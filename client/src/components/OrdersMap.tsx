/// <reference types="@types/google.maps" />

/**
 * OrdersMap — renders multiple order pins on a Google Map.
 *
 * Supports two modes:
 *  - "available": shows unassigned orders as selectable pins (dispatch view).
 *  - "route": shows route stops numbered in sequence order + a polyline.
 *
 * Uses the same Google Maps proxy loader as Map.tsx.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { STATUS_TONE } from '@/lib/statusStyles';
import { abbreviateServiceType } from '@/const';
import { fanOutCollisions } from '@/lib/mapFanOut';

declare global {
    interface Window { google?: typeof google; }
}


const DUBAI_CENTER: google.maps.LatLngLiteral = { lat: 25.2048, lng: 55.2708 };

export type PinKind = 'available' | 'selected' | 'pickup' | 'delivery' | 'origin';

/**
 * Stops being sequenced in the create wizard don't exist in the database yet,
 * so they're keyed by a synthetic `${orderId}:${type}` string instead of a
 * routeOrders.id. Numeric ids keep working unchanged.
 */
export type MapPointId = number | string;

export interface MapPointDetails {
    customerName?: string | null;
    address?: string | null;
    city?: string | null;
    emirate?: string | null;
    pieces?: number | null;
    weight?: string | number | null;
    serviceType?: string | null;
    codRequired?: number | boolean | null;
    codAmount?: string | number | null;
    type?: 'pickup' | 'delivery' | null;
}

export interface MapPoint {
    id: MapPointId;
    lat: number;
    lng: number;
    label: string;
    kind: PinKind;
    sequence?: number;
    /** Order status — colors 'available' pins by functional tone. */
    status?: string | null;
    /** 'approximate' (geocoded) pins render dashed to flag possible error. */
    accuracy?: string | null;
    /** Extra package info shown in the hover card. */
    details?: MapPointDetails;
}

interface OrdersMapProps {
    points: MapPoint[];
    /** When true, draws a numbered polyline connecting points in array order */
    showRoute?: boolean;
    onPointClick?: (id: MapPointId) => void;
    /** When set, hover cards get a "Corregir ubicación" button. */
    onEditLocation?: (id: MapPointId) => void;
    /** Ringed + enlarged pin, kept in sync with an external list selection. */
    selectedId?: MapPointId | null;
    className?: string;
}

// Functional tone colors (hex fallbacks match --st-* in index.css light theme).
const TONE_COLOR: Record<string, string> = {
    green: 'var(--st-green, #1F8A5B)',
    blue:  'var(--st-blue, #2A6FDB)',
    amber: 'var(--st-amber, #B5790A)',
    red:   'var(--primary, #E10600)',
    gray:  '#64748b',
};

function pinColor(kind: PinKind, status?: string | null): string {
    switch (kind) {
        case 'selected':  return '#1e3a5f'; // primary navy
        case 'pickup':    return '#0f5a2e'; // dark green
        case 'delivery':  return '#1e3a5f'; // primary navy
        case 'origin':    return '#c0392b'; // red accent
        default: {
            // available — color by order status tone
            const tone = status ? STATUS_TONE[status] : undefined;
            return tone ? TONE_COLOR[tone] : TONE_COLOR.gray;
        }
    }
}

function serviceLabel(s?: string | null): string {
    if (!s) return '';
    if (s === 'same-day') return 'Same Day';
    if (s === 'express') return 'Express';
    return abbreviateServiceType(s);
}

