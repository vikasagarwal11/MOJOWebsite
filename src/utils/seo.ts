import { EventDoc } from '../hooks/useEvents';

/**
 * Creates a canonical URL for an event
 * @param event - The event document
 * @returns Canonical URL for the event
 */
export function createEventCanonicalUrl(event: EventDoc): string {
  const baseUrl = 'https://momfitnessmojo.web.app';
  const eventSlug = event.slug || event.id;
  return `${baseUrl}/events/${eventSlug}`;
}

/**
 * Creates a canonical URL for the events listing page
 * @returns Canonical URL for the events page
 */
export function createEventsListCanonicalUrl(): string {
  return 'https://momfitnessmojo.web.app/events';
}

/**
 * Creates a canonical URL for any page
 * @param path - The path (without leading slash)
 * @returns Canonical URL for the page
 */
export function createCanonicalUrl(path: string): string {
  const baseUrl = 'https://momfitnessmojo.web.app';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}/${cleanPath}`;
}
