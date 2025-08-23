import Hls from 'hls.js';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Attaches HLS stream to a video element
 * @param video - The HTML video element to attach HLS to
 * @param storagePath - The Firebase Storage path to the HLS manifest file
 */
export async function attachHls(video: HTMLVideoElement, storagePath: string): Promise<void> {
  try {
    // Get the download URL for the HLS manifest
    const url = await getDownloadURL(ref(storage, storagePath));
    
    if (Hls.isSupported()) {
      // CRITICAL FIX: Store HLS instance on video element for proper cleanup
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      
      // Store the HLS instance on the video element for cleanup
      (video as any)._hls = hls;
      
      hls.loadSource(url);
      hls.attachMedia(video);
      
      // Optional: Handle HLS events
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest loaded successfully');
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS error:', data);
        if (data.fatal) {
          // Fallback to direct URL for fatal errors
          video.src = url;
        }
      });
    } else {
      // Safari/iOS can play HLS natively
      video.src = url;
      console.log('Using native HLS support');
    }
  } catch (error) {
    console.error('Failed to attach HLS:', error);
    // Fallback: try to use the storage path directly
    try {
      const fallbackUrl = await getDownloadURL(ref(storage, storagePath));
      video.src = fallbackUrl;
    } catch (fallbackError) {
      console.error('HLS fallback also failed:', fallbackError);
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
