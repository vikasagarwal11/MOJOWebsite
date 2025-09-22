import { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';
import { useSwipeRaw } from '../../hooks/useSwipeRaw';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { attachHls, detachHls } from '../../utils/hls';
import { useImageOrientation } from '../../utils/imageOrientation';

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { correctImageOrientation } = useImageOrientation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVideo = item?.type === 'video';

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
        if (nextItem.sources?.hls) preloadVideo(nextItem.sources.hls);
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
        if (prevItem.sources?.hls) preloadVideo(prevItem.sources.hls);
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
        if (item.sources?.hls) {
          const canNativeHls = !!v.canPlayType?.('application/vnd.apple.mpegURL');
          if (canNativeHls) {
            v.src = item.sources.hls;
          } else {
            await attachHls(v, item.sources.hls);
          }
        } else {
          v.src = item.url;
        }
        if (!cancelled) v.play().catch(() => {}).finally(() => setVideoLoading(false));
      } catch {
        v.src = item.url;
        if (!cancelled) v.play().catch(() => {}).finally(() => setVideoLoading(false));
      }
    })();

    return () => {
      cancelled = true;
      setVideoLoading(false);
      try { detachHls(v); } catch {}
    };
  }, [isVideo, item?.sources?.hls, item?.url]);

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

  useEffect(() => { setScale(1); }, [item?.id]);

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

  // ---- SWIPE: TikTok-style vertical navigation with native pointer events
  const bindSwipeRef = useSwipeRaw<HTMLDivElement>({
    onUp: onNext,        // Up swipe = Next item (TikTok style)
    onDown: onPrev,      // Down swipe = Previous item
    axis: 'y',           // Vertical swipes only
    thresholdPx: 20,     // Slightly generous for phones
    restraintPx: 80,     // Don't cancel for small diagonal noise
    slopPx: 8,
    edgeGuardPx: 24,     // Avoid edge gestures
    allowMouse: true,    // Nice for desktop testing
    disabled: !item || (!isVideo && scale > 1.02), // Keep zoom rule
    debug: true          // Enable debugging to see what's happening
  });

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
              <a data-no-swipe href={item.url} download className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
          )}
        </div>

        {/* Media Stage (only place we bind swipe) */}
        <div
          id="lightbox-media-area"
          ref={bindSwipeRef}
          className={`flex-1 ${isMobile ? 'lb-stage' : 'flex items-center justify-center p-3 gap-4'}`}
          style={{ touchAction: isMobile ? 'pan-x pinch-zoom' : (scale > 1.02 ? 'auto' : 'pan-y') }}
          onClick={() => { if (isMobile) setControlsVisible(v => !v); }}
        >
          {/* Prev button (desktop) */}
          {!isMobile && (
            <button
              data-no-swipe
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className={`text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Previous"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

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
                style={{ touchAction: isMobile ? 'none' : 'auto' }}
                onEnded={() => {
                  if (autoAdvanceVideos) {
                    onNext();
                  } else if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onPlay={() => setVideoLoading(false)}
                onClick={() => {
                  if (!videoRef.current) return;
                  if (videoRef.current.paused) videoRef.current.play().catch(() => {});
                  else videoRef.current.pause();
                }}
              />
            </div>
          ) : (
            isMobile ? (
              // NOTE: NO swipe handlers here; the stage handles them
              <div className="lb-media">
                <img
                  key={item.id}
                  src={rotatedImageUrl || item.url}
                  alt={item.title || ''}
                  className="w-full h-full object-contain rounded-2xl"
                  draggable={false}
                  data-no-swipe
                  onLoad={(e) => correctImageOrientation(e.currentTarget)}
                />
              </div>
            ) : (
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={4}
                centerOnInit
                wheel={{ step: 0.1 }}
                pinch={{ step: 5 }}
                onTransformed={({ state }) => setScale(state.scale)}
              >
                <TransformComponent>
                  <div className="lb-img-wrap">
                    <img
                      key={item.id}
                      src={rotatedImageUrl || item.url}
                      alt={item.title || ''}
                      className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                      draggable={false}
                      data-no-swipe
                      onLoad={(e) => correctImageOrientation(e.currentTarget)}
                    />
                  </div>
                </TransformComponent>
              </TransformWrapper>
            )
          )}

          {/* Next button (desktop) */}
          {!isMobile && (
            <button
              data-no-swipe
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className={`text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors lb-controls transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              aria-label="Next"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Sound pill (mobile) */}
          {isMobile && showSoundHint && isVideo && isMuted && (
            <div
              data-no-swipe
              onClick={() => { setIsMuted(false); setShowSoundHint(false); }}
              className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm flex items-center gap-2 animate-pulse z-30 transition-all duration-200 cursor-pointer"
              style={{ marginBottom: `env(safe-area-inset-bottom)` }}
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
        </div>
      </div>
    </div>
  );
}
