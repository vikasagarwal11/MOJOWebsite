import React, { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';
import { useSwipe } from '../../hooks/useSwipe';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { attachHls, detachHls } from '../../utils/hls';

type Props = {
  item: any;
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
  onClose,
  onPrev,
  onNext,
  autoPlay = true,
  intervalMs = 3500,
  pauseOnHover = true,
  autoAdvanceVideos = true,
}: Props) {
  const [playing, setPlaying] = useState(autoPlay);
  const [hovering, setHovering] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string>('');
  const [scale, setScale] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!item) return null;

  // Resolve Storage poster path → URL (images & videos)
  useEffect(() => {
    let mounted = true;
    setPosterUrl('');
    if (item.thumbnailPath) {
      getDownloadURL(ref(storage, item.thumbnailPath))
        .then((u) => mounted && setPosterUrl(u))
        .catch(() => mounted && setPosterUrl(''));
    }
    return () => { mounted = false; };
  }, [item?.thumbnailPath]);

  // Attach HLS (if available) in lightbox; fallback to original url
  useEffect(() => {
    if (!item || item.type !== 'video' || !videoRef.current) return;
    const v = videoRef.current;

    let cancelled = false;
    (async () => {
      try {
        if (item.sources?.hls) {
          await attachHls(v, item.sources.hls);
        } else {
          v.src = item.url;
        }
        if (!cancelled) {
          // Start playing automatically if user arrived from slideshow
          v.play().catch(() => {});
        }
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
  }, [item, onNext, autoAdvanceVideos]);

  // Auto-advance images
  useEffect(() => {
    if (!item || item.type === 'video') return;
    if (!playing) return;
    if (pauseOnHover && hovering) return;

    const t = setInterval(onNext, intervalMs);
    return () => clearInterval(t);
  }, [item, playing, hovering, pauseOnHover, intervalMs, onNext]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  // Swipe; disable when zoomed so pan doesn't trigger slide
  const swipe = useSwipe({ onLeft: onNext, onRight: onPrev });
  const swipeHandlers = scale > 1.02 ? {} : swipe;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      {...swipeHandlers}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-3">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            <button onClick={() => shareUrl(item.url, item.title)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <a href={item.url} download className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex items-center justify-center p-3 gap-4">
          <button onClick={onPrev} className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors" aria-label="Previous">
            <ChevronLeft className="w-8 h-8" />
          </button>

          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
            onTransformed={(ref) => setScale(ref.state.scale)}
          >
            <TransformComponent>
              {item.type === 'video' ? (
                <video
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  poster={posterUrl || undefined}
                  className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                />
              ) : (
                <img
                  src={posterUrl || item.url}
                  alt={item.title || ''}
                  className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                  draggable={false}
                />
              )}
            </TransformComponent>
          </TransformWrapper>

          <button onClick={onNext} className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors" aria-label="Next">
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
          <div className="text-white text-sm opacity-80">
            {item.type === 'image' ? 'Slideshow' : 'Video'} • Auto-advance {item.type === 'image' ? (playing ? 'ON' : 'OFF') : (autoAdvanceVideos ? 'ON' : 'OFF')}
          </div>
        </div>
      </div>
    </div>
  );
}