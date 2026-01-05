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

/**
 * Get cached thumbnail URL or null if not cached
 */
export function getCachedThumbnailUrl(storagePath: string): string | null {
  return thumbnailUrlCache.get(storagePath) || null;
}

/**
 * Cache a resolved thumbnail URL
 */
export function setCachedThumbnailUrl(storagePath: string, url: string): void {
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

