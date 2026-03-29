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

  // 🔹 Extract valid images
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

  // 🔹 Sync images
  useEffect(() => {
    if (heroImages.length > 0) {
      setImages(heroImages);
      setCurrentIndex(0);
      return;
    }
    setImages([]);
    setCurrentIndex(0);
  }, [heroImages]);

  // 🔹 Auto slide
  useEffect(() => {
    if (images.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) =>
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, duration * 1000);

    return () => clearInterval(interval);
  }, [images, duration]);

  // 🔹 Fallback UI
  if (images.length === 0) {
    if (debug) {
      console.log('HeroCarousel: No images loaded, showing fallback');
    }

    return (
      <div className="aspect-[4/3] sm:aspect-[3/2] lg:aspect-[2/1] overflow-hidden bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center">
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
    console.log(
      'HeroCarousel: Rendering with',
      images.length,
      'images, current index:',
      currentIndex
    );
  }

  return (
    <div className="aspect-[4/3] sm:aspect-[3/2] lg:aspect-[2/1.5] relative bg-white rounded-2xl overflow-hidden">
      
      {images.length > 0 && (
        <div className="absolute inset-0">
          
          {/* 🔵 Blurred Background */}

          {/* 🟢 Main Image */}
          <div className="relative w-full h-full flex items-center justify-center bg-white">
            <img
              src={images[currentIndex]}
              alt="Moms Fitness Mojo community activities and events"
              className="block max-w-full max-h-full object-contain rounded-2xl [clip-path:inset(0_round_1rem)]"
              onError={(e) => {
                console.error(
                  'HeroCarousel: Failed to load image',
                  images[currentIndex],
                  e
                );
                setImages((prev) => {
                  const next = prev.filter((_, idx) => idx !== currentIndex);
                  setCurrentIndex(0);
                  return next;
                });
              }}
              onLoad={() => {
                if (debug) {
                  console.log(
                    'HeroCarousel: Displayed image',
                    images[currentIndex]
                  );
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Optional debug UI */}
      {/* 
      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
        {currentIndex + 1}/{images.length}
      </div>
      */}
    </div>
  );
};

export default HeroCarousel;
