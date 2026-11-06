/**
 * Small dispatch badges shared by the Dispatch board, the order pickers, the
 * route wizard and the route details: stop status, leg, priority, attempts,
 * where the pin came from, and the admin-only ETA.
 *
 * Colours follow the portal's functional status system (statusStyles.ts):
 * red = problem/urgent, amber = waiting/attention, green = done/verified,
 * blue = moving, gray = neutral.
 */
import { ShieldCheck, Clock, AlertTriangle, MapPinOff, MessageCircle } from 'lucide-react';
import { statusBadgeClass } from '@/lib/statusStyles';
import { dubaiTimeOfDay, isSameDubaiDay } from '@shared/dubaiTime';
import type { DispatchPriority } from '@shared/dispatchPriority';

/** Any status → readable label: every underscore, not just the first. */
export const humanizeStatus = (status: string | null | undefined) =>
    (status || 'pending').replace(/_/g, ' ');

export function StopStatusBadge({ status }: { status: string | null | undefined }) {
    const s = status || 'pending';
    return <span className={statusBadgeClass(s)}>{humanizeStatus(s)}</span>;
}

export function LegBadge({ type, sequence }: { type: string | null | undefined; sequence?: number | null }) {
    const pickup = type === 'pickup';
    return (
        <span className={`badge2 ${pickup ? 'b-green' : 'b-blue'}`} title={pickup ? 'Collect at the shipper' : 'Deliver to the recipient'}>
            {sequence != null ? `#${sequence} · ` : ''}{pickup ? 'Pickup' : 'Delivery'}
        </span>
    );
}

export interface PriorityLike { level: DispatchPriority; reasons: string[]; overridden?: boolean }

const PRIORITY_TONE: Record<DispatchPriority, string> = { urgent: 'b-red', high: 'b-amber', normal: 'b-gray' };

/** Hidden for normal priority unless `showNormal` — most orders are normal, the badge is for the exceptions. */
export function PriorityBadge({ priority, showNormal = false }: { priority?: PriorityLike | null; showNormal?: boolean }) {
    if (!priority || (priority.level === 'normal' && !showNormal)) return null;
    const label = priority.level === 'urgent' ? 'Urgent' : priority.level === 'high' ? 'High' : 'Normal';
    return (
        <span className={`badge2 ${PRIORITY_TONE[priority.level]}`} title={priority.reasons.join(' · ') || undefined}>
            {label}{priority.overridden ? ' (manual)' : ''}
        </span>
    );
}

export interface AttemptsLike { count: number; lastAt: string | Date | null; lastReason: string | null; today: boolean }

export function AttemptBadge({ attempts }: { attempts?: AttemptsLike | null }) {
    if (!attempts || attempts.count === 0) return null;
    const when = attempts.lastAt
        ? (isSameDubaiDay(attempts.lastAt, new Date()) ? `today ${dubaiTimeOfDay(attempts.lastAt)}` : new Date(attempts.lastAt).toLocaleDateString())
        : '';
    return (
        <span
            className={`badge2 ${attempts.today ? 'b-red' : 'b-amber'}`}
            title={attempts.lastReason ? `Last attempt: ${attempts.lastReason}` : undefined}
        >
            {attempts.today ? 'Attempted' : `${attempts.count} attempt${attempts.count !== 1 ? 's' : ''}`}{when ? ` · ${when}` : ''}
        </span>
    );
}

export type LocationSource = 'bot' | 'client' | 'admin' | 'geocode' | null | undefined;

/**
 * Where the pin of THIS leg came from. Pass the shipper-side source for a
 * pickup. `hasPin` false wins over everything; `accuracy` 'approximate' (or a
 * 'geocode' source) means a geocoded address, never a real fix.
 */
export function LocationSourceBadge({ source, hasPin, accuracy, botStatus, compact = false }: {
    source: LocationSource | string;
    hasPin: boolean;
    accuracy?: string | null;
    botStatus?: string | null;
    compact?: boolean;
}) {
    const pending = botStatus === 'waiting' || botStatus === 'queued';
    const failed = botStatus === 'failed';
    let tone = 'b-gray';
    let label = 'Pin · source unknown';
    let icon: React.ReactNode = null;
    if (!hasPin) {
        tone = 'b-red'; label = 'No location'; icon = <MapPinOff className="w-3 h-3" />;
    } else if (source === 'bot') {
        tone = 'b-green'; label = compact ? 'Verified' : 'Verified by recipient'; icon = <ShieldCheck className="w-3 h-3" />;
    } else if (source === 'geocode' || accuracy === 'approximate') {
        tone = 'b-amber'; label = 'Approximate';
    } else if (source === 'admin') {
        tone = 'b-blue'; label = compact ? 'Pin · PathXpress' : 'Pin set by PathXpress';
    } else if (source === 'client') {
        label = compact ? 'Pin · client' : 'Pin from client';
    }
    const title = [
        source === 'bot' ? 'The recipient shared this location on WhatsApp' : null,
        pending ? 'WhatsApp location request sent — waiting for the reply' : null,
        failed ? 'The WhatsApp location request could not be delivered' : null,
    ].filter(Boolean).join(' · ') || undefined;
    return (
        <span className="inline-flex items-center gap-1">
            <span className={`badge2 ${tone} !inline-flex items-center gap-1`} title={title}>{icon}{label}</span>
            {source !== 'bot' && (pending || failed) && (
                <span className={`badge2 ${failed ? 'b-red' : 'b-amber'} !inline-flex items-center gap-1`} title={title}>
                    <MessageCircle className="w-3 h-3" />{failed ? 'Request failed' : 'Asked on WhatsApp'}
                </span>
            )}
        </span>
    );
}

export interface EtaLike {
    arriveAt: string;
    actual: boolean;
    approx: boolean;
    lateRisk: 'window' | 'bullet' | null;
    early?: boolean;
}

/** Admin-only arrival time in Dubai time. */
export function EtaChip({ eta }: { eta?: EtaLike | null }) {
    if (!eta) return null;
    const time = dubaiTimeOfDay(eta.arriveAt);
    if (eta.actual) {
        return <span className="badge2 b-gray !inline-flex items-center gap-1" title="When the driver worked this stop"><Clock className="w-3 h-3" />{time}</span>;
    }
    if (eta.lateRisk) {
        return (
            <span className="badge2 b-red !inline-flex items-center gap-1" title={eta.lateRisk === 'bullet' ? 'Arrives after the 4h Bullet deadline' : "Arrives after the recipient's preferred time window"}>
                <AlertTriangle className="w-3 h-3" />ETA {eta.approx ? '~' : ''}{time} · late
            </span>
        );
    }
    return (
        <span className={`badge2 ${eta.early ? 'b-amber' : 'b-blue'} !inline-flex items-center gap-1`} title={eta.early ? 'Arrives before the preferred window opens — the driver will wait' : eta.approx ? 'Approximate: the route has no start point, or a stop before this one has no pin' : 'Estimated arrival (Dubai time)'}>
            <Clock className="w-3 h-3" />ETA {eta.approx ? '~' : ''}{time}{eta.early ? ' · early' : ''}
        </span>
    );
}
