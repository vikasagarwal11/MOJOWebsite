import React, { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { shareUrl } from '../../utils/share';
import { useSwipe } from '../../hooks/useSwipe';

export default function MediaLightbox({ 
  item, 
  onClose, 
  onPrev, 
  onNext,
  autoPlay = true,
  intervalMs = 3500,
  pauseOnHover = true,
  autoAdvanceVideos = true
}: {
  item: any; 
  onClose: () => void; 
  onPrev: () => void; 
  onNext: () => void;
  autoPlay?: boolean;
  intervalMs?: number;
  pauseOnHover?: boolean;
  autoAdvanceVideos?: boolean;
}) {
  const [playing, setPlaying] = useState(autoPlay);
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!item) return null;

  // Swipe functionality
  const swipe = useSwipe({ onLeft: onNext, onRight: onPrev });

  // Auto-advance images
  useEffect(() => {
    if (!item || item.type === 'video') return;
    if (!playing) return;
    if (pauseOnHover && hovering) return;

    const timer = setInterval(onNext, intervalMs);
    return () => clearInterval(timer);
  }, [item, playing, hovering, pauseOnHover, intervalMs, onNext]);

  // Video auto-advance on end
  useEffect(() => {
    if (!item || item.type !== 'video' || !videoRef.current) return;
    
    const video = videoRef.current;
    const handleEnded = () => {
      if (autoAdvanceVideos) onNext();
    };
    
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [item, autoAdvanceVideos, onNext]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      onPointerDown={swipe.onPointerDown}
      onPointerUp={swipe.onPointerUp}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between p-3">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            <button onClick={()=>shareUrl(item.url, item.title)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Share2 className="w-4 h-4" /> Share
            </button>
            <a href={item.url} download className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-3 gap-4">
          {/* Previous button */}
          <button onClick={onPrev} className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors" aria-label="Previous">
            <ChevronLeft className="w-8 h-8" />
          </button>

          {/* Media with ZOOM PRESERVED */}
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
          >
            <TransformComponent>
              {item.type === 'video' ? (
                <video 
                  ref={videoRef}
                  src={item.url} 
                  controls 
                  autoPlay 
                  className="max-h-[85vh] max-w-[85vw] rounded-2xl"
                  poster={item.thumbnailPath ? undefined : undefined}
                />
              ) : (
                <img 
                  src={item.thumbnailPath || item.url} 
                  alt={item.title} 
                  className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain"
                  draggable={false}
                />
              )}
            </TransformComponent>
          </TransformWrapper>

          {/* Next button */}
          <button onClick={onNext} className="text-white text-3xl px-3 hover:bg-white/10 rounded-full transition-colors" aria-label="Next">
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>

        {/* Bottom controls bar */}
        <div className="flex items-center justify-center gap-4 pb-4">
          {/* Play/Pause button (only for images) */}
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
          
          {/* Slideshow info */}
          <div className="text-white text-sm opacity-80">
            {item.type === 'image' ? 'Slideshow' : 'Video'} • Auto-advance {playing ? 'ON' : 'OFF'}
          </div>
        </div>
      </div>
    </div>
  );
}