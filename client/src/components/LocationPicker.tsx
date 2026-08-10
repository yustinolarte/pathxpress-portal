/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CITY_CENTERS, EMIRATE_CENTERS, normalizeCity, normalizeEmirate, isPinNearEmirate } from '@shared/uae';

import { loadGoogleMaps } from '@/lib/googleMaps';

const loadMapScript = loadGoogleMaps;

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
    /**
     * Where the components came from. A picked suggestion carries a full,
     * trustworthy address; a dropped pin only knows roughly where it is, so
     * callers must merge it into what the operator already typed instead of
     * replacing it.
     */
    source: 'search' | 'pin';
}

interface LocationPickerProps {
    onLocationPicked: (location: PickedLocation | null) => void;
    onAddressParsed?: (parsed: ParsedAddress) => void;
    /** When provided, autocomplete attaches to this external input and the internal search bar is hidden */
    searchInputRef?: React.RefObject<HTMLInputElement | null>;
    initialLocation?: { lat: number; lng: number };
    /**
     * Biases suggestions and recentres the empty map on this emirate, so
     * searching "Al Nakheel" in Ras Al Khaimah stops returning the Dubai one.
     */
    biasEmirate?: string | null;
    /** Bump to clear the pin from the outside (e.g. when a form resets). */
    resetSignal?: number;
    className?: string;
}

// Dubai default center
const DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };

/** Half-width, in degrees, of the box used to bias autocomplete to an emirate. */
const BIAS_SPAN = 0.45;

/**
 * Parse Google address_components into our form fields. Shared by the
 * Autocomplete path (search) and the reverse-geocode path (map click / drag),
 * so dropping a pin auto-fills the same fields a search would.
 * @param fallbackName place.name from Autocomplete (e.g. "Maison VI Residences");
 *   reverse-geocoding has no equivalent, so for villas without a street number
 *   the building field is left empty for manual entry.
 */
function parseAddressComponents(
    components: google.maps.GeocoderAddressComponent[],
    fallbackName?: string,
): Omit<ParsedAddress, 'source'> {
    const get = (type: string) =>
        components.find(c => c.types.includes(type))?.long_name;
    const area =
        get('sublocality_level_1') ??
        get('sublocality') ??
        get('neighborhood') ??
        get('route');
    // Prefer the selected place's name (e.g. "Maison VI Residences"), then a named
    // premise, then a street/plot number. Villas usually have none → left empty.
    const building = fallbackName ?? get('premise') ?? get('street_number') ?? undefined;
    return {
        streetNumber: building,
        street: get('route'),
        area,
        city: get('locality') ?? get('administrative_area_level_2'),
        emirate: get('administrative_area_level_1'),
    };
}

