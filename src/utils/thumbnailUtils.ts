/**
 * Utility functions for generating thumbnail URLs from Firebase Storage URLs
 * This leverages the Firebase Extensions that automatically generate thumbnails
 */

/**
 * Generate a thumbnail URL from a Firebase Storage URL
 * Firebase Extensions create thumbnails in the format: originalPath/thumbnails/filename_{size}.ext
 * Available sizes: 400x400 (small), 800x800 (medium), 1200x1200 (large)
 */
export function getThumbnailUrl(originalUrl: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!originalUrl) return originalUrl;
  
  try {
    // Parse the Firebase Storage URL
    const url = new URL(originalUrl);
    
    // Extract bucket name from pathname: /v0/b/{bucket}/o/{path}
    // This is more reliable than extracting from hostname
    const bucketMatch = url.pathname.match(/\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!bucketMatch) {
      // Fallback: try extracting from hostname if pathname format doesn't match
      const hostnameParts = url.hostname.split('.');
      if (hostnameParts.length >= 2 && hostnameParts[1] === 'firebasestorage') {
        const bucketName = hostnameParts[0];
        const pathMatch = url.pathname.match(/\/o\/(.+)$/);
        if (pathMatch) {
          const encodedPath = pathMatch[1];
          const decodedPath = decodeURIComponent(encodedPath);
          
          // Extract filename and directory
          const pathParts = decodedPath.split('/');
          const fileName = pathParts.pop();
          const directory = pathParts.join('/');
          
          if (fileName) {
            const lastDotIndex = fileName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
              const baseName = fileName.substring(0, lastDotIndex);
              const extension = fileName.substring(lastDotIndex);
              
              const sizeMap = {
                small: '400x400',
                medium: '800x800',
                large: '1200x1200'
              };
              
              const thumbnailSize = sizeMap[size];
              const thumbnailFileName = `${baseName}_${thumbnailSize}${extension}`;
              const thumbnailPath = `${directory}/thumbnails/${thumbnailFileName}`;
              const encodedThumbnailPath = encodeURIComponent(thumbnailPath);
              
              return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedThumbnailPath}?alt=media`;
            }
          }
        }
      }
      return originalUrl;
    }
    
    const bucketName = bucketMatch[1];
    const encodedPath = bucketMatch[2];
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
    // Updated to match Firebase Extension config: 400x400, 800x800, 1200x1200
    const sizeMap = {
      small: '400x400',   // Mobile, list views
      medium: '800x800',  // Tablet, current default
      large: '1200x1200'  // Desktop, retina displays, wide layouts
    };
    
    const thumbnailSize = sizeMap[size];
    const thumbnailFileName = `${baseName}_${thumbnailSize}${extension}`;
    const thumbnailPath = `${directory}/thumbnails/${thumbnailFileName}`;
    
    // Reconstruct the Firebase Storage URL with correct bucket name
    const encodedThumbnailPath = encodeURIComponent(thumbnailPath);
    const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedThumbnailPath}?alt=media`;
    
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
  
  // Updated widths to match actual thumbnail sizes: 400px, 800px, 1200px
  return `${small} 400w, ${medium} 800w, ${large} 1200w`;
}

/**
 * Get the best thumbnail URL for a given container size
 */
export function getBestThumbnailUrl(originalUrl: string, containerWidth: number): string {
  if (!isFirebaseStorageUrl(originalUrl)) {
    return originalUrl;
  }
  
  // Updated breakpoints to match new thumbnail sizes
  if (containerWidth <= 400) {
    return getThumbnailUrl(originalUrl, 'small');
  } else if (containerWidth <= 800) {
    return getThumbnailUrl(originalUrl, 'medium');
  } else {
    return getThumbnailUrl(originalUrl, 'large');
  }
}
