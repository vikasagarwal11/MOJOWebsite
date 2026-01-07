/**
 * Shared Thumbnail URL Cache
 * 
 * Module-level cache for resolved thumbnail URLs to avoid redundant
 * getDownloadURL() calls across all MediaCard components.
 * 
 * This is more efficient than per-component caching because:
 * - Multiple cards can share the same cached URLs
 * - Cache persists across component unmounts
 * - Reduces network overhead significantly
 */

// Module-level cache shared across all MediaCard instances
const thumbnailUrlCache = new Map<string, string>();

// Maximum cache size to prevent unbounded memory growth
// 1000 entries = ~100KB memory (assuming ~100 bytes per entry)
const MAX_CACHE_SIZE = 1000;

/**
 * Get cached thumbnail URL or null if not cached
 */
export function getCachedThumbnailUrl(storagePath: string): string | null {
  const url = thumbnailUrlCache.get(storagePath);
  
  // Move to end (LRU - most recently used)
  if (url) {
    thumbnailUrlCache.delete(storagePath);
    thumbnailUrlCache.set(storagePath, url);
  }
  
  return url || null;
}

/**
 * Cache a resolved thumbnail URL
 * Implements LRU eviction when cache exceeds MAX_CACHE_SIZE
 */
export function setCachedThumbnailUrl(storagePath: string, url: string): void {
  // If already exists, update it (moves to end)
  if (thumbnailUrlCache.has(storagePath)) {
    thumbnailUrlCache.delete(storagePath);
  }
  
  // If cache is full, remove oldest entry (first in Map)
  if (thumbnailUrlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = thumbnailUrlCache.keys().next().value;
    if (firstKey) {
      thumbnailUrlCache.delete(firstKey);
    }
  }
  
  // Add new entry (will be at end of Map)
  thumbnailUrlCache.set(storagePath, url);
}

/**
 * Check if a path is already cached
 */
export function hasCachedThumbnailUrl(storagePath: string): boolean {
  return thumbnailUrlCache.has(storagePath);
}

/**
 * Clear the cache (useful for testing or memory management)
 */
export function clearThumbnailUrlCache(): void {
  thumbnailUrlCache.clear();
}

/**
 * Get cache size (for debugging/monitoring)
 */
export function getThumbnailUrlCacheSize(): number {
  return thumbnailUrlCache.size;
}

