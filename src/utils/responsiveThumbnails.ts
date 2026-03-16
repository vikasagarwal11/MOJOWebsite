/**
 * Responsive Thumbnail Selection Utility
 * 
 * Provides intelligent thumbnail size selection based on:
 * - Viewport width
 * - Device pixel ratio (for high-DPI displays)
 * - Container size
 * 
 * Thumbnail sizes available:
 * - Small: 400x400 (mobile, dense grids)
 * - Medium: 800x800 (default for grid, tablets) - RECOMMENDED
 * - Large: 1200x1200 (desktop, high-DPI displays)
 */

export type ThumbnailSize = 'small' | 'medium' | 'large';

export interface ThumbnailUrls {
  small?: string;
  medium?: string;
  large?: string;
  original: string;
}

export interface ThumbnailReadyFlags {
  smallReady?: boolean;
  mediumReady?: boolean;
  largeReady?: boolean;
}

/**
 * Get the optimal thumbnail size based on viewport and device pixel ratio
 * 
 * Strategy:
 * - Mobile (< 768px): Small (400x400) - unless high-DPI, then medium
 * - Tablet (768px - 1200px): Medium (800x800) - unless high-DPI, then large
 * - Desktop (> 1200px): Large (1200x1200) for high-DPI, medium for standard
 * 
 * @param viewportWidth - Current viewport width in pixels
 * @param devicePixelRatio - Device pixel ratio (default: 1)
 * @returns Recommended thumbnail size
 */
export function getOptimalThumbnailSize(
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1024,
  devicePixelRatio: number = typeof window !== 'undefined' ? window.devicePixelRatio : 1
): ThumbnailSize {
  // Account for device pixel ratio (retina displays need higher resolution)
  const effectiveWidth = viewportWidth * devicePixelRatio;

  // Mobile devices
  if (viewportWidth < 768) {
    // High-DPI mobile (iPhone, modern Android) - use medium for crisp display
    if (devicePixelRatio >= 2) {
      return 'medium';
    }
    return 'small';
  }

  // Tablet devices
  if (viewportWidth < 1200) {
    // High-DPI tablet (iPad Pro, etc.) - use large for crisp display
    if (devicePixelRatio >= 2) {
      return 'large';
    }
    return 'medium';
  }

  // Desktop devices
  // Always use medium for standard displays, large for high-DPI
  return devicePixelRatio >= 2 ? 'large' : 'medium';
}

/**
 * Get the best available thumbnail URL from Firestore thumbnail data
 * 
 * Priority order:
 * 1. Requested size (if available and ready)
 * 2. Medium (if available and ready) - best balance
 * 3. Large (if available and ready)
 * 4. Small (if available and ready)
 * 5. Original URL (fallback)
 * 
 * @param thumbnails - Thumbnail paths and ready flags from Firestore
 * @param originalUrl - Original image URL (fallback)
 * @param preferredSize - Preferred thumbnail size
 * @returns Best available thumbnail URL
 */
export function getBestThumbnailUrl(
  thumbnails: {
    smallPath?: string;
    mediumPath?: string;
    largePath?: string;
    smallReady?: boolean;
    mediumReady?: boolean;
    largeReady?: boolean;
  } | undefined,
  originalUrl: string,
  preferredSize: ThumbnailSize = 'medium'
): string {
  if (!thumbnails) {
    return originalUrl;
  }

  // Try preferred size first
  if (preferredSize === 'small' && thumbnails.smallReady && thumbnails.smallPath) {
    return thumbnails.smallPath;
  }
  if (preferredSize === 'medium' && thumbnails.mediumReady && thumbnails.mediumPath) {
    return thumbnails.mediumPath;
  }
  if (preferredSize === 'large' && thumbnails.largeReady && thumbnails.largePath) {
    return thumbnails.largePath;
  }

  // Fallback priority: medium > large > small > original
  if (thumbnails.mediumReady && thumbnails.mediumPath) {
    return thumbnails.mediumPath;
  }
  if (thumbnails.largeReady && thumbnails.largePath) {
    return thumbnails.largePath;
  }
  if (thumbnails.smallReady && thumbnails.smallPath) {
    return thumbnails.smallPath;
  }

  return originalUrl;
}

/**
 * Generate srcSet string for responsive images
 * 
 * Format: "url1 width1, url2 width2, url3 width3"
 * 
 * @param thumbnails - Thumbnail paths and ready flags
 * @param originalUrl - Original image URL
 * @returns srcSet string for <img srcSet> attribute
 */
export function generateThumbnailSrcSet(
  thumbnails: {
    smallPath?: string;
    mediumPath?: string;
    largePath?: string;
    smallReady?: boolean;
    mediumReady?: boolean;
    largeReady?: boolean;
  } | undefined,
  originalUrl: string
): string {
  const srcSetParts: string[] = [];

  // Add available thumbnail sizes to srcSet
  if (thumbnails?.smallReady && thumbnails.smallPath) {
    srcSetParts.push(`${thumbnails.smallPath} 400w`);
  }
  if (thumbnails?.mediumReady && thumbnails.mediumPath) {
    srcSetParts.push(`${thumbnails.mediumPath} 800w`);
  }
  if (thumbnails?.largeReady && thumbnails.largePath) {
    srcSetParts.push(`${thumbnails.largePath} 1200w`);
  }

  // If no thumbnails available, return empty (will use src fallback)
  if (srcSetParts.length === 0) {
    return '';
  }

  return srcSetParts.join(', ');
}

/**
 * Generate sizes attribute for responsive images
 * 
 * Tells the browser what size the image will be displayed at different viewport widths
 * 
 * @returns sizes string for <img sizes> attribute
 */
export function getThumbnailSizes(): string {
  // Grid layout: 1 column on mobile, 2 on tablet, 3 on desktop
  return '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
}

/**
 * Get all available thumbnail URLs for a media item
 * 
 * @param thumbnails - Thumbnail paths and ready flags from Firestore
 * @param originalUrl - Original image URL
 * @returns Object with all available thumbnail URLs
 */
export function getAllThumbnailUrls(
  thumbnails: {
    smallPath?: string;
    mediumPath?: string;
    largePath?: string;
    smallReady?: boolean;
    mediumReady?: boolean;
    largeReady?: boolean;
  } | undefined,
  originalUrl: string
): ThumbnailUrls {
  return {
    small: thumbnails?.smallReady && thumbnails.smallPath ? thumbnails.smallPath : undefined,
    medium: thumbnails?.mediumReady && thumbnails.mediumPath ? thumbnails.mediumPath : undefined,
    large: thumbnails?.largeReady && thumbnails.largePath ? thumbnails.largePath : undefined,
    original: originalUrl
  };
}

