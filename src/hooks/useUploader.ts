import { useCallback, useState } from 'react';
import { useStorage } from '../hooks/useStorage';
import { useFirestore } from '../hooks/useFirestore';
import { v4 as uuidv4 } from 'uuid';

export type UploadResult = { id?: string; url: string; title: string };

export function useUploader() {
  const { uploadFile, getStoragePath, getStorageFolder } = useStorage();
  const { addDocument } = useFirestore();
  const [loading, setLoading] = useState(false);

  const uploadOne = useCallback(async (file: File, meta: any, onProgress?: (progress: number) => void) => {
    // Generate UUID once and use consistently for both storage path and Firestore document
    const batchId = uuidv4();
    
    // Build path manually to ensure consistency
    const path = `media/${meta.uploadedBy || 'unknown'}/${batchId}/${file.name}`;
    const folder = path.substring(0, path.lastIndexOf('/') + 1);
    
    console.log('🔍 Upload path consistency check:', { 
      path, 
      folder, 
      fileName: file.name,
      batchId 
    });
    
    const url = await uploadFile(file, path, onProgress);
    const docData = { 
      ...meta, 
      url, 
      createdAt: new Date(),
      storageFolder: folder, // This now matches the actual file path
      filePath: path // This field for Cloud Function processing
    };
    
    console.log('🔍 Creating document with paths:', { 
      filePath: docData.filePath, 
      storageFolder: docData.storageFolder 
    });
    
    await addDocument('media', docData);
    return { url, title: meta.title } as UploadResult;
  }, [uploadFile, addDocument]);

  const uploadMany = useCallback(async (
    files: File[], 
    makeMeta: (file: File) => any | Promise<any>,
    onProgress?: (fileName: string, progress: number) => void
  ) => {
    setLoading(true);
    try {
      const results: UploadResult[] = [];
      
      // Parallel uploads with concurrency cap (4 at a time)
      const concurrency = 4;
      const queue = Array.from(files);
      
      const workers = Array.from({ length: concurrency }).map(async () => {
        for (;;) {
          const f = queue.shift(); 
          if (!f) break;
          
          try {
            const meta = await Promise.resolve(makeMeta(f));
            const res = await uploadOne(f, meta, (progress) => {
              if (onProgress) {
                onProgress(f.name, progress);
              }
            });
            results.push(res);
          } catch (error) {
            console.error(`Failed to upload ${f.name}:`, error);
            // Continue with other files even if one fails
          }
        }
      });
      
      await Promise.all(workers);
      return results;
    } finally {
      setLoading(false);
    }
  }, [uploadOne]);

  return { loading, uploadOne, uploadMany };
}