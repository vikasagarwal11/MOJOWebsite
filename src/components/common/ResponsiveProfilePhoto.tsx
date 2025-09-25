import React from 'react';

type Variant = "transparent" | "with-background";

interface ResponsiveProfilePhotoProps {
  className?: string;
  variant?: Variant;
  priority?: boolean;
  size?: "small" | "medium" | "large" | "hero";
}

/**
 * Responsive profile photo component for founder/team members
 * Uses SVG for crisp scaling across all devices
 */
export const ResponsiveProfilePhoto: React.FC<ResponsiveProfilePhotoProps> = ({
  className = "",
  variant = "transparent",
  priority = true,
  size = "medium",
}) => {
  // Size configurations
  const sizeConfig = {
    small: "w-16 h-16 sm:w-20 sm:h-20",
    medium: "w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40",
    large: "w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56",
    hero: "w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 xl:w-72 xl:h-72"
  };

  // Choose the appropriate SVG file
  const imageSrc = variant === "transparent" 
    ? "/images/aina-profile-transparent.svg"
    : "/images/aina-profile-with-background.svg";

  return (
    <div className={`${sizeConfig[size]} ${className}`}>
      <picture>
        <img
          src={imageSrc}
          alt="Aina Rai - Founder of Moms Fitness Mojo"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          {...(priority ? { fetchpriority: "high" as any } : {})}
          className="w-full h-full object-cover rounded-full shadow-lg border-4 border-white/20"
          draggable={false}
        />
      </picture>
    </div>
  );
};
