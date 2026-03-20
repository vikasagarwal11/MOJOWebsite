import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../config/firebase';
import { notificationService } from './notificationService';

export interface ModerationAction {
  contentId: string;
  contentType: 'post' | 'media' | 'resource';
  action: 'approve' | 'reject';
  adminId: string;
  reason?: string;
}

export class ModerationService {
  /**
   * Approve pending content
   */
  static async approveContent(
    contentId: string,
    contentType: 'post' | 'media' | 'resource',
    adminId: string
  ): Promise<void> {
    if (!contentId || !contentType || !adminId) {
      const error = new Error('Missing required parameters for approval');
      console.error('❌ [ModerationService] approveContent validation failed:', { contentId, contentType, adminId });
      toast.error('Invalid approval request. Please try again.');
      throw error;
    }

    try {
      const collectionName =
        contentType === 'post' ? 'posts' : contentType === 'resource' ? 'resources' : contentType;
      const contentRef = doc(db, collectionName, contentId);
      const contentDoc = await getDoc(contentRef);
      
      if (!contentDoc.exists()) {
        const error = new Error(`Content not found: ${contentType}/${contentId}`);
        console.error('❌ [ModerationService] Content not found:', { contentId, contentType });
        toast.error('Content not found. It may have been deleted.');
        throw error;
      }

      const contentData = contentDoc.data();
      const authorId =
        contentType === 'post'
          ? contentData.authorId
          : contentType === 'media'
            ? contentData.uploadedBy
            : contentData.contributorId;

      // Validate content data
      if (!authorId) {
        const error = new Error('Content missing author information');
        console.error('❌ [ModerationService] Content missing author:', { contentId, contentType, contentData });
        toast.error('Content is missing author information. Cannot approve.');
        throw error;
      }

      // Update moderation status
      await updateDoc(contentRef, {
        moderationStatus: 'approved',
        requiresApproval: false,
        moderatedAt: serverTimestamp(),
        moderatedBy: adminId,
        moderationReason: null,
      });

      // Log moderation action (non-blocking)
      try {
        await addDoc(collection(db, 'moderationLog'), {
          contentId,
          contentType,
          action: 'approved',
          adminId,
          authorId,
          contentTitle:
            contentType === 'post'
              ? contentData.title || 'Untitled Post'
              : contentType === 'media'
                ? 'Media Upload'
                : contentData.title || 'Resource',
          reason: null,
          createdAt: serverTimestamp(),
        });
      } catch (logError) {
        console.warn('⚠️ [ModerationService] Failed to log moderation action (non-critical):', logError);
        // Continue even if logging fails
      }

      // Send notification to author (non-blocking)
      if (authorId) {
        try {
          const contentTitle =
            contentType === 'post'
              ? contentData.title || 'Your post'
              : contentType === 'media'
                ? 'Your media'
                : contentData.title || 'Your resource';
          
          await notificationService.createNotification({
            userId: authorId,
            type: 'content_approved',
            title: 'Content Approved',
            message: `${contentTitle} has been approved and is now visible to the community.`,
            metadata: {
              contentType,
              contentId,
              action: 'approved',
            },
          });
        } catch (notifError) {
          console.warn('⚠️ [ModerationService] Failed to send notification (non-critical):', notifError);
          // Continue even if notification fails
        }
      }

      toast.success(
        `${contentType === 'post' ? 'Post' : contentType === 'media' ? 'Media' : 'Resource'} approved successfully`
      );
    } catch (error: any) {
      console.error('❌ [ModerationService] Error approving content:', {
        error,
        contentId,
        contentType,
        adminId,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorStack: error?.stack,
      });
      
      // Provide user-friendly error messages
      let userMessage = 'Failed to approve content';
      if (error?.code === 'permission-denied') {
        userMessage = 'You do not have permission to approve this content.';
      } else if (error?.code === 'not-found') {
        userMessage = 'Content not found. It may have been deleted.';
      } else if (error?.message) {
        userMessage = error.message;
      }
      
      toast.error(userMessage);
      throw error;
    }
  }

