/**
 * Filter bar for the dispatch map + order pickers. Pure controlled component:
 * state lives in DriversSection so map, "no location" panel and pick list
 * all consume the same filtered set.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Search, XCircle } from 'lucide-react';
import {
    type DispatchFilterState,
    type OrderTypeFilter,
    EMPTY_DISPATCH_FILTERS,
    hasActiveFilters,
} from '@/lib/orderFilters';

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    pending_pickup: 'Pending pickup',
    picked_up: 'Picked up',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivery_attempted: 'Delivery attempted',
    failed_pickup: 'Failed pickup',
    failed_delivery: 'Failed delivery',
    on_hold: 'On hold',
    address_issue: 'Address issue',
    rescheduled: 'Rescheduled',
    processing: 'Processing',
    exchange: 'Exchange',
};

export function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const TYPE_OPTIONS: { value: OrderTypeFilter; label: string }[] = [
    { value: 'all', label: 'All types' },
    { value: 'pickup', label: '📦 Pickup' },
    { value: 'delivery', label: '🚚 Delivery' },
    { value: 'return', label: '↩️ Return' },
    { value: 'exchange', label: '🔄 Exchange' },
];

interface DispatchFiltersProps {
    value: DispatchFilterState;
    onChange: (next: DispatchFilterState) => void;
    statuses: string[];
    emirates: string[];
    /** "{shown} of {total} orders" counter */
    shown: number;
    total: number;
}

export default function DispatchFilters({ value, onChange, statuses, emirates, shown, total }: DispatchFiltersProps) {
    const set = (patch: Partial<DispatchFilterState>) => onChange({ ...value, ...patch });

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                        value={value.search}
                        onChange={(e) => set({ search: e.target.value })}
                        placeholder="Search waybill, client or address..."
                        className="bg-white/5 border-border h-8 text-sm"
                    />
                </div>
                <Select value={value.status || 'all'} onValueChange={(v) => set({ status: v === 'all' ? '' : v })}>
                    <SelectTrigger className="bg-white/5 border-border h-8 w-[160px] text-sm">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {statuses.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={value.type} onValueChange={(v) => set({ type: v as OrderTypeFilter })}>
                    <SelectTrigger className="bg-white/5 border-border h-8 w-[150px] text-sm">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        {TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={value.emirate || 'all'} onValueChange={(v) => set({ emirate: v === 'all' ? '' : v })}>
                    <SelectTrigger className="bg-white/5 border-border h-8 w-[150px] text-sm">
                        <SelectValue placeholder="Emirate" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All emirates</SelectItem>
                        {emirates.map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={value.zone || 'all'} onValueChange={(v) => set({ zone: v === 'all' ? '' : v })}>
                    <SelectTrigger className="bg-white/5 border-border h-8 w-[120px] text-sm">
                        <SelectValue placeholder="Zone" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All zones</SelectItem>
                        <SelectItem value="ZONA 1">Zone 1</SelectItem>
                        <SelectItem value="ZONA 2">Zone 2</SelectItem>
                        <SelectItem value="ZONA 3">Zone 3</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                        type="date"
                        value={value.dateFrom}
                        onChange={(e) => set({ dateFrom: e.target.value })}
                        className="bg-white/5 border-border h-8 text-sm w-[140px]"
                        title="From (creation date)"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                        type="date"
                        value={value.dateTo}
                        onChange={(e) => set({ dateTo: e.target.value })}
                        className="bg-white/5 border-border h-8 text-sm w-[140px]"
                        title="To (creation date)"
                    />
                </div>
                {hasActiveFilters(value) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => onChange({ ...EMPTY_DISPATCH_FILTERS })}
                    >
                        <XCircle className="w-3 h-3 mr-1" /> Clear
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                {shown === total
                    ? `${total} order${total !== 1 ? 's' : ''} available`
                    : `${shown} of ${total} orders (filters active)`}
            </p>
        </div>
    );
}
