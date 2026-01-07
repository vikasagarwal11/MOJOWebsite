import { EventDoc } from '../hooks/useEvents';
import { SEO_CONFIG } from '../config/seo';

/**
 * Creates a canonical URL for an event
 * @param event - The event document
 * @returns Canonical URL for the event
 */
export function createEventCanonicalUrl(event: EventDoc): string {
  const eventSlug = event.slug || event.id;
  return SEO_CONFIG.getUrl(`/events/${eventSlug}`);
}

/**
 * Creates a canonical URL for the events listing page
 * @returns Canonical URL for the events page
 */
export function createEventsListCanonicalUrl(): string {
  return SEO_CONFIG.getUrl('/events');
}

/**
 * Creates a canonical URL for any page
 * @param path - The path (with or without leading slash)
 * @returns Canonical URL for the page
 */
export function createCanonicalUrl(path: string): string {
  return SEO_CONFIG.getUrl(path);
}
