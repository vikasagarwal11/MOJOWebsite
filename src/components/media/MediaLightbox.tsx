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
  onNext,
  onPrev,
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

  // DEBUG: Log component props and state
  console.log('🔍 MediaLightbox DEBUG:', {
    itemId: item?.id,
    itemType: item?.type,
    autoPlay,
    intervalMs,
    pauseOnHover,
    autoAdvanceVideos,
    playing,
    hovering,
    scale
  });

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
    console.log('🎥 Video HLS useEffect triggered:', {
      itemExists: !!item,
      itemType: item?.type,
      hasVideoRef: !!videoRef.current,
      autoAdvanceVideos,
      onNextFunction: typeof onNext
    });

    if (!item || item.type !== 'video' || !videoRef.current) {
      console.log('❌ Video HLS setup skipped: Not a video or no video ref');
      return;
    }
    
    const v = videoRef.current;
    console.log('✅ Setting up video with HLS/fallback');

    let cancelled = false;
    (async () => {
      try {
        if (item.sources?.hls) {
          console.log('🎬 Attaching HLS source:', item.sources.hls);
          await attachHls(v, item.sources.hls);
        } else {
          console.log('📹 Using fallback video URL:', item.url);
          v.src = item.url;
        }
        if (!cancelled) {
          // Start playing automatically if user arrived from slideshow
          console.log('▶️ Attempting to auto-play video');
          v.play().catch((e) => console.log('❌ Auto-play failed:', e));
        }
      } catch (error) {
        console.log('❌ HLS setup failed, using fallback:', error);
        v.src = item.url;
      }
    })();

    const onEnded = () => { 
      console.log('🏁 Video ended, auto-advance:', autoAdvanceVideos);
      if (autoAdvanceVideos) onNext(); 
    };
    v.addEventListener('ended', onEnded);

    return () => {
      console.log('🧹 Cleaning up video HLS setup');
      cancelled = true;
      v.removeEventListener('ended', onEnded);
      try { detachHls(v); } catch {}
    };
  }, [item, onNext, autoAdvanceVideos]);

  // Auto-advance images
  useEffect(() => {
    console.log('🔄 Auto-advance useEffect triggered:', {
      itemExists: !!item,
      itemType: item?.type,
      playing,
      hovering,
      pauseOnHover,
      intervalMs,
      onNextFunction: typeof onNext
    });

    if (!item || item.type === 'video') {
      console.log('❌ Auto-advance skipped: Not an image or no item');
      return;
    }
    if (!playing) {
      console.log('❌ Auto-advance skipped: Not playing');
      return;
    }
    if (pauseOnHover && hovering) {
      console.log('❌ Auto-advance skipped: Paused on hover');
      return;
    }

    console.log('✅ Creating auto-advance timer for', intervalMs, 'ms');
    const t = setInterval(() => {
      console.log('⏰ Auto-advance timer fired, calling onNext()');
      onNext();
    }, intervalMs);
    
    return () => {
      console.log('🧹 Cleaning up auto-advance timer');
      clearInterval(t);
    };
  }, [item, playing, hovering, pauseOnHover, intervalMs, onNext]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      console.log('⌨️ Keyboard event:', e.key);
      if (e.key === 'Escape') {
        console.log('🚪 Escape key pressed, calling onClose()');
        onClose();
      }
      if (e.key === 'ArrowRight') {
        console.log('➡️ Right arrow key pressed, calling onNext()');
        onNext();
      }
      if (e.key === 'ArrowLeft') {
        console.log('⬅️ Left arrow key pressed, calling onPrev()');
        onPrev();
      }
      if (e.key === ' ') { 
        console.log('␣ Spacebar pressed, toggling playing state');
        e.preventDefault(); 
        setPlaying(p => !p); 
      }
    };
    console.log('⌨️ Setting up keyboard event listeners');
    window.addEventListener('keydown', onKey);
    return () => {
      console.log('🧹 Cleaning up keyboard event listeners');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, onNext, onPrev]);

  // Swipe; disable when zoomed so pan doesn't trigger slide
  const swipe = useSwipe({ 
    onLeft: () => {
      console.log('👈 Swipe left detected, calling onNext()');
      onNext();
    }, 
    onRight: () => {
      console.log('👉 Swipe right detected, calling onPrev()');
      onPrev();
    }
  });
  
  const swipeHandlers = scale > 1.02 ? {} : swipe;
  console.log('🖱️ Swipe handlers:', {
    scale,
    swipeDisabled: scale > 1.02,
    hasSwipeHandlers: Object.keys(swipeHandlers).length > 0
  });

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
          <button 
            onClick={() => {
              console.log('⬅️ Previous button clicked, calling onPrev()');
              console.log('🔍 onPrev function:', typeof onPrev, onPrev);
              onPrev();
            }} 
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

          <button 
            onClick={() => {
              console.log('➡️ Next button clicked, calling onNext()');
              console.log('🔍 onNext function:', typeof onNext, onNext);
              onNext();
            }} 
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
              onClick={() => {
                console.log('🎮 Play/Pause button clicked');
                console.log('🔍 Current playing state:', playing);
                setPlaying(p => {
                  const newState = !p;
                  console.log('🔄 Setting playing state to:', newState);
                  return newState;
                });
              }}
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