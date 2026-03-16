/**
 * Centralized SEO Configuration
 * 
 * This file contains all SEO-related constants to ensure consistency
 * across the application. All URLs should reference this config.
 */

export const SEO_CONFIG = {
  // Primary domain - always use this for canonical URLs and structured data
  baseUrl: 'https://momsfitnessmojo.com',
  
  // Alternative domains that redirect to baseUrl
  alternateDomains: [
    'https://momfitnessmojo.com',
    'https://www.momsfitnessmojo.com',
    'https://www.momfitnessmojo.com',
    'https://momfitnessmojo.web.app', // Firebase hosting domain
  ],
  
  // Site information
  siteName: 'Moms Fitness Mojo',
  defaultTitle: 'Moms Fitness Mojo - Fitness Community for Moms',
  defaultDescription: 'Join Moms Fitness Mojo - a supportive community for moms to connect, share fitness journeys, and grow together. Find local fitness events, share media, and build lasting friendships.',
  defaultKeywords: 'mom fitness, fitness community, women fitness, local fitness events, mom workout, fitness classes, health and wellness, mom health, women wellness',
  
  // Default images for SEO/Social Media Sharing
  // These are ONLY used in meta tags (og:image, twitter:image) for social media previews
  // They are NOT displayed in the application UI - only shown when links are shared on social media
  // 
  // Recommended sizes:
  // - Open Graph (Facebook/LinkedIn): 1200x630px
  // - Twitter Card: 1200x675px or 1200x1200px for square
  // Note: SVG works but PNG/JPG is often better for social media platforms
  defaultImage: 'https://momsfitnessmojo.com/assets/logo/mfm-logo-updated-tagline-2.svg', // Open Graph image (Facebook/LinkedIn sharing)
  defaultImageWidth: 1200, // Recommended width for Open Graph
  defaultImageHeight: 630, // Recommended height for Open Graph
  defaultLogo: 'https://momsfitnessmojo.com/assets/logo/square-logo.svg', // Twitter Card image
  
  // Social media
  twitterHandle: '@momsfitnessmojo',
  facebookAppId: import.meta.env.VITE_FACEBOOK_APP_ID,
  
  socialMedia: {
    facebook: 'https://www.facebook.com/momsfitnessmojo',
    instagram: 'https://www.instagram.com/momsfitnessmojo',
    twitter: 'https://twitter.com/momsfitnessmojo',
  },
  
  // Contact information
  email: 'momsfitnessmojo@gmail.com',
  phone: undefined, // Add if available
  
  // Location (for local SEO)
  address: {
    '@type': 'PostalAddress' as const,
    addressLocality: 'Short Hills',
    addressRegion: 'NJ',
    postalCode: '07078',
    addressCountry: 'US',
    streetAddress: undefined, // Add if you want to include street address
  },
  
  // Geo coordinates for local SEO
  geo: {
    region: 'US-NJ',
    placename: 'Short Hills, New Jersey',
    position: '40.747;-74.326',
    ICBM: '40.747, -74.326',
  },
  
  // Organization details
  foundingDate: '2024',
  knowsAbout: ['Fitness', "Women's Health", 'Community Building', 'Wellness', 'Motherhood'],
  
  // Locale
  locale: 'en_US',
  
  // Theme colors
  themeColor: '#F25129',
  
  // Helper function to generate full URL
  getUrl: (path: string = ''): string => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${SEO_CONFIG.baseUrl}${cleanPath}`;
  },
  
  // Helper function to check if URL is an alternate domain
  isAlternateDomain: (url: string): boolean => {
    return SEO_CONFIG.alternateDomains.some(domain => url.startsWith(domain));
  },
};

// Ensure we always use the primary domain
if (typeof window !== 'undefined' && SEO_CONFIG.isAlternateDomain(window.location.href)) {
  // This will be handled by Firebase hosting redirects, but we log it in dev
  if (import.meta.env.DEV) {
    console.warn('[SEO] Detected alternate domain. Should redirect to:', SEO_CONFIG.baseUrl);
  }
}

