import { where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { useFirestore } from '../../hooks/useFirestore';

interface HeroCarouselProps {
  duration?: number; // Duration per slide in seconds
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({
  duration = 4,
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { useRealtimeCollection } = useFirestore();
  const heroMediaSnapshot = useRealtimeCollection('media', [
    where('showOnHomepage', '==', true),
  ]);

  const debug = import.meta.env.DEV;

  const heroImages = useMemo(() => {
    const raw = heroMediaSnapshot.data ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const media of raw) {
      if (media?.type !== 'image') continue;
      const url = media.url || media.thumbnailUrl;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= 20) break;
    }
    return out;
  }, [heroMediaSnapshot.data]);

  useEffect(() => {
    if (heroImages.length > 0) {
      setImages(heroImages);
      setCurrentIndex(0);
      return;
    }
    setImages([]);
    setCurrentIndex(0);
  }, [heroImages]);

  useEffect(() => {
    if (images.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, duration * 1000);

    return () => clearInterval(interval);
  }, [images, duration]);

  if (images.length === 0) {
    if (debug) {
      console.log('HeroCarousel: No images loaded, showing fallback');
    }
    return (
      <div className="aspect-[4/3] sm:aspect-[3/2] lg:aspect-[2/1] rounded-lg sm:rounded-xl lg:rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center">
        <div className="text-center text-white px-4">
          <img 
            src="/assets/logo/homepageslide.svg" 
            alt="Moms Fitness Mojo Logo" 
            className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 mx-auto mb-4 filter brightness-0 invert" 
          />
          <p className="text-xs sm:text-sm">Loading carousel...</p>
        </div>
      </div>
    );
  }

  if (debug) {
    console.log('HeroCarousel: Rendering with', images.length, 'images, current index:', currentIndex);
  }

  return (
    <div className="aspect-[4/3] sm:aspect-[3/2] lg:aspect-[2/1.5] rounded-lg sm:rounded-xl lg:rounded-2xl overflow-hidden shadow-lg bg-gray-100 relative">
      {/* Show current image directly - no complex CSS */}
      {images.length > 0 && (
        <img
          src={images[currentIndex]}   // now already a full URL
          alt="Moms Fitness Mojo community activities and events"
          className="w-full h-full object-contain bg-gray-100"
          onError={(e) => {
            console.error('HeroCarousel: Failed to load image', images[currentIndex], e);
            // Remove the bad image and move on
            setImages((prev) => {
              const next = prev.filter((_, idx) => idx !== currentIndex);
              setCurrentIndex(0);
              return next;
            });
          }}
          onLoad={() => {
            if (debug) {
              console.log('HeroCarousel: Displayed image', images[currentIndex]);
            }
          }}
        />
      )}
      
      {/* (removed dead code: currentIndex never equals images.length) */}
      
      {/* Fallback when no images are available */}
      {images.length === 0 && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="text-center text-white">
            <div className="text-3xl sm:text-4xl mb-4">🏃‍♀️</div>
            <div className="text-base sm:text-lg lg:text-xl font-semibold">Moms Fitness Mojo</div>
            <div className="text-xs sm:text-sm opacity-90">Community Activities</div>
          </div>
        </div>
      )}

      {/* Optional: Uncomment these for debugging */}
      {/* <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
        {currentIndex + 1}/{images.length}
      </div>
      
      <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
        CAROUSEL ACTIVE - {images.length} images
      </div> */}
    </div>
  );
};

export default HeroCarousel;
