// src/services/geoService.ts
import { collection, getDocs, orderBy, query, startAfter, where } from 'firebase/firestore';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import { db } from '../config/firebase';
import type { EventDoc } from '../hooks/useEvents';
import type { CacheEntry, GeoPoint, GeoQueryResult } from '../types/geo';

/**
 * Validate that latitude and longitude are within valid ranges.
 * Throws an Error identifying the invalid field if out of range.
 */
export function validateCoordinates(lat: number, lng: number): void {
    if (lat < -90 || lat > 90) {
        throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90`);
    }
    if (lng < -180 || lng > 180) {
        throw new Error(`Invalid longitude: ${lng}. Must be between -180 and 180`);
    }
}

/**
 * Compute a geohash string from coordinates using geofire-common.
 * Validates coordinates first.
 */
export function computeGeohash(lat: number, lng: number): string {
    validateCoordinates(lat, lng);
    return geohashForLocation([lat, lng]);
}

/**
 * Clamp a radius value to the [0, 50] km range.
 */
export function clampRadius(radiusKm: number): number {
    return Math.min(Math.max(radiusKm, 0), 50);
}

/**
 * Compute the distance in km between two GeoPoints using the Haversine formula.
 */
export function distanceBetween(a: GeoPoint, b: GeoPoint): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
        sinDLat * sinDLat +
        Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLng * sinDLng;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/**
 * Generate a cache key from a center point and radius.
 * Coordinates are rounded to 4 decimal places (~11m precision).
 */
export function generateCacheKey(center: GeoPoint, radiusKm: number): string {
    const lat = center.latitude.toFixed(4);
    const lng = center.longitude.toFixed(4);
    return `${lat},${lng},${radiusKm}`;
}

// ---------------------------------------------------------------------------
// In-memory query cache with 60-second TTL
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

export const queryCache: Map<string, CacheEntry> = new Map();

/**
 * Return a cached GeoQueryResult if the entry exists and hasn't expired.
 * Removes stale entries and returns null otherwise.
 */
export function getCachedResult(key: string): GeoQueryResult | null {
    const entry = queryCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttlMs) {
        queryCache.delete(key);
        return null;
    }

    return entry.results;
}

/**
 * Store a GeoQueryResult in the cache with the current timestamp and 60 s TTL.
 */
export function setCacheResult(key: string, results: GeoQueryResult): void {
    queryCache.set(key, {
        key,
        results,
        timestamp: Date.now(),
        ttlMs: CACHE_TTL_MS,
    });
}


// ---------------------------------------------------------------------------
// Geo query: fetch events near a center point
// ---------------------------------------------------------------------------

const MAX_RESULTS = 50;

/**
 * Fetch events within `radiusKm` of `center`.
 * Uses geofire-common geohash bounds for Firestore range queries,
 * then filters by true Haversine distance on the client.
 *
 * Returns at most 50 results sorted by distance ascending.
 * Supports cursor-based pagination via the optional `cursor` parameter.
 */
export async function getEventsNearby(
    center: GeoPoint,
    radiusKm: number,
    cursor?: any
): Promise<GeoQueryResult> {
    try {
        const clampedRadius = clampRadius(radiusKm);

        // Check cache (skip for paginated requests)
        if (!cursor) {
            const cacheKey = generateCacheKey(center, clampedRadius);
            const cached = getCachedResult(cacheKey);
            if (cached) return cached;
        }

        // Compute geohash bound ranges (radius in METERS)
        const radiusMeters = clampedRadius * 1000;
        const bounds = geohashQueryBounds(
            [center.latitude, center.longitude],
            radiusMeters
        );

        // Execute parallel Firestore queries — one per bound range
        const eventsRef = collection(db, 'events');
        const snapshots = await Promise.all(
            bounds.map((bound) => {
                const constraints = [
                    where('geohash', '>=', bound[0]),
                    where('geohash', '<=', bound[1]),
                    orderBy('geohash', 'asc'),
                ];
                if (cursor) {
                    constraints.push(startAfter(cursor));
                }
                return getDocs(query(eventsRef, ...constraints));
            })
        );

        // Merge & deduplicate by document ID
        const seen = new Set<string>();
        const candidates: { event: EventDoc; distanceKm: number; doc: any }[] = [];

        for (const snap of snapshots) {
            for (const doc of snap.docs) {
                if (seen.has(doc.id)) continue;
                seen.add(doc.id);

                const data = doc.data() as any;
                const lat = data.latitude;
                const lng = data.longitude;

                // Skip events without valid geo coordinates
                if (lat == null || lng == null) continue;

                const dist = distanceBetween(center, {
                    latitude: lat,
                    longitude: lng,
                });

                // Discard events outside the true radius
                if (dist > clampedRadius) continue;

                candidates.push({
                    event: { id: doc.id, ...data } as EventDoc,
                    distanceKm: dist,
                    doc,
                });
            }
        }

        // Sort by distance ascending
        candidates.sort((a, b) => a.distanceKm - b.distanceKm);

        // Determine hasMore and limit results
        const hasMore = candidates.length > MAX_RESULTS;
        const limited = candidates.slice(0, MAX_RESULTS);

        const lastDoc =
            limited.length > 0 ? limited[limited.length - 1].doc : null;

        const result: GeoQueryResult = {
            events: limited.map(({ event, distanceKm }) => ({
                event,
                distanceKm,
            })),
            hasMore,
            lastDoc,
        };

        // Cache the result (only for non-paginated requests)
        if (!cursor) {
            const cacheKey = generateCacheKey(center, clampedRadius);
            setCacheResult(cacheKey, result);
        }

        return result;
    } catch (error) {
        console.error('getEventsNearby failed:', error);
        return { events: [], hasMore: false, lastDoc: null };
    }
}

/**
 * Fetch events inside a circle defined by center + radius.
 * Semantic alias for getEventsNearby — used by the circle drawing tool.
 */
export async function getEventsInCircle(
    center: GeoPoint,
    radiusKm: number,
    cursor?: any
): Promise<GeoQueryResult> {
    return getEventsNearby(center, radiusKm, cursor);
}
