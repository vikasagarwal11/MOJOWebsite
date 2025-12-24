type Variant = "square" | "wide" | "compact";

interface ResponsiveLogoProps {
  className?: string;
  variant?: Variant;          // choose container aspect
  priority?: boolean;         // eager load when true (hero)
  hiddenH1?: boolean;         // optional hidden H1 for SEO
  showDescription?: boolean;  // show description text below logo
}

/**
 * Responsive logo component that works perfectly on all devices
 * - Optimized for Mac, Windows, mobile (iOS & Android)
 * - Proper aspect ratios and sizing
 * - SVG with PNG fallback for maximum compatibility
 * - Responsive scaling based on screen size
 */
export function ResponsiveLogo({
  className = "",
  variant = "wide",
  priority = true,
  hiddenH1 = false,
  showDescription = true,
}: ResponsiveLogoProps) {
  // Container aspect and sizing based on variant
  const containerClasses = {
    square: "aspect-square max-w-xs sm:max-w-sm md:max-w-md",
    wide: "aspect-[4/3] max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl",
    compact: "aspect-[3/2] max-w-xs sm:max-w-sm"
  };
  
  // Padding based on variant for optimal logo display
  const paddingClasses = {
    square: "p-6 sm:p-8 md:p-10",
    wide: "p-8 sm:p-10 md:p-12 lg:p-14 xl:p-16",
    compact: "p-6 sm:p-8"
  };
  
  // Asset paths
  const logoSvg = "/assets/logo/mfm-logo-updated-tagline-2.svg";
  const fallbackPng = "/logo.png";

  return (
    <div className={`mx-auto w-full ${className}`}>
      {/* Logo container with gradient background */}
      <div className={`${containerClasses[variant]} mx-auto rounded-xl sm:rounded-2xl shadow-xl bg-gradient-to-r from-[#F25129] to-[#FFC107] overflow-hidden`}>
        <div className={`w-full h-full ${paddingClasses[variant]} flex items-center justify-center`}>
          <img
            src={logoSvg}
            alt="Moms Fitness Mojo - Where Fitness meets Friendship"
            className="w-full h-full max-w-full max-h-full object-contain select-none"
            loading={priority ? "eager" : "lazy"}
            fetchpriority={priority ? "high" : "auto"}
            decoding="async"
            width="800"
            height="600"
            style={{
              objectFit: 'contain',
              objectPosition: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto'
            }}
            draggable={false}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              // Fallback to PNG if SVG fails (for older browsers or rendering issues)
              if (target.src.includes('.svg')) {
                console.warn('SVG logo failed to load, using PNG fallback');
                target.src = fallbackPng;
              }
            }}
          />
        </div>
      </div>

      {/* Optional accessible heading for SEO, visually hidden */}
      {hiddenH1 && (
        <h1 className="sr-only">
          Moms Fitness Mojo – Where Fitness meets Friendship
        </h1>
      )}

      {/* Optional description text */}
      {showDescription && (
        <div className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg text-gray-700 max-w-3xl mx-auto text-center leading-relaxed space-y-3 sm:space-y-4 px-4">
          <p>
            Moms Fitness Mojo is more than a moms fitness group — it's a lifestyle and a circle of strength for moms. We bring together health, wellness, and fun while balancing family, careers, and social life.
          </p>
          
          <p className="hidden sm:block">
            From fitness activities and events like workouts, hikes, tennis, dance, and active meetups to social events like brunches, dinners, cocktail nights, and celebrating festivals together — it's where fitness meets friendship.
          </p>
        </div>
      )}
    </div>
  );
}