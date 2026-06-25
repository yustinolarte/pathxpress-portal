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
    id: number;
    lat: number;
    lng: number;
    label: string;
    kind: PinKind;
    sequence?: number;
    /** Extra package info shown in the hover card. */
    details?: MapPointDetails;
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

function serviceLabel(s?: string | null): string {
    if (!s) return '';
    if (s === 'same-day') return 'Same Day';
    if (s === 'express') return 'Express';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rich hover card shown above a pin (replaces the bare waybill tooltip). */
function makeHoverCard(point: MapPoint): HTMLElement {
    const d = point.details ?? {};
    const card = document.createElement('div');
    card.style.cssText = `
        position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%);
        display:none; z-index:60;
        min-width:200px; max-width:260px;
        background:#1e3a5f; color:#fff;
        border:1px solid rgba(255,255,255,.15); border-radius:10px;
        padding:10px 12px;
        box-shadow:0 8px 24px rgba(0,0,0,.35);
        font-size:12px; line-height:1.45; font-family:inherit;
        text-align:left; white-space:normal; pointer-events:none;
    `;

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

    return card;
}

function makePin(kind: PinKind, pinLabel: string, point: MapPoint): HTMLElement {
    const color = pinColor(kind);
    const el = document.createElement('div');
    el.style.cssText = `
        position:relative;
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
    const labelText = document.createElement('span');
    labelText.textContent = pinLabel;
    el.appendChild(labelText);

    const card = makeHoverCard(point);
    el.appendChild(card);

    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; card.style.display = 'block'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; card.style.display = 'none'; });
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
            const el = makePin(pt.kind, pinLabel, pt);

            const marker = new window.google.maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: pt.lat, lng: pt.lng },
                title: pt.label,
                content: el,
            });

            // Lift the hovered marker above its neighbours so the card isn't covered.
            el.addEventListener('mouseenter', () => { marker.zIndex = 1000; });
            el.addEventListener('mouseleave', () => { marker.zIndex = null; });

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
