import { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';
import { useSwipeRaw } from '../../hooks/useSwipeRaw';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { attachHls, detachHls } from '../../utils/hls';
import { useImageOrientation } from '../../utils/imageOrientation';
import toast from 'react-hot-toast';
import { requestWatermarkedDownload } from '../../services/mediaDownloadService';

type Props = {
  item: any;
  nextItem?: any;  // For preloading optimization
  prevItem?: any;  // For preloading optimization
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  autoPlay?: boolean;        // slideshow for images
  intervalMs?: number;
  pauseOnHover?: boolean;
  autoAdvanceVideos?: boolean;
};

export default function MediaLightbox({
  item,
  nextItem,
  prevItem,
  onClose,
  onNext,
  onPrev,
  autoPlay = true,
  intervalMs = 3500,
  pauseOnHover = true,
  autoAdvanceVideos = true,
}: Props) {
  const [playing, setPlaying] = useState(autoPlay);
  const [userActive, setUserActive] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string>('');
  const [rotatedImageUrl, setRotatedImageUrl] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [showSoundHint, setShowSoundHint] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);
  const { correctImageOrientation } = useImageOrientation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVideo = item?.type === 'video';
  const fallbackTriggeredRef = useRef(false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    console.log('🎬 [DEBUG] MediaLightbox mounted:', {
      itemId: item?.id,
      itemType: item?.type,
      isVideo,
      isMobile,
      autoAdvanceVideos,
      hasUrl: !!item?.url,
      hasRotatedImageUrl: !!rotatedImageUrl
    });
  }, [item?.id, item?.type, isVideo, isMobile, autoAdvanceVideos, rotatedImageUrl]);

  if (!item) return null;

  // Preload next/prev
  useEffect(() => {
    const preloadImage = (url: string) => {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.crossOrigin = 'anonymous';
      img.src = url;
    };
    const preloadVideo = (hlsUrl: string) => {
      fetch(hlsUrl, { mode: 'cors', cache: 'force-cache' }).then(r => r.text()).catch(() => {});
    };

    if (nextItem) {
      if (nextItem.type === 'image') {
        if (nextItem.url) preloadImage(nextItem.url);
        if (nextItem.rotatedImagePath) {
          getDownloadURL(ref(storage, nextItem.rotatedImagePath)).then(preloadImage).catch(() => {});
        }
      } else if (nextItem.type === 'video') {
        const nextHlsPath = nextItem.sources?.hlsMaster || nextItem.sources?.hls;
        if (nextHlsPath) preloadVideo(nextHlsPath);
        if (nextItem.thumbnailPath) {
          getDownloadURL(ref(storage, nextItem.thumbnailPath)).then(preloadImage).catch(() => {});
        }
      }
      console.log('🚀 [PRELOAD] next item:', nextItem.id);
    }

    if (prevItem) {
      if (prevItem.type === 'image') {
        if (prevItem.url) preloadImage(prevItem.url);
        if (prevItem.rotatedImagePath) {
          getDownloadURL(ref(storage, prevItem.rotatedImagePath)).then(preloadImage).catch(() => {});
        }
      } else if (prevItem.type === 'video') {
        const prevHlsPath = prevItem.sources?.hlsMaster || prevItem.sources?.hls;
        if (prevHlsPath) preloadVideo(prevHlsPath);
        if (prevItem.thumbnailPath) {
          getDownloadURL(ref(storage, prevItem.thumbnailPath)).then(preloadImage).catch(() => {});
        }
      }
      console.log('🚀 [PRELOAD] prev item:', prevItem.id);
    }
  }, [nextItem?.id, prevItem?.id]);

  // Poster for video
  useEffect(() => {
    let mounted = true;
    setPosterUrl('');
    if (isVideo && item.thumbnailPath) {
      getDownloadURL(ref(storage, item.thumbnailPath))
        .then((u) => mounted && setPosterUrl(u))
        .catch(() => mounted && setPosterUrl(''));
    }
    return () => { mounted = false; };
  }, [isVideo, item?.thumbnailPath]);

  // Rotated image url
  useEffect(() => {
    let mounted = true;
    setRotatedImageUrl('');
    if (!isVideo && item.rotatedImagePath) {
      getDownloadURL(ref(storage, item.rotatedImagePath))
        .then((u) => mounted && setRotatedImageUrl(u))
        .catch(() => mounted && setRotatedImageUrl(''));
    }
    return () => { mounted = false; };
  }, [isVideo, item?.rotatedImagePath]);

  // HLS attach
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const v = videoRef.current;
    setVideoLoading(true);

    if (import.meta.env.DEV) {
      v.src = item.url;
      v.play().catch(() => {}).finally(() => setVideoLoading(false));
      return () => {};
    }

    let cancelled = false;
    (async () => {
      try {
        // Prefer master playlist for adaptive streaming, fallback to single manifest
        const hlsPath = item.sources?.hlsMaster || item.sources?.hls;
        const isMasterPlaylist = !!item.sources?.hlsMaster;
        
        if (hlsPath) {
          console.log(`🎬 [HLS] Attaching HLS ${isMasterPlaylist ? '(adaptive streaming)' : '(single quality)'}:`, hlsPath);
          const canNativeHls = !!v.canPlayType?.('application/vnd.apple.mpegURL');
          if (canNativeHls) {
            console.log('🎬 [HLS] Using native HLS support');
            // Still need to get download URL even for native HLS
            const hlsUrl = await getDownloadURL(ref(storage, hlsPath));
            v.src = hlsUrl;
          } else {
            console.log('🎬 [HLS] Using HLS.js');
            await attachHls(v, hlsPath, isMasterPlaylist);
          }
        } else {
          console.log('🎬 [FALLBACK] No HLS source, using direct URL:', item.url);
          v.src = item.url;
        }
        if (!cancelled) {
          console.log('▶️ Attempting to play video...');
          await v.play().catch((err) => {
            console.warn('⚠️ Play failed:', err.message);
          });
        }
      } catch (error) {
        console.error('❌ HLS attachment failed:', error);
        fallbackTriggeredRef.current = true;
        v.src = item.url;
        if (!cancelled) {
          await v.play().catch((err) => {
            console.warn('⚠️ Fallback play failed:', err.message);
          });
        }
      } finally {
        if (!cancelled) setVideoLoading(false);
      }
    })();

    return () => {
      console.log('🧹 Cleaning up HLS...');
      cancelled = true;
      setVideoLoading(false);
      try { detachHls(v); } catch {}
    };
  }, [isVideo, item?.sources?.hlsMaster, item?.sources?.hls, item?.url, item?.id]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const video = videoRef.current;
    const handleError = () => {
      if (fallbackTriggeredRef.current) return;
      fallbackTriggeredRef.current = true;
      video.src = item.url;
      video.play().catch(() => {});
    };
    video.addEventListener('error', handleError);
    return () => {
      video.removeEventListener('error', handleError);
    };
  }, [isVideo, item?.url, item?.id]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, []);

  // Auto-advance images
  useEffect(() => {
    if (!item || isVideo) return;
    if (!playing) return;
    if (pauseOnHover && userActive) return;

    const t = setInterval(() => onNext(), intervalMs);
    return () => clearInterval(t);
  }, [item, isVideo, playing, userActive, pauseOnHover, intervalMs, onNext]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      if ((e.key === 'm' || e.key === 'M') && isVideo) {
        e.preventDefault();
        setIsMuted(m => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev, isVideo]);

  // Sync muted
  useEffect(() => {
    if (videoRef.current && isVideo) videoRef.current.muted = isMuted;
  }, [isMuted, isVideo]);

  // Sound hint
  useEffect(() => {
    if (!isVideo || !isMuted) return;
    const video = videoRef.current;
    if (!video) return;

    let playTimerId: ReturnType<typeof setTimeout>;
    let pauseTimerId: ReturnType<typeof setTimeout>;

    const handlePlay = () => {
      setShowSoundHint(true);
      clearTimeout(playTimerId);
      playTimerId = setTimeout(() => setShowSoundHint(false), 2500);
    };

    const handlePause = () => {
      if (isMuted) {
        setShowSoundHint(true);
        clearTimeout(pauseTimerId);
        pauseTimerId = setTimeout(() => setShowSoundHint(false), 2000);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      clearTimeout(playTimerId);
      clearTimeout(pauseTimerId);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [isVideo, isMuted]);

  useEffect(() => {
    setScale(1);
    fallbackTriggeredRef.current = false;
    if (zoomRef.current) {
      zoomRef.current.resetTransform();
    }
  }, [item?.id]);

  // Controls visibility + slideshow hover
  useEffect(() => {
    let slideshowTimeoutId: ReturnType<typeof setTimeout>;
    let controlsTimeoutId: ReturnType<typeof setTimeout>;

    const handleUserActivity = () => {
      if (pauseOnHover) {
        setUserActive(true);
        clearTimeout(slideshowTimeoutId);
        slideshowTimeoutId = setTimeout(() => setUserActive(false), 1200);
      }

      setControlsVisible(true);
      clearTimeout(controlsTimeoutId);
      if (isMobile) {
        controlsTimeoutId = setTimeout(() => setControlsVisible(false), 3000);
      }
    };

    handleUserActivity();

    const mediaArea = document.getElementById('lightbox-media-area');
    if (mediaArea) {
      mediaArea.addEventListener('mousemove', handleUserActivity);
      mediaArea.addEventListener('touchstart', handleUserActivity);
      mediaArea.addEventListener('pointermove', handleUserActivity);
    }

    return () => {
      clearTimeout(slideshowTimeoutId);
      clearTimeout(controlsTimeoutId);
      if (mediaArea) {
        mediaArea.removeEventListener('mousemove', handleUserActivity);
        mediaArea.removeEventListener('touchstart', handleUserActivity);
        mediaArea.removeEventListener('pointermove', handleUserActivity);
      }
    };
  }, [pauseOnHover, isMobile]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    const prevOB = (document.documentElement.style as any).overscrollBehavior;
    document.documentElement.style.overflow = 'hidden';
    (document.documentElement.style as any).overscrollBehavior = 'contain';
    return () => {
      document.documentElement.style.overflow = prev;
      (document.documentElement.style as any).overscrollBehavior = prevOB || '';
    };
  }, []);

  // ---- SWIPE: Horizontal navigation (left/right) with native pointer events
  const bindSwipeRef = useSwipeRaw<HTMLDivElement>({
    onLeft: onNext,      // Left swipe = Next item
    onRight: onPrev,     // Right swipe = Previous item
    axis: 'x',           // Horizontal swipes only
    thresholdPx: 50,     // Minimum distance to trigger swipe
    restraintPx: 80,     // Don't cancel for small diagonal noise
    slopPx: 8,
    edgeGuardPx: 24,     // Avoid edge gestures
    allowMouse: true,    // Nice for desktop testing
    disabled: !item || (!isVideo && scale > 1.02), // Keep zoom rule
    debug: false         // Disable debug logs
  });

  const handleDownloadMedia = async () => {
    if (isDownloading) return;
    
    const toastId = 'watermark-download';
    try {
      setIsDownloading(true);
      
      // Show loading toast for first-time generation
      toast.loading('Preparing watermarked download...', { id: toastId });
      
      const { url, isCached } = await requestWatermarkedDownload(item.id);
      
      // Build filename with _watermarked suffix
      const originalFilename = item.filePath?.split('/').pop() || `${item.title || 'media'}`;
      const ext = originalFilename.includes('.') ? originalFilename.substring(originalFilename.lastIndexOf('.')) : '';
      const baseName = ext ? originalFilename.substring(0, originalFilename.lastIndexOf('.')) : originalFilename;
      const filename = `${baseName}_watermarked${ext}`;
      
      if (isCached) {
        toast.success('Download ready!', { id: toastId, duration: 2000 });
      } else {
        toast.success('Watermarked copy generated!', { id: toastId, duration: 2000 });
      }
      
      if (isMobile) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error: any) {
      console.error('Failed to download media:', error);
      toast.error(error?.message || 'Failed to download media', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`lb-root fixed inset-0 z-50 ${isMobile ? 'bg-black' : 'bg-black/80 backdrop-blur-sm'}`}
      aria-modal
      role="dialog"
    >
      <div className="absolute inset-0 flex flex-col sa-top sa-bottom">
        {/* Top bar */}
        <div className={`flex items-center justify-between p-3 lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button data-no-swipe onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
          {!isMobile && (
            <div className="flex gap-2">
              {isVideo && (
                <button
                  data-no-swipe
                  onClick={() => setIsMuted(!isMuted)}
                  className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
                  title={isMuted ? 'Unmute audio' : 'Mute audio'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
              )}
              <button data-no-swipe onClick={() => shareUrl(item.url, item.title)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
                <Share2 className="w-4 h-4" /> Share
              </button>
              <button
                data-no-swipe
                onClick={handleDownloadMedia}
                disabled={isDownloading}
                className={`px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 ${isDownloading ? 'opacity-70 cursor-wait' : ''}`}
              >
                <Download className="w-4 h-4" /> {isDownloading ? 'Preparing…' : 'Download'}
              </button>
            </div>
          )}
        </div>

        {/* Media Stage (only place we bind swipe) */}
        <div
          id="lightbox-media-area"
          ref={bindSwipeRef}
          className={`flex-1 ${isMobile ? 'lb-stage' : 'flex items-center justify-center p-3 gap-4'}`}
          style={{ touchAction: isMobile ? 'pan-y pinch-zoom' : (scale > 1.02 ? 'auto' : 'pan-y') }}
          onClick={() => { if (isMobile) setControlsVisible(v => !v); }}
        >
          {/* Prev button (always visible) */}
          <button
            data-no-swipe
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className={`text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isMobile ? 'absolute left-2 top-1/2 -translate-y-1/2 z-20' : ''}`}
            aria-label="Previous"
          >
            <ChevronLeft className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'}`} />
          </button>

          {/* Media */}
          {isVideo ? (
            <div className={`relative ${isMobile ? 'w-full h-full' : 'flex items-center justify-center'}`}>
              {videoLoading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <video
                ref={videoRef}
                data-no-swipe
                controls={!isMobile}
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                autoPlay
                muted={isMuted}
                playsInline
                loop={false}
                preload="metadata"
                poster={posterUrl || undefined}
                className={`${isMobile ? 'lb-media fill' : 'max-h-[85vh] max-w-[85vw] object-contain'} rounded-2xl`}
                style={{ touchAction: isMobile ? 'pan-y pinch-zoom' : 'auto' }}
                onEnded={() => {
                  if (autoAdvanceVideos) {
                    onNext();
                  } else if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onPlay={() => setVideoLoading(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!videoRef.current) return;

                  if (isMobile) {
                    if (singleTapTimerRef.current) {
                      clearTimeout(singleTapTimerRef.current);
                      singleTapTimerRef.current = null;
                    }

                    const now = Date.now();
                    if (now - lastTapTimeRef.current < 280) {
                      lastTapTimeRef.current = 0;
                      setIsMuted((m) => !m);
                      setShowSoundHint(false);
                      return;
                    }

                    lastTapTimeRef.current = now;
                    singleTapTimerRef.current = setTimeout(() => {
                      if (!videoRef.current) return;
                      if (videoRef.current.paused) {
                        videoRef.current.play().catch(() => {});
                      } else {
                        videoRef.current.pause();
                      }
                      singleTapTimerRef.current = null;
                    }, 240);
                    return;
                  }

                  if (videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                  } else {
                    videoRef.current.pause();
                  }
                }}
              />
            </div>
          ) : (
            <TransformWrapper
              initialScale={1}
              minScale={isMobile ? 1 : 0.5}
              maxScale={isMobile ? 3 : 4}
              centerOnInit
              wheel={{ step: 0.1, disabled: isMobile }}
              pinch={{ step: 5 }}
              doubleClick={{ disabled: true }}
              panning={{ velocity: true }}
              onTransformed={({ state }) => setScale(state.scale)}
              ref={zoomRef}
            >
              <TransformComponent
                wrapperClass={isMobile ? 'relative w-full h-full' : undefined}
                contentClass={isMobile ? 'w-full h-full' : undefined}
              >
                <div
                  className={
                    isMobile
                      ? 'w-full h-full flex items-center justify-center bg-black'
                      : 'lb-img-wrap'
                  }
                >
                  <img
                    key={item.id}
                    src={rotatedImageUrl || item.url}
                    alt={item.title || ''}
                    className={
                      isMobile
                        ? 'max-h-full max-w-full object-contain rounded-2xl'
                        : 'max-h-[85vh] max-w-[85vw] rounded-2xl object-contain'
                    }
                    draggable={false}
                    data-no-swipe
                    onLoad={(e) => correctImageOrientation(e.currentTarget)}
                  />
                </div>
              </TransformComponent>
            </TransformWrapper>
          )}

          {/* Next button (always visible) */}
          <button
            data-no-swipe
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className={`text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isMobile ? 'absolute right-2 top-1/2 -translate-y-1/2 z-20' : ''}`}
            aria-label="Next"
          >
            <ChevronRight className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'}`} />
          </button>

          {/* Sound pill (mobile) - shows hint to unmute */}
          {isMobile && showSoundHint && isVideo && isMuted && (
            <div
              data-no-swipe
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(false);
                setShowSoundHint(false);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/70 hover:bg-black/90 active:bg-black/95 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm flex items-center gap-2 animate-pulse z-50 transition-all duration-200 cursor-pointer touch-manipulation"
              style={{ marginBottom: `env(safe-area-inset-bottom)`, pointerEvents: 'auto' }}
            >
              <Volume2 className="w-4 h-4" />
              <span>Tap for sound</span>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className={`flex items-center justify-center gap-4 pb-4 lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {item.type === 'image' && (
            <button
              data-no-swipe
              onClick={() => setPlaying(p => !p)}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 transition-colors"
              aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="text-sm">{playing ? 'Pause' : 'Play'}</span>
            </button>
          )}
          {item.type === 'image' && scale > 1.01 && (
            <button
              data-no-swipe
              onClick={() => {
                zoomRef.current?.resetTransform();
                setScale(1);
              }}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 transition-colors"
              aria-label="Reset zoom"
            >
              <span className="text-sm">Reset zoom</span>
            </button>
          )}
          {isMobile && isVideo && (
            <button
              data-no-swipe
              onClick={() => {
                setIsMuted(m => !m);
                setShowSoundHint(false);
              }}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 transition-colors"
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="text-sm">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
