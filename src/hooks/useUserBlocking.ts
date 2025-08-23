import { useState, useEffect, useCallback } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  UserBlock, 
  BlockedUser, 
  BlockSummary, 
  BlockReason, 
  BlockCategory, 
  AppealStatus,
  BlockReport,
  isUserBlocked,
  isUserBlockedBy,
  getBlockLevel,
  canInteract
} from '../types/blocking';
import toast from 'react-hot-toast';

export function useUserBlocking() {
  const { currentUser } = useAuth();
  const [userBlocks, setUserBlocks] = useState<UserBlock[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockReports, setBlockReports] = useState<BlockReport[]>([]);
  const [blockSummary, setBlockSummary] = useState<BlockSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);

  // Load user's blocks (who they've blocked)
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'userBlocks'),
        where('blockedByUserId', '==', currentUser.id),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        const blocks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as UserBlock[];
        setUserBlocks(blocks);
      },
      (error) => {
        console.error('Failed to load user blocks:', error);
      }
    );

    return unsubscribe;
  }, [currentUser?.id]);

  // Load users who have blocked the current user
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'userBlocks'),
        where('blockedUserId', '==', currentUser.id),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      ),
      async (snapshot) => {
        const blocks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as UserBlock[];

        // Fetch user details for blocked users
        const blockedUserDetails = await Promise.all(
          blocks.map(async (block) => {
            try {
              const userDoc = await getDocs(query(
                collection(db, 'users'),
                where('__name__', '==', block.blockedByUserId)
              ));
              if (userDoc.docs[0]?.exists()) {
                const userData = userDoc.docs[0].data();
                return {
                  id: block.blockedByUserId,
                  displayName: userData.displayName || 'Unknown User',
                  email: userData.email || '',
                  photoURL: userData.photoURL,
                  blockedAt: block.createdAt,
                  blockReason: block.reason,
                  blockCategory: block.category,
                  isActive: block.isActive,
                  expiresAt: block.expiresAt,
                  canAppeal: block.category !== 'permanent',
                  appealStatus: block.appealStatus
                } as BlockedUser;
              }
              return null;
            } catch (error) {
              console.error('Failed to fetch blocked user details:', error);
              return null;
            }
          })
        );

        setBlockedUsers(blockedUserDetails.filter(Boolean) as BlockedUser[]);
      },
      (error) => {
        console.error('Failed to load blocked users:', error);
      }
    );

    return unsubscribe;
  }, [currentUser?.id]);

  // Load block reports (admin only)
  useEffect(() => {
    if (!currentUser?.role || currentUser.role !== 'admin') return;

    setLoadingReports(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'blockReports'),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        const reports = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as BlockReport[];
        setBlockReports(reports);
        setLoadingReports(false);
      },
      (error) => {
        console.error('Failed to load block reports:', error);
        setLoadingReports(false);
      }
    );

    return unsubscribe;
  }, [currentUser?.role]);

  // Calculate block summary
  useEffect(() => {
    if (!currentUser?.role || currentUser.role !== 'admin') return;

    const summary: BlockSummary = {
      totalBlocks: userBlocks.length + blockedUsers.length,
      activeBlocks: userBlocks.filter(b => b.isActive).length + blockedUsers.filter(b => b.isActive).length,
      pendingAppeals: blockReports.filter(r => r.status === 'pending').length,
      blocksByCategory: {
        platform_wide: 0,
        content_only: 0,
        interaction_only: 0,
        rsvp_only: 0,
        temporary: 0,
        permanent: 0
      },
      blocksByReason: {
        harassment: 0,
        spam: 0,
        inappropriate_content: 0,
        fake_account: 0,
        security_violation: 0,
        terms_violation: 0,
        other: 0
      }
    };

    // Count by category and reason
    [...userBlocks, ...blockedUsers].forEach(block => {
      if (block.isActive) {
        summary.blocksByCategory[block.category]++;
        summary.blocksByReason[block.reason]++;
      }
    });

    setBlockSummary(summary);
  }, [userBlocks, blockedUsers, blockReports, currentUser?.role]);

  // Block a user
  const blockUser = useCallback(async (
    targetUserId: string,
    reason: BlockReason,
    category: BlockCategory,
    description?: string,
    expiresAt?: Date
  ) => {
    if (!currentUser?.id) {
      toast.error('You must be signed in to block users');
      return;
    }

    if (targetUserId === currentUser.id) {
      toast.error('You cannot block yourself');
      return;
    }

    try {
      setLoading(true);
      
      // Check if already blocked
      const existingBlock = userBlocks.find(b => 
        b.blockedUserId === targetUserId && b.isActive
      );

      if (existingBlock) {
        toast.error('User is already blocked');
        return;
      }

      // Create new block
      const blockData: Omit<UserBlock, 'id'> = {
        blockedUserId: targetUserId,
        blockedByUserId: currentUser.id,
        reason,
        category,
        description,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: expiresAt ? serverTimestamp() : undefined
      };

      await addDoc(collection(db, 'userBlocks'), blockData);
      toast.success('User blocked successfully');
    } catch (error: any) {
      console.error('Failed to block user:', error);
      toast.error(error.message || 'Failed to block user');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, userBlocks]);

  // Unblock a user
  const unblockUser = useCallback(async (blockId: string) => {
    if (!currentUser?.id) return;

    try {
      setLoading(true);
      await updateDoc(doc(db, 'userBlocks', blockId), {
        isActive: false,
        updatedAt: serverTimestamp()
      });
      toast.success('User unblocked successfully');
    } catch (error: any) {
      console.error('Failed to unblock user:', error);
      toast.error(error.message || 'Failed to unblock user');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Update block
  const updateBlock = useCallback(async (
    blockId: string,
    updates: Partial<UserBlock>
  ) => {
    if (!currentUser?.id) return;

    try {
      setLoading(true);
      await updateDoc(doc(db, 'userBlocks', blockId), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      toast.success('Block updated successfully');
    } catch (error: any) {
      console.error('Failed to update block:', error);
      toast.error(error.message || 'Failed to update block');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Submit block appeal
  const submitAppeal = useCallback(async (
    blockId: string,
    reason: string
  ) => {
    if (!currentUser?.id) return;

    try {
      setLoading(true);
      await updateDoc(doc(db, 'userBlocks', blockId), {
        appealStatus: 'pending' as AppealStatus,
        appealReason: reason,
        appealSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Appeal submitted successfully');
    } catch (error: any) {
      console.error('Failed to submit appeal:', error);
      toast.error(error.message || 'Failed to submit appeal');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Report a user for blocking
  const reportUser = useCallback(async (
    targetUserId: string,
    reason: BlockReason,
    description: string,
    evidence?: string[]
  ) => {
    if (!currentUser?.id) {
      toast.error('You must be signed in to report users');
      return;
    }

    if (targetUserId === currentUser.id) {
      toast.error('You cannot report yourself');
      return;
    }

    try {
      setLoading(true);
      
      const reportData: Omit<BlockReport, 'id'> = {
        reporterUserId: currentUser.id,
        reportedUserId: targetUserId,
        reason,
        description,
        evidence,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'blockReports'), reportData);
      toast.success('User reported successfully. An admin will review your report.');
    } catch (error: any) {
      console.error('Failed to report user:', error);
      toast.error(error.message || 'Failed to report user');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Review block report (admin only)
  const reviewReport = useCallback(async (
    reportId: string,
    status: 'reviewed' | 'resolved' | 'dismissed',
    adminNotes?: string
  ) => {
    if (!currentUser?.role || currentUser.role !== 'admin') {
      toast.error('Only admins can review reports');
      return;
    }

    try {
      setLoading(true);
      await updateDoc(doc(db, 'blockReports', reportId), {
        status,
        adminNotes,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.id
      });
      toast.success('Report reviewed successfully');
    } catch (error: any) {
      console.error('Failed to review report:', error);
      toast.error(error.message || 'Failed to review report');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.role, currentUser?.id]);

  // Utility functions
  const isBlocked = useCallback((targetUserId: string): boolean => {
    return isUserBlocked(currentUser?.id || '', targetUserId, userBlocks);
  }, [currentUser?.id, userBlocks]);

  const isBlockedBy = useCallback((targetUserId: string): boolean => {
    return isUserBlockedBy(currentUser?.id || '', targetUserId, userBlocks);
  }, [currentUser?.id, userBlocks]);

  const getBlockCategory = useCallback((targetUserId: string): BlockCategory | null => {
    return getBlockLevel(currentUser?.id || '', targetUserId, userBlocks);
  }, [currentUser?.id, userBlocks]);

  const canInteractWith = useCallback((
    targetUserId: string,
    interactionType: 'like' | 'comment' | 'rsvp' | 'content' | 'view'
  ): boolean => {
    return canInteract(currentUser?.id || '', targetUserId, userBlocks, interactionType);
  }, [currentUser?.id, userBlocks]);

  return {
    // State
    userBlocks,
    blockedUsers,
    blockReports,
    blockSummary,
    loading,
    loadingReports,

    // Actions
    blockUser,
    unblockUser,
    updateBlock,
    submitAppeal,
    reportUser,
    reviewReport,

    // Utility functions
    isBlocked,
    isBlockedBy,
    getBlockCategory,
    canInteractWith,

    // Admin functions
    isAdmin: currentUser?.role === 'admin'
  };
}
