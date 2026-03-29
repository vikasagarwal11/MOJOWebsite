import { CircleF, GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { Circle as CircleIcon, Loader2, MapPin, MousePointer } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGeoEvents } from '../../hooks/useGeoEvents';
import type { GeoEventResult, GeoPoint } from '../../types/geo';
import { safeFormat, safeToDate } from '../../utils/dateUtils';

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 12;
const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;

interface EventDiscoveryMapProps {
    className?: string;
    defaultCenter?: { lat: number; lng: number };
    defaultZoom?: number;
}

type ToolMode = 'pointer' | 'circle' | null;

const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '600px',
};

const EventDiscoveryMap: React.FC<EventDiscoveryMapProps> = ({
    className,
    defaultCenter,
    defaultZoom,
}) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

    // Warn and bail if no API key
    if (!apiKey || apiKey.trim() === '') {
        console.warn('EventDiscoveryMap: VITE_GOOGLE_MAPS_API_KEY is missing or empty.');
        return (
            <div className="flex items-center justify-center bg-red-50 border border-red-200 rounded-lg p-8 text-red-700">
                <p>Google Maps API key is not configured. Please set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your environment.</p>
            </div>
        );
    }

    return <EventDiscoveryMapInner apiKey={apiKey} className={className} defaultCenter={defaultCenter} defaultZoom={defaultZoom} />;
};

