/**
 * Route history: every correction, reassignment, move, cancellation and
 * ignored driver update on this route, newest first (routeAuditLog).
 */
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { dubaiDateKey, dubaiTimeOfDay } from '@shared/dubaiTime';
import { humanizeStatus } from './dispatchBadges';

const ACTION_LABELS: Record<string, string> = {
    stop_corrected: 'Stop corrected',
    stop_synced_from_order: 'Stop updated from order status',
    tracking_event_removed: 'Wrong tracking event removed',
    route_auto_completed: 'Route closed automatically',
    route_closed: 'Route closed',
    route_closed_at_clock_out: 'Route closed at clock-out',
    route_finished_by_driver: 'Route finished by driver',
    route_cancelled: 'Route cancelled',
    route_reopened: 'Route reopened',
    route_started_by_admin: 'Route started by dispatch',
    route_reassigned: 'Route reassigned',
    route_edited: 'Route edited',
    route_deleted: 'Route deleted',
    stops_moved_out: 'Stops handed over',
    stops_moved_in: 'Stops received',
    stop_removed: 'Stop removed',
    order_deleted_from_route: 'Order deleted',
    order_back_to_warehouse: 'Order back to warehouse',
    driver_update_ignored: 'Driver update ignored',
    driver_route_update_ignored: 'Driver route update ignored',
    late_update_accepted: 'Late driver update accepted',
    priority_set: 'Priority changed',
};

export default function RouteHistory({ routeId }: { routeId: string }) {
    const { data, isLoading } = trpc.portal.drivers.getRouteAuditLog.useQuery({ routeId }, { refetchOnWindowFocus: false });

    if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
    if (!data || data.length === 0) return <p className="text-center py-8 text-sm text-muted-foreground">Nothing has been corrected or changed on this route yet.</p>;

    return (
        <ol className="space-y-2 max-h-[450px] overflow-y-auto">
            {data.map(e => {
                const ignored = e.action.includes('ignored');
                return (
                    <li key={e.id} className={`rounded-lg border p-3 text-sm ${ignored ? 'border-[var(--st-amber)]/40 bg-[var(--st-amber-bg)]' : 'border-border'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{ACTION_LABELS[e.action] ?? humanizeStatus(e.action)}</span>
                            <span className="text-xs text-muted-foreground">{dubaiDateKey(e.createdAt)} {dubaiTimeOfDay(e.createdAt)} · {e.actor}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                            {e.waybillNumber && <span className="font-mono">{e.waybillNumber}</span>}
                            {(e.fromValue || e.toValue) && <span>{humanizeStatus(e.fromValue ?? '—')} → {humanizeStatus(e.toValue ?? '—')}</span>}
                            {e.reason && <span>{e.reason}</span>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
