import { useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';

export const useStorage = () => {
  const { currentUser } = useAuth();
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    if (!currentUser) {
      throw new Error('User must be authenticated to upload files');
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, path);
      
      // Use uploadBytesResumable for progress tracking
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      // Set up progress tracking
      if (onProgress) {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(progress);
          },
          (error) => {
            console.error('Upload error:', error);
            throw error;
          },
          async () => {
            // Upload completed successfully
          }
        );
      }
      
      // Wait for upload to complete
      const snapshot = await uploadTask;
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error: any) {
      console.error('Upload error:', error);
      
      // Handle specific Firebase Storage errors
      if (error.code === 'storage/unauthorized') {
        toast.error('You do not have permission to upload this file');
      } else if (error.code === 'storage/quota-exceeded') {
        toast.error('Storage quota exceeded');
      } else if (error.code === 'storage/invalid-format') {
        toast.error('Invalid file format');
      } else {
        toast.error('Failed to upload file');
      }
      
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (path: string): Promise<void> => {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);
      toast.success('File deleted successfully');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file');
      throw error;
    }
  };

  // Helper function to generate storage paths
  const getStoragePath = (type: 'media' | 'profiles' | 'events' | 'sponsors', fileName: string) => {
    if (!currentUser) return '';
    
    switch (type) {
      case 'media':
        const batchId = uuid(); // Generate unique UUID for this upload
        return `media/${currentUser.id}/${batchId}/${fileName}`;
      case 'profiles':
        return `profiles/${currentUser.id}/${fileName}`;
      case 'events':
        return `events/${Date.now()}_${fileName}`;
      case 'sponsors':
        return `sponsors/${Date.now()}_${fileName}`;
      default:
        return `misc/${Date.now()}_${fileName}`;
    }
  };

  // Helper function to get storage folder path for cleanup
  const getStorageFolder = (type: 'media' | 'profiles' | 'events' | 'sponsors') => {
    if (!currentUser) return '';
    
    switch (type) {
      case 'media':
        const batchId = uuid(); // Generate unique UUID for this upload
        return `media/${currentUser.id}/${batchId}/`;
      case 'profiles':
        return `profiles/${currentUser.id}/`;
      case 'events':
        return `events/`;
      case 'sponsors':
        return `sponsors/`;
      default:
        return `misc/`;
    }
  };

  return {
    uploadFile,
    deleteFile,
    getStoragePath,
    getStorageFolder,
    uploading,
  };
};