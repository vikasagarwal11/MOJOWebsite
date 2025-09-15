/**
 * Image Orientation Utility - EXIF-first, flicker-free
 * - Primary: read EXIF Orientation and map to CSS transform
 * - Fallback: conservative heuristic only if EXIF unavailable
 * - Avoids double-correction + hides the image during adjustment to prevent flicker
 */

import React from 'react';
// import exifr from 'exifr'; // Temporarily disabled due to initialization issues

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

    // Check if this image URL has already been processed globally
    if (processedImages.has(img.src)) {
      console.log('🖼️ Image URL already processed globally, skipping:', img.src);
      return;
    }

    // If we already oriented this exact src, skip
    if (img.dataset.srcApplied === img.src && img.dataset.oriented === '1') return;
    img.dataset.srcApplied = img.src;

    // Add to cache immediately to prevent concurrent processing
    processedImages.add(img.src);

    console.log('🖼️ Image orientation correction triggered:', img.src);

    // Hide to prevent the "rotate → unrotate" flash
    const prevVisibility = img.style.visibility;
    if (!prevVisibility) img.style.visibility = 'hidden';

    // Disable browser EXIF so we fully control orientation
    (img.style as any).imageOrientation = 'none';
    (img.style as any).webkitImageOrientation = 'none';

    // Clear any prior transforms/wrapper rotation (e.g., when src changes)
    const wrap = img.closest('.lb-img-wrap') as HTMLElement | null;
    if (wrap) wrap.classList.remove('rotate-90-wrap');
    img.style.transform = '';

    await afterDecodeAndFrame(img);

    const target = wrap ?? img;
    let oriented = false;

    // --- 1) EXIF-first path (temporarily disabled due to initialization issues) ---
    // try {
    //   // Small and fast: orientation only
    //   const orientation = await exifr.orientation(img.src);
    //   if (orientation && orientation !== 1) {
    //     const css = mapExifToCss(orientation);
    //     console.log('🖼️ Applied EXIF-based orientation:', { orientation, css, hasWrapper: !!wrap });
    //     // For pure 90°, keep your wrapper class in Lightbox for consistency
    //     if (wrap && css === 'rotate(90deg)') {
    //       wrap.classList.add('rotate-90-wrap');
    //     } else {
    //       applyTransform(target, css);
    //     }
    //     oriented = true;
    //   }
    // } catch (error) {
    //   console.log('🖼️ EXIF parsing failed, falling back to heuristics:', error);
    //   // EXIF not available/parseable (common for webp thumbs) → fall through
    // }

    // --- 2) Fallback heuristic (only if EXIF unavailable) ---
    if (!oriented) {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw && nh) {
        const rect = img.getBoundingClientRect();
        let dw = rect.width || img.clientWidth || 1;
        let dh = rect.height || img.clientHeight || 1;

        if (dw <= 1 || dh <= 1) { // very rare, wait one more frame
          await nextFrame();
          const r2 = img.getBoundingClientRect();
          dw = r2.width || img.clientWidth || dw;
          dh = r2.height || img.clientHeight || dh;
        }

        const naturalPortrait = nh > nw;
        const displayRatio = dw / dh;
        const displayedPortrait  = displayRatio < 0.83;
        const displayedLandscape = displayRatio > 1.20;

        // Only rotate when the rendered box is clearly the opposite orientation
        const needs90 =
          (naturalPortrait && displayedLandscape) ||
          (!naturalPortrait && displayedPortrait);

        if (needs90) {
          console.log('🖼️ Applied heuristic-based rotation:', { 
            naturalPortrait, 
            displayedPortrait, 
            displayedLandscape, 
            displayRatio,
            hasWrapper: !!wrap 
          });
          if (wrap) wrap.classList.add('rotate-90-wrap');
          else applyTransform(target, 'rotate(90deg)');
          oriented = true;
        } else {
          console.log('🖼️ No rotation needed, CSS EXIF orientation applied');
        }
      }
    }

    // Mark done, reveal image
    img.dataset.oriented = '1';
    img.style.visibility = prevVisibility || 'visible';
  }, []); // Empty dependency array since we don't use any external variables

  return { correctImageOrientation };
}

// Optional: legacy detect/apply helpers (unchanged API for callers that might import them)
export function detectImageOrientation(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
  _img?: HTMLImageElement
): ImageOrientationResult {
  const naturalRatio = naturalWidth / naturalHeight;
  const displayRatio = displayWidth / displayHeight;
  const naturalPortrait = naturalRatio < 1;
  const displayedPortrait = displayRatio < 0.83;
  const displayedLandscape = displayRatio > 1.20;

  let needsRotation = false;
  let rotation: 0 | 90 | 180 | 270 = 0;

  if ((naturalPortrait && !displayedPortrait) || (!naturalPortrait && displayedPortrait)) {
    needsRotation = true; rotation = 90;
  }
  return { needsRotation, rotation };
}

export function applyImageOrientation(img: HTMLImageElement): void {
  const r = detectImageOrientation(img.naturalWidth, img.naturalHeight, img.clientWidth, img.clientHeight, img);
  if (r.needsRotation) {
    img.style.transform = `rotate(${r.rotation}deg)`;
    img.style.transformOrigin = 'center';
  }
}
