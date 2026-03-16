/**
 * Batch thumbnail URL resolver
 * 
 * Resolves multiple thumbnail storage paths to download URLs in parallel
 * to reduce waterfall effect and improve initial load performance.
 */

import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../config/firebase';
import { getCachedThumbnailUrl, setCachedThumbnailUrl } from './thumbnailUrlCache';

interface ThumbnailPath {
  path: string;
  mediaId: string;
}

interface ResolvedThumbnail {
  path: string;
  url: string;
  mediaId: string;
}

/**
 * Batch resolve thumbnail paths to download URLs
 * Uses cache when available, resolves missing ones in parallel
 * 
 * @param paths Array of thumbnail paths to resolve
 * @param maxConcurrent Maximum concurrent requests (default: 6)
 * @returns Promise resolving to map of path -> url
 */
export async function batchResolveThumbnailUrls(
  paths: ThumbnailPath[],
  maxConcurrent: number = 6
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  if (paths.length === 0) return results;

  // Separate cached and uncached paths
  const cached: Map<string, string> = new Map();
  const uncached: ThumbnailPath[] = [];

  for (const { path } of paths) {
    const cachedUrl = getCachedThumbnailUrl(path);
    if (cachedUrl) {
      cached.set(path, cachedUrl);
      results.set(path, cachedUrl);
    } else {
      uncached.push({ path });
    }
  }

  // If all were cached, return immediately
  if (uncached.length === 0) {
    return results;
  }

  // Resolve uncached paths in batches to avoid overwhelming the network
  for (let i = 0; i < uncached.length; i += maxConcurrent) {
    const batch = uncached.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async ({ path }) => {
      try {
        const url = await getDownloadURL(ref(storage, path));
        // Cache the resolved URL
        setCachedThumbnailUrl(path, url);
        return { path, url };
      } catch (error) {
        console.warn(`⚠️ Failed to resolve thumbnail path: ${path}`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    
    // Add successful resolutions to results
    batchResults.forEach(result => {
      if (result) {
        results.set(result.path, result.url);
      }
    });
  }

  return results;
}

/**
 * Extract thumbnail paths from media items for batch resolution
 * 
 * @param mediaItems Array of media items
 * @returns Array of thumbnail paths with media IDs
 */
export function extractThumbnailPaths(mediaItems: any[]): ThumbnailPath[] {
  const paths: ThumbnailPath[] = [];

  for (const item of mediaItems) {
    if (!item || item.type !== 'image') continue;

    // Try to get best thumbnail path
    const thumbnails = item.thumbnails;
    if (thumbnails) {
      // Prefer medium, fallback to small or large
      const path = thumbnails.mediumPath || 
                   thumbnails.smallPath || 
                   thumbnails.largePath;
      
      if (path && !path.startsWith('http')) {
        paths.push({ path, mediaId: item.id });
      }
    }

    // Also check thumbnailPath for videos
    if (item.thumbnailPath && !item.thumbnailPath.startsWith('http')) {
      paths.push({ path: item.thumbnailPath, mediaId: item.id });
    }
  }

  return paths;
}