/** Rich hover card shown above a pin (replaces the bare waybill tooltip). */
function makeHoverCard(point: MapPoint, onEditLocation?: (id: MapPointId) => void): HTMLElement {
    const d = point.details ?? {};
    // Wrapper bridges the gap between pin and card (padding, not margin) so the
    // mouse can travel into the card without triggering mouseleave. Interactive
    // (pointer-events) only when the card has a button to click.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
        display:none; z-index:60; padding-bottom:8px;
        pointer-events:${onEditLocation ? 'auto' : 'none'};
    `;
    // Clicking the card must not count as clicking the marker (would toggle selection).
    wrapper.addEventListener('click', (e) => e.stopPropagation());

    const card = document.createElement('div');
    card.style.cssText = `
        min-width:200px; max-width:260px;
        background:#1e3a5f; color:#fff;
        border:1px solid rgba(255,255,255,.15); border-radius:10px;
        padding:10px 12px;
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        font-size:12px; line-height:1.45; font-family:inherit;
        text-align:left; white-space:normal;
    `;
    wrapper.appendChild(card);

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;';
    const wb = document.createElement('span');
    wb.style.cssText = 'font-weight:700;font-family:ui-monospace,monospace;';
    wb.textContent = point.label;
    header.appendChild(wb);
    if (d.type) {
        const chip = document.createElement('span');
        chip.style.cssText = `font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap;background:${d.type === 'pickup' ? 'rgba(15,90,46,.9)' : 'rgba(255,255,255,.18)'};`;
        chip.textContent = d.type === 'pickup' ? '📦 Pickup' : '🚚 Entrega';
        header.appendChild(chip);
    }
    card.appendChild(header);

    const addLine = (text: string, muted?: boolean) => {
        if (!text) return;
        const line = document.createElement('div');
        if (muted) line.style.cssText = 'color:rgba(255,255,255,.7);';
        line.textContent = text;
        card.appendChild(line);
    };

    if (d.customerName) addLine(d.customerName);
    if (d.address) addLine(d.address, true);
    const loc = [d.city, d.emirate].filter(Boolean).join(', ');
    if (loc) addLine(loc, true);

    const meta: string[] = [];
    if (d.pieces != null) meta.push(`${d.pieces} pza${Number(d.pieces) > 1 ? 's' : ''}`);
    if (d.weight != null && d.weight !== '') meta.push(`${d.weight} kg`);
    const svc = serviceLabel(d.serviceType);
    if (svc) meta.push(svc);
    if (meta.length) addLine(meta.join(' · '), true);

    if (d.codRequired === 1 || d.codRequired === true) addLine(`💰 COD ${d.codAmount ?? ''} AED`);

    if (point.accuracy === 'approximate') {
        const approx = document.createElement('div');
        approx.style.cssText = 'margin-top:4px;color:#F2B632;font-size:11px;';
        approx.textContent = '≈ Ubicación aproximada (geocodificada)';
        card.appendChild(approx);
    }

    if (onEditLocation) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = `
            margin-top:8px; width:100%;
            background:rgba(255,255,255,.12); color:#fff;
            border:1px solid rgba(255,255,255,.25); border-radius:8px;
            padding:5px 8px; font-size:11px; font-weight:600; cursor:pointer;
        `;
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,.25)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,.12)'; });
        btn.textContent = '📍 Corregir ubicación';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onEditLocation(point.id);
        });
        card.appendChild(btn);
    }

    return wrapper;
}

function makePin(kind: PinKind, pinLabel: string, point: MapPoint, onEditLocation?: (id: MapPointId) => void): HTMLElement {
    const color = pinColor(kind, point.status);
    const isApprox = point.accuracy === 'approximate';
    const el = document.createElement('div');
    el.style.cssText = `
        position:relative;
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:50%;
        background:${color};color:#fff;
        font-size:11px;font-weight:700;font-family:inherit;
        border:2px ${isApprox ? 'dashed' : 'solid'} #fff;
        box-shadow:${kind === 'selected'
            ? '0 0 0 3px rgba(30,58,95,.4), 0 2px 6px rgba(0,0,0,.35)'
            : '0 2px 6px rgba(0,0,0,.35)'};
        ${isApprox ? 'opacity:.88;' : ''}
        cursor:pointer;
        transition:transform .15s;
        white-space:nowrap;
    `;
    // Remembered so the selection ring can be removed without recomputing it.
    el.dataset.baseShadow = kind === 'selected'
        ? '0 0 0 3px rgba(30,58,95,.4), 0 2px 6px rgba(0,0,0,.35)'
        : '0 2px 6px rgba(0,0,0,.35)';

    const labelText = document.createElement('span');
    labelText.textContent = pinLabel;
    el.appendChild(labelText);

    if (kind === 'selected') {
        const check = document.createElement('span');
        check.style.cssText = `
            position:absolute;top:-5px;right:-5px;
            width:14px;height:14px;border-radius:50%;
            background:#1F8A5B;color:#fff;font-size:9px;line-height:1;
            display:flex;align-items:center;justify-content:center;
            border:1.5px solid #fff;
        `;
        check.textContent = '✓';
        el.appendChild(check);
    }

    const card = makeHoverCard(point, onEditLocation);
    el.appendChild(card);

    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; card.style.display = 'block'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; card.style.display = 'none'; });
    return el;
}

export function OrdersMap({ points, showRoute = false, onPointClick, onEditLocation, selectedId = null, className }: OrdersMapProps) {
    const containerRef  = useRef<HTMLDivElement>(null);
    const mapRef        = useRef<google.maps.Map | null>(null);
    const markersRef    = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const polylineRef   = useRef<google.maps.Polyline | null>(null);
    /** Hair-lines tying fanned-out pins back to their shared true location. */
    const leaderLinesRef = useRef<google.maps.Polyline[]>([]);
    const [mapReady, setMapReady] = useState(false);

    // Indexed by point id so the selection ring can touch just the two pins that
    // changed. Putting `selectedId` in the marker effect's deps instead would
    // tear down and rebuild every pin on each click.
    const pinElsRef      = useRef(new Map<MapPointId, HTMLElement>());
    const markersByIdRef = useRef(new Map<MapPointId, google.maps.marker.AdvancedMarkerElement>());

    // Callers typically pass these as inline arrow functions, so a new function
    // identity arrives on every parent render. Keeping them in refs (always up to
    // date, but never triggering the marker-rebuild effect below) means an
    // unrelated parent re-render no longer tears down and recreates every pin.
    const onPointClickRef = useRef(onPointClick);
    onPointClickRef.current = onPointClick;
    const onEditLocationRef = useRef(onEditLocation);
    onEditLocationRef.current = onEditLocation;

    // ── Viewport persistence ──
    // Re-fitting on every `points` change yanked the camera back out whenever the
    // user selected a pin: selecting only flips a point's `kind`, but that still
    // produces a new array. So auto-fit is gated twice — the fit signature ignores
    // everything except the actual coordinates, and once the user has panned or
    // zoomed themselves we stop moving the camera at all.
    const fitSignatureRef = useRef<string | null>(null);
    const userMovedRef = useRef(false);
    const programmaticMoveRef = useRef(false);

    const positionSignature = points
        .map(p => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .sort()
        .join('|');

    // Init map once
    useEffect(() => {
        let cancelled = false;
        loadGoogleMaps().then(() => {
            if (cancelled || !containerRef.current || !window.google?.maps) return;
            if (mapRef.current) return;
            try {
                mapRef.current = new window.google.maps.Map(containerRef.current, {
                    center: DUBAI_CENTER,
                    zoom: 11,
                    mapId: 'DEMO_MAP_ID',
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                    zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
                });
                // Any camera change the user drives themselves takes ownership of the
                // viewport. fitBounds also fires zoom_changed, so programmatic moves are
                // flagged and cleared on the following 'idle'.
                const claimViewport = () => { if (!programmaticMoveRef.current) userMovedRef.current = true; };
                mapRef.current.addListener('dragstart', claimViewport);
                mapRef.current.addListener('zoom_changed', claimViewport);
                setMapReady(true);
            } catch (e) {
                console.error('[OrdersMap] Map init error:', e);
            }
        });
        return () => { cancelled = true; };
    }, []);

    // Update markers & polyline whenever points change OR map becomes ready
    useEffect(() => {
        if (!mapReady || !mapRef.current || !window.google?.maps) return;
        const map = mapRef.current;

        // Clear old markers. Detaching a marker runs inside the Maps API, and when
        // that API is in a degraded state (a rejected key still returns a Map object
        // whose internals are half-built) the setter throws — which used to take the
        // whole admin page down through the error boundary. A map that fails to
        // redraw its pins is worth degrading over; a blank portal is not.
        markersRef.current.forEach(m => {
            try { m.map = null; } catch (e) { console.error('[OrdersMap] marker detach failed:', e); }
        });
        markersRef.current = [];

        // Clear old polyline
        try { polylineRef.current?.setMap(null); } catch { /* same reasoning as above */ }
        polylineRef.current = null;

        leaderLinesRef.current.forEach(l => {
            try { l.setMap(null); } catch { /* same reasoning as above */ }
        });
        leaderLinesRef.current = [];

        if (points.length === 0) {
            // An empty map has no viewport worth keeping — the next batch of pins
            // should frame itself.
            fitSignatureRef.current = null;
            userMovedRef.current = false;
            return;
        }

        const bounds = new window.google.maps.LatLngBounds();

        pinElsRef.current.clear();
        markersByIdRef.current.clear();

        fanOutCollisions(points).forEach(({ point: pt, lat, lng, anchor }) => {
            try {
                const pinLabel = pt.sequence !== undefined ? String(pt.sequence) : pt.label.slice(0, 2);
                const el = makePin(pt.kind, pinLabel, pt, onEditLocationRef.current);

                const marker = new window.google.maps.marker.AdvancedMarkerElement({
                    map,
                    position: { lat, lng },
                    title: pt.label,
                    content: el,
                });

                // Leader line back to the shared point, so a fanned pin reads as
                // "displaced to be visible" rather than "this is where it is".
                if (anchor) {
                    try {
                        leaderLinesRef.current.push(new window.google.maps.Polyline({
                            path: [anchor, { lat, lng }],
                            strokeColor: '#64748b',
                            strokeOpacity: 0.5,
                            strokeWeight: 1,
                            clickable: false,
                            map,
                        }));
                    } catch { /* a missing hair-line is not worth losing the pin over */ }
                }

                // Lift the hovered marker above its neighbours so the card isn't covered.
                el.addEventListener('mouseenter', () => { marker.zIndex = 1000; });
                el.addEventListener('mouseleave', () => { marker.zIndex = null; });

                marker.addListener('click', () => onPointClickRef.current?.(pt.id));

                pinElsRef.current.set(pt.id, el);
                markersByIdRef.current.set(pt.id, marker);
                markersRef.current.push(marker);
            } catch (e) {
                // One unrenderable pin shouldn't cost the operator the rest of the map.
                console.error('[OrdersMap] marker create failed:', e);
            }
            // Frame on the TRUE point: fanned offsets are cosmetic and shouldn't
            // widen the viewport.
            bounds.extend({ lat: pt.lat, lng: pt.lng });
        });

        // Only frame the map when the set of coordinates is genuinely new and the
        // user hasn't taken the camera over. Selecting/deselecting a pin changes
        // `points` but not the signature, so the view stays exactly where it was.
        if (fitSignatureRef.current !== positionSignature && !userMovedRef.current) {
            try {
                programmaticMoveRef.current = true;
                map.fitBounds(bounds, 60);
                window.google.maps.event.addListenerOnce(map, 'idle', () => { programmaticMoveRef.current = false; });
            } catch (e) {
                programmaticMoveRef.current = false;
                console.error('[OrdersMap] fitBounds failed:', e);
            }
        }
        fitSignatureRef.current = positionSignature;

        if (showRoute && points.length > 1) {
            try {
                polylineRef.current = new window.google.maps.Polyline({
                    path: points.map(p => ({ lat: p.lat, lng: p.lng })),
                    geodesic: true,
                    strokeColor: '#1e3a5f',
                    strokeOpacity: 0.8,
                    strokeWeight: 2.5,
                    map,
                });
            } catch (e) {
                console.error('[OrdersMap] polyline failed:', e);
            }
        }
    }, [points, showRoute, mapReady, positionSignature]);

    // Selection ring. Runs after the marker effect on a points change (same
    // commit, declaration order) so a freshly rebuilt pin still gets ringed.
    // Uses box-shadow rather than transform: the pin's own hover handler owns
    // transform, and fighting it made the ring flicker on mouse-out.
    useEffect(() => {
        pinElsRef.current.forEach((el, id) => {
            const on = selectedId !== null && id === selectedId;
            el.style.boxShadow = on
                ? '0 0 0 5px rgba(225,6,0,.35), 0 2px 8px rgba(0,0,0,.4)'
                : (el.dataset.baseShadow ?? '0 2px 6px rgba(0,0,0,.35)');
            const marker = markersByIdRef.current.get(id);
            if (marker) marker.zIndex = on ? 900 : null;
        });
    }, [selectedId, points, mapReady]);

    return (
        <div ref={containerRef} className={cn('w-full h-[400px] rounded-xl border border-border overflow-hidden', className)} />
    );
}
