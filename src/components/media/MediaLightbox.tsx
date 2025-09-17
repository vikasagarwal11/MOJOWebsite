import { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';
import { useSwipe } from '../../hooks/useSwipe';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { attachHls, detachHls } from '../../utils/hls';
import { useImageOrientation } from '../../utils/imageOrientation';

type Props = {
  item: any;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  autoPlay?: boolean;        // slideshow for images
  intervalMs?: number;
  pauseOnHover?: boolean;
  autoAdvanceVideos?: boolean;
  /** optional: try to enter OS fullscreen on mobile */
  fullscreenOnMobile?: boolean;
};

export default function MediaLightbox({
  item,
  onClose,
  onNext,
  onPrev,
  autoPlay = true,
  intervalMs = 3500,
  pauseOnHover = true,
  autoAdvanceVideos = true,
  fullscreenOnMobile = true,
}: Props) {
  const [playing, setPlaying] = useState(autoPlay);
  const [userActive, setUserActive] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string>('');
  const [rotatedImageUrl, setRotatedImageUrl] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { correctImageOrientation } = useImageOrientation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVideo = item?.type === 'video';

  if (!item) return null;

  // Attempt OS fullscreen on mobile (Android Chrome supports; iOS falls back to CSS 100dvh)
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !fullscreenOnMobile) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    // Best-effort
    const tryFs = async () => {
      try {
        // Some browsers need a user gesture; we try anyway.
        if (!document.fullscreenElement && el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' } as any);
        }
      } catch {
        /* ignore – CSS fallback still gives full-viewport */
      }
    };
    tryFs();

    // Exit fullscreen when closing/unmounting
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [fullscreenOnMobile]);

  // Only resolve poster for VIDEO (prevents double image loads & 429s)
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

  // Load rotated image URL for full-size display (images only)
  useEffect(() => {
    let mounted = true;
    setRotatedImageUrl('');
    if (!isVideo && item.rotatedImagePath) {
      getDownloadURL(ref(storage, item.rotatedImagePath))
        .then((u) => mounted && setRotatedImageUrl(u))
        .catch(() => {
          console.warn('Failed to load rotated image, using original');
          mounted && setRotatedImageUrl('');
        });
    }
    return () => { mounted = false; };
  }, [isVideo, item?.rotatedImagePath]);

  // Attach HLS (if available) in lightbox; fallback to original url
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const v = videoRef.current;

    // Dev: skip HLS due to typical CORS during local runs
    if (import.meta.env.DEV) {
      v.src = item.url;
      v.play().catch(() => {});
      const onEnded = () => { if (autoAdvanceVideos) onNext(); };
      v.addEventListener('ended', onEnded);
      return () => v.removeEventListener('ended', onEnded);
    }

    let cancelled = false;
    (async () => {
      try {
        if (item.sources?.hls) {
          await attachHls(v, item.sources.hls);
        } else {
          v.src = item.url;
        }
        if (!cancelled) v.play().catch(() => {});
      } catch {
        v.src = item.url;
      }
    })();

    const onEnded = () => { if (autoAdvanceVideos) onNext(); };
    v.addEventListener('ended', onEnded);

    return () => {
      cancelled = true;
      v.removeEventListener('ended', onEnded);
      try { detachHls(v); } catch {}
    };
  }, [isVideo, item, onNext, autoAdvanceVideos]);

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

  // Sync video muted state
  useEffect(() => {
    if (videoRef.current && isVideo) videoRef.current.muted = isMuted;
  }, [isMuted, isVideo]);

  // Swipe; disable when zoomed so pan doesn't trigger slide
  const swipe = useSwipe({ onLeft: onNext, onRight: onPrev });
  const swipeHandlers = scale > 1.02 ? {} : swipe;

  // Reset zoom when slide changes
  useEffect(() => { setScale(1); }, [item?.id]);

  // Inactivity timer to replace aggressive hover detection
  useEffect(() => {
    if (!pauseOnHover) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const setUserInactive = () => setUserActive(false);

    const setUserActiveAndReset = () => {
      setUserActive(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(setUserInactive, 1200); // Resume after 1.2s idle
    };

    const mediaArea = document.getElementById('lightbox-media-area');
    if (mediaArea) {
      mediaArea.addEventListener('mousemove', setUserActiveAndReset);
      mediaArea.addEventListener('touchstart', setUserActiveAndReset);
      mediaArea.addEventListener('click', setUserActiveAndReset);
      setUserActive(false);
    }
    return () => {
      clearTimeout(timeoutId);
      if (mediaArea) {
        mediaArea.removeEventListener('mousemove', setUserActiveAndReset);
        mediaArea.removeEventListener('touchstart', setUserActiveAndReset);
        mediaArea.removeEventListener('click', setUserActiveAndReset);
      }
    };
  }, [pauseOnHover]);

  return (
    <div
      ref={rootRef}
      className="lb-root fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      aria-modal
      role="dialog"
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-3">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            {isVideo && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
                title={isMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
            <button onClick={() => shareUrl(item.url, item.title)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <a href={item.url} download className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        </div>

        {/* Body */}
        <div
          id="lightbox-media-area"
          className="flex-1 flex items-center justify-center p-3 gap-4"
          style={{ touchAction: (scale > 1.02 ? 'auto' : 'pan-y') }}
          {...swipeHandlers}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

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
              {isVideo ? (
                <video
                  ref={videoRef}
                  controls
                  autoPlay
                  muted={isMuted}
                  playsInline
                  preload="metadata"
                  poster={posterUrl || undefined}
                  className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                />
              ) : (
                <div className="lb-img-wrap">
                  <img
                    key={item.id}                    // stable: no more thumb->full swaps
                    src={rotatedImageUrl || item.url} // use server-rotated image if available, fallback to original
                    alt={item.title || ''}
                    className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                    draggable={false}
                    onLoad={(e) => correctImageOrientation(e.currentTarget)}
                  />
                </div>
              )}
            </TransformComponent>
          </TransformWrapper>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-center gap-4 pb-4">
          {item.type === 'image' && (
            <button
              onClick={() => setPlaying(p => !p)}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 transition-colors"
              aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="text-sm">{playing ? 'Pause' : 'Play'}</span>
            </button>
          )}
          {isVideo && (
            <div className="text-white/70 text-sm">
              Press <kbd className="px-2 py-1 bg-white/20 rounded text-xs">M</kbd> to toggle audio
            </div>
          )}
        </div>
      </div>
    </div>
  );
}