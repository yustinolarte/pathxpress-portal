/**
 * Hand over the stops a driver hasn't worked yet to another route — an
 * existing one, or a new route for another driver. The server moves an
 * order's open pickup and delivery together, and cash already collected stays
 * with the driver who collected it.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dubaiDateKey, dubaiDateTime, dubaiToday } from '@shared/dubaiTime';
import { LegBadge } from './dispatchBadges';

export default function HandOverDialog({ open, onOpenChange, route, stops, drivers, targets, onMoved }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    route: { id: string; driverId: number | null };
    stops: Array<{ id: number; orderId: number; type: string; waybillNumber: string; customerName?: string | null; shipperName?: string | null }>;
    drivers: Array<{ id: number; fullName: string }>;
    targets: Array<{ id: string; driver?: { fullName: string } | null; status: string; date: string | Date }>;
    onMoved: () => void;
}) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [driverId, setDriverId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [day, setDay] = useState(dubaiToday());
    const [time, setTime] = useState('');

    useEffect(() => {
        if (!open) return;
        setSelected(new Set(stops.map(s => s.id)));
        setMode('new'); setDriverId(''); setTargetId(''); setDay(dubaiToday()); setTime('');
    }, [open, stops]);

    const move = trpc.portal.drivers.moveStops.useMutation({
        onSuccess: (res) => {
            toast.success(`${res.moved} stop${res.moved !== 1 ? 's' : ''} moved to ${res.toRouteId}`);
            onOpenChange(false);
            onMoved();
        },
        onError: (e) => toast.error(e.message),
    });

    const toggle = (id: number) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const otherDrivers = drivers.filter(d => d.id !== route.driverId);
    const canSubmit = selected.size > 0 && (mode === 'new' ? !!driverId && !!day : !!targetId);

    const submit = () => {
        const stopIds = Array.from(selected);
        if (mode === 'existing') {
            move.mutate({ fromRouteId: route.id, toRouteId: targetId, stopIds });
            return;
        }
        let plannedStartAt: string | null = null;
        try {
            plannedStartAt = time ? dubaiDateTime(day, time).toISOString() : null;
        } catch {
            toast.error('Start time must be HH:MM');
            return;
        }
        move.mutate({
            fromRouteId: route.id,
            newRoute: { driverId: Number(driverId), date: dubaiDateTime(day, '00:00').toISOString(), plannedStartAt },
            stopIds,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Hand over stops</DialogTitle>
                    <DialogDescription>
                        Move the stops not worked yet off route {route.id}. An order's pickup and delivery move together.
                        If the package is already on this van, hand it over physically too.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                        {stops.length === 0 && <p className="p-3 text-sm text-muted-foreground">Every stop on this route was already worked.</p>}
                        {stops.map(s => (
                            <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                                <span className="font-mono text-xs">{s.waybillNumber}</span>
                                <LegBadge type={s.type} />
                                <span className="truncate text-muted-foreground">{s.type === 'pickup' ? s.shipperName : s.customerName}</span>
                            </label>
                        ))}
                    </div>

                    <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium w-fit">
                        <button className={`px-3 py-1.5 ${mode === 'new' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`} onClick={() => setMode('new')}>New route for a driver</button>
                        <button className={`px-3 py-1.5 ${mode === 'existing' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`} onClick={() => setMode('existing')} disabled={targets.length === 0}>Existing route</button>
                    </div>

                    {mode === 'new' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 space-y-1.5">
                                <Label>Driver</Label>
                                <Select value={driverId} onValueChange={setDriverId}>
                                    <SelectTrigger><SelectValue placeholder="Who takes these stops?" /></SelectTrigger>
                                    <SelectContent>
                                        {otherDrivers.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.fullName}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Planned day</Label>
                                <Input type="date" value={day} onChange={e => setDay(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Start time (optional)</Label>
                                <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label>Target route</Label>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger><SelectValue placeholder="Choose a pending or in-progress route" /></SelectTrigger>
                                <SelectContent>
                                    {targets.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.id} · {r.driver?.fullName || 'Unassigned'} · {dubaiDateKey(r.date)} · {r.status.replace(/_/g, ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={!canSubmit || move.isPending} onClick={submit}>
                        {move.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Move ${selected.size} stop${selected.size !== 1 ? 's' : ''}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
