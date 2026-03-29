import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clampRadius,
    computeGeohash,
    distanceBetween,
    generateCacheKey,
    getCachedResult,
    queryCache,
    setCacheResult,
    validateCoordinates,
} from './geoService';

describe('geoService', () => {
    describe('validateCoordinates', () => {
        it('accepts valid coordinates', () => {
            expect(() => validateCoordinates(0, 0)).not.toThrow();
            expect(() => validateCoordinates(90, 180)).not.toThrow();
            expect(() => validateCoordinates(-90, -180)).not.toThrow();
            expect(() => validateCoordinates(40.7128, -74.006)).not.toThrow();
        });

        it('rejects latitude out of range', () => {
            expect(() => validateCoordinates(91, 0)).toThrow('Invalid latitude: 91');
            expect(() => validateCoordinates(-91, 0)).toThrow('Invalid latitude: -91');
        });

        it('rejects longitude out of range', () => {
            expect(() => validateCoordinates(0, 181)).toThrow('Invalid longitude: 181');
            expect(() => validateCoordinates(0, -181)).toThrow('Invalid longitude: -181');
        });
    });

    describe('computeGeohash', () => {
        it('returns a non-empty string for valid coordinates', () => {
            const hash = computeGeohash(40.7128, -74.006);
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('is deterministic — same inputs produce same output', () => {
            const a = computeGeohash(37.7749, -122.4194);
            const b = computeGeohash(37.7749, -122.4194);
            expect(a).toBe(b);
        });

        it('throws for invalid coordinates', () => {
            expect(() => computeGeohash(91, 0)).toThrow('Invalid latitude');
        });
    });

    describe('clampRadius', () => {
        it('returns the value when within [0, 50]', () => {
            expect(clampRadius(25)).toBe(25);
            expect(clampRadius(0)).toBe(0);
            expect(clampRadius(50)).toBe(50);
        });

        it('clamps values above 50 to 50', () => {
            expect(clampRadius(100)).toBe(50);
            expect(clampRadius(999)).toBe(50);
        });

        it('clamps negative values to 0', () => {
            expect(clampRadius(-5)).toBe(0);
            expect(clampRadius(-100)).toBe(0);
        });
    });

    describe('distanceBetween', () => {
        it('returns 0 for the same point', () => {
            const p = { latitude: 40.7128, longitude: -74.006 };
            expect(distanceBetween(p, p)).toBeCloseTo(0, 5);
        });

        it('computes a known distance (NYC to LA ≈ 3944 km)', () => {
            const nyc = { latitude: 40.7128, longitude: -74.006 };
            const la = { latitude: 34.0522, longitude: -118.2437 };
            const dist = distanceBetween(nyc, la);
            expect(dist).toBeGreaterThan(3900);
            expect(dist).toBeLessThan(4000);
        });

        it('is symmetric', () => {
            const a = { latitude: 51.5074, longitude: -0.1278 };
            const b = { latitude: 48.8566, longitude: 2.3522 };
            expect(distanceBetween(a, b)).toBeCloseTo(distanceBetween(b, a), 5);
        });
    });

    describe('generateCacheKey', () => {
        it('rounds coordinates to 4 decimal places', () => {
            const key = generateCacheKey({ latitude: 40.71284999, longitude: -74.00604999 }, 10);
            expect(key).toBe('40.7128,-74.0060,10');
        });

        it('produces different keys for different radii', () => {
            const center = { latitude: 40.7128, longitude: -74.006 };
            expect(generateCacheKey(center, 10)).not.toBe(generateCacheKey(center, 20));
        });
    });

    describe('cache (getCachedResult / setCacheResult)', () => {
        beforeEach(() => {
            queryCache.clear();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns null for a missing key', () => {
            expect(getCachedResult('nonexistent')).toBeNull();
        });

        it('stores and retrieves a result', () => {
            const result = { events: [], hasMore: false, lastDoc: null };
            setCacheResult('key1', result);
            expect(getCachedResult('key1')).toEqual(result);
        });

        it('returns null and removes entry after TTL expires', () => {
            const result = { events: [], hasMore: false, lastDoc: null };
            setCacheResult('key2', result);

            // Advance time past TTL
            vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

            expect(getCachedResult('key2')).toBeNull();
            expect(queryCache.has('key2')).toBe(false);
        });
    });
});
