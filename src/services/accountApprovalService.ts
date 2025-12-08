import { 
  collection, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AccountApproval, ApprovalMessage, UserStatus } from '../types';

export class AccountApprovalService {
  /**
   * Create a new account approval request
   */
  static async createApprovalRequest(data: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    location?: string;
    howDidYouHear?: string;
    howDidYouHearOther?: string;
    referredBy?: string;
    referralNotes?: string;
  }): Promise<string> {
    try {
      // Build approval data, only including defined fields (Firestore doesn't allow undefined)
      const approvalData: any = {
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        status: 'pending',
        submittedAt: serverTimestamp(),
        awaitingResponseFrom: null,
        unreadCount: {
          admin: 0,
          user: 0
        }
      };

      // Only add optional fields if they are defined (not undefined)
      if (data.location !== undefined && data.location !== null && data.location !== '') {
        approvalData.location = data.location;
      }
      if (data.howDidYouHear !== undefined && data.howDidYouHear !== null && data.howDidYouHear !== '') {
        approvalData.howDidYouHear = data.howDidYouHear;
      }
      if (data.howDidYouHearOther !== undefined && data.howDidYouHearOther !== null && data.howDidYouHearOther !== '') {
        approvalData.howDidYouHearOther = data.howDidYouHearOther;
      }
      if (data.referredBy !== undefined && data.referredBy !== null && data.referredBy !== '') {
        approvalData.referredBy = data.referredBy;
      }
      if (data.referralNotes !== undefined && data.referralNotes !== null && data.referralNotes !== '') {
        approvalData.referralNotes = data.referralNotes;
      }

      const approvalRef = doc(collection(db, 'accountApprovals'));
      await setDoc(approvalRef, approvalData);

      return approvalRef.id;
    } catch (error) {
      console.error('Error creating account approval request:', error);
      throw error;
    }
  }

  /**
   * Get approval request by user ID
   */
  static async getApprovalByUserId(userId: string): Promise<AccountApproval | null> {
    try {
      const q = query(
        collection(db, 'accountApprovals'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return null;
      }

      const doc = querySnapshot.docs[0];
      const data = doc.data();
      
      return {
        id: doc.id,
        ...data,
        submittedAt: (data.submittedAt as Timestamp)?.toDate() || new Date(),
        reviewedAt: (data.reviewedAt as Timestamp)?.toDate(),
        lastMessageAt: (data.lastMessageAt as Timestamp)?.toDate(),
      } as AccountApproval;
    } catch (error) {
      console.error('Error getting approval by user ID:', error);
      throw error;
    }
  }

  /**
   * Get approval request by approval ID
   */
  static async getApprovalById(approvalId: string): Promise<AccountApproval | null> {
    try {
      const approvalRef = doc(db, 'accountApprovals', approvalId);
      const approvalSnap = await getDoc(approvalRef);
      
      if (!approvalSnap.exists()) {
        return null;
      }

      const data = approvalSnap.data();
      return {
        id: approvalSnap.id,
        ...data,
        submittedAt: (data.submittedAt as Timestamp)?.toDate() || new Date(),
        reviewedAt: (data.reviewedAt as Timestamp)?.toDate(),
        lastMessageAt: (data.lastMessageAt as Timestamp)?.toDate(),
      } as AccountApproval;
    } catch (error) {
      console.error('Error getting approval by ID:', error);
      throw error;
    }
  }

  /**
   * Send a message in the approval Q&A thread
   */
  static async sendMessage(data: {
    approvalId: string;
    userId: string;
    senderRole: 'admin' | 'user';
    senderName: string;
    message: string;
  }): Promise<string> {
    try {
      const messageData: Omit<ApprovalMessage, 'id'> = {
        approvalId: data.approvalId,
        userId: data.userId,
        senderRole: data.senderRole,
        senderName: data.senderName,
        message: data.message,
        createdAt: new Date(),
        read: false
      };

      const messageRef = doc(collection(db, 'approvalMessages'));
      await setDoc(messageRef, {
        ...messageData,
        createdAt: serverTimestamp()
      });

      // Update approval document
      const approvalRef = doc(db, 'accountApprovals', data.approvalId);
      const approvalData = await getDoc(approvalRef);
      const currentData = approvalData.data();
      const currentUnread = currentData?.unreadCount || { admin: 0, user: 0 };

      // Increment unread for the recipient, not the sender
      const nextUnread = {
        admin: data.senderRole === 'user' ? (currentUnread.admin || 0) + 1 : currentUnread.admin || 0,
        user: data.senderRole === 'admin' ? (currentUnread.user || 0) + 1 : currentUnread.user || 0,
      };

      // Build update payload - users can only update message fields, admins can also update status
      const updatePayload: any = {
        lastMessageAt: serverTimestamp(),
        awaitingResponseFrom: data.senderRole === 'admin' ? 'user' : 'admin',
        unreadCount: nextUnread,
      };

      // Only admins can update status (when admin asks first question, change pending -> needs_clarification)
      if (data.senderRole === 'admin' && currentData?.status === 'pending') {
        updatePayload.status = 'needs_clarification';
      }

      await updateDoc(approvalRef, updatePayload);

      return messageRef.id;
    } catch (error) {
      console.error('Error sending approval message:', error);
      throw error;
    }
  }

  /**
   * Approve an account
   */
  static async approveAccount(
    approvalId: string,
    adminId: string
  ): Promise<void> {
    try {
      const approvalRef = doc(db, 'accountApprovals', approvalId);
      const approvalSnap = await getDoc(approvalRef);
      
      if (!approvalSnap.exists()) {
        throw new Error('Approval request not found');
      }

      const approvalData = approvalSnap.data();
      const userId = approvalData.userId;

      // Update approval status
      await updateDoc(approvalRef, {
        status: 'approved',
        reviewedAt: serverTimestamp(),
        reviewedBy: adminId,
        awaitingResponseFrom: null
      });

      // Update user status
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: adminId
      });
    } catch (error) {
      console.error('Error approving account:', error);
      throw error;
    }
  }

  /**
   * Reject an account
   */
  static async rejectAccount(
    approvalId: string,
    adminId: string,
    rejectionReason: string
  ): Promise<void> {
    try {
      const approvalRef = doc(db, 'accountApprovals', approvalId);
      const approvalSnap = await getDoc(approvalRef);
      
      if (!approvalSnap.exists()) {
        throw new Error('Approval request not found');
      }

      const approvalData = approvalSnap.data();
      const userId = approvalData.userId;

      // Update approval status
      await updateDoc(approvalRef, {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedBy: adminId,
        rejectionReason: rejectionReason,
        awaitingResponseFrom: null
      });

      // Update user status
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: adminId,
        rejectionReason: rejectionReason
      });
    } catch (error) {
      console.error('Error rejecting account:', error);
      throw error;
    }
  }

  /**
   * Check if user can reapply (after 30 days cooldown)
   */
  static async canReapply(userId: string): Promise<{ canReapply: boolean; reapplyDate?: Date }> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        return { canReapply: true };
      }

      const userData = userSnap.data();
      const rejectedAt = (userData.rejectedAt as Timestamp)?.toDate();
      
      if (!rejectedAt) {
        return { canReapply: true };
      }

      const cooldownDays = 30;
      const reapplyDate = new Date(rejectedAt);
      reapplyDate.setDate(reapplyDate.getDate() + cooldownDays);
      const now = new Date();

      return {
        canReapply: now >= reapplyDate,
        reapplyDate: reapplyDate
      };
    } catch (error) {
      console.error('Error checking reapply eligibility:', error);
      return { canReapply: false };
    }
  }
}

