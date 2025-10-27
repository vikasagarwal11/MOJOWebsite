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
    const url = await getDownloadURL(ref(storage, storagePath));
    console.log('✅ HLS download URL obtained:', url);

    if (Hls.isSupported()) {
      console.log('🌐 HLS.js is supported, creating HLS instance...');
      const hls = new Hls({
        enableWorker: false, // Disable worker to avoid CORS issues
        lowLatencyMode: false, // Disable low latency mode which can cause issues
        backBufferLength: 90,
        // Add CORS configuration
        xhrSetup: (xhr, _url) => {
          xhr.withCredentials = false; // Don't send credentials
        },
        // Add fragment loading error recovery
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000
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
  } catch (error) {
    console.error('❌ Failed to attach HLS:', error);
    try {
      console.log('🔄 Attempting HLS fallback...');
      const fallbackUrl = await getDownloadURL(ref(storage, storagePath));
      video.src = fallbackUrl;
      console.log('✅ HLS fallback successful:', fallbackUrl);
    } catch (fallbackError) {
      console.error('❌ HLS fallback also failed:', fallbackError);
      throw fallbackError;
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
