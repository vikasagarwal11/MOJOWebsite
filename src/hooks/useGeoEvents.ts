import { useCallback, useEffect, useRef, useState } from 'react';
import { getEventsNearby } from '../services/geoService';
import type { GeoEventResult, GeoPoint, GeoQueryResult } from '../types/geo';

export interface UseGeoEventsResult {
    events: GeoEventResult[];
    loading: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => void;
    search: (center: GeoPoint, radiusKm: number) => void;
    clear: () => void;
}

export function useGeoEvents(debounceMs: number = 300): UseGeoEventsResult {
    const [events, setEvents] = useState<GeoEventResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    // Refs for debounce timer, abort counter, pagination cursor, and last search params
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestCounter = useRef(0);
    const cursorRef = useRef<any>(null);
    const lastSearchRef = useRef<{ center: GeoPoint; radiusKm: number } | null>(null);

    const search = useCallback(
        (center: GeoPoint, radiusKm: number) => {
            // Clear any pending debounce
            if (debounceTimer.current !== null) {
                clearTimeout(debounceTimer.current);
            }

            debounceTimer.current = setTimeout(async () => {
                // Increment request counter to invalidate any in-flight request
                const thisRequest = ++requestCounter.current;

                setLoading(true);
                setError(null);

                try {
                    const result: GeoQueryResult = await getEventsNearby(center, radiusKm);

                    // Ignore stale responses
                    if (thisRequest !== requestCounter.current) return;

                    setEvents(result.events);
                    setHasMore(result.hasMore);
                    cursorRef.current = result.lastDoc;
                    lastSearchRef.current = { center, radiusKm };
                } catch (err: any) {
                    if (thisRequest !== requestCounter.current) return;
                    setError(err?.message ?? 'Failed to fetch nearby events');
                    setEvents([]);
                    setHasMore(false);
                    cursorRef.current = null;
                } finally {
                    if (thisRequest === requestCounter.current) {
                        setLoading(false);
                    }
                }
            }, debounceMs);
        },
        [debounceMs],
    );

    const loadMore = useCallback(async () => {
        if (!lastSearchRef.current || !cursorRef.current || loading) return;

        const { center, radiusKm } = lastSearchRef.current;
        const thisRequest = ++requestCounter.current;

        setLoading(true);

        try {
            const result: GeoQueryResult = await getEventsNearby(center, radiusKm, cursorRef.current);

            if (thisRequest !== requestCounter.current) return;

            setEvents((prev) => [...prev, ...result.events]);
            setHasMore(result.hasMore);
            cursorRef.current = result.lastDoc;
        } catch (err: any) {
            if (thisRequest !== requestCounter.current) return;
            setError(err?.message ?? 'Failed to load more events');
        } finally {
            if (thisRequest === requestCounter.current) {
                setLoading(false);
            }
        }
    }, [loading]);

    const clear = useCallback(() => {
        // Cancel any pending debounce
        if (debounceTimer.current !== null) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }
        // Invalidate in-flight requests
        requestCounter.current++;

        setEvents([]);
        setError(null);
        setHasMore(false);
        cursorRef.current = null;
        lastSearchRef.current = null;
        setLoading(false);
    }, []);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current !== null) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    return { events, loading, error, hasMore, loadMore, search, clear };
}
