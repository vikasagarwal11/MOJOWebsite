import type { EventDoc } from '../hooks/useEvents';

/** A geographic coordinate pair. lat in [-90,90], lng in [-180,180]. */
export interface GeoPoint {
    latitude: number;
    longitude: number;
}

/** Geo fields stored on an event document. All nullable for events without a venue address. */
export interface GeoData {
    latitude: number | null;
    longitude: number | null;
    geohash: string | null;
    region: string | null;
}

/** Parameters for a spatial query: center point + search radius. */
export interface GeoQueryParams {
    center: GeoPoint;
    radiusKm: number;
}

/** A single event result enriched with its distance from the query center. */
export interface GeoEventResult {
    event: EventDoc;
    distanceKm: number;
}

/** Paginated result set from a geo query. */
export interface GeoQueryResult {
    events: GeoEventResult[];
    hasMore: boolean;
    lastDoc: any | null;
}

/** In-memory cache entry for geo query results. */
export interface CacheEntry {
    key: string;
    results: GeoQueryResult;
    timestamp: number;
    ttlMs: number;
}
