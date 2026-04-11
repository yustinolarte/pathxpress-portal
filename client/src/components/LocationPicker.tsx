/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let mapsLoadPromise: Promise<void> | null = null;
function loadMapScript(): Promise<void> {
    if (window.google?.maps) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;
    mapsLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => { mapsLoadPromise = null; resolve(); };
        document.head.appendChild(script);
    });
    return mapsLoadPromise;
}

export interface PickedLocation {
    latitude: string;
    longitude: string;
    address?: string;
}

export interface ParsedAddress {
    streetNumber?: string;
    street?: string;
    area?: string;
    city?: string;
    emirate?: string;
}

interface LocationPickerProps {
    onLocationPicked: (location: PickedLocation | null) => void;
    onAddressParsed?: (parsed: ParsedAddress) => void;
    /** When provided, autocomplete attaches to this external input and the internal search bar is hidden */
    searchInputRef?: React.RefObject<HTMLInputElement>;
    initialLocation?: { lat: number; lng: number };
    className?: string;
}

// Dubai default center
const DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };

export function LocationPicker({ onLocationPicked, onAddressParsed, searchInputRef, initialLocation, className }: LocationPickerProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const internalInputRef = useRef<HTMLInputElement>(null);

    const [pickedAddress, setPickedAddress] = useState<string>('');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        loadMapScript().then(() => {
            if (cancelled || !mapContainerRef.current || !window.google?.maps) return;

            const center = initialLocation ?? DUBAI_CENTER;
            const zoom = initialLocation ? 16 : 11;

            const map = new window.google.maps.Map(mapContainerRef.current, {
                center,
                zoom,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
                mapId: 'location-picker',
            });
            mapRef.current = map;

            geocoderRef.current = new window.google.maps.Geocoder();

            if (initialLocation) {
                placeMarker(map, { lat: initialLocation.lat, lng: initialLocation.lng }, false);
            }

            map.addListener('click', (e: google.maps.MapMouseEvent) => {
                if (e.latLng) {
                    placeMarker(map, e.latLng.toJSON(), true);
                }
            });

            // Attach autocomplete to external ref if provided, otherwise to internal input
            const targetInput = searchInputRef?.current ?? internalInputRef.current;
            if (targetInput) {
                const ac = new window.google.maps.places.Autocomplete(targetInput, {
                    componentRestrictions: { country: 'ae' },
                    fields: ['geometry', 'formatted_address', 'address_components', 'name'],
                });
                autocompleteRef.current = ac;
                ac.addListener('place_changed', () => {
                    const place = ac.getPlace();
                    if (place.geometry?.location) {
                        const pos = place.geometry.location.toJSON();
                        map.setCenter(pos);
                        map.setZoom(17);
                        placeMarker(map, pos, true);
                        if (place.formatted_address) {
                            setPickedAddress(place.formatted_address);
                        }
                        if (onAddressParsed && place.address_components) {
                            const get = (type: string) =>
                                place.address_components!.find(c => c.types.includes(type))?.long_name;
                            const area =
                                get('sublocality_level_1') ??
                                get('sublocality') ??
                                get('neighborhood') ??
                                get('route');
                            // Use place.name as building when no street_number exists (e.g. "Maison VI Residences")
                            const building = get('street_number') ?? (place as any).name ?? undefined;
                            onAddressParsed({
                                streetNumber: building,
                                street: get('route'),
                                area,
                                city: get('locality') ?? get('administrative_area_level_2'),
                                emirate: get('administrative_area_level_1'),
                            });
                        }
                    }
                });
            }

            setIsLoaded(true);
        });
        return () => { cancelled = true; };
    }, []);

    function placeMarker(map: google.maps.Map, pos: google.maps.LatLngLiteral, reverseGeocode: boolean) {
        if (markerRef.current) {
            markerRef.current.map = null;
        }

        const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map,
            position: pos,
            title: 'Delivery location',
            gmpDraggable: true,
        });
        markerRef.current = marker;

        marker.addListener('dragend', () => {
            const p = marker.position as google.maps.LatLngLiteral;
            reverseGeocodeAndEmit(p);
        });

        if (reverseGeocode) {
            reverseGeocodeAndEmit(pos);
        } else {
            onLocationPicked({ latitude: String(pos.lat), longitude: String(pos.lng) });
        }
    }

    function reverseGeocodeAndEmit(pos: google.maps.LatLngLiteral) {
        if (!geocoderRef.current) {
            onLocationPicked({ latitude: String(pos.lat), longitude: String(pos.lng) });
            return;
        }
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
            const addr = status === 'OK' && results?.[0] ? results[0].formatted_address : undefined;
            if (addr) setPickedAddress(addr);
            onLocationPicked({ latitude: String(pos.lat), longitude: String(pos.lng), address: addr });
        });
    }

    function clearPin() {
        if (markerRef.current) {
            markerRef.current.map = null;
            markerRef.current = null;
        }
        setPickedAddress('');
        onLocationPicked(null);
    }

    return (
        <div className={cn('space-y-2', className)}>
            {/* Internal search bar — only shown when no external searchInputRef is provided */}
            {!searchInputRef && (
                <>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="w-4 h-4 text-primary" />
                        Find Location
                    </div>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            ref={internalInputRef}
                            placeholder="Search address or drop a pin on the map..."
                            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                        />
                    </div>
                </>
            )}

            {/* Map */}
            <div className="relative rounded-lg overflow-hidden border">
                <div ref={mapContainerRef} className="h-[300px] w-full bg-muted" />
                {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
                        Loading map...
                    </div>
                )}
            </div>

            {/* Pin confirmation */}
            {pickedAddress ? (
                <div className="flex items-start gap-2 text-xs bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
                    <MapPin className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-green-700 dark:text-green-400 flex-1">{pickedAddress}</span>
                    <button onClick={clearPin} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground px-1">
                    Click on the map or drop a pin — the driver will navigate directly to it.
                </p>
            )}
        </div>
    );
}
