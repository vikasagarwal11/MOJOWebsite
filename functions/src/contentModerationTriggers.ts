import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import {
  adjustUserTrustScore,
  analyzeMediaSafeSearch,
  MediaModerationResult,
  ModerationContentType,
  ModerationVerdict,
  runTextModeration,
  shouldForceManualReview,
} from './moderationEngine';

interface ModerationJob {
  ref: FirebaseFirestore.DocumentReference;
  contentType: ModerationContentType;
  text: string;
  userId?: string;
  mediaPath?: string;
  isVideo?: boolean;
  allowAutoApproveWithoutText?: boolean;
  metadata?: Record<string, any>;
}

const db = getFirestore();

async function handleModeration(job: ModerationJob) {
  const { ref, contentType } = job;
  const userData = job.userId ? await db.collection('users').doc(job.userId).get() : null;
  const forceManual = userData?.exists ? shouldForceManualReview(userData.data()) : false;
  const hasText = job.text.trim().length > 0;

  // Check if user is admin or in trusted list (skip image analysis for cost savings)
  let isAdmin = false;
  let isInTrustedList = false;
  if (userData?.exists && job.userId) {
    const user = userData.data();
    isAdmin = user?.role === 'admin';
    
    // Check trusted list (only for non-admins)
    if (!isAdmin) {
      try {
        const trustedUsersQuery = db.collection('trustedUsers')
          .where('userId', '==', job.userId)
          .limit(1);
        const trustedUsersSnapshot = await trustedUsersQuery.get();
        isInTrustedList = !trustedUsersSnapshot.empty;
      } catch (error) {
        console.warn('⚠️ [ModerationTriggers] Error checking trusted list:', error);
        // On error, assume not trusted (safer)
      }
    }
  }

  let textVerdict: ModerationVerdict = {
    requiresApproval: !job.allowAutoApproveWithoutText,
    isBlocked: false,
    sentiment: 'neutral',
    confidence: 0.3,
    detectedIssues: [],
  };

  if (hasText) {
    textVerdict = await runTextModeration(job.text, contentType, job.userId);
  } else if (forceManual || !job.allowAutoApproveWithoutText) {
    textVerdict = {
      requiresApproval: true,
      isBlocked: false,
      sentiment: 'neutral',
      confidence: 0.5,
      detectedIssues: ['Missing caption - manual review required'],
      reason: 'Content is missing text and requires review.',
    };
  }

  // COST OPTIMIZATION: Skip image analysis for admins and trusted users
  // Only analyze images for users NOT in trusted list
  let mediaVerdict: MediaModerationResult | null = null;
  if (job.mediaPath && !isAdmin && !isInTrustedList) {
    // User is not admin and not in trusted list - analyze image
    mediaVerdict = await analyzeMediaSafeSearch(job.mediaPath);
  } else if (job.mediaPath && (isAdmin || isInTrustedList)) {
    // Skip image analysis for admins and trusted users
    console.log(`💰 [ModerationTriggers] Skipping image analysis - ${isAdmin ? 'admin user' : 'user in trusted list'}`);
    mediaVerdict = {
      requiresApproval: false,
      isBlocked: false,
      detectedIssues: [],
    };
  } else if (job.isVideo) {
    // For videos, only analyze if user is not trusted
    if (!isAdmin && !isInTrustedList) {
      mediaVerdict = {
        requiresApproval: true,
        isBlocked: false,
        detectedIssues: ['Video moderation pending manual review'],
        reason: 'Video content requires manual review.',
      };
    } else {
      console.log(`💰 [ModerationTriggers] Skipping video analysis - ${isAdmin ? 'admin user' : 'user in trusted list'}`);
      mediaVerdict = {
        requiresApproval: false,
        isBlocked: false,
        detectedIssues: [],
      };
    }
  }

  if (forceManual) {
    textVerdict = {
      ...textVerdict,
      requiresApproval: true,
      isBlocked: textVerdict.isBlocked,
      reason: textVerdict.reason || 'User requires manual review due to trust score.',
    };
  }

  const combinedIssues = [
    ...(textVerdict.detectedIssues || []),
    ...(mediaVerdict?.detectedIssues || []),
  ];

  // CRITICAL: ALL uploads must be manually approved in admin console
  // Never auto-approve, even if AI analysis finds no issues
  let moderationStatus: 'approved' | 'pending' | 'rejected' = 'pending';
  let requiresApproval = true;
  let reason = textVerdict.reason || mediaVerdict?.reason || 'Awaiting moderator review.';

  if (textVerdict.isBlocked || mediaVerdict?.isBlocked) {
    moderationStatus = 'rejected';
    requiresApproval = true;
    reason = reason || 'Automatically rejected by moderation pipeline.';
  }
  // All other cases stay as 'pending' - no auto-approval

  const updatePayload: Record<string, any> = {
    moderationStatus,
    requiresApproval,
    moderationReason: reason,
    moderationDetectedIssues: combinedIssues,
    moderationSentiment: textVerdict.sentiment,
    moderationConfidence: textVerdict.confidence,
    moderationAiAnalysis: textVerdict.aiAnalysis || null,
    moderationEvaluatedAt: FieldValue.serverTimestamp(),
    moderationPipeline: 'auto',
  };

  if (mediaVerdict) {
    updatePayload.moderationMediaScan = {
      issues: mediaVerdict.detectedIssues,
      reason: mediaVerdict.reason || null,
      scannedAt: FieldValue.serverTimestamp(),
    };
  }

  await ref.update(updatePayload);

  await db.collection('moderationLog').add({
    contentId: ref.id,
    contentType,
    action: `auto_${moderationStatus}`,
    issues: combinedIssues,
    reason,
    userId: job.userId || null,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (job.userId) {
    if (moderationStatus === 'rejected') {
      await adjustUserTrustScore(job.userId, -5);
    } else if (moderationStatus === 'pending') {
      await adjustUserTrustScore(job.userId, -1);
    }
    // Note: 'approved' status is never set in this function (all media requires manual approval)
  }

  // Notify admins when media is set to pending
  if (contentType === 'media' && moderationStatus === 'pending') {
    try {
      const mediaData = await ref.get();
      const mediaDoc = mediaData.data();
      if (!mediaDoc) return;

      const mediaId = ref.id;
      const uploadedBy = mediaDoc.uploadedBy || job.userId;
      const uploadedByName = mediaDoc.uploadedByName || mediaDoc.uploaderName || 'A member';
      const mediaType = mediaDoc.type || 'media';

      console.log('🔔 [ModerationTriggers] Notifying admins about pending media', {
        mediaId,
        uploadedBy,
        uploadedByName,
        mediaType
      });

      // Get all admins
      const adminsSnapshot = await db.collection('users')
        .where('role', '==', 'admin')
        .get();

      if (adminsSnapshot.empty) {
        console.warn('⚠️ [ModerationTriggers] No admins found to notify');
        return;
      }

      // Import notification helper function
      const { sendAdminNotificationWithFallback } = await import('./utils/notifications');

      // Create in-app notifications for all admins
      const notifications = adminsSnapshot.docs.map(adminDoc => ({
        userId: adminDoc.id,
        type: 'media_pending_approval',
        title: 'Media Pending Approval',
        message: `${uploadedByName} has uploaded ${mediaType === 'video' ? 'a video' : 'an image'} that requires your approval.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        metadata: {
          mediaId: mediaId,
          uploadedBy: uploadedBy,
          uploadedByName: uploadedByName,
          mediaType: mediaType,
          action: 'media_pending_review'
        }
      }));

      // Batch write in-app notifications
      const batch = db.batch();
      notifications.forEach(notif => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, notif);
      });
      await batch.commit();
      console.log('✅ [ModerationTriggers] In-app notifications created successfully', {
        notificationCount: notifications.length
      });

      // Send push notifications with SMS fallback for each admin
      const notificationPromises = adminsSnapshot.docs.map(async (adminDoc) => {
        const adminData = adminDoc.data();
        const adminId = adminDoc.id;

        await sendAdminNotificationWithFallback(
          adminId,
          adminData,
          'Media Pending Approval',
          `${uploadedByName} has uploaded ${mediaType === 'video' ? 'a video' : 'an image'} that requires your approval.`,
          `MOMS FITNESS MOJO: New ${mediaType} pending approval from ${uploadedByName}. Check Content Moderation.`,
          {
            type: 'media_pending_approval',
            mediaId: mediaId,
            uploadedBy: uploadedBy,
          }
        );
      });

      const results = await Promise.allSettled(notificationPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ [ModerationTriggers] Notified ${adminsSnapshot.size} admins`, {
        successCount,
        failureCount,
        totalAdmins: adminsSnapshot.size
      });

      if (failureCount > 0) {
        console.error('❌ [ModerationTriggers] Some notifications failed', {
          failures: results
            .map((r, i) => r.status === 'rejected' ? { adminIndex: i, error: r.reason } : null)
            .filter(Boolean)
        });
      }
    } catch (error) {
      console.error('❌ [ModerationTriggers] Error sending media pending notifications:', error);
      // Don't throw - we don't want to fail moderation if notification fails
    }
  }
}

function shouldSkipModeration(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return true;
  if (data.skipModeration === true) return true;
  if (data.moderationPipeline === 'auto_processed') return true;
  return false;
}

export const onPostCreatedModeration = onDocumentCreated(
  {
    document: 'posts/{postId}',
    region: 'us-east1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || shouldSkipModeration(data)) return;

    const docRef = event.data?.ref || db.collection('posts').doc(event.params.postId);
    const text = [data.title, data.content].filter(Boolean).join(' ').trim();

    await handleModeration({
      ref: docRef,
      contentType: 'post',
      text,
      userId: data.authorId,
      allowAutoApproveWithoutText: false,
    });
  }
);

export const onMediaCreatedModeration = onDocumentCreated(
  {
    document: 'media/{mediaId}',
    region: 'us-east1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || shouldSkipModeration(data)) return;

    const docRef = event.data?.ref || db.collection('media').doc(event.params.mediaId);
    const isVideo = data.type === 'video';
    const text = (data.description || '').trim();

    await handleModeration({
      ref: docRef,
      contentType: 'media',
      text,
      userId: data.uploadedBy,
      mediaPath: data.filePath,
      isVideo,
      allowAutoApproveWithoutText: false,
    });
  }
);

export const onPostCommentCreatedModeration = onDocumentCreated(
  {
    document: 'posts/{postId}/comments/{commentId}',
    region: 'us-east1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || shouldSkipModeration(data)) return;

    const docRef =
      event.data?.ref ||
      db.collection('posts').doc(event.params.postId).collection('comments').doc(event.params.commentId);

    await handleModeration({
      ref: docRef,
      contentType: 'comment',
      text: (data.text || '').trim(),
      userId: data.authorId,
      allowAutoApproveWithoutText: false,
    });
  }
);

export const onMediaCommentCreatedModeration = onDocumentCreated(
  {
    document: 'media/{mediaId}/comments/{commentId}',
    region: 'us-east1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || shouldSkipModeration(data)) return;

    const docRef =
      event.data?.ref ||
      db.collection('media').doc(event.params.mediaId).collection('comments').doc(event.params.commentId);

    await handleModeration({
      ref: docRef,
      contentType: 'comment',
      text: (data.text || '').trim(),
      userId: data.authorId,
      allowAutoApproveWithoutText: false,
    });
  }
);

export const onTestimonialCreatedModeration = onDocumentCreated(
  {
    document: 'testimonials/{testimonialId}',
    region: 'us-east1',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || shouldSkipModeration(data)) return;

    const docRef = event.data?.ref || db.collection('testimonials').doc(event.params.testimonialId);
    const text = [data.quote, data.highlight].filter(Boolean).join(' ').trim();

    await handleModeration({
      ref: docRef,
      contentType: 'testimonial',
      text,
      userId: data.userId,
      allowAutoApproveWithoutText: true,
    });
  }
);

