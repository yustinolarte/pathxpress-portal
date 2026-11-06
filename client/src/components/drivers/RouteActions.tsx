/**
 * Route details header: where the route stands (status, planned vs real times,
 * admin-only ETA) and the dispatch actions that used to need scripts — close,
 * cancel, reopen, reassign, edit, hand over stops. Every action goes through
 * the server's route lifecycle rules (server/routeLifecycle.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Clock, Edit, Loader2, RotateCcw, Shuffle, UserCog } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LocationPicker } from '@/components/LocationPicker';
import { dubaiDateKey, dubaiDateTime, dubaiTimeOfDay } from '@shared/dubaiTime';
import { isStopOpen } from '@shared/stopTransitions';
import { defaultRouteStartTime } from '@shared/routeEta';
import { StopStatusBadge } from './dispatchBadges';
import HandOverDialog from './HandOverDialog';

export interface RouteForActions {
    id: string;
    status: string;
    driverId: number | null;
    driver?: { id: number; fullName: string } | null;
    date: string | Date;
    zone?: string | null;
    plannedStartAt?: string | Date | null;
    startedAt?: string | Date | null;
    finishedAt?: string | Date | null;
    startAddress?: string | null;
    startLat?: string | null;
    startLng?: string | null;
    deliveries: Array<{
        id: number; orderId: number; type: string; status: string; waybillNumber: string;
        deliveredAt?: string | Date | null; pickedUpAt?: string | Date | null; attemptedAt?: string | Date | null;
        proofPhotoUrl?: string | null; proofPhotoUrl2?: string | null; collectedAmount?: string | null;
        customerName?: string | null; shipperName?: string | null;
    }>;
    eta?: { startAt: string; endAt: string | null; live: boolean; mode?: 'planned' | 'late_start' | 'live'; hasOrigin?: boolean } | null;
}

const fmtDubai = (d: string | Date | null | undefined) =>
    d ? `${dubaiDateKey(d)} ${dubaiTimeOfDay(d)}` : '—';

const isWorked = (s: RouteForActions['deliveries'][number]) =>
    !!(s.deliveredAt || s.pickedUpAt || s.attemptedAt || s.proofPhotoUrl || s.proofPhotoUrl2 || s.collectedAmount);

export default function RouteActions({ route, drivers, openRoutes, onChanged }: {
    route: RouteForActions;
    drivers: Array<{ id: number; fullName: string; status: string }>;
    /** Other pending / in-progress routes, as hand-over targets. */
    openRoutes: Array<{ id: string; driver?: { fullName: string } | null; status: string; date: string | Date }>;
    onChanged: () => void;
}) {
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [reassignOpen, setReassignOpen] = useState(false);
    const [reassignTo, setReassignTo] = useState('');
    const [editOpen, setEditOpen] = useState(false);
    const [handOverOpen, setHandOverOpen] = useState(false);

    const isOpenRoute = route.status === 'pending' || route.status === 'in_progress';
    const openStops = route.deliveries.filter(s => isStopOpen(s.status));
    const anyWorked = route.deliveries.some(isWorked);
    const activeDrivers = drivers.filter(d => d.status === 'active');

    const onError = (e: { message: string }) => toast.error(e.message);
    const setStatus = trpc.portal.drivers.updateRouteStatus.useMutation({ onError });
    const reassign = trpc.portal.drivers.assignDriverToRoute.useMutation({
        onSuccess: () => { toast.success('Route reassigned'); setReassignOpen(false); onChanged(); },
        onError,
    });

    const run = (status: 'completed' | 'cancelled' | 'in_progress', reason?: string, done?: string) =>
        setStatus.mutate({ routeId: route.id, status, reason }, {
            onSuccess: (res: any) => {
                const back = res?.backToWarehouse ? ` · ${res.backToWarehouse} order${res.backToWarehouse !== 1 ? 's' : ''} back to in transit` : '';
                toast.success(`${done ?? 'Route updated'}${back}`);
                setCancelOpen(false);
                onChanged();
            },
        });

    const closeRoute = () => {
        const msg = openStops.length > 0
            ? `Close route ${route.id}?\n\n${openStops.length} stop${openStops.length !== 1 ? 's were' : ' was'} not worked: ${openStops.map(s => s.waybillNumber).join(', ')}.\nThey go back to the pool, and orders already "Out for Delivery" return to In Transit.`
            : `Close route ${route.id}? Every stop has been worked.`;
        if (confirm(msg)) run('completed', undefined, 'Route closed');
    };

    return (
        <div className="mb-4 rounded-lg border border-border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5"><StopStatusBadge status={route.status} /></span>
                <span><span className="text-muted-foreground">Planned day</span> {dubaiDateKey(route.date)}</span>
                <span><span className="text-muted-foreground">Start</span> {route.plannedStartAt ? dubaiTimeOfDay(route.plannedStartAt) : <em className="text-muted-foreground">not set</em>}</span>
                {route.startedAt && <span><span className="text-muted-foreground">Started</span> {fmtDubai(route.startedAt)}</span>}
                {route.finishedAt && <span><span className="text-muted-foreground">Finished</span> {fmtDubai(route.finishedAt)}</span>}
                {route.eta?.endAt && (
                    <span
                        className="flex items-center gap-1"
                        title={`Admin-only estimate, Dubai time${route.eta.mode === 'late_start' ? ' — the planned start has passed, so it assumes the route leaves now' : ''}${route.eta.hasOrigin === false ? ' — no start point, so the first drive is a guess' : ''}`}
                    >
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            {route.eta.live ? 'Est. finish (live)' : route.eta.mode === 'late_start' ? 'Est. finish (if it leaves now)' : 'Est. finish'}
                        </span> {route.eta.hasOrigin === false && !route.eta.live ? '~' : ''}{dubaiTimeOfDay(route.eta.endAt)}
                    </span>
                )}
                {!route.eta && isOpenRoute && (
                    <button className="text-primary hover:underline" onClick={() => setEditOpen(true)}>Set a start time to see ETAs</button>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {isOpenRoute && (
                    <>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={closeRoute} disabled={setStatus.isPending}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Close route
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setCancelReason(''); setCancelOpen(true); }} disabled={setStatus.isPending}>
                            <Ban className="w-3.5 h-3.5" /> Cancel route
                        </Button>
                        <Button
                            size="sm" variant="outline" className="gap-1.5"
                            disabled={anyWorked}
                            title={anyWorked ? 'Stops were already worked — use Hand over stops instead' : undefined}
                            onClick={() => { setReassignTo(route.driverId ? String(route.driverId) : ''); setReassignOpen(true); }}
                        >
                            <UserCog className="w-3.5 h-3.5" /> Reassign
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={openStops.length === 0} onClick={() => setHandOverOpen(true)}>
                            <Shuffle className="w-3.5 h-3.5" /> Hand over stops
                        </Button>
                    </>
                )}
                {route.status === 'completed' && (
                    <Button
                        size="sm" variant="outline" className="gap-1.5" disabled={setStatus.isPending}
                        onClick={() => confirm(`Reopen route ${route.id}? Its unfinished stops go back on the road.`) && run('in_progress', undefined, 'Route reopened')}
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Reopen
                    </Button>
                )}
                {route.status !== 'cancelled' && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
                        <Edit className="w-3.5 h-3.5" /> Edit
                    </Button>
                )}
            </div>

            {/* Cancel */}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent className="bg-card border-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Cancel route {route.id}</DialogTitle>
                        <DialogDescription>
                            The stops stay on the route as history. {openStops.length} unworked stop{openStops.length !== 1 ? 's go' : ' goes'} back to the pool,
                            and orders already "Out for Delivery" return to In Transit.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label>Reason</Label>
                        <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Van broke down, driver sick" rows={2} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep route</Button>
                        <Button disabled={setStatus.isPending} onClick={() => run('cancelled', cancelReason.trim() || undefined, 'Route cancelled')}>
                            {setStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel route'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reassign */}
            <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                <DialogContent className="bg-card border-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reassign route {route.id}</DialogTitle>
                        <DialogDescription>
                            Only for routes nobody has worked yet. The new driver scans the QR to start it.
                        </DialogDescription>
                    </DialogHeader>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                        <SelectTrigger><SelectValue placeholder="Choose a driver" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Unassigned (any driver can claim it)</SelectItem>
                            {activeDrivers.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.fullName}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
                        <Button
                            disabled={!reassignTo || reassign.isPending}
                            onClick={() => reassign.mutate({ routeId: route.id, driverId: reassignTo === 'none' ? null : Number(reassignTo) })}
                        >
                            {reassign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reassign'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <EditRouteDialog route={route} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />

            <HandOverDialog
                open={handOverOpen}
                onOpenChange={setHandOverOpen}
                route={route}
                stops={route.deliveries.filter(s => isStopOpen(s.status) && !isWorked(s))}
                drivers={activeDrivers}
                targets={openRoutes.filter(r => r.id !== route.id)}
                onMoved={onChanged}
            />
        </div>
    );
}

function EditRouteDialog({ route, open, onOpenChange, onSaved }: {
    route: RouteForActions;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [startAddress, setStartAddress] = useState('');
    const [start, setStart] = useState<{ lat: string; lng: string } | null>(null);
    const [pickerReset, setPickerReset] = useState(0);
    const defaults = trpc.portal.drivers.routePlanningDefaults.useQuery(undefined, { enabled: open, staleTime: 10 * 60_000 });
    const typicalStart = defaults.data?.typicalStartTime ?? null;
    const timeEdited = useRef(false);

    useEffect(() => {
        if (!open) return;
        timeEdited.current = false;
        setDate(dubaiDateKey(route.date));
        setTime(route.plannedStartAt ? dubaiTimeOfDay(route.plannedStartAt) : '');
        setStartAddress(route.startAddress || '');
        setStart(route.startLat && route.startLng ? { lat: route.startLat, lng: route.startLng } : null);
        setPickerReset(n => n + 1);
    }, [open, route]);

    // A route with no start time yet gets the usual departure (which loads after
    // the dialog opens), never one in the past — until the admin types their own.
    useEffect(() => {
        if (!open || route.plannedStartAt || timeEdited.current || !date) return;
        setTime(defaultRouteStartTime(date, typicalStart));
    }, [open, typicalStart, date, route.plannedStartAt]);

    const initial = useMemo(() => start ? { lat: Number(start.lat), lng: Number(start.lng) } : undefined,
        // only the opening value seeds the picker
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pickerReset]);

    const save = trpc.portal.drivers.updateRouteMeta.useMutation({
        onSuccess: () => { toast.success('Route updated'); onOpenChange(false); onSaved(); },
        onError: (e) => toast.error(e.message),
    });

    const submit = () => {
        if (!date) return toast.error('Pick the planned day');
        let plannedStartAt: string | null = null;
        try {
            plannedStartAt = time ? dubaiDateTime(date, time).toISOString() : null;
        } catch {
            return toast.error('Start time must be HH:MM');
        }
        save.mutate({
            routeId: route.id,
            date: dubaiDateTime(date, '00:00').toISOString(),
            plannedStartAt,
            startAddress: startAddress.trim() || null,
            startLat: start?.lat ?? null,
            startLng: start?.lng ?? null,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit route {route.id}</DialogTitle>
                    <DialogDescription>Start time and start point drive the admin-only ETAs. Times are Dubai time.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label>Planned day</Label>
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Start time</Label>
                        <Input type="time" value={time} onChange={e => { timeEdited.current = true; setTime(e.target.value); }} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                        <Label>Start point</Label>
                        <Input value={startAddress} onChange={e => setStartAddress(e.target.value)} placeholder="e.g. PathXpress warehouse, Al Quoz" />
                        <LocationPicker
                            initialLocation={initial}
                            resetSignal={pickerReset}
                            onLocationPicked={(loc) => {
                                setStart(loc ? { lat: loc.latitude, lng: loc.longitude } : null);
                                if (loc?.address && !startAddress.trim()) setStartAddress(loc.address);
                            }}
                            className="h-[220px]"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>
                        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
