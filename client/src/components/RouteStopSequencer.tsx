/**
 * RouteStopSequencer — the one place a route's stop order is decided.
 *
 * Map on the left (numbered pins + live polyline), draggable list on the right.
 * Dragging a row renumbers the map immediately; clicking a pin highlights and
 * scrolls to its row. Used by both the create wizard (stops don't exist in the
 * database yet, so they're keyed `${orderId}:${type}`) and the route detail
 * dialog (keyed by routeOrders.id).
 *
 * Two rules are enforced here rather than left to the server round-trip:
 *   - a finished stop can't move (the driver has already been there);
 *   - a delivery can't sit above its own pickup, which would leave the driver
 *     with a permanently blocked stop mid-route.
 * The server re-checks both against the database — this is only the fast, local
 * half of the same rule, shared via @shared/routeSequence.
 */

import { useMemo, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { toast } from 'sonner';
import {
    GripVertical, Lock, MapPin, Package, Truck, Trash2, Wand2, Loader2, AlertTriangle,
    ChevronUp, ChevronDown,
} from 'lucide-react';
import { OrdersMap, type MapPoint, type MapPointId, type PinKind } from './OrdersMap';
import { applyLockedPositions, enforcePrecedence, findPrecedenceViolation } from '@shared/routeSequence';
import { pathLength } from '@shared/geo';
import type { SequencerStop } from '@/lib/routeDraft';

export type { SequencerStop };
import { cn } from '@/lib/utils';

interface RouteStopSequencerProps {
    stops: SequencerStop[];
    onChange: (next: SequencerStop[]) => void;
    origin?: { lat: number; lng: number; label?: string } | null;
    onEditLocation?: (stop: SequencerStop) => void;
    /** Wizard only — drop a stop from the draft. Omit to hide the button. */
    onRemoveStop?: (key: string) => void;
    /** "Ordenar automáticamente". Omit to hide the button. */
    onAutoOrder?: () => void;
    autoOrdering?: boolean;
    disabled?: boolean;
    className?: string;
    mapClassName?: string;
}

const fmtKm = (metres: number) =>
    metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;

export default function RouteStopSequencer({
    stops,
    onChange,
    origin = null,
    onEditLocation,
    onRemoveStop,
    onAutoOrder,
    autoOrdering = false,
    disabled = false,
    className,
    mapClassName = 'h-[440px]',
}: RouteStopSequencerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    // One stable ref for the list; rows are found by data attribute. Per-row
    // callback refs were being torn down and recreated on every render, which
    // pulled the node out from under framer's drag gesture.
    const listRef = useRef<HTMLUListElement | null>(null);

    const byKey = useMemo(() => new Map(stops.map(s => [s.key, s])), [stops]);
    const withCoords = useMemo(() => stops.filter(s => s.lat !== null && s.lng !== null), [stops]);
    const noCoords = useMemo(() => stops.filter(s => s.lat === null || s.lng === null), [stops]);

    /** Incoming data that is already invalid — legacy routes ordered before the rule existed. */
    const incomingViolation = useMemo(() => findPrecedenceViolation(stops), [stops]);

    const mapPoints: MapPoint[] = useMemo(() => {
        const points: MapPoint[] = stops
            .map((s, i) => ({ s, seq: i + 1 }))
            .filter(({ s }) => s.lat !== null && s.lng !== null)
            .map(({ s, seq }) => ({
                id: s.key as MapPointId,
                lat: s.lat!,
                lng: s.lng!,
                label: s.waybillNumber,
                kind: (s.type === 'pickup' ? 'pickup' : 'delivery') as PinKind,
                // Position in the list, NOT the stored sequence — this is what makes
                // the pins renumber the instant a row is dragged.
                sequence: seq,
                accuracy: s.accuracy ?? null,
                details: {
                    customerName: s.customerName,
                    address: s.address,
                    city: s.city,
                    pieces: s.pieces,
                    weight: s.weight,
                    serviceType: s.serviceType,
                    codRequired: s.codRequired,
                    codAmount: s.codAmount,
                    type: s.type,
                },
            }));

        if (origin) {
            points.unshift({
                id: '__origin__',
                lat: origin.lat,
                lng: origin.lng,
                label: origin.label || 'Origen',
                kind: 'origin' as PinKind,
                sequence: 0,
                accuracy: null,
                details: { address: origin.label },
            });
        }
        return points;
    }, [stops, origin]);

    const totalMetres = useMemo(() => {
        const path = withCoords.map(s => ({ lat: s.lat!, lng: s.lng! }));
        return pathLength(path, origin ? { lat: origin.lat, lng: origin.lng } : null);
    }, [withCoords, origin]);

    const pickups = stops.filter(s => s.type === 'pickup').length;
    const deliveries = stops.length - pickups;

    function handleReorder(dragged: SequencerStop[]) {
        const pinned = applyLockedPositions(stops, dragged, s => !!s.locked);
        const violation = findPrecedenceViolation(pinned);
        if (violation) {
            // Revert rather than persist-and-warn: dragging a delivery above its own
            // pickup is never a legitimate intent, so a saved-but-broken order would
            // be worse than the bounce-back.
            toast.error(`La entrega de ${violation.delivery.waybillNumber} no puede ir antes de su recogida`);
            return;
        }
        onChange(pinned);
    }

    function selectStop(key: string) {
        setSelectedKey(key);
        listRef.current
            ?.querySelector(`[data-stop-key="${CSS.escape(key)}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /**
     * Keyboard/click alternative to dragging. Not just an accessibility nicety:
     * a pointer gesture is the one interaction that can silently do nothing on a
     * given device or browser, and reordering a route is not optional work.
     */
    function nudge(index: number, delta: -1 | 1) {
        const target = index + delta;
        if (target < 0 || target >= stops.length) return;
        const next = [...stops];
        [next[index], next[target]] = [next[target], next[index]];
        setSelectedKey(stops[index].key);
        handleReorder(next);
    }

    return (
        <div className={cn('grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4', className)}>
            {/* ── Map ── */}
            <div className="space-y-2 min-w-0">
                {withCoords.length === 0 ? (
                    <div className={cn(
                        'flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-xl border border-border bg-muted/20',
                        mapClassName,
                    )}>
                        <MapPin className="w-8 h-8 opacity-30" />
                        <p className="text-sm">Ninguna parada tiene coordenadas</p>
                        <p className="text-xs">Puedes ordenarlas igualmente en la lista</p>
                    </div>
                ) : (
                    <OrdersMap
                        points={mapPoints}
                        showRoute
                        selectedId={selectedKey}
                        className={mapClassName}
                        onPointClick={(id) => { if (id !== '__origin__') selectStop(String(id)); }}
                        onEditLocation={onEditLocation
                            ? (id) => { const s = byKey.get(String(id)); if (s) onEditLocation(s); }
                            : undefined}
                    />
                )}
                <p className="text-xs text-muted-foreground text-center">
                    Verde = recogidas · Azul = entregas · El número es el orden en que el conductor las hará
                </p>
            </div>

            {/* ── Draggable list ── */}
            <div className="flex flex-col min-w-0 gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Orden de paradas
                    </p>
                    <div className="flex items-center gap-2">
                        {incomingViolation && (
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onChange(
                                    // Same repair the backfill script applies; locked slots stay put.
                                    applyLockedPositions(stops, enforcePrecedence(stops), s => !!s.locked),
                                )}
                                className="text-xs font-semibold px-2 py-1 rounded-lg border border-[var(--st-amber)]/40 bg-[var(--st-amber-bg)] text-[var(--st-amber)] hover:opacity-80 disabled:opacity-50"
                            >
                                Corregir orden
                            </button>
                        )}
                        {onAutoOrder && (
                            <button
                                type="button"
                                onClick={onAutoOrder}
                                disabled={disabled || autoOrdering || stops.length < 2}
                                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-input bg-background hover:bg-muted/40 disabled:opacity-50"
                            >
                                {autoOrdering
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ordenando...</>
                                    : <><Wand2 className="w-3.5 h-3.5 text-[var(--st-green)]" /> Ordenar automáticamente</>}
                            </button>
                        )}
                    </div>
                </div>

                {incomingViolation && (
                    <p className="text-xs px-3 py-2 rounded-lg border border-[var(--st-amber)]/40 bg-[var(--st-amber-bg)] text-[var(--st-amber)] flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            La entrega de <strong>{incomingViolation.delivery.waybillNumber}</strong> está antes de su
                            recogida. El conductor la vería bloqueada hasta llegar a la recogida.
                        </span>
                    </p>
                )}

                {stops.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground border border-dashed border-border rounded-xl">
                        <Package className="w-7 h-7 opacity-30" />
                        <p className="text-sm">Sin paradas todavía</p>
                    </div>
                ) : (
                    <Reorder.Group
                        axis="y"
                        values={stops}
                        onReorder={handleReorder}
                        ref={listRef}
                        // `layoutScroll` + gap (not Tailwind's space-y) are both load-bearing:
                        // space-y-* compiles to margin-top on `> * + *`, so the first row has no
                        // margin and the rest do — framer measures those uneven boxes and the drag
                        // never lands anywhere. layoutScroll is what keeps the maths right once
                        // this list is scrolled.
                        layoutScroll
                        className="flex flex-col gap-1.5 overflow-y-auto pr-1"
                        style={{ maxHeight: '400px' }}
                    >
                        {stops.map((stop, idx) => {
                            const isPickup = stop.type === 'pickup';
                            const draggable = !stop.locked && !disabled;
                            return (
                                <Reorder.Item
                                    key={stop.key}
                                    value={stop}
                                    dragListener={draggable}
                                    data-stop-key={stop.key}
                                    // Selection runs on click, never on pointerdown: setting state
                                    // as the gesture starts re-renders the row mid-drag and kills it.
                                    onClick={() => setSelectedKey(stop.key)}
                                    className={cn(
                                        // flex-shrink-0 is load-bearing: this list is a flex column
                                        // with a capped height, so without it the browser squeezes
                                        // every row to fit and the two lines of text overlap.
                                        'flex flex-shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 bg-card',
                                        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                                        selectedKey === stop.key
                                            ? 'border-primary ring-1 ring-primary/40'
                                            : 'border-border',
                                        stop.locked && 'opacity-70',
                                    )}
                                >
                                    <span className={cn(
                                        'w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0',
                                        isPickup
                                            ? 'bg-[var(--st-green-bg)] text-[var(--st-green)]'
                                            : 'bg-[var(--st-blue-bg)] text-[var(--st-blue)]',
                                    )}>
                                        {idx + 1}
                                    </span>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {isPickup
                                                ? <Package className="w-3 h-3 text-[var(--st-green)] flex-shrink-0" />
                                                : <Truck className="w-3 h-3 text-[var(--st-blue)] flex-shrink-0" />}
                                            <span className="font-mono text-xs font-medium truncate">{stop.waybillNumber}</span>
                                            {stop.locked && (
                                                <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                                                    <Lock className="w-2.5 h-2.5" /> Hecha
                                                </span>
                                            )}
                                            {stop.lat === null && (
                                                <span className="text-[10px] font-bold uppercase text-[var(--st-amber)]">
                                                    Sin ubicación
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {isPickup ? 'Recoger' : 'Entregar'} · {stop.customerName || '—'}
                                            {stop.city ? ` · ${stop.city}` : ''}
                                        </p>
                                    </div>

                                    {/* Placing a pin has to live on the ROW, not only on the map
                                        marker's hover card: a stop with no coordinates has no
                                        marker at all, so the stops that most need a location were
                                        the only ones that couldn't be given one. */}
                                    {onEditLocation && (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onPointerDownCapture={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); onEditLocation(stop); }}
                                            className={cn(
                                                'flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-semibold flex-shrink-0 disabled:opacity-50',
                                                stop.lat === null
                                                    ? 'text-[var(--st-amber)] bg-[var(--st-amber-bg)] hover:opacity-80'
                                                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                                            )}
                                            title={stop.lat === null
                                                ? `Falta la ubicación de ${isPickup ? 'recogida' : 'entrega'} — haz clic para ponerla`
                                                : 'Corregir ubicación'}
                                        >
                                            <MapPin className="w-3.5 h-3.5" />
                                            {stop.lat === null && 'Ubicar'}
                                        </button>
                                    )}

                                    {onRemoveStop && !stop.locked && (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onPointerDownCapture={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); onRemoveStop(stop.key); }}
                                            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex-shrink-0 disabled:opacity-50"
                                            aria-label={`Quitar ${stop.waybillNumber}`}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}

                                    {/* Arrows always work; the grip is the faster path when
                                        dragging behaves on the device at hand. */}
                                    <div className="flex flex-col flex-shrink-0">
                                        <button
                                            type="button"
                                            disabled={disabled || idx === 0}
                                            onPointerDownCapture={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); nudge(idx, -1); }}
                                            className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-20"
                                            aria-label={`Subir ${stop.waybillNumber}`}
                                        >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={disabled || idx === stops.length - 1}
                                            onPointerDownCapture={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); nudge(idx, 1); }}
                                            className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-20"
                                            aria-label={`Bajar ${stop.waybillNumber}`}
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <GripVertical className={cn(
                                        'w-4 h-4 flex-shrink-0',
                                        draggable ? 'text-muted-foreground' : 'text-transparent',
                                    )} />
                                </Reorder.Item>
                            );
                        })}
                    </Reorder.Group>
                )}

                {/* ── Summary ── */}
                <div className="text-xs text-muted-foreground border-t border-border pt-2 space-y-1">
                    <p>
                        <strong className="text-foreground">{stops.length}</strong> parada{stops.length !== 1 ? 's' : ''}
                        {' · '}{pickups} recogida{pickups !== 1 ? 's' : ''}
                        {' · '}{deliveries} entrega{deliveries !== 1 ? 's' : ''}
                        {withCoords.length > 1 && <> · ~{fmtKm(totalMetres)}</>}
                    </p>
                    {noCoords.length > 0 && (
                        <div className="px-2 py-1.5 rounded-lg border border-[var(--st-amber)]/40 bg-[var(--st-amber-bg)] text-[var(--st-amber)] space-y-1">
                            <p>
                                {noCoords.length} parada{noCoords.length !== 1 ? 's' : ''} sin ubicación —
                                {noCoords.length !== 1 ? ' no aparecen' : ' no aparece'} en el mapa
                                {onEditLocation && ', pulsa "Ubicar" para ponerle el pin'}:
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {noCoords.map(s => (
                                    <button
                                        key={s.key}
                                        type="button"
                                        disabled={disabled || !onEditLocation}
                                        onClick={() => onEditLocation?.(s)}
                                        className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--st-amber)]/15 hover:bg-[var(--st-amber)]/30 disabled:cursor-default"
                                    >
                                        {s.type === 'pickup' ? '📦' : '🚚'} {s.waybillNumber}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

