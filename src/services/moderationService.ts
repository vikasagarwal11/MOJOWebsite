import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { notificationService } from './notificationService';
import toast from 'react-hot-toast';

export interface ModerationAction {
  contentId: string;
  contentType: 'post' | 'media';
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
    contentType: 'post' | 'media',
    adminId: string
  ): Promise<void> {
    try {
      const contentRef = doc(db, contentType, contentId);
      const contentDoc = await getDoc(contentRef);
      
      if (!contentDoc.exists()) {
        throw new Error('Content not found');
      }

      const contentData = contentDoc.data();
      const authorId = contentType === 'post' ? contentData.authorId : contentData.uploadedBy;

      // Update moderation status
      await updateDoc(contentRef, {
        moderationStatus: 'approved',
        requiresApproval: false,
        moderatedAt: serverTimestamp(),
        moderatedBy: adminId,
        moderationReason: null,
      });

      // Send notification to author
      if (authorId) {
        const contentTitle = contentType === 'post' 
          ? contentData.title || 'Your post'
          : 'Your media';
        
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
      }

      toast.success(`${contentType === 'post' ? 'Post' : 'Media'} approved successfully`);
    } catch (error: any) {
      console.error('❌ [ModerationService] Error approving content:', error);
      toast.error(error?.message || 'Failed to approve content');
      throw error;
    }
  }

  /**
   * Reject pending content
   */
  static async rejectContent(
    contentId: string,
    contentType: 'post' | 'media',
    adminId: string,
    reason?: string
  ): Promise<void> {
    try {
      const contentRef = doc(db, contentType, contentId);
      const contentDoc = await getDoc(contentRef);
      
      if (!contentDoc.exists()) {
        throw new Error('Content not found');
      }

      const contentData = contentDoc.data();
      const authorId = contentType === 'post' ? contentData.authorId : contentData.uploadedBy;

      // Update moderation status
      await updateDoc(contentRef, {
        moderationStatus: 'rejected',
        requiresApproval: false,
        moderatedAt: serverTimestamp(),
        moderatedBy: adminId,
        moderationReason: reason || 'Content does not meet community guidelines',
      });

      // Send notification to author
      if (authorId) {
        const contentTitle = contentType === 'post' 
          ? contentData.title || 'Your post'
          : 'Your media';
        
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
      }

      toast.success(`${contentType === 'post' ? 'Post' : 'Media'} rejected`);
    } catch (error: any) {
      console.error('❌ [ModerationService] Error rejecting content:', error);
      toast.error(error?.message || 'Failed to reject content');
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
    try {
      const userRef = doc(db, 'users', userId);
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
      console.error('❌ [ModerationService] Error updating user settings:', error);
      toast.error(error?.message || 'Failed to update user settings');
      throw error;
    }
  }
}

