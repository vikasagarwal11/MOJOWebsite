/**
 * Image Orientation Utility
 * Handles image rotation correction when EXIF data is not available
 */

export interface ImageOrientationResult {
  needsRotation: boolean;
  rotation: number;
  transform: string;
}

/**
 * Detect if an image needs rotation based on visual content analysis
 * This approach is more aggressive since Firebase Storage processes images
 */
export function detectImageOrientation(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
  imgElement?: HTMLImageElement
): ImageOrientationResult {
  // If dimensions are 0, skip detection
  if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) {
    return {
      needsRotation: false,
      rotation: 0,
      transform: 'none'
    };
  }

  const naturalRatio = naturalWidth / naturalHeight;
  const displayRatio = displayWidth / displayHeight;
  
  console.log('🖼️ Orientation detection:', {
    naturalRatio: naturalRatio.toFixed(2),
    displayRatio: displayRatio.toFixed(2),
    naturalWidth,
    naturalHeight,
    displayWidth,
    displayHeight
  });
  
  // Since Firebase Storage processes images, we need to be more aggressive
  // Most mobile photos are taken in portrait but get processed as landscape
  
  // Check if this looks like a mobile photo that needs rotation
  const isCommonMobileRatio = naturalRatio >= 1.2 && naturalRatio <= 1.8; // 4:3 to 16:9 range
  const isDisplayPortrait = displayRatio < 1.0; // Display is taller than wide
  
  console.log('🖼️ Mobile photo check:', { 
    isCommonMobileRatio, 
    isDisplayPortrait, 
    naturalRatio: naturalRatio.toFixed(2) 
  });

  // If it's a common mobile ratio and display is portrait, likely needs rotation
  if (isCommonMobileRatio && isDisplayPortrait) {
    console.log('🖼️ Detected mobile photo needing rotation');
    return {
      needsRotation: true,
      rotation: 90,
      transform: 'rotate(90deg)'
    };
  }

  // Additional check: if natural is very wide but display is very tall
  if (naturalRatio > 1.5 && displayRatio < 0.8) {
    console.log('🖼️ Detected very wide natural, very tall display');
    return {
      needsRotation: true,
      rotation: 90,
      transform: 'rotate(90deg)'
    };
  }

  // Additional check: if natural is very tall but display is very wide
  if (naturalRatio < 0.8 && displayRatio > 1.5) {
    console.log('🖼️ Detected very tall natural, very wide display');
    return {
      needsRotation: true,
      rotation: 90,
      transform: 'rotate(90deg)'
    };
  }

  // Fallback: if aspect ratios are significantly different
  const ratioDifference = Math.abs(naturalRatio - displayRatio);
  if (ratioDifference > 0.3) {
    console.log('🖼️ Detected significant ratio difference');
    return {
      needsRotation: true,
      rotation: 90,
      transform: 'rotate(90deg)'
    };
  }

  // Last resort: if we're in MediaLightbox and the image looks like it might be rotated
  // Check if the image URL contains 'thumb_' (thumbnail) which suggests it's processed
  const isProcessedImage = imgElement?.src?.includes('thumb_') || imgElement?.src?.includes('firebasestorage');
  
  if (isProcessedImage && naturalRatio > 1.0 && displayRatio < 1.0) {
    console.log('🖼️ Detected processed image that might need rotation');
    return {
      needsRotation: true,
      rotation: 90,
      transform: 'rotate(90deg)'
    };
  }
  
  console.log('🖼️ No rotation needed');
  return {
    needsRotation: false,
    rotation: 0,
    transform: 'none'
  };
}

/**
 * Apply orientation correction to an image element
 */
export function applyImageOrientation(img: HTMLImageElement): void {
  if (!img.complete) {
    // Wait for image to load
    img.onload = () => applyImageOrientation(img);
    return;
  }
  
  const result = detectImageOrientation(
    img.naturalWidth,
    img.naturalHeight,
    img.clientWidth,
    img.clientHeight,
    img
  );
  
  if (result.needsRotation) {
    img.style.transform = result.transform;
    img.style.transformOrigin = 'center';
  }
}

/**
 * Create a corrected image URL using canvas
 * This preserves the corrected orientation
 */
export function createCorrectedImageUrl(
  originalUrl: string,
  orientation: number = 90
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Set canvas dimensions based on rotation
      if (orientation === 90 || orientation === 270) {
        canvas.width = img.naturalHeight;
        canvas.height = img.naturalWidth;
      } else {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      
      // Apply rotation
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((orientation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      
      // Convert to data URL
      const correctedUrl = canvas.toDataURL('image/jpeg', 0.9);
      resolve(correctedUrl);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = originalUrl;
  });
}

/**
 * Hook to handle image orientation correction
 */
export function useImageOrientation() {
  const correctImageOrientation = (imgElement: HTMLImageElement) => {
    console.log('🖼️ Image orientation correction triggered for:', imgElement.src);
    
    // First try CSS image-orientation
    imgElement.style.imageOrientation = 'from-image';
    imgElement.style.webkitImageOrientation = 'from-image';
    
    // Always apply our heuristic approach as a fallback
    setTimeout(() => {
      console.log('🖼️ Applying heuristic orientation correction...');
      console.log('🖼️ Image dimensions:', {
        naturalWidth: imgElement.naturalWidth,
        naturalHeight: imgElement.naturalHeight,
        clientWidth: imgElement.clientWidth,
        clientHeight: imgElement.clientHeight
      });
      
      const result = detectImageOrientation(
        imgElement.naturalWidth,
        imgElement.naturalHeight,
        imgElement.clientWidth,
        imgElement.clientHeight,
        imgElement
      );
      
      console.log('🖼️ Orientation detection result:', result);
      
      if (result.needsRotation) {
        console.log('🖼️ Applying rotation:', result.transform);
        imgElement.style.transform = result.transform;
        imgElement.style.transformOrigin = 'center';
      } else {
        console.log('🖼️ No rotation needed');
      }
    }, 100);
  };
  
  return { correctImageOrientation };
}
