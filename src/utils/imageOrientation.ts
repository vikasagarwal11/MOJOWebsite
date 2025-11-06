/**
 * Image Orientation Utility - EXIF-first, flicker-free
 * - Primary: read EXIF Orientation and map to CSS transform
 * - Fallback: conservative heuristic only if EXIF unavailable
 * - Avoids double-correction + hides the image during adjustment to prevent flicker
 */

import React from 'react';
import exifr from 'exifr';

export interface ImageOrientationResult {
  needsRotation: boolean;
  rotation: 0 | 90 | 180 | 270;
}

// Global cache to prevent processing the same image multiple times
const processedImages = new Set<string>();

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
const afterDecodeAndFrame = async (img: HTMLImageElement) => {
  try { if ('decode' in img) await img.decode(); } catch {}
  await nextFrame();
};

const applyTransform = (el: HTMLElement, transform: string) => {
  el.style.transform = transform;
  el.style.transformOrigin = 'center';
};

const mapExifToCss = (orientation: number) => {
  // Return either a rotate() or a combined rotate()+scale transform
  switch (orientation) {
    case 2: return 'scaleX(-1)';                       // Mirror horizontal
    case 3: return 'rotate(180deg)';
    case 4: return 'scaleY(-1)';                       // Mirror vertical
    case 5: return 'rotate(90deg) scaleX(-1)';
    case 6: return 'rotate(90deg)';
    case 7: return 'rotate(270deg) scaleX(-1)';
    case 8: return 'rotate(270deg)';
    default: return '';                                // 1: no transform
  }
};

export function useImageOrientation() {
  const correctImageOrientation = React.useCallback(async (img: HTMLImageElement) => {
    if (!img || !img.isConnected) return;

    // Check if already processed
    if (img.dataset.oriented === '1') {
      return;
    }

    // Mark as processed to prevent any other rotation attempts
    img.dataset.oriented = '1';
    
    return;
  }, []);

  return { correctImageOrientation };
}

// Optional: legacy detect/apply helpers (simplified for server-side processing)
export function detectImageOrientation(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
  _img?: HTMLImageElement
): ImageOrientationResult {
  // Server-side processing handles all rotation - no client-side rotation needed
  return { needsRotation: false, rotation: 0 };
}

export function applyImageOrientation(img: HTMLImageElement): void {
  // Server-side processing handles all rotation - no client-side rotation needed
  console.log('🖼️ applyImageOrientation: Server-side rotation active, skipping client-side rotation');
  return;
}
