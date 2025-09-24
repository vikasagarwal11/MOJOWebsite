import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CommentMediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrls: string[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export const CommentMediaLightbox: React.FC<CommentMediaLightboxProps> = ({
  isOpen,
  onClose,
  mediaUrls,
  currentIndex,
  onIndexChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(true); // Start as true to avoid covering content
  const videoRef = useRef<HTMLVideoElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const currentMedia = mediaUrls[currentIndex];
  const isVideo = currentMedia?.match(/\.(mp4|webm|ogg|mov|avi)(\?|$)/i);

  // Reset image loaded state when media changes
  useEffect(() => {
    setImageLoaded(false);
  }, [currentMedia]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            onIndexChange(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < mediaUrls.length - 1) {
            onIndexChange(currentIndex + 1);
          }
          break;
        case ' ':
          e.preventDefault();
          if (isVideo) {
            togglePlayPause();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, mediaUrls.length, isVideo]);

  // Handle body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentMedia;
    link.download = `media-${Date.now()}`;
    link.click();
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < mediaUrls.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  if (!isOpen || !currentMedia) return null;

  const overlay = (
    <AnimatePresence>
      {isOpen && currentMedia && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          aria-label="Media viewer"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/90" onClick={onClose} />

          {/* Top controls – OUTSIDE the media box */}
          <div className="absolute top-0 left-0 right-0 z-[60] pointer-events-none">
            <div className="flex items-center justify-between p-4">
              <div className="text-white/90 text-sm pointer-events-auto">
                {currentIndex + 1} of {mediaUrls.length}
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                <button 
                  onClick={handleDownload} 
                  className="p-2 text-white hover:bg-white/20 rounded-full focus:outline-none focus:ring-2 focus:ring-white/50"
                  aria-label="Download media"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button 
                  onClick={onClose} 
                  className="p-2 text-white hover:bg-white/20 rounded-full focus:outline-none focus:ring-2 focus:ring-white/50"
                  aria-label="Close media viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Media – OWNER of layout */}
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="absolute inset-0 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo ? (
              <video
                ref={videoRef}
                src={currentMedia}
                className="block w-auto h-auto rounded-lg shadow-2xl"
                style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
                onLoadedData={() => setImageLoaded(true)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                muted={isMuted}
                loop
                controls
              />
            ) : (
              <img
                src={currentMedia}
                alt="Media content"
                className="block w-auto h-auto rounded-lg shadow-2xl"
                style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            )}

            {/* Spinner */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F25129]" />
              </div>
            )}

            {/* Arrows */}
            {mediaUrls.length > 1 && currentIndex > 0 && (
              <button
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full z-[60] focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Previous media"
                title="Previous media (Left arrow)"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            {mediaUrls.length > 1 && currentIndex < mediaUrls.length - 1 && (
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white hover:bg-white/20 rounded-full z-[60] focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Next media"
                title="Next media (Right arrow)"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </motion.div>

          {/* Thumbnail Strip */}
          {mediaUrls.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4">
              <div className="flex space-x-2 justify-center overflow-x-auto">
                {mediaUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => onIndexChange(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentIndex 
                        ? 'border-white shadow-lg' 
                        : 'border-transparent hover:border-white/50'
                    }`}
                  >
                    {url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                      <img
                        src={url}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <Play className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render the overlay at the top of the DOM
  return createPortal(overlay, document.body);
};
