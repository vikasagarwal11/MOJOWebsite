import React from 'react';

interface MetaTagsProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'event';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  locale?: string;
  siteName?: string;
  twitterHandle?: string;
  facebookAppId?: string;
  noIndex?: boolean;
  noFollow?: boolean;
}

export const MetaTags: React.FC<MetaTagsProps> = ({
  title = "Moms Fitness Mojo - Fitness Community for Moms",
  description = "Join Moms Fitness Mojo - a supportive community for moms to connect, share fitness journeys, and grow together. Find local fitness events, share media, and build lasting friendships.",
  keywords = "mom fitness, fitness community, women fitness, local fitness events, mom workout, fitness classes, health and wellness, mom health, women wellness",
  image = "https://momsfitnessmojo.com/images/founder-cover.jpg",
  url = "https://momsfitnessmojo.com",
  type = "website",
  author = "Moms Fitness Mojo",
  publishedTime,
  modifiedTime,
  locale = "en_US",
  siteName = "Moms Fitness Mojo",
  twitterHandle = "@momsfitnessmojo",
  facebookAppId,
  noIndex = false,
  noFollow = false
}) => {
  const robotsContent = [
    noIndex ? 'noindex' : 'index',
    noFollow ? 'nofollow' : 'follow'
  ].join(', ');

  return (
    <>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <meta name="language" content="English" />
      <meta name="revisit-after" content="7 days" />
      <link rel="canonical" href={url} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale} />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {author && <meta property="article:author" content={author} />}
      {facebookAppId && <meta property="fb:app_id" content={facebookAppId} />}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {twitterHandle && <meta name="twitter:site" content={twitterHandle} />}
      {twitterHandle && <meta name="twitter:creator" content={twitterHandle} />}

      {/* Additional SEO Tags */}
      <meta name="theme-color" content="#f97316" />
      <meta name="msapplication-TileColor" content="#f97316" />
      <meta name="apple-mobile-web-app-title" content="Mojo Fitness" />
      
      {/* Geo Tags (if location-specific) */}
      <meta name="geo.region" content="US-NJ" />
      <meta name="geo.placename" content="Short Hills, New Jersey" />
      <meta name="geo.position" content="40.747;-74.326" />
      <meta name="ICBM" content="40.747, -74.326" />
    </>
  );
};

// Specialized meta tags for different page types
export const HomeMetaTags: React.FC = () => (
  <MetaTags
    title="Moms Fitness Mojo - Fitness Community for Moms"
    description="Join our supportive fitness community where moms connect, share fitness journeys, and grow together. Find local events, share media, and build lasting friendships."
    keywords="mom fitness, fitness community, women fitness, local fitness events, mom workout, fitness classes, health and wellness"
  />
);

export const EventsMetaTags: React.FC = () => (
  <MetaTags
    title="Events for Moms - Moms Fitness Mojo"
    description="Discover local fitness events designed for moms. Join yoga classes, workout sessions, and wellness activities in your community."
    keywords="fitness events, mom yoga classes, women fitness events, local workout classes, mom wellness activities"
    url="https://momsfitnessmojo.com/events"
  />
);

export const MediaMetaTags: React.FC = () => (
  <MetaTags
    title="Fitness Media & Gallery - Moms Fitness Mojo"
    description="Browse our fitness media gallery featuring workout videos, healthy recipes, and inspiring stories from our mom fitness community."
    keywords="fitness videos, workout gallery, mom fitness inspiration, healthy recipes, fitness photos"
    url="https://momsfitnessmojo.com/media"
  />
);

export const FounderMetaTags: React.FC = () => (
  <MetaTags
    title="Meet Our Founder - Moms Fitness Mojo"
    description="Learn about the inspiring story behind Moms Fitness Mojo and how our founder is building a supportive community for moms everywhere."
    keywords="fitness founder, mom entrepreneur, women in fitness, community leader"
    url="https://momsfitnessmojo.com/founder"
  />
);

export const ContactMetaTags: React.FC = () => (
  <MetaTags
    title="Contact Us - Moms Fitness Mojo"
    description="Get in touch with Moms Fitness Mojo. We'd love to hear from you and help you join our supportive fitness community."
    keywords="contact fitness community, join mom fitness, fitness community support"
    url="https://momsfitnessmojo.com/contact"
  />
);
