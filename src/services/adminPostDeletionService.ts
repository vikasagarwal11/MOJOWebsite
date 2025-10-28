import { 
  doc, 
  deleteDoc, 
  collection, 
  getDocs, 
  writeBatch,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import { useState } from 'react';

export interface PostDeletionResult {
  success: boolean;
  deletedCounts: {
    post: number;
    comments: number;
    reactions: number;
    mediaFiles: number;
  };
  errors: string[];
}

export class AdminPostDeletionService {
  /**
   * Delete a post and all its associated data
   * @param postId - The ID of the post to delete
   * @param adminId - The ID of the admin performing the deletion
   * @returns Promise<PostDeletionResult>
   */
  static async deletePost(postId: string, actorId: string): Promise<PostDeletionResult> {
    const result: PostDeletionResult = {
      success: false,
      deletedCounts: {
        post: 0,
        comments: 0,
        reactions: 0,
        mediaFiles: 0
      },
      errors: []
    };

    try {
      console.log(`🗑️ [AdminPostDeletion] Starting deletion of post ${postId} by user ${actorId}`);

      // 1. Get post data first to check for associated media
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      
      if (!postDoc.exists()) {
        result.errors.push('Post not found');
        return result;
      }

      const postData = postDoc.data();
      console.log(`🗑️ [AdminPostDeletion] Post data retrieved:`, postData);

      const isAdminUser = await this.checkAdminPermissions(actorId);
      const isAuthor = postData?.authorId === actorId;
      if (!isAdminUser && !isAuthor) {
        throw new Error('User is not authorized to delete this post');
      }

      // 2. Delete all comments and their reactions
      const commentsResult = await this.deletePostComments(postId);
      result.deletedCounts.comments = commentsResult.comments;
      result.deletedCounts.reactions = commentsResult.reactions;
      result.errors.push(...commentsResult.errors);

      // 3. Delete associated media files from storage
      console.log(`🔍 [AdminPostDeletion] About to call deletePostMediaFiles with postData:`, postData);
      console.log(`🔍 [AdminPostDeletion] Post data keys:`, Object.keys(postData));
      console.log(`🔍 [AdminPostDeletion] Post data imageUrl:`, postData.imageUrl);
      const mediaResult = await this.deletePostMediaFiles(postData);
      console.log(`🔍 [AdminPostDeletion] Media deletion result:`, mediaResult);
      result.deletedCounts.mediaFiles = mediaResult.deletedFiles;
      result.errors.push(...mediaResult.errors);

      // 4. Delete the main post document
      await deleteDoc(postRef);
      result.deletedCounts.post = 1;
      console.log(`✅ [AdminPostDeletion] Post document deleted`);

      // 5. Log the deletion action
      await this.logDeletionAction(postId, actorId, result.deletedCounts, isAdminUser ? 'admin' : 'author');

      result.success = true;
      console.log(`✅ [AdminPostDeletion] Post deletion completed successfully:`, result.deletedCounts);

    } catch (error) {
      console.error('❌ [AdminPostDeletion] Error deleting post:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    return result;
  }

  /**
   * Delete all comments and reactions for a post
   */
  private static async deletePostComments(postId: string): Promise<{
    comments: number;
    reactions: number;
    errors: string[];
  }> {
    const result = {
      comments: 0,
      reactions: 0,
      errors: [] as string[]
    };

    try {
      // Get all comments
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const commentsSnapshot = await getDocs(commentsRef);
      
      console.log(`🗑️ [AdminPostDeletion] Found ${commentsSnapshot.size} comments to delete`);

      // Delete each comment and its reactions
      for (const commentDoc of commentsSnapshot.docs) {
        const commentId = commentDoc.id;
        
        try {
          // Delete comment reactions
          const reactionsResult = await this.deleteCommentReactions(postId, commentId);
          result.reactions += reactionsResult.reactions;
          result.errors.push(...reactionsResult.errors);

          // Delete the comment document
          await deleteDoc(commentDoc.ref);
          result.comments++;
          console.log(`✅ [AdminPostDeletion] Comment ${commentId} deleted`);

        } catch (error) {
          console.error(`❌ [AdminPostDeletion] Error deleting comment ${commentId}:`, error);
          result.errors.push(`Failed to delete comment ${commentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (error) {
      console.error('❌ [AdminPostDeletion] Error deleting comments:', error);
      result.errors.push(`Failed to delete comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Delete all reactions for a specific comment
   */
  private static async deleteCommentReactions(postId: string, commentId: string): Promise<{
    reactions: number;
    errors: string[];
  }> {
    const result = {
      reactions: 0,
      errors: [] as string[]
    };

    try {
      const reactionsRef = collection(db, 'posts', postId, 'comments', commentId, 'reactions');
      const reactionsSnapshot = await getDocs(reactionsRef);
      
      console.log(`🗑️ [AdminPostDeletion] Found ${reactionsSnapshot.size} reactions for comment ${commentId}`);

      // Use batch delete for efficiency
      const batch = writeBatch(db);
      reactionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (reactionsSnapshot.size > 0) {
        await batch.commit();
        result.reactions = reactionsSnapshot.size;
        console.log(`✅ [AdminPostDeletion] ${result.reactions} reactions deleted for comment ${commentId}`);
      }

    } catch (error) {
      console.error(`❌ [AdminPostDeletion] Error deleting reactions for comment ${commentId}:`, error);
      result.errors.push(`Failed to delete reactions for comment ${commentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Delete media files associated with the post
   */
  private static async deletePostMediaFiles(postData: any): Promise<{
    deletedFiles: number;
    errors: string[];
  }> {
    const result = {
      deletedFiles: 0,
      errors: [] as string[]
    };

    console.log(`🔍 [AdminPostDeletion] Starting media file deletion for post:`, postData);

    try {
      // Check if post has an imageUrl
      if (postData.imageUrl) {
        console.log(`🔍 [AdminPostDeletion] Found imageUrl: ${postData.imageUrl}`);
        try {
          // Extract file path from URL
          const url = new URL(postData.imageUrl);
          console.log(`🔍 [AdminPostDeletion] Parsed URL pathname: ${url.pathname}`);
          
          const pathMatch = url.pathname.match(/\/o\/(.+?)(?:\?|$)/);
          console.log(`🔍 [AdminPostDeletion] Path match result:`, pathMatch);
          
          if (pathMatch) {
            const filePath = decodeURIComponent(pathMatch[1]);
            console.log(`🔍 [AdminPostDeletion] Extracted file path: ${filePath}`);
            const fileRef = ref(storage, filePath);
            
            await deleteObject(fileRef);
            result.deletedFiles++;
            console.log(`✅ [AdminPostDeletion] Post image deleted: ${filePath}`);
          } else {
            console.log(`❌ [AdminPostDeletion] Could not extract file path from URL: ${postData.imageUrl}`);
            result.errors.push(`Could not extract file path from URL: ${postData.imageUrl}`);
          }
        } catch (error) {
          console.error('❌ [AdminPostDeletion] Error deleting post image:', error);
          result.errors.push(`Failed to delete post image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log(`ℹ️ [AdminPostDeletion] No imageUrl found in post data`);
      }

          // Firebase Extensions create thumbnails but don't automatically delete them when original is deleted
          // We need to manually delete the thumbnails
          if (postData.imageUrl) {
            try {
              // Extract the file path from the imageUrl
              const url = new URL(postData.imageUrl);
              const pathMatch = url.pathname.match(/\/o\/(.+?)(?:\?|$)/);
              
              if (pathMatch) {
                const filePath = decodeURIComponent(pathMatch[1]);
                const pathParts = filePath.split('/');
                const fileName = pathParts.pop();
                const directory = pathParts.join('/');
                
                if (fileName) {
                  // Firebase Extensions creates thumbnails with timestamp prefix and full filename
                  // Example: posts/thumbnails/1758921844423_Upcoming Events  Moms Fitness Mojo - Millburn & Short Hills NJ_400x400.webp
                  // We need to find and delete all thumbnails that match this pattern
                  
                  // List all files in the thumbnails directory to find matching thumbnails
                  const thumbnailsDir = `${directory}/thumbnails`;
                  const thumbnailsListRef = ref(storage, thumbnailsDir);
                  
                  try {
                    const thumbnailsList = await listAll(thumbnailsListRef);
                    
                    // Find thumbnails that contain the original filename and end with _400x400
                    const matchingThumbnails = thumbnailsList.items.filter(item => {
                      const itemName = item.name;
                      // Check if this thumbnail corresponds to our original file
                      // Pattern: [timestamp]_[original-filename]_400x400.[extension]
                      return itemName.includes(fileName.replace(/\.[^/.]+$/, '')) && itemName.includes('_400x400');
                    });
                    
                    console.log(`🔍 [AdminPostDeletion] Found ${matchingThumbnails.length} matching thumbnails for ${fileName}`);
                    
                    // Delete all matching thumbnails
                    for (const thumbnailItem of matchingThumbnails) {
                      try {
                        console.log(`🔍 [AdminPostDeletion] Deleting thumbnail: ${thumbnailItem.fullPath}`);
                        await deleteObject(thumbnailItem);
                        result.deletedFiles++;
                        console.log(`✅ [AdminPostDeletion] Thumbnail deleted: ${thumbnailItem.fullPath}`);
                      } catch (deleteError) {
                        console.log(`ℹ️ [AdminPostDeletion] Failed to delete thumbnail ${thumbnailItem.fullPath}:`, deleteError);
                      }
                    }
                  } catch (listError) {
                    console.log(`ℹ️ [AdminPostDeletion] Could not list thumbnails directory ${thumbnailsDir}:`, listError);
                  }
                }
              }
            } catch (error) {
              console.log(`ℹ️ [AdminPostDeletion] Thumbnail deletion process failed:`, error);
              // Don't add this to errors since thumbnails might not exist for all images
            }
          }

          // Check for any other media files in posts folder (for future posts)
          // Note: This is a simplified approach - in production, you might want to store
          // post-specific folder references or use more sophisticated matching
          try {
            const postsMediaRef = ref(storage, `posts/`);
            const mediaList = await listAll(postsMediaRef);

            // For now, we'll only delete files if we can match them to this post
            // This is a simplified approach - in production, you might want to store
            // post-specific folder references or use more sophisticated matching
            console.log(`ℹ️ [AdminPostDeletion] Found ${mediaList.items.length} files in posts folder (not deleting all - would need post-specific matching)`);
          } catch (error) {
            // This is expected if no posts media folder exists
            console.log(`ℹ️ [AdminPostDeletion] No posts media folder found`);
          }

      // Check for any media files in misc folder (for existing posts that might have been stored there)
      // Note: This is a simplified approach - in production, you might want to store
      // post-specific folder references or use more sophisticated matching
      try {
        const miscMediaRef = ref(storage, `misc/`);
        const mediaList = await listAll(miscMediaRef);
        
        // For now, we'll only delete files if we can match them to this post
        // This is a simplified approach - in production, you might want to store
        // post-specific folder references or use more sophisticated matching
        console.log(`ℹ️ [AdminPostDeletion] Found ${mediaList.items.length} files in misc folder (not deleting all - would need post-specific matching)`);
      } catch (error) {
        // This is expected if no misc media folder exists
        console.log(`ℹ️ [AdminPostDeletion] No misc media folder found`);
      }

    } catch (error) {
      console.error('❌ [AdminPostDeletion] Error deleting post media files:', error);
      result.errors.push(`Failed to delete post media files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Log the deletion action for audit purposes
   */
  private static async logDeletionAction(
    postId: string, 
    actorId: string, 
    deletedCounts: PostDeletionResult['deletedCounts'],
    actorRole: 'admin' | 'author'
  ): Promise<void> {
    try {
      await addDoc(collection(db, 'adminLogs'), {
        action: 'post_deletion',
        postId,
        actorId,
        actorRole,
        deletedCounts,
        timestamp: new Date(),
        type: 'admin_action'
      });
      
      console.log(`📝 [AdminPostDeletion] Deletion action logged`);
    } catch (error) {
      console.error('❌ [AdminPostDeletion] Error logging deletion action:', error);
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
      console.error('❌ [AdminPostDeletion] Error checking admin permissions:', error);
      return false;
    }
  }
}

/**
 * Hook for admin post deletion functionality
 */
export function useAdminPostDeletion() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deletePost = async (postId: string, actorId: string): Promise<PostDeletionResult> => {
    setIsDeleting(true);
    
    try {
      const result = await AdminPostDeletionService.deletePost(postId, actorId);
      
      if (result.success) {
        toast.success(`Post deleted successfully! Removed ${result.deletedCounts.post} post, ${result.deletedCounts.comments} comments, ${result.deletedCounts.reactions} reactions, and ${result.deletedCounts.mediaFiles} media files.`);
      } else {
        toast.error(`Post deletion completed with errors: ${result.errors.join(', ')}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete post';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deletePost,
    isDeleting
  };
}
