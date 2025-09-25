import React from 'react';
import { Helmet } from 'react-helmet-async';
import type { EventDoc } from '../../hooks/useEvents';

type Props = {
  event: EventDoc;
  canonicalUrl: string;      // e.g. `https://momfitnessmojo.web.app/events/${event.slug || event.id}`
  defaultImage?: string;     // fallback OG image
};

function toISO(d: any): string | undefined {
  if (!d) return undefined;
  try {
    // Firestore Timestamp
    if (typeof d?.seconds === 'number') return new Date(d.seconds * 1000).toISOString();
    // Firestore Timestamp.toDate()
    if (typeof d?.toDate === 'function') return d.toDate().toISOString();
    // JS Date or string/number
    const date = d instanceof Date ? d : new Date(d);
    return isNaN(+date) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

export const EventSeo: React.FC<Props> = ({ event, canonicalUrl, defaultImage = '/assets/logo/facebook-post.svg' }) => {
  const name = event.title ?? 'Moms Fitness Mojo Event';
  const description =
    event.description?.slice(0, 240) ||
    'Join Moms Fitness Mojo for community, movement, and feel-good fitness.';

  const startDate = toISO(event.startAt);
  const endDate = toISO(event.endAt);

  const imageUrl =
    (event.images && event.images[0]) ||
    (event.heroImageUrl as string) ||
    defaultImage;

  // Location (offline / online / hybrid)
  const isOnline = Boolean(event.isOnline || event.meetingUrl);
  const location = isOnline
    ? {
        '@type': 'VirtualLocation',
        url: event.meetingUrl || canonicalUrl,
      }
    : {
        '@type': 'Place',
        name: event.venueName || 'Moms Fitness Mojo',
        address: event.venueAddress || 'Short Hills, NJ',
      };

  // Price & availability (optional; keep simple)
  const offers =
    event.price != null
      ? {
          '@type': 'Offer',
          price: String(event.price),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: canonicalUrl,
        }
      : undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description,
    startDate,
    endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    image: imageUrl ? [imageUrl] : undefined,
    organizer: {
      '@type': 'Organization',
      name: 'Moms Fitness Mojo',
      url: 'https://momfitnessmojo.web.app/',
    },
    isAccessibleForFree: event.price == null || event.price === 0,
    maximumAttendeeCapacity: event.maxCapacity || undefined,
    offers,
  };

  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl} />
      <title>{`${name} | Moms Fitness Mojo`}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={name} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      {imageUrl && <meta property="og:image" content={imageUrl} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={name} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}

      {/* JSON-LD */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
    </Helmet>
  );
};
