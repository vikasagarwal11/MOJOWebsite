import { useEffect } from 'react';

interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'event';
  noIndex?: boolean;
  noFollow?: boolean;
}

export const useSEO = (seoData: SEOData) => {
  useEffect(() => {
    const {
      title,
      description,
      keywords,
      image,
      url,
      type = 'website',
      noIndex = false,
      noFollow = false
    } = seoData;

    // Update document title
    if (title) {
      document.title = title;
    }

    // Update meta description
    if (description) {
      updateMetaTag('description', description);
    }

    // Update meta keywords
    if (keywords) {
      updateMetaTag('keywords', keywords);
    }

    // Update Open Graph tags
    if (title) {
      updateMetaTag('og:title', title, 'property');
    }
    if (description) {
      updateMetaTag('og:description', description, 'property');
    }
    if (image) {
      updateMetaTag('og:image', image, 'property');
    }
    if (url) {
      updateMetaTag('og:url', url, 'property');
    }
    updateMetaTag('og:type', type, 'property');

    // Update Twitter Card tags
    if (title) {
      updateMetaTag('twitter:title', title);
    }
    if (description) {
      updateMetaTag('twitter:description', description);
    }
    if (image) {
      updateMetaTag('twitter:image', image);
    }

    // Update robots meta
    const robotsContent = [
      noIndex ? 'noindex' : 'index',
      noFollow ? 'nofollow' : 'follow'
    ].join(', ');
    updateMetaTag('robots', robotsContent);
    updateMetaTag('googlebot', robotsContent);

    // Update canonical URL
    if (url) {
      updateCanonicalURL(url);
    }
  }, [seoData]);
};

const updateMetaTag = (name: string, content: string, attribute: string = 'name') => {
  let meta = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;
  
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  
  meta.content = content;
};

const updateCanonicalURL = (url: string) => {
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  
  canonical.href = url;
};

// Predefined SEO configurations for different pages
export const seoConfigs = {
  home: {
    title: "Moms Fitness Mojo - Fitness Community for Moms",
    description: "Join our supportive fitness community where moms connect, share fitness journeys, and grow together. Find local events, share media, and build lasting friendships.",
    keywords: "mom fitness, fitness community, women fitness, local fitness events, mom workout, fitness classes, health and wellness"
  },
  
  events: {
    title: "Events for Moms - Moms Fitness Mojo",
    description: "Discover local fitness events designed for moms. Join yoga classes, workout sessions, and wellness activities in your community.",
    keywords: "fitness events, mom yoga classes, women fitness events, local workout classes, mom wellness activities",
    url: "https://momsfitnessmojo.com/events"
  },
  
  media: {
    title: "Fitness Media & Gallery - Moms Fitness Mojo",
    description: "Browse our fitness media gallery featuring workout videos, healthy recipes, and inspiring stories from our mom fitness community.",
    keywords: "fitness videos, workout gallery, mom fitness inspiration, healthy recipes, fitness photos",
    url: "https://momsfitnessmojo.com/media"
  },
  
  founder: {
    title: "Meet Our Founder - Moms Fitness Mojo",
    description: "Learn about the inspiring story behind Moms Fitness Mojo and how our founder is building a supportive community for moms everywhere.",
    keywords: "fitness founder, mom entrepreneur, women in fitness, community leader",
    url: "https://momsfitnessmojo.com/founder"
  },
  
  contact: {
    title: "Contact Us - Moms Fitness Mojo",
    description: "Get in touch with Moms Fitness Mojo. We'd love to hear from you and help you join our supportive fitness community.",
    keywords: "contact fitness community, join mom fitness, fitness community support",
    url: "https://momsfitnessmojo.com/contact"
  },
  
  about: {
    title: "About Moms Fitness Mojo - Our Mission",
    description: "Learn about Moms Fitness Mojo's mission to create a supportive fitness community where moms can connect, share, and grow together.",
    keywords: "about mom fitness, fitness community mission, women wellness community",
    url: "https://momsfitnessmojo.com/about"
  }
};

// Hook for event-specific SEO
export const useEventSEO = (event: {
  title: string;
  description: string;
  startAt: any;
  location?: string;
  venueName?: string;
  venueAddress?: string;
  imageUrl?: string;
  maxAttendees?: number;
  attendingCount?: number;
}) => {
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString();
  };

  const locationText = event.venueName 
    ? `${event.venueName}${event.venueAddress ? `, ${event.venueAddress}` : ''}`
    : event.location || '';

  const seoData: SEOData = {
    title: `${event.title} - Moms Fitness Event | Moms Fitness Mojo`,
    description: `${event.description} Join MOJO at ${locationText} for this amazing fitness event designed for moms.`,
    keywords: `fitness event, mom workout, ${event.title}, ${locationText}, moms fitness mojo`,
    image: event.imageUrl || "https://momsfitnessmojo.com/images/founder-cover.jpg",
    type: 'event',
    url: `https://momsfitnessmojo.com/events`
  };

  useSEO(seoData);
};
