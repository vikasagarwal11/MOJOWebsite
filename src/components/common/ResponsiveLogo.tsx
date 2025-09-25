import React from 'react';

type Variant = "square" | "wide";

interface ResponsiveLogoProps {
  className?: string;
  showSupportingText?: boolean;
  variant?: Variant;          // choose container aspect
  priority?: boolean;         // eager load when true (hero)
}

/**
 * Responsive logo component that uses modern image formats
 * with proper fallbacks and accessibility features
 */
export function ResponsiveLogo({
  className = "",
  showSupportingText = true,
  variant = "wide",
  priority = true,
}: ResponsiveLogoProps) {
  // Container aspect based on variant
  const aspect = variant === "square" ? "aspect-square" : "aspect-[1366/768]";
  
  // Asset paths - these will be fingerprinted by the bundler
  const logoSvg = "/assets/logo/mfm-logo.svg";
  const logoPng1x = "/assets/logo/mfm-logo-800.png";
  const logoPng2x = "/assets/logo/mfm-logo-1600.png";
  const fallbackSvg = "/assets/logo/mfm-mark.svg";

  return (
    <div className={`mx-auto max-w-3xl md:max-w-4xl ${className}`}>
      {/* Accessible heading for SEO, visually hidden */}
      <h1 className="sr-only">
        Moms Fitness Mojo – Fit, Fierce, and Fabulous – Together
      </h1>

      <div className={`mx-auto ${aspect} w-72 sm:w-96 md:w-[28rem] lg:w-[36rem] xl:w-[40rem] max-w-full`}>
        <picture>
          {/* SVG as primary source for modern browsers */}
          <source type="image/svg+xml" srcSet={logoSvg} />
          {/* PNG fallback for older browsers */}
          <img
            src={logoPng1x}
            srcSet={`${logoPng1x} 1x, ${logoPng2x} 2x`}
            sizes="(min-width: 1280px) 40rem, (min-width: 1024px) 36rem, (min-width: 768px) 28rem, 90vw"
            alt="Moms Fitness Mojo logo"
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            // Chrome hint for LCP image
            {...(priority ? { fetchpriority: "high" as any } : {})}
            width={1366} 
            height={768} 
            className="h-full w-full object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.25)] select-none pointer-events-none"
            draggable={false}
            onError={(e) => { 
              // Final fallback to mark SVG
              (e.currentTarget as HTMLImageElement).src = fallbackSvg; 
            }}
          />
        </picture>
      </div>

      {showSupportingText && (
        <p className="mt-3 text-sm sm:text-base md:text-lg text-white/85 max-w-3xl mx-auto text-center">
          Empowering mothers to prioritize their health, connect, and find their fitness mojo in a supportive environment.
        </p>
      )}
    </div>
  );
}

