import React, { useState, useEffect } from 'react';

interface HeroCarouselProps {
  imagesDirectory: string;
  duration?: number; // Duration per slide in seconds
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({
  imagesDirectory,
  duration = 4,
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const debug = import.meta.env.DEV;

  useEffect(() => {
    // Keep this tiny and deterministic: check a short, sensible list.
    const discoverImages = async () => {
      // Put your likely hero photos here (add/remove as you add files)
      // Images are numbered in order: 001, 002, 003, etc.
      const candidates = [
        '001.jpeg',
        '002.JPG',
        '003.jpg',
        '004.JPG',
        '005.jpeg',
        '006.JPG',
        '007.jpeg',
        '008.JPG',
        '009.jpeg',
        '010.jpeg',
        '011.jpg',
        '012.jpeg',
        '013.jpg'
      ];

      const check = async (name: string) => {
        const url = `${imagesDirectory}/${name}`;
        try {
          const res = await fetch(url, { method: 'GET' });
          const type = res.headers.get('content-type') || '';
          if (!res.ok || !type.startsWith('image/')) return null;
          return url; // store full URL
        } catch {
          return null;
        }
      };

      const results = await Promise.all(candidates.map(check));
      const valid = results.filter(Boolean) as string[];
      setImages(valid.length ? valid : [`${imagesDirectory}/001.jpeg`]);
    };
    discoverImages();
  }, [imagesDirectory]);

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
      <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center">
        <div className="text-center text-white">
          <img 
            src="/assets/logo/homepageslide.svg" 
            alt="Moms Fitness Mojo Logo" 
            className="h-24 w-24 mx-auto mb-4 filter brightness-0 invert" 
          />
          <p className="text-sm">Loading carousel...</p>
        </div>
      </div>
    );
  }

  if (debug) {
    console.log('HeroCarousel: Rendering with', images.length, 'images, current index:', currentIndex);
  }

  return (
    <div className="aspect-[2/1.5] rounded-2xl overflow-hidden shadow-lg bg-gray-100 relative">
      {/* Show current image directly - no complex CSS */}
      {images.length > 0 && (
        <img
          src={images[currentIndex]}   // now already a full URL
          alt="Moms Fitness Mojo community activities and events"
          className="w-full h-full object-cover"
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
        <div className="absolute inset-0 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center p-8">
          <div className="text-center text-white">
            <div className="text-4xl mb-4">🏃‍♀️</div>
            <div className="text-lg font-semibold">Moms Fitness Mojo</div>
            <div className="text-sm opacity-90">Community Activities</div>
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
