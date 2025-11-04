import Hls from 'hls.js';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Attaches HLS stream to a video element
 * @param video - The HTML video element to attach HLS to
 * @param storagePath - The Firebase Storage path to the HLS manifest file (can be master playlist or single manifest)
 * @param isMasterPlaylist - Whether the storagePath points to a master playlist (for adaptive streaming)
 */
export async function attachHls(video: HTMLVideoElement, storagePath: string, isMasterPlaylist: boolean = false): Promise<void> {
  console.log('🔧 attachHls called with:', { storagePath, isMasterPlaylist, videoExists: !!video });

  try {
    console.log(isMasterPlaylist ? '📡 Getting download URL for HLS master playlist...' : '📡 Getting download URL for HLS manifest...');
    const url = await getDownloadURL(ref(storage, storagePath));
    console.log(isMasterPlaylist ? '✅ HLS master playlist download URL obtained:' : '✅ HLS download URL obtained:', url);

    if (Hls.isSupported()) {
      console.log('🌐 HLS.js is supported, creating HLS instance...');
      const hls = new Hls({
        enableWorker: false, // Disable worker to avoid CORS issues
        lowLatencyMode: false, // Disable low latency mode which can cause issues
        backBufferLength: 90,
        // Increase buffer sizes to reduce stalling
        maxBufferLength: 60, // Maximum buffer length in seconds (default: 30)
        maxMaxBufferLength: 120, // Maximum buffer length when buffer is stalling (default: 600)
        maxBufferSize: 60 * 1000 * 1000, // Maximum buffer size in bytes (60MB)
        maxBufferHole: 0.5, // Maximum buffer hole tolerance in seconds
        // Add CORS configuration
        xhrSetup: (xhr, _url) => {
          xhr.withCredentials = false; // Don't send credentials
        },
        // Add fragment loading error recovery
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
        // Better handling of buffer stalling
        highBufferWatchdogPeriod: 2, // Check buffer level every 2 seconds
        nudgeOffset: 0.1, // Small nudge to recover from buffer stalling
        nudgeMaxRetry: 3 // Max retries for buffer recovery
      });

      (video as any)._hls = hls;

      console.log('📺 Loading HLS source and attaching to video...');
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ HLS manifest loaded successfully');
        // Try to play the video after manifest is parsed
        if (video.paused) {
          console.log('▶️ Attempting to start playback...');
          video.play().catch((err: any) => {
            console.warn('⚠️ Autoplay prevented:', err.message);
          });
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        console.log('📊 HLS level loaded:', { level: data.level, bitrate: data.details?.totalduration });
      });

      hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
        console.log('🎬 HLS fragment loaded:', { frag: data.frag.relurl });
        // Try to play after first fragment
        if (video.paused && video.readyState >= 2) {
          console.log('▶️ First fragment loaded, attempting playback...');
          video.play().catch((err: any) => {
            console.warn('⚠️ Playback failed:', err.message);
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        // Don't log non-fatal buffer stalling errors as errors - they're warnings
        const isBufferStall = data.details === 'bufferStalledError';
        if (isBufferStall && !data.fatal) {
          console.warn('⚠️ HLS buffer stalling (non-fatal):', {
            type: data.type,
            details: data.details,
            bufferInfo: (data as any).bufferInfo
          });
          // HLS.js will automatically try to recover from non-fatal buffer stalling
          return;
        }
        
        console.error('❌ HLS error:', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          error: data.error
        });
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('🔄 Network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('🔄 Media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.log('🔄 Fatal HLS error, falling back to direct URL');
              hls.destroy();
              video.src = url;
              break;
          }
        }
      });

      console.log('✅ HLS instance created and attached successfully');
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('🍎 HLS.js not supported, using native HLS support');
      video.src = url;
      console.log('✅ Native HLS source set:', url);
    } else {
      console.log('⚠️ HLS not supported, using fallback URL');
      video.src = url;
    }
  } catch (error: any) {
    // Check if it's a 404 (object not found) - common for old videos that were processed before new code
    const is404 = error?.code === 'storage/object-not-found' || 
                  error?.message?.includes('does not exist') ||
                  error?.message?.includes('404');
    
    if (is404) {
      console.warn('⚠️ HLS file not found (404) - likely an old video without HLS processing. Using original video URL.');
      // Don't throw - just silently use original video URL
      // The video element already has a source with the original URL
      return;
    }
    
    console.error('❌ Failed to attach HLS:', error);
    try {
      console.log('🔄 Attempting HLS fallback...');
      const fallbackUrl = await getDownloadURL(ref(storage, storagePath));
      video.src = fallbackUrl;
      console.log('✅ HLS fallback successful:', fallbackUrl);
    } catch (fallbackError) {
      // If fallback also fails (e.g., 404), don't throw - original video URL will be used
      if ((fallbackError as any)?.code === 'storage/object-not-found') {
        console.warn('⚠️ HLS fallback also not found (404). Original video will be used.');
        return;
      }
      console.error('❌ HLS fallback also failed:', fallbackError);
      // Don't throw - let the video use the original source that's already in the <source> tag
    }
  }
}

/**
 * Detaches HLS from a video element and cleans up resources
 * @param video - The HTML video element to detach HLS from
 */
export function detachHls(video: HTMLVideoElement): void {
  try {
    const hls = (video as any)._hls;
    if (hls) {
      hls.destroy();
      (video as any)._hls = undefined;
    }
    video.removeAttribute('src');
    video.load();
  } catch (error) {
    console.error('Error detaching HLS:', error);
  }
}

/** Check if HLS is supported in the current browser */
export function isHlsSupported(): boolean {
  return Hls.isSupported();
}
