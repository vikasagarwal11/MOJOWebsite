import React from 'react';
import { EventPlaceholder } from './EventPlaceholder';

interface EventImageProps {
  src?: string;
  alt: string;
  className?: string;
  children?: React.ReactNode;
  fit?: "contain" | "cover" | "auto";
  aspect?: string | number;
  focus?: "center" | "top" | "bottom" | "left" | "right";
  title?: string;
}

// ------------------------------
// SMART IMAGE (avoids cutting off content)
// ------------------------------
const EventImage: React.FC<EventImageProps> = ({ 
  src, 
  alt, 
  className = "", 
  children, 
  fit = "contain", 
  aspect = "16/9", 
  focus = "center",
  title
}) => {
  const [naturalRatio, setNaturalRatio] = React.useState<number | null>(null);
  const [imageError, setImageError] = React.useState<boolean>(false);
  const resolved = src;

  // Decide object-fit based on image ratio and fit mode
  const objectFit = React.useMemo(() => {
    if (fit === "auto") {
      // If image is extremely wide/tall, prefer contain to avoid cropping
      if (naturalRatio && (naturalRatio > 2 || naturalRatio < 0.5)) {
        return "contain";
      }
      return "cover"; // otherwise allow tasteful crop
    }
    return fit; // 'contain' (no crop) or 'cover'
  }, [fit, naturalRatio]);

  const objectPosition = React.useMemo(() => {
    switch (focus) {
      case "top": return "top";
      case "bottom": return "bottom";
      case "left": return "left";
      case "right": return "right";
      default: return "center";
    }
  }, [focus]);
  
  // If no src provided or image failed to load, use placeholder
  if (!src || imageError) {
    return (
      <EventPlaceholder className={className} aspect={aspect} title={title}>
        {children}
      </EventPlaceholder>
    );
  }
  
  // Dynamic aspect ratio - use natural ratio if available, otherwise fallback
  const style: React.CSSProperties = {
    aspectRatio: naturalRatio ? naturalRatio : (typeof aspect === "number" ? String(aspect) : aspect),
  };

  return (
    <div className={`relative w-full overflow-hidden bg-gray-100 ${className}`} style={style}>
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.naturalWidth && img.naturalHeight) {
            setNaturalRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        onError={() => {
          console.warn(`🚨 EventImage: Failed to load image: ${resolved}`);
          setImageError(true);
        }}
        className={`h-full w-full object-${objectFit} object-${objectPosition}`}
      />
      {children ? (
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">{children}</div>
      ) : null}
    </div>
  );
};

export { EventImage };

