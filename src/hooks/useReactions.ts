import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Reaction {
  userId: string;
  emoji: string;
  createdAt: any;
}

interface ReactionCounts {
  [emoji: string]: number;
}

interface UserReactions {
  [emoji: string]: boolean;
}

export function useReactions(commentId: string, collectionPath: string) {
  const { currentUser } = useAuth();
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts>({});
  const [userReactions, setUserReactions] = useState<UserReactions>({});
  const [loading, setLoading] = useState(true);
  const [optimisticUpdates, setOptimisticUpdates] = useState<{[key: string]: string}>({});
  const debounceRef = useRef<{[key: string]: NodeJS.Timeout}>({});

  // Load reaction counts directly from reactions subcollection (temporary fix for Cloud Functions)
  useEffect(() => {
    if (!commentId || !collectionPath) return;

    console.log('🔄 [useReactions] Setting up direct reaction count listener for:', { commentId, collectionPath });

    const reactionsRef = collection(db, collectionPath, commentId, 'reactions');
    const unsubscribe = onSnapshot(reactionsRef, (snapshot) => {
      console.log('🔄 [useReactions] Direct reactions snapshot received:', { 
        size: snapshot.size, 
        docs: snapshot.docs.length 
      });
      
      const counts: ReactionCounts = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const emoji = data.emoji;
        if (emoji) {
          counts[emoji] = (counts[emoji] || 0) + 1;
        }
      });
      
      console.log('🔄 [useReactions] Calculated reaction counts:', counts);
      setReactionCounts(counts);
      setLoading(false);
    }, (error) => {
      console.error('❌ [useReactions] Error loading direct reactions:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [commentId, collectionPath]);

  // Load user's specific reactions (one-time check)
  useEffect(() => {
    if (!currentUser || !commentId || !collectionPath) {
      setUserReactions({});
      return;
    }

    const checkUserReactions = async () => {
      try {
        const userReacts: UserReactions = {};
        const availableEmojis = ['❤️', '😂', '😮', '👍', '👎', '😢', '😡'];
        
        // Check each emoji for user's reaction
        for (const emoji of availableEmojis) {
          const reactionRef = doc(db, collectionPath, commentId, 'reactions', `${currentUser.id}_${emoji}`);
          const reactionDoc = await getDoc(reactionRef);
          if (reactionDoc.exists()) {
            userReacts[emoji] = true;
          }
        }
        
        setUserReactions(userReacts);
      } catch (error) {
        console.error('Error checking user reactions:', error);
      }
    };

    checkUserReactions();
  }, [currentUser, commentId, collectionPath]);

  // Optimistic reaction toggle with debouncing
  const toggleReaction = useCallback(async (emoji: string) => {
    console.log('🔄 [useReactions] toggleReaction called!', {
      emoji: emoji,
      commentId: commentId,
      collectionPath: collectionPath,
      currentUser: currentUser?.id,
      userReactions: userReactions,
      reactionCounts: reactionCounts
    });
    
    if (!currentUser || !commentId || !collectionPath) {
      console.log('❌ [useReactions] Missing required data:', {
        currentUser: !!currentUser,
        commentId: !!commentId,
        collectionPath: !!collectionPath
      });
      return;
    }

    const compoundKey = `${currentUser.id}_${emoji}`;
    const isCurrentlyReacted = userReactions[emoji] || optimisticUpdates[compoundKey] === 'add';

    // Clear any existing debounce for this emoji
    if (debounceRef.current[compoundKey]) {
      clearTimeout(debounceRef.current[compoundKey]);
    }

    // Optimistic update
    setOptimisticUpdates(prev => ({
      ...prev,
      [compoundKey]: isCurrentlyReacted ? 'remove' : 'add'
    }));

    // Update local state immediately
    setUserReactions(prev => ({
      ...prev,
      [emoji]: !isCurrentlyReacted
    }));

    setReactionCounts(prev => ({
      ...prev,
      [emoji]: Math.max(0, (prev[emoji] || 0) + (isCurrentlyReacted ? -1 : 1))
    }));

    // Debounced Firestore update
    debounceRef.current[compoundKey] = setTimeout(async () => {
      try {
        console.log('🔥 [useReactions] Starting Firestore operation:', {
          compoundKey,
          emoji,
          isCurrentlyReacted,
          commentId,
          collectionPath
        });

        const reactionRef = doc(db, collectionPath, commentId, 'reactions', compoundKey);
        console.log('🔥 [useReactions] Reaction ref created:', reactionRef.path);
        
        if (isCurrentlyReacted) {
          // Remove reaction
          console.log('🔥 [useReactions] Removing reaction from Firestore');
          await deleteDoc(reactionRef);
          console.log('✅ [useReactions] Reaction removed successfully');
        } else {
          // Add reaction
          console.log('🔥 [useReactions] Adding reaction to Firestore');
          await setDoc(reactionRef, {
            userId: currentUser.id,
            emoji,
            createdAt: serverTimestamp()
          });
          console.log('✅ [useReactions] Reaction added successfully');
        }

        // Clear optimistic update
        setOptimisticUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[compoundKey];
          return newUpdates;
        });

        console.log('✅ [useReactions] Firestore operation completed successfully');

      } catch (error) {
        console.error('❌ [useReactions] Error updating reaction:', error);
        console.error('❌ [useReactions] Error details:', {
          message: error.message,
          code: error.code,
          compoundKey,
          emoji,
          commentId,
          collectionPath
        });
        
        // Rollback optimistic update
        setUserReactions(prev => ({
          ...prev,
          [emoji]: isCurrentlyReacted
        }));

        setReactionCounts(prev => ({
          ...prev,
          [emoji]: (prev[emoji] || 0) + (isCurrentlyReacted ? 1 : -1)
        }));

        toast.error('Failed to update reaction. Please try again.');
      }
    }, 100); // 100ms debounce for faster testing
  }, [currentUser, commentId, collectionPath, userReactions, optimisticUpdates]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceRef.current).forEach(clearTimeout);
    };
  }, []);

  return {
    reactionCounts,
    userReactions,
    loading,
    toggleReaction
  };
}