export function LocationPicker({
    onLocationPicked,
    onAddressParsed,
    searchInputRef,
    initialLocation,
    biasEmirate,
    resetSignal,
    className,
}: LocationPickerProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const internalInputRef = useRef<HTMLInputElement>(null);

    // The map is built once, so its listeners would otherwise capture the props
    // from the very first render. Callbacks go through refs to stay current.
    const onLocationPickedRef = useRef(onLocationPicked);
    const onAddressParsedRef = useRef(onAddressParsed);
    onLocationPickedRef.current = onLocationPicked;
    onAddressParsedRef.current = onAddressParsed;

    const [pickedAddress, setPickedAddress] = useState<string>('');
    const [pickedCoords, setPickedCoords] = useState<google.maps.LatLngLiteral | null>(null);
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
                    fields: ['geometry', 'formatted_address', 'address_components', 'name', 'types'],
                });
                autocompleteRef.current = ac;
                ac.addListener('place_changed', () => {
                    const place = ac.getPlace();
                    if (place.geometry?.location) {
                        const pos = place.geometry.location.toJSON();
                        map.setCenter(pos);
                        map.setZoom(17);
                        // Autocomplete already carries the full address — place the pin without a
                        // reverse-geocode, which would otherwise overwrite the building name.
                        placeMarker(map, pos, false);
                        if (place.formatted_address) {
                            setPickedAddress(place.formatted_address);
                        }
                        if (onAddressParsedRef.current && place.address_components) {
                            // Use the place's own name as the building only for a named
                            // building/POI, not when a plain street/route was selected.
                            const namedTypes = ['premise', 'subpremise', 'establishment', 'point_of_interest'];
                            const buildingName = place.types?.some(t => namedTypes.includes(t)) ? place.name : undefined;
                            onAddressParsedRef.current({
                                ...parseAddressComponents(place.address_components, buildingName),
                                source: 'search',
                            });
                        }
                    }
                });
            }

            setIsLoaded(true);
        });
        return () => {
            cancelled = true;
            // Autocomplete attaches to an input that may outlive this picker
            // (the caller owns it via searchInputRef) and injects a
            // .pac-container into <body>. Without this, toggling the map open
            // and closed stacks up duplicate suggestion dropdowns.
            if (autocompleteRef.current && window.google?.maps?.event) {
                window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
                autocompleteRef.current = null;
            }
            if (markerRef.current) {
                markerRef.current.map = null;
                markerRef.current = null;
            }
        };
    }, []);

    // Bias suggestions towards the selected city/emirate and, while no pin
    // exists, move the map there so the operator starts in the right place.
    useEffect(() => {
        const canonical = normalizeEmirate(biasEmirate);
        if (!canonical || !window.google?.maps) return;
        // A city center wins over the emirate center where they differ
        // (searching in Al Ain should not be biased at Abu Dhabi city).
        const city = normalizeCity(biasEmirate);
        const centre = (city ? CITY_CENTERS[city] : undefined) ?? EMIRATE_CENTERS[canonical];
        const bounds = new window.google.maps.LatLngBounds(
            { lat: centre.lat - BIAS_SPAN, lng: centre.lng - BIAS_SPAN },
            { lat: centre.lat + BIAS_SPAN, lng: centre.lng + BIAS_SPAN },
        );
        autocompleteRef.current?.setBounds(bounds);
        if (mapRef.current && !markerRef.current) {
            mapRef.current.setCenter(centre);
            mapRef.current.setZoom(11);
        }
    }, [biasEmirate, isLoaded]);

    // External reset (form cleared / dialog reopened). Skips the initial mount.
    const lastResetRef = useRef(resetSignal);
    useEffect(() => {
        if (resetSignal === lastResetRef.current) return;
        lastResetRef.current = resetSignal;
        clearPin();
    }, [resetSignal]);

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
        setPickedCoords(pos);

        marker.addListener('dragend', () => {
            const p = marker.position as google.maps.LatLngLiteral;
            setPickedCoords(p);
            reverseGeocodeAndEmit(p);
        });

        if (reverseGeocode) {
            reverseGeocodeAndEmit(pos);
        } else {
            onLocationPickedRef.current({ latitude: String(pos.lat), longitude: String(pos.lng) });
        }
    }

    function reverseGeocodeAndEmit(pos: google.maps.LatLngLiteral) {
        if (!geocoderRef.current) {
            onLocationPickedRef.current({ latitude: String(pos.lat), longitude: String(pos.lng) });
            return;
        }
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
            const ok = status === 'OK' && results?.length ? results : undefined;
            const addr = ok?.[0]?.formatted_address;
            if (addr) setPickedAddress(addr);
            onLocationPickedRef.current({ latitude: String(pos.lat), longitude: String(pos.lng), address: addr });
            if (onAddressParsedRef.current && ok) {
                // Reverse geocoding returns several results (most specific first). A single
                // result often misses route/sublocality, so merge components across all of
                // them and let parseAddressComponents pick the first match per field.
                const merged = ok.flatMap(r => r.address_components ?? []);
                // A dropped pin can't reliably name a building (Google returns plot numbers
                // like "p12"), so leave building/villa empty for the customer to enter.
                onAddressParsedRef.current({
                    ...parseAddressComponents(merged),
                    streetNumber: undefined,
                    source: 'pin',
                });
            }
        });
    }

    function clearPin() {
        if (markerRef.current) {
            markerRef.current.map = null;
            markerRef.current = null;
        }
        setPickedAddress('');
        setPickedCoords(null);
        onLocationPickedRef.current(null);
    }

    const emirateMismatch = pickedCoords != null
        && !!normalizeEmirate(biasEmirate)
        && !isPinNearEmirate(pickedCoords, biasEmirate);

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
            {pickedCoords ? (
                <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-xs bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2">
                        <MapPin className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                        <span className="text-green-700 dark:text-green-400 flex-1">
                            {pickedAddress || 'Pin placed'}
                            <span className="block font-mono text-[10px] opacity-70 mt-0.5">
                                {pickedCoords.lat.toFixed(5)}, {pickedCoords.lng.toFixed(5)}
                            </span>
                        </span>
                        <button type="button" onClick={clearPin} className="text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    {emirateMismatch && (
                        <p className="text-xs px-3 py-2 rounded-md border" style={{ color: 'var(--st-amber)', borderColor: 'color-mix(in srgb, var(--st-amber) 35%, transparent)', background: 'color-mix(in srgb, var(--st-amber) 10%, transparent)' }}>
                            This pin does not look like it is in {normalizeEmirate(biasEmirate)}. Check the emirate or move the pin.
                        </p>
                    )}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground px-1">
                    Click on the map or drop a pin — the driver will navigate directly to it.
                </p>
            )}
        </div>
    );
}
