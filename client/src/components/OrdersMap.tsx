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

declare global {
    interface Window { google?: typeof google; }
}


const DUBAI_CENTER: google.maps.LatLngLiteral = { lat: 25.2048, lng: 55.2708 };

export type PinKind = 'available' | 'selected' | 'pickup' | 'delivery' | 'origin';

export interface MapPoint {
    id: number;
    lat: number;
    lng: number;
    label: string;
    kind: PinKind;
    sequence?: number;
}

interface OrdersMapProps {
    points: MapPoint[];
    /** When true, draws a numbered polyline connecting points in array order */
    showRoute?: boolean;
    onPointClick?: (id: number) => void;
    className?: string;
}

function pinColor(kind: PinKind): string {
    switch (kind) {
        case 'selected':  return '#1e3a5f'; // primary navy
        case 'pickup':    return '#0f5a2e'; // dark green
        case 'delivery':  return '#1e3a5f'; // primary navy
        case 'origin':    return '#c0392b'; // red accent
        default:          return '#64748b'; // slate — available, unselected
    }
}

function makePin(kind: PinKind, label: string): HTMLElement {
    const color = pinColor(kind);
    const el = document.createElement('div');
    el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:50%;
        background:${color};color:#fff;
        font-size:11px;font-weight:700;font-family:inherit;
        border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.35);
        cursor:pointer;
        transition:transform .15s;
        white-space:nowrap;
    `;
    el.textContent = label;
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
    return el;
}

export function OrdersMap({ points, showRoute = false, onPointClick, className }: OrdersMapProps) {
    const containerRef  = useRef<HTMLDivElement>(null);
    const mapRef        = useRef<google.maps.Map | null>(null);
    const markersRef    = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const polylineRef   = useRef<google.maps.Polyline | null>(null);
    const [mapReady, setMapReady] = useState(false);

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

        // Clear old markers
        markersRef.current.forEach(m => { m.map = null; });
        markersRef.current = [];

        // Clear old polyline
        polylineRef.current?.setMap(null);
        polylineRef.current = null;

        if (points.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();

        points.forEach((pt) => {
            const pinLabel = pt.sequence !== undefined ? String(pt.sequence) : pt.label.slice(0, 2);
            const el = makePin(pt.kind, pinLabel);

            const marker = new window.google.maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: pt.lat, lng: pt.lng },
                title: pt.label,
                content: el,
            });

            if (onPointClick) {
                marker.addListener('click', () => onPointClick(pt.id));
            }

            markersRef.current.push(marker);
            bounds.extend({ lat: pt.lat, lng: pt.lng });
        });

        map.fitBounds(bounds, 60);

        if (showRoute && points.length > 1) {
            polylineRef.current = new window.google.maps.Polyline({
                path: points.map(p => ({ lat: p.lat, lng: p.lng })),
                geodesic: true,
                strokeColor: '#1e3a5f',
                strokeOpacity: 0.8,
                strokeWeight: 2.5,
                map,
            });
        }
    }, [points, showRoute, onPointClick, mapReady]);

    return (
        <div ref={containerRef} className={cn('w-full h-[400px] rounded-xl border border-border overflow-hidden', className)} />
    );
}