/** Inner component that only renders when API key is present */
const EventDiscoveryMapInner: React.FC<EventDiscoveryMapProps & { apiKey: string }> = ({
    apiKey,
    className,
    defaultCenter,
    defaultZoom,
}) => {
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey,
    });

    const { events, loading, error, search, clear } = useGeoEvents();

    const [center, setCenter] = useState<{ lat: number; lng: number }>(defaultCenter ?? DEFAULT_CENTER);
    const [activeMode, setActiveMode] = useState<ToolMode>(null);

    // Pointer mode state
    const [pointerMarker, setPointerMarker] = useState<{ lat: number; lng: number } | null>(null);

    // Circle tool state
    const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [circleRadiusKm, setCircleRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
    const [radiusClamped, setRadiusClamped] = useState(false);

    // Info window state
    const [selectedEvent, setSelectedEvent] = useState<GeoEventResult | null>(null);

    const mapRef = useRef<google.maps.Map | null>(null);

    // Request geolocation on mount
    useEffect(() => {
        if (defaultCenter) return; // Skip if caller provided a center
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCenter({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {
                // Denied or unavailable — keep default (New York)
            },
        );
    }, [defaultCenter]);

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    const handleMapClick = useCallback(
        (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();

            if (activeMode === 'pointer') {
                // Place / replace pointer marker
                setPointerMarker({ lat, lng });
                // Clear circle state
                setCircleCenter(null);
                setRadiusClamped(false);
                // Search with default radius
                const geoPoint: GeoPoint = { latitude: lat, longitude: lng };
                search(geoPoint, DEFAULT_RADIUS_KM);
            } else if (activeMode === 'circle') {
                // Clear previous circle and results
                clear();
                setPointerMarker(null);
                setRadiusClamped(false);
                // Set new circle center with default radius
                setCircleCenter({ lat, lng });
                setCircleRadiusKm(DEFAULT_RADIUS_KM);
                // Search
                const geoPoint: GeoPoint = { latitude: lat, longitude: lng };
                search(geoPoint, DEFAULT_RADIUS_KM);
            }
        },
        [activeMode, search, clear],
    );

    const handleRadiusChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            let value = parseFloat(e.target.value);
            if (isNaN(value) || value < 0.5) value = 0.5;

            const clamped = value > MAX_RADIUS_KM;
            if (clamped) value = MAX_RADIUS_KM;

            setRadiusClamped(clamped);
            setCircleRadiusKm(value);

            if (circleCenter) {
                const geoPoint: GeoPoint = { latitude: circleCenter.lat, longitude: circleCenter.lng };
                search(geoPoint, value);
            }
        },
        [circleCenter, search],
    );

    const toggleMode = useCallback(
        (mode: ToolMode) => {
            if (activeMode === mode) {
                setActiveMode(null);
            } else {
                setActiveMode(mode);
                // Clear state when switching modes
                setSelectedEvent(null);
            }
        },
        [activeMode],
    );

    const handleMarkerClick = useCallback((result: GeoEventResult) => {
        setSelectedEvent(result);
    }, []);

    if (loadError) {
        return (
            <div className="flex items-center justify-center bg-red-50 border border-red-200 rounded-lg p-8 text-red-700">
                <p>Failed to load Google Maps. Please try again later.</p>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg p-8 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading map…</span>
            </div>
        );
    }

    const hasSearched = pointerMarker !== null || circleCenter !== null;
    const showNoResults = hasSearched && !loading && events.length === 0;

    return (
        <div className={className ?? 'w-full'}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                    type="button"
                    onClick={() => toggleMode('pointer')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMode === 'pointer'
                        ? 'bg-[#F25129] text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                >
                    <MousePointer className="w-4 h-4" />
                    Pointer Mode
                </button>

                <button
                    type="button"
                    onClick={() => toggleMode('circle')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeMode === 'circle'
                        ? 'bg-[#F25129] text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                >
                    <CircleIcon className="w-4 h-4" />
                    Circle Tool
                </button>

                {/* Radius slider for circle tool */}
                {activeMode === 'circle' && circleCenter && (
                    <div className="flex items-center gap-2 ml-2">
                        <label htmlFor="radius-slider" className="text-sm text-gray-600 whitespace-nowrap">
                            Radius: {circleRadiusKm.toFixed(1)} km
                        </label>
                        <input
                            id="radius-slider"
                            type="range"
                            min="0.5"
                            max="50"
                            step="0.5"
                            value={circleRadiusKm}
                            onChange={handleRadiusChange}
                            className="w-32 accent-[#F25129]"
                        />
                        {radiusClamped && (
                            <span className="text-xs text-amber-600">Max 50 km</span>
                        )}
                    </div>
                )}
            </div>

            {/* Map container */}
            <div className="relative rounded-lg overflow-hidden border border-gray-200">
                <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={center}
                    zoom={defaultZoom ?? DEFAULT_ZOOM}
                    onClick={handleMapClick}
                    onLoad={onMapLoad}
                >
                    {/* Pointer marker */}
                    {pointerMarker && (
                        <MarkerF position={pointerMarker} />
                    )}

                    {/* Circle overlay */}
                    {circleCenter && (
                        <CircleF
                            center={circleCenter}
                            radius={circleRadiusKm * 1000}
                            options={{
                                fillColor: '#F25129',
                                fillOpacity: 0.12,
                                strokeColor: '#F25129',
                                strokeOpacity: 0.6,
                                strokeWeight: 2,
                            }}
                        />
                    )}

                    {/* Event markers */}
                    {events.map((result) => {
                        const evt = result.event as any;
                        const lat = evt.latitude as number | null;
                        const lng = evt.longitude as number | null;
                        if (lat == null || lng == null) return null;

                        return (
                            <MarkerF
                                key={result.event.id}
                                position={{ lat, lng }}
                                icon={{
                                    url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                }}
                                onClick={() => handleMarkerClick(result)}
                            />
                        );
                    })}

                    {/* Info window */}
                    {selectedEvent && (selectedEvent.event as any).latitude != null && (selectedEvent.event as any).longitude != null && (
                        <InfoWindowF
                            position={{
                                lat: (selectedEvent.event as any).latitude as number,
                                lng: (selectedEvent.event as any).longitude as number,
                            }}
                            onCloseClick={() => setSelectedEvent(null)}
                        >
                            <div className="p-1 max-w-[220px]">
                                <p className="font-bold text-gray-900 text-sm mb-1">{selectedEvent.event.title}</p>
                                <p className="text-xs text-gray-600 mb-0.5">
                                    {safeFormat(safeToDate(selectedEvent.event.startAt), 'MMM d, yyyy h:mm a', 'Date TBD')}
                                </p>
                                {selectedEvent.event.venueName && (
                                    <p className="text-xs text-gray-600 mb-0.5">
                                        <MapPin className="w-3 h-3 inline mr-0.5" />
                                        {selectedEvent.event.venueName}
                                    </p>
                                )}
                                <p className="text-xs text-gray-500 mb-1">
                                    {selectedEvent.distanceKm.toFixed(1)} km away
                                </p>
                                <Link
                                    to={`/events/${selectedEvent.event.id}`}
                                    className="text-xs font-medium text-[#F25129] hover:underline"
                                >
                                    View Event →
                                </Link>
                            </div>
                        </InfoWindowF>
                    )}
                </GoogleMap>

                {/* Loading overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none">
                        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md">
                            <Loader2 className="w-4 h-4 animate-spin text-[#F25129]" />
                            <span className="text-sm text-gray-700">Searching events…</span>
                        </div>
                    </div>
                )}

                {/* No results message */}
                {showNoResults && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full px-4 py-2 shadow-md border border-gray-200">
                        <span className="text-sm text-gray-600">No events found nearby</span>
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-50 rounded-full px-4 py-2 shadow-md border border-red-200">
                        <span className="text-sm text-red-600">{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventDiscoveryMap;
