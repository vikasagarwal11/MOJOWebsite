import { useCallback, useState } from 'react';
import { useStorage } from '../hooks/useStorage';
import { useFirestore } from '../hooks/useFirestore';

export type UploadResult = { id?: string; url: string; title: string };

export function useUploader() {
  const { uploadFile, getStoragePath, getStorageFolder } = useStorage();
  const { addDocument } = useFirestore();
  const [loading, setLoading] = useState(false);

  const uploadOne = useCallback(async (file: File, meta: any, onProgress?: (progress: number) => void) => {
    const path = getStoragePath('media', file.name);
    // CRITICAL FIX: Derive folder from the actual path to ensure they match
    const folder = path.substring(0, path.lastIndexOf('/') + 1);
    
    const url = await uploadFile(file, path, onProgress);
    const docData = { 
      ...meta, 
      url, 
      createdAt: new Date(),
      storageFolder: folder, // This now matches the actual file path
      filePath: path // This field for FFmpeg processing
    };
    
    await addDocument('media', docData);
    return { url, title: meta.title } as UploadResult;
  }, [uploadFile, getStoragePath, addDocument]);

  const uploadMany = useCallback(async (
    files: File[], 
    makeMeta: (file: File) => any | Promise<any>,
    onProgress?: (fileName: string, progress: number) => void
  ) => {
    setLoading(true);
    try {
      const results: UploadResult[] = [];
      
      // Parallel uploads with concurrency cap (2 at a time)
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