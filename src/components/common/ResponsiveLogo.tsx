type Variant = "square" | "wide";

interface ResponsiveLogoProps {
  className?: string;
  variant?: Variant;          // choose container aspect
  priority?: boolean;         // eager load when true (hero)
  hiddenH1?: boolean;         // optional hidden H1 for SEO
}

/**
 * Responsive logo component that uses modern image formats
 * with proper fallbacks and accessibility features
 */
export function ResponsiveLogo({
  className = "",
  variant = "wide",
  priority = true,
  hiddenH1 = false,
}: ResponsiveLogoProps) {
  // Container aspect based on variant - optimized for logo with text
  const aspect = variant === "square" ? "aspect-square" : "aspect-[3/2]";
  
  // Asset paths - these will be fingerprinted by the bundler
  const logoSvg = "/assets/logo/mfm-logo-new-hero.svg";
  const logoPng1x = "/assets/logo/mfm-logo-800.png";
  const logoPng2x = "/assets/logo/mfm-logo-1600.png";
  const fallbackSvg = "/assets/logo/mfm-mark.svg";

  return (
    <div className={`mx-auto max-w-3xl md:max-w-4xl ${className}`}>
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
            width={800} 
            height={600} 
            className="h-full w-full object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.25)] select-none pointer-events-none safari-logo-fix"
            draggable={false}
            onError={(e) => { 
              // Final fallback to mark SVG
              (e.currentTarget as HTMLImageElement).src = fallbackSvg; 
            }}
          />
        </picture>
      </div>

      {/* Optional accessible heading for SEO, visually hidden */}
      {hiddenH1 && (
        <h1 className="sr-only">
          Moms Fitness Mojo – Fit, Fierce, and Fabulous – Together
        </h1>
      )}

      <div className="mt-2 text-sm sm:text-base md:text-lg text-white/90 max-w-4xl mx-auto text-center leading-relaxed space-y-4">
        <p>
          Moms Fitness Mojo is more than a moms fitness group — it's a lifestyle and a circle of strength for moms. We bring together health, wellness, and fun while balancing family, careers, and social life.
        </p>
        
        <p>
          From fitness activities and events like workouts, hikes, tennis, dance, and active meetups to social events like brunches, dinners, cocktail nights, and celebrating festivals together — it's where fitness meets friendship.
        </p>
        
      </div>
    </div>
  );
}