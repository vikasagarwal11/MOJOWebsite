import React from 'react';
import { Helmet } from 'react-helmet-async';
import type { EventDoc } from '../../hooks/useEvents';

export const EventsListSeo: React.FC<{ events: EventDoc[] }> = ({ events }) => {
  const items = events.map((e, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `https://momfitnessmojo.web.app/events/${e.slug || e.id}`,
    name: e.title,
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items,
  };

  return (
    <Helmet>
      <title>Upcoming Events | Moms Fitness Mojo - Millburn & Short Hills NJ</title>
      <meta
        name="description"
        content="Upcoming Moms Fitness Mojo events: walks, strength sessions, brunch workouts, and more in Short Hills & Millburn, NJ."
      />
      <link rel="canonical" href="https://momfitnessmojo.web.app/events" />
      
      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Upcoming Events - Moms Fitness Mojo" />
      <meta property="og:description" content="Join our mom fitness events in Millburn & Short Hills, NJ. Find your perfect workout with our supportive community." />
      <meta property="og:url" content="https://momfitnessmojo.web.app/events" />
      <meta property="og:image" content="https://momfitnessmojo.web.app/assets/logo/facebook-post.svg" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Upcoming Events - Moms Fitness Mojo" />
      <meta name="twitter:description" content="Join our mom fitness events in Millburn & Short Hills, NJ." />
      <meta name="twitter:image" content="https://momfitnessmojo.web.app/assets/logo/square-logo.svg" />
      
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
