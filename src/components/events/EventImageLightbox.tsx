import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useImageOrientation } from '../../utils/imageOrientation';

interface EventImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

export const EventImageLightbox: React.FC<EventImageLightboxProps> = ({
  isOpen,
  imageUrl,
  alt,
  onClose
}) => {
  const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);
  const { correctImageOrientation } = useImageOrientation();
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
  }, [isOpen]);

  // Reset zoom when image changes
  useEffect(() => {
    if (zoomRef.current) {
      zoomRef.current.resetTransform();
    }
  }, [imageUrl]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Image Container */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <TransformWrapper
              initialScale={1}
              minScale={isMobile ? 1 : 0.5}
              maxScale={isMobile ? 3 : 4}
              centerOnInit
              wheel={{ step: 0.1, disabled: isMobile }}
              pinch={{ step: 5 }}
              doubleClick={{ disabled: true }}
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
                      : 'flex items-center justify-center'
                  }
                >
                  <img
                    src={imageUrl}
                    alt={alt}
                    className={
                      isMobile
                        ? 'max-h-full max-w-full object-contain rounded-2xl'
                        : 'max-h-[90vh] max-w-[90vw] rounded-2xl object-contain'
                    }
                    draggable={false}
                    onLoad={(e) => correctImageOrientation(e.currentTarget)}
                  />
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>

          {/* Hint text (mobile) */}
          {isMobile && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm">
              Pinch to zoom • Tap outside to close
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
