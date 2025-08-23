import Hls from 'hls.js';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Attaches HLS stream to a video element
 * @param video - The HTML video element to attach HLS to
 * @param storagePath - The Firebase Storage path to the HLS manifest file
 */
export async function attachHls(video: HTMLVideoElement, storagePath: string): Promise<void> {
  console.log('🔧 attachHls called with:', { storagePath, videoExists: !!video });
  
  try {
    console.log('📡 Getting download URL for HLS manifest...');
    // Get the download URL for the HLS manifest
    const url = await getDownloadURL(ref(storage, storagePath));
    console.log('✅ HLS download URL obtained:', url);
    
    if (Hls.isSupported()) {
      console.log('🌐 HLS.js is supported, creating HLS instance...');
      // CRITICAL FIX: Store HLS instance on video element for proper cleanup
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      
      // Store the HLS instance on the video element for cleanup
      (video as any)._hls = hls;
      
      console.log('📺 Loading HLS source and attaching to video...');
      hls.loadSource(url);
      hls.attachMedia(video);
      
      // Enhanced HLS event handling
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ HLS manifest loaded successfully');
      });
      
      hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        console.log('📊 HLS level loaded:', data);
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('❌ HLS error:', data);
        if (data.fatal) {
          console.log('🔄 Fatal HLS error, falling back to direct URL');
          // Fallback to direct URL for fatal errors
          video.src = url;
        }
      });
      
      console.log('✅ HLS instance created and attached successfully');
    } else {
      console.log('🍎 HLS.js not supported, using native HLS support');
      // Safari/iOS can play HLS natively
      video.src = url;
      console.log('✅ Native HLS source set:', url);
    }
  } catch (error) {
    console.error('❌ Failed to attach HLS:', error);
    // Fallback: try to use the storage path directly
    try {
      console.log('🔄 Attempting HLS fallback...');
      const fallbackUrl = await getDownloadURL(ref(storage, storagePath));
      video.src = fallbackUrl;
      console.log('✅ HLS fallback successful:', fallbackUrl);
    } catch (fallbackError) {
      console.error('❌ HLS fallback also failed:', fallbackError);
      throw fallbackError; // Re-throw to let caller handle
    }
  }
}

/**
 * Detaches HLS from a video element and cleans up resources
 * @param video - The HTML video element to detach HLS from
 */
export function detachHls(video: HTMLVideoElement): void {
  try {
    // CRITICAL FIX: Access the stored HLS instance and destroy it properly
    const hls = (video as any)._hls;
    if (hls) {
      hls.destroy();
      (video as any)._hls = undefined;
    }
    
    // Clear the video source
    video.removeAttribute('src');
    video.load();
  } catch (error) {
    console.error('Error detaching HLS:', error);
  }
}

/**
 * Check if HLS is supported in the current browser
 */
export function isHlsSupported(): boolean {
  return Hls.isSupported();
}