  /**
   * Reject pending content
   */
  static async rejectContent(
    contentId: string,
    contentType: 'post' | 'media' | 'resource',
    adminId: string,
    reason?: string
  ): Promise<void> {
    if (!contentId || !contentType || !adminId) {
      const error = new Error('Missing required parameters for rejection');
      console.error('❌ [ModerationService] rejectContent validation failed:', { contentId, contentType, adminId });
      toast.error('Invalid rejection request. Please try again.');
      throw error;
    }

    try {
      const collectionName =
        contentType === 'post' ? 'posts' : contentType === 'resource' ? 'resources' : contentType;
      const contentRef = doc(db, collectionName, contentId);
      const contentDoc = await getDoc(contentRef);
      
      if (!contentDoc.exists()) {
        const error = new Error(`Content not found: ${contentType}/${contentId}`);
        console.error('❌ [ModerationService] Content not found:', { contentId, contentType });
        toast.error('Content not found. It may have been deleted.');
        throw error;
      }

      const contentData = contentDoc.data();
      const authorId =
        contentType === 'post'
          ? contentData.authorId
          : contentType === 'media'
            ? contentData.uploadedBy
            : contentData.contributorId;

      // Validate content data
      if (!authorId) {
        const error = new Error('Content missing author information');
        console.error('❌ [ModerationService] Content missing author:', { contentId, contentType, contentData });
        toast.error('Content is missing author information. Cannot reject.');
        throw error;
      }

      // Update moderation status
      await updateDoc(contentRef, {
        moderationStatus: 'rejected',
        requiresApproval: false,
        moderatedAt: serverTimestamp(),
        moderatedBy: adminId,
        moderationReason: reason || 'Content does not meet community guidelines',
      });

      // Log moderation action (non-blocking)
      try {
        await addDoc(collection(db, 'moderationLog'), {
          contentId,
          contentType,
          action: 'rejected',
          adminId,
          authorId,
          contentTitle:
            contentType === 'post'
              ? contentData.title || 'Untitled Post'
              : contentType === 'media'
                ? 'Media Upload'
                : contentData.title || 'Resource',
          reason: reason || 'Content does not meet community guidelines',
          createdAt: serverTimestamp(),
        });
      } catch (logError) {
        console.warn('⚠️ [ModerationService] Failed to log moderation action (non-critical):', logError);
        // Continue even if logging fails
      }

      // Send notification to author (non-blocking)
      if (authorId) {
        try {
          const contentTitle =
            contentType === 'post'
              ? contentData.title || 'Your post'
              : contentType === 'media'
                ? 'Your media'
                : contentData.title || 'Your resource';
          
          await notificationService.createNotification({
            userId: authorId,
            type: 'content_rejected',
            title: 'Content Not Approved',
            message: `${contentTitle} was not approved. ${reason || 'It does not meet our community guidelines.'}`,
            metadata: {
              contentType,
              contentId,
              action: 'rejected',
              reason,
            },
          });
        } catch (notifError) {
          console.warn('⚠️ [ModerationService] Failed to send notification (non-critical):', notifError);
          // Continue even if notification fails
        }
      }

      toast.success(
        `${contentType === 'post' ? 'Post' : contentType === 'media' ? 'Media' : 'Resource'} rejected`
      );
    } catch (error: any) {
      console.error('❌ [ModerationService] Error rejecting content:', {
        error,
        contentId,
        contentType,
        adminId,
        reason,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorStack: error?.stack,
      });
      
      // Provide user-friendly error messages
      let userMessage = 'Failed to reject content';
      if (error?.code === 'permission-denied') {
        userMessage = 'You do not have permission to reject this content.';
      } else if (error?.code === 'not-found') {
        userMessage = 'Content not found. It may have been deleted.';
      } else if (error?.message) {
        userMessage = error.message;
      }
      
      toast.error(userMessage);
      throw error;
    }
  }

  /**
   * Update user moderation settings
   */
  static async updateUserModerationSettings(
    userId: string,
    settings: {
      requireApprovalForUser?: boolean;
      autoModerateUser?: boolean;
    }
  ): Promise<void> {
    if (!userId) {
      const error = new Error('User ID is required');
      console.error('❌ [ModerationService] updateUserModerationSettings validation failed:', { userId });
      toast.error('Invalid user. Please try again.');
      throw error;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        const error = new Error(`User not found: ${userId}`);
        console.error('❌ [ModerationService] User not found:', { userId });
        toast.error('User not found.');
        throw error;
      }

      await updateDoc(userRef, {
        moderationSettings: {
          requireApproval: settings.requireApprovalForUser || false,
          autoModerate: settings.autoModerateUser !== false, // Default to true
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      toast.success('User moderation settings updated');
    } catch (error: any) {
      console.error('❌ [ModerationService] Error updating user settings:', {
        error,
        userId,
        settings,
        errorMessage: error?.message,
        errorCode: error?.code,
      });
      
      // Provide user-friendly error messages
      let userMessage = 'Failed to update user settings';
      if (error?.code === 'permission-denied') {
        userMessage = 'You do not have permission to update these settings.';
      } else if (error?.code === 'not-found') {
        userMessage = 'User not found.';
      } else if (error?.message) {
        userMessage = error.message;
      }
      
      toast.error(userMessage);
      throw error;
    }
  }
}

