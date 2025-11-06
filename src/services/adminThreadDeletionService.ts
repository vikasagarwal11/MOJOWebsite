import { 
  doc, 
  deleteDoc, 
  collection, 
  getDocs, 
  query,
  where,
  writeBatch,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import { useState } from 'react';

export interface ThreadDeletionResult {
  success: boolean;
  deletedCounts: {
    comments: number;
    reactions: number;
    likes: number;
    mediaFiles: number;
  };
  errors: string[];
}

export class AdminThreadDeletionService {
  /**
   * Delete a comment thread and all its nested replies
   * @param commentId - The ID of the comment to delete
   * @param collectionPath - The collection path (e.g., 'posts/{postId}/comments')
   * @param userId - The ID of the user performing the deletion (admin or author)
   * @returns Promise<ThreadDeletionResult>
   */
  static async deleteCommentThread(
    commentId: string, 
    collectionPath: string, 
    userId: string
  ): Promise<ThreadDeletionResult> {
    const result: ThreadDeletionResult = {
      success: false,
      deletedCounts: {
        comments: 0,
        reactions: 0,
        likes: 0,
        mediaFiles: 0
      },
      errors: []
    };

    try {
      console.log(`🗑️ [AdminThreadDeletion] Starting deletion of thread ${commentId} by user ${userId}`);

      // 1. Get comment data first
      const commentRef = doc(db, collectionPath, commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (!commentDoc.exists()) {
        result.errors.push('Comment not found');
        return result;
      }

      const commentData = commentDoc.data();

      // 2. Verify user has permission to delete this comment
      const isAdmin = await this.checkAdminPermissions(userId);
      const isAuthor = commentData.authorId === userId;
      
      if (!isAdmin && !isAuthor) {
        result.errors.push('User does not have permission to delete this comment');
        return result;
      }

      console.log(`🗑️ [AdminThreadDeletion] Comment data retrieved for ${isAdmin ? 'admin' : 'author'} deletion:`, commentData);

      // 2. Find all replies to this comment (recursive)
      const allCommentsToDelete = await this.findAllReplies(commentId, collectionPath);
      console.log(`🗑️ [AdminThreadDeletion] Found ${allCommentsToDelete.length} comments to delete (including replies)`);

      // 3. Delete all comments and their associated data
      for (const commentToDelete of allCommentsToDelete) {
        try {
        // For admin users, delete all associated data (reactions, likes)
        // For comment authors, only delete their own comment (let admin handle nested cleanup if needed)
        if (isAdmin) {
          // Delete comment reactions
          const reactionsResult = await this.deleteCommentReactions(collectionPath, commentToDelete.id);
          result.deletedCounts.reactions += reactionsResult.reactions;
          result.errors.push(...reactionsResult.errors);

          // Delete comment likes
          const likesResult = await this.deleteCommentLikes(collectionPath, commentToDelete.id);
          result.deletedCounts.likes += likesResult.likes;
          result.errors.push(...likesResult.errors);
        }

        // Always delete associated media files (both admin and author should clean up their media)
        const mediaResult = await this.deleteCommentMediaFiles(commentToDelete.data);
        result.deletedCounts.mediaFiles += mediaResult.deletedFiles;
        result.errors.push(...mediaResult.errors);

        // Delete the comment document
        await deleteDoc(doc(db, collectionPath, commentToDelete.id));
        result.deletedCounts.comments++;
        console.log(`✅ [AdminThreadDeletion] Comment ${commentToDelete.id} deleted by ${isAdmin ? 'admin' : 'author'}`);

      } catch (error) {
        console.error(`❌ [AdminThreadDeletion] Error deleting comment ${commentToDelete.id}:`, error);
        result.errors.push(`Failed to delete comment ${commentToDelete.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

      // 4. Log the deletion action
      await this.logThreadDeletionAction( commentId, collectionPath, userId, result.deletedCounts);

      result.success = true;
      console.log(`✅ [AdminThreadDeletion] Thread deletion completed successfully:`, result.deletedCounts);

    } catch (error) {
      console.error('❌ [AdminThreadDeletion] Error deleting thread:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    return result;
  }

  /**
   * Recursively find all replies to a comment
   */
  private static async findAllReplies(commentId: string, collectionPath: string): Promise<any[]> {
    const commentsToDelete: any[] = [];
    
    try {
      // Get the main comment
      const commentRef = doc(db, collectionPath, commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (commentDoc.exists()) {
        commentsToDelete.push({
          id: commentId,
          data: commentDoc.data()
        });
      }

      // Find all direct replies to this comment
      const repliesQuery = query(
        collection(db, collectionPath),
        where('parentCommentId', '==', commentId)
      );
      
      const repliesSnapshot = await getDocs(repliesQuery);
      
      // Recursively find replies to each reply
      for (const replyDoc of repliesSnapshot.docs) {
        const replyId = replyDoc.id;
        const nestedReplies = await this.findAllReplies(replyId, collectionPath);
        commentsToDelete.push(...nestedReplies);
      }

    } catch (error) {
      console.error(`❌ [AdminThreadDeletion] Error finding replies for comment ${commentId}:`, error);
    }

    return commentsToDelete;
  }

  /**
   * Delete all reactions for a specific comment
   */
  private static async deleteCommentReactions(collectionPath: string, commentId: string): Promise<{
    reactions: number;
    errors: string[];
  }> {
    const result = {
      reactions: 0,
      errors: [] as string[]
    };

    try {
      const reactionsRef = collection(db, collectionPath, commentId, 'reactions');
      const reactionsSnapshot = await getDocs(reactionsRef);
      
      console.log(`🗑️ [AdminThreadDeletion] Found ${reactionsSnapshot.size} reactions for comment ${commentId}`);

      // Use batch delete for efficiency
      const batch = writeBatch(db);
      reactionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (reactionsSnapshot.size > 0) {
        await batch.commit();
        result.reactions = reactionsSnapshot.size;
        console.log(`✅ [AdminThreadDeletion] ${result.reactions} reactions deleted for comment ${commentId}`);
      }

    } catch (error) {
      console.error(`❌ [AdminThreadDeletion] Error deleting reactions for comment ${commentId}:`, error);
      result.errors.push(`Failed to delete reactions for comment ${commentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Delete all likes for a specific comment
   */
  private static async deleteCommentLikes(collectionPath: string, commentId: string): Promise<{
    likes: number;
    errors: string[];
  }> {
    const result = {
      likes: 0,
      errors: [] as string[]
    };

    try {
      const likesRef = collection(db, collectionPath, commentId, 'likes');
      const likesSnapshot = await getDocs(likesRef);
      
      console.log(`🗑️ [AdminThreadDeletion] Found ${likesSnapshot.size} likes for comment ${commentId}`);

      // Use batch delete for efficiency
      const batch = writeBatch(db);
      likesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (likesSnapshot.size > 0) {
        await batch.commit();
        result.likes = likesSnapshot.size;
        console.log(`✅ [AdminThreadDeletion] ${result.likes} likes deleted for comment ${commentId}`);
      }

    } catch (error) {
      console.error(`❌ [AdminThreadDeletion] Error deleting likes for comment ${commentId}:`, error);
      result.errors.push(`Failed to delete likes for comment ${commentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Delete media files associated with the comment
   */
  private static async deleteCommentMediaFiles(commentData: any): Promise<{
    deletedFiles: number;
    errors: string[];
  }> {
    const result = {
      deletedFiles: 0,
      errors: [] as string[]
    };

    try {
      // Check if comment has mediaUrls
      if (commentData.mediaUrls && Array.isArray(commentData.mediaUrls)) {
        for (const mediaUrl of commentData.mediaUrls) {
          try {
            // Extract file path from URL
            const url = new URL(mediaUrl);
            const pathMatch = url.pathname.match(/\/o\/(.+?)(?:\?|$)/);
            
            if (pathMatch) {
              const filePath = decodeURIComponent(pathMatch[1]);
              const fileRef = ref(storage, filePath);
              
              await deleteObject(fileRef);
              result.deletedFiles++;
              console.log(`✅ [AdminThreadDeletion] Comment media file deleted: ${filePath}`);

              // Firebase Extensions create thumbnails but don't automatically delete them when original is deleted
              // We need to manually delete the thumbnails for comment images
              if (filePath.startsWith('comments/') && (filePath.includes('.jpg') || filePath.includes('.jpeg') || filePath.includes('.png') || filePath.includes('.webp'))) {
                try {
                  const pathParts = filePath.split('/');
                  const fileName = pathParts.pop();
                  const directory = pathParts.join('/');
                  
                  if (fileName) {
                    // Firebase Extensions creates thumbnails with timestamp prefix and full filename
                    // We need to find and delete all thumbnails that match this pattern
                    
                    // List all files in the thumbnails directory to find matching thumbnails
                    const thumbnailsDir = `${directory}/thumbnails`;
                    const thumbnailsListRef = ref(storage, thumbnailsDir);
                    
                    try {
                      const thumbnailsList = await listAll(thumbnailsListRef);
                      
                      // Find thumbnails that contain the original filename for all sizes: 400x400, 800x800, 1200x1200
                      const thumbnailSizes = ['_400x400', '_800x800', '_1200x1200'];
                      const matchingThumbnails = thumbnailsList.items.filter(item => {
                        const itemName = item.name;
                        // Check if this thumbnail corresponds to our original file
                        // Pattern: [timestamp]_[original-filename]_{size}.[extension]
                        const baseNameMatch = itemName.includes(fileName.replace(/\.[^/.]+$/, ''));
                        const sizeMatch = thumbnailSizes.some(size => itemName.includes(size));
                        return baseNameMatch && sizeMatch;
                      });
                      
                      console.log(`🔍 [AdminThreadDeletion] Found ${matchingThumbnails.length} matching comment thumbnails for ${fileName}`);
                      
                      // Delete all matching thumbnails
                      for (const thumbnailItem of matchingThumbnails) {
                        try {
                          console.log(`🔍 [AdminThreadDeletion] Deleting comment thumbnail: ${thumbnailItem.fullPath}`);
                          await deleteObject(thumbnailItem);
                          result.deletedFiles++;
                          console.log(`✅ [AdminThreadDeletion] Comment thumbnail deleted: ${thumbnailItem.fullPath}`);
                        } catch (deleteError) {
                          console.log(`ℹ️ [AdminThreadDeletion] Failed to delete comment thumbnail ${thumbnailItem.fullPath}:`, deleteError);
                        }
                      }
                    } catch (listError) {
                      console.log(`ℹ️ [AdminThreadDeletion] Could not list comment thumbnails directory ${thumbnailsDir}:`, listError);
                    }
                  }
                } catch (thumbnailError) {
                  console.log(`ℹ️ [AdminThreadDeletion] Comment thumbnail deletion process failed:`, thumbnailError);
                }
              }
            }
          } catch (error) {
            console.error('❌ [AdminThreadDeletion] Error deleting comment media file:', error);
            result.errors.push(`Failed to delete comment media file: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

    } catch (error) {
      console.error('❌ [AdminThreadDeletion] Error deleting comment media files:', error);
      result.errors.push(`Failed to delete comment media files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Log the thread deletion action for audit purposes
   */
  private static async logThreadDeletionAction(
    commentId: string, 
    collectionPath: string, 
    userId: string, 
    deletedCounts: ThreadDeletionResult['deletedCounts']
  ): Promise<void> {
    try {
      await addDoc(collection(db, 'adminLogs'), {
        action: 'thread_deletion',
        commentId,
        collectionPath,
        userId,
        deletedCounts,
        timestamp: new Date(),
        type: 'admin_action'
      });
      
      console.log(`📝 [AdminThreadDeletion] Thread deletion action logged`);
    } catch (error) {
      console.error('❌ [AdminThreadDeletion] Error logging thread deletion action:', error);
      // Don't throw here - logging failure shouldn't prevent deletion
    }
  }

  /**
   * Check if user has admin permissions
   */
  static async checkAdminPermissions(userId: string): Promise<boolean> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return false;
      }

      const userData = userDoc.data();
      return userData.role === 'admin';
    } catch (error) {
      console.error('❌ [AdminThreadDeletion] Error checking admin permissions:', error);
      return false;
    }
  }
}

/**
 * Hook for admin thread deletion functionality
 */
export function useAdminThreadDeletion() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteCommentThread = async (
    commentId: string, 
    collectionPath: string, 
    userId: string
  ): Promise<ThreadDeletionResult> => {
    setIsDeleting(true);
    
    try {
      const result = await AdminThreadDeletionService.deleteCommentThread(commentId, collectionPath, userId);
      
      if (result.success) {
        toast.success(`Thread deleted successfully! Removed ${result.deletedCounts.comments} comments, ${result.deletedCounts.reactions} reactions, ${result.deletedCounts.likes} likes, and ${result.deletedCounts.mediaFiles} media files.`);
      } else {
        toast.error(`Thread deletion completed with errors: ${result.errors.join(', ')}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete thread';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteCommentThread,
    isDeleting
  };
}
