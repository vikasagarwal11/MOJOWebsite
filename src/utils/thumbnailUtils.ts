/**
 * Utility functions for generating thumbnail URLs from Firebase Storage URLs
 * This leverages the Firebase Extensions that automatically generate thumbnails
 */

/**
 * Generate a thumbnail URL from a Firebase Storage URL
 * Firebase Extensions create thumbnails in the format: originalPath/thumbnails/filename_800x800.ext (for medium size)
 */
export function getThumbnailUrl(originalUrl: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!originalUrl) return originalUrl;
  
  try {
    // Parse the Firebase Storage URL
    const url = new URL(originalUrl);
    
    // Extract the file path from the URL
    const pathMatch = url.pathname.match(/\/o\/(.+)$/);
    if (!pathMatch) return originalUrl;
    
    const encodedPath = pathMatch[1];
    const decodedPath = decodeURIComponent(encodedPath);
    
    // Extract filename and directory
    const pathParts = decodedPath.split('/');
    const fileName = pathParts.pop();
    const directory = pathParts.join('/');
    
    if (!fileName) return originalUrl;
    
    // Extract base name and extension
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return originalUrl;
    
    const baseName = fileName.substring(0, lastDotIndex);
    const extension = fileName.substring(lastDotIndex);
    
    // Generate thumbnail path based on size
    const sizeMap = {
      small: '200x200',
      medium: '800x800', 
      large: '600x600'
    };
    
    const thumbnailSize = sizeMap[size];
    const thumbnailFileName = `${baseName}_${thumbnailSize}${extension}`;
    const thumbnailPath = `${directory}/thumbnails/${thumbnailFileName}`;
    
    // Reconstruct the Firebase Storage URL
    const encodedThumbnailPath = encodeURIComponent(thumbnailPath);
    const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${url.hostname.split('.')[0]}/o/${encodedThumbnailPath}?alt=media`;
    
    return thumbnailUrl;
  } catch (error) {
    console.warn('Failed to generate thumbnail URL:', error);
    return originalUrl;
  }
}

/**
 * Generate multiple thumbnail URLs for different sizes
 */
export function getThumbnailUrls(originalUrl: string) {
  return {
    small: getThumbnailUrl(originalUrl, 'small'),
    medium: getThumbnailUrl(originalUrl, 'medium'),
    large: getThumbnailUrl(originalUrl, 'large'),
    original: originalUrl
  };
}

/**
 * Check if a URL is a Firebase Storage URL
 */
export function isFirebaseStorageUrl(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com');
}

/**
 * Generate a responsive image srcSet for thumbnails
 */
export function getResponsiveThumbnailSrcSet(originalUrl: string): string {
  if (!isFirebaseStorageUrl(originalUrl)) {
    return originalUrl;
  }
  
  const small = getThumbnailUrl(originalUrl, 'small');
  const medium = getThumbnailUrl(originalUrl, 'medium');
  const large = getThumbnailUrl(originalUrl, 'large');
  
  return `${small} 200w, ${medium} 400w, ${large} 600w`;
}

/**
 * Get the best thumbnail URL for a given container size
 */
export function getBestThumbnailUrl(originalUrl: string, containerWidth: number): string {
  if (!isFirebaseStorageUrl(originalUrl)) {
    return originalUrl;
  }
  
  if (containerWidth <= 200) {
    return getThumbnailUrl(originalUrl, 'small');
  } else if (containerWidth <= 400) {
    return getThumbnailUrl(originalUrl, 'medium');
  } else {
    return getThumbnailUrl(originalUrl, 'large');
  }
}
