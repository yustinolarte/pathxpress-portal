/**
 * Dispatch priority — which packages should go out first when building routes.
 *
 * Pure, no DB. Computed from the service, the dates and the attempts so far;
 * an admin can override it per order (orders.priorityOverride). Decided
 * 2026-10-31:
 *   URGENT  BULLET (4h); Preferred Time due today or earlier; Same Day created
 *           today or overdue from an earlier day; past its promised date.
 *   HIGH    a retry (already attempted at least once); Express Zone 2.
 *   NORMAL  everything else (DOM).
 * Every "today" is the Dubai calendar day (shared/dubaiTime).
 */
import { dubaiDateKey } from './dubaiTime';

export const DISPATCH_PRIORITIES = ['urgent', 'high', 'normal'] as const;
export type DispatchPriority = typeof DISPATCH_PRIORITIES[number];

export const PRIORITY_RANK: Record<DispatchPriority, number> = { urgent: 0, high: 1, normal: 2 };

export const PRIORITY_LABELS: Record<DispatchPriority, string> = {
    urgent: 'Urgent',
    high: 'High',
    normal: 'Normal',
};

export function isDispatchPriority(value: unknown): value is DispatchPriority {
    return typeof value === 'string' && (DISPATCH_PRIORITIES as readonly string[]).includes(value);
}

export interface PriorityInput {
    serviceType: string | null | undefined;
    createdAt: Date | string;
    preferredDeliveryDate?: string | null;
    deliveryDateEstimated?: Date | string | null;
    priorityOverride?: string | null;
    /** Delivery/pickup attempts already logged for this order. */
    attemptCount?: number;
}

export interface PriorityResult {
    level: DispatchPriority;
    /** What the rules alone say — differs from `level` when overridden. */
    computed: DispatchPriority;
    overridden: boolean;
    /** Human-readable reasons, most important first. */
    reasons: string[];
}

export function computeDispatchPriority(o: PriorityInput, now: Date = new Date()): PriorityResult {
    const service = (o.serviceType ?? '').trim().toUpperCase();
    const today = dubaiDateKey(now);
    const created = dubaiDateKey(o.createdAt);
    const urgent: string[] = [];
    const high: string[] = [];

    if (service === 'BULLET') urgent.push('Bullet (4h)');
    if ((service === 'PREFERRED_TIME' || service === 'PREFERRED_TIME_SDD') && o.preferredDeliveryDate) {
        if (o.preferredDeliveryDate === today) urgent.push('Preferred time today');
        else if (o.preferredDeliveryDate < today) urgent.push('Preferred time overdue');
    }
    if (service === 'SDD') {
        if (created === today) urgent.push('Same day');
        else if (created < today) urgent.push('Same day — overdue');
    }
    if (o.deliveryDateEstimated && dubaiDateKey(o.deliveryDateEstimated) < today) urgent.push('Past promised date');

    const attempts = o.attemptCount ?? 0;
    if (attempts > 0) high.push(`Retry — attempt #${attempts + 1}`);
    if (service === 'EXPRESS_ZONE2') high.push('Express Zone 2');

    const computed: DispatchPriority = urgent.length > 0 ? 'urgent' : high.length > 0 ? 'high' : 'normal';
    const override = isDispatchPriority(o.priorityOverride) ? o.priorityOverride : null;
    const reasons = [...urgent, ...high];
    if (override && override !== computed) reasons.unshift(`Set to ${PRIORITY_LABELS[override].toLowerCase()} by dispatch`);
    return { level: override ?? computed, computed, overridden: !!override, reasons };
}

/** Sort key: priority first, then oldest first. */
export function comparePriority(
    a: { priority: { level: DispatchPriority }; createdAt: Date | string },
    b: { priority: { level: DispatchPriority }; createdAt: Date | string },
): number {
    const byLevel = PRIORITY_RANK[a.priority.level] - PRIORITY_RANK[b.priority.level];
    if (byLevel !== 0) return byLevel;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
