/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
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

interface LocationPickerProps {
    onLocationPicked: (location: PickedLocation | null) => void;
    initialLocation?: { lat: number; lng: number };
    className?: string;
}

// Dubai default center
const DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };

export function LocationPicker({ onLocationPicked, initialLocation, className }: LocationPickerProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

            // Geocoder for reverse geocoding
            geocoderRef.current = new window.google.maps.Geocoder();

            // Create draggable marker if initial location provided
            if (initialLocation) {
                placeMarker(map, { lat: initialLocation.lat, lng: initialLocation.lng }, false);
            }

            // Click on map to place/move pin
            map.addListener('click', (e: google.maps.MapMouseEvent) => {
                if (e.latLng) {
                    placeMarker(map, e.latLng.toJSON(), true);
                }
            });

            // Places autocomplete on search input
            if (inputRef.current) {
                const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
                    componentRestrictions: { country: 'ae' },
                    fields: ['geometry', 'formatted_address'],
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
                    }
                });
            }

            setIsLoaded(true);
        });
        return () => { cancelled = true; };
    }, []);

    function placeMarker(map: google.maps.Map, pos: google.maps.LatLngLiteral, reverseGeocode: boolean) {
        // Remove old marker
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

        marker.addListener('dragend', (e: any) => {
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
            <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4 text-primary" />
                Find Location
            </div>

            {/* Search bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                    ref={inputRef}
                    placeholder="Search address or drop a pin on the map..."
                    className="pl-9"
                />
            </div>

            {/* Map */}
            <div className="relative rounded-lg overflow-hidden border">
                <div ref={mapContainerRef} className="h-[220px] w-full bg-muted" />
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
                    Click on the map or search above to place a pin — the driver will navigate directly to it.
                </p>
            )}
        </div>
    );
}
