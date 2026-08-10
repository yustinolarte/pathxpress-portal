/**
 * Drivers — Dispatch Command Center
 *
 * Six views behind one segmented control, following the "Drivers Command Center"
 * design: Dispatch (live board), Routes, Drivers (master/detail), COD
 * (per-driver cash reconciliation), Shifts and Reports.
 *
 * Layout leans on the portal design language in index.css (.kpi / .badge2 /
 * .statline / .seg / .lrow) so this area matches Billing, COD and Reports
 * rather than inventing a second visual system.
 */
import { useState, useMemo, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
    Users, Truck, Package, AlertTriangle, Plus, Eye, Edit, Trash2,
    RefreshCw, MapPin, Clock, CheckCircle, XCircle,
    Calendar, Building2, CheckCircle2, Loader2,
    DollarSign, RotateCcw, UserPlus, QrCode,
    TrendingUp, BarChart2, Search, ChevronRight,
    Activity, Download, ChevronUp, ChevronDown, ListOrdered, MapPinOff,
    Map as MapIcon, Inbox, Route as RouteIcon, CreditCard, Banknote,
    Maximize2, ShieldCheck, AlertCircle,
} from 'lucide-react';
import CreateRouteWizard from '@/components/CreateRouteWizard';
import OrderPickList, { type SelectedOrder, type OrderMode } from '@/components/OrderPickList';
import { OrdersMap } from '@/components/OrdersMap';
import type { MapPoint, PinKind } from '@/components/OrdersMap';
import DispatchFilters from '@/components/DispatchFilters';
import SetLocationDialog from '@/components/SetLocationDialog';
import RouteStopSequencer, { type SequencerStop } from '@/components/RouteStopSequencer';
import {
    type DispatchFilterState, EMPTY_DISPATCH_FILTERS, filterAvailableOrders,
    distinctEmirates, distinctStatuses, pickableOrders, countHiddenByDefault,
    stopLocationTarget, stopLegCoords,
} from '@/lib/orderFilters';
import { getProofPhotoUrls } from '@shared/podPhotos';
import { normalizeCity } from '@shared/uae';

// Dubai zone presets
const ZONE_OPTIONS = [
    { value: 'downtown_dubai', label: 'Downtown Dubai' },
    { value: 'dubai_marina', label: 'Dubai Marina' },
    { value: 'jbr', label: 'JBR' },
    { value: 'business_bay', label: 'Business Bay' },
    { value: 'jumeirah', label: 'Jumeirah' },
    { value: 'deira', label: 'Deira' },
    { value: 'bur_dubai', label: 'Bur Dubai' },
    { value: 'al_quoz', label: 'Al Quoz' },
    { value: 'jlt', label: 'JLT' },
    { value: 'silicon_oasis', label: 'Silicon Oasis' },
    { value: 'sports_city', label: 'Sports City' },
    { value: 'motor_city', label: 'Motor City' },
    { value: 'international_city', label: 'International City' },
    { value: 'al_barsha', label: 'Al Barsha' },
    { value: 'mirdif', label: 'Mirdif' },
    { value: 'dubai_hills', label: 'Dubai Hills' },
    { value: 'palm_jumeirah', label: 'Palm Jumeirah' },
    { value: 'sharjah', label: 'Sharjah' },
    { value: 'ajman', label: 'Ajman' },
    { value: 'abu_dhabi', label: 'Abu Dhabi' },
    { value: 'al_ain', label: 'Al Ain' },
    { value: 'rak', label: 'Ras Al Khaimah' },
    { value: 'fujairah', label: 'Fujairah' },
    { value: 'uaq', label: 'Umm Al Quwain' },
    { value: 'other', label: 'Other' },
];

const ZONE_LABELS = new Map(ZONE_OPTIONS.map(z => [z.value, z.label]));
const zoneLabel = (zone?: string | null) => (zone ? ZONE_LABELS.get(zone) || zone : null);

// A stop the driver already worked can't be moved — it's frozen at its index by
// the server too (reorderRouteStops). Mirrors FINISHED_STOP_STATUSES in
// server/driverAdmin.ts; 'on_hold' is postponed, not done.
const FINISHED_STOP_STATUSES = ['picked_up', 'delivered', 'attempted', 'returned', 'failed'];

/** Route-detail stop rows → the sequencer's shape, in their stored order. */
function toSequencerStops(deliveries: any[] | undefined): SequencerStop[] {
    return [...(deliveries || [])]
        .sort((a, b) => {
            // Null sequences sort last (MySQL would put them first), then by id.
            const as = a.sequence ?? Number.MAX_SAFE_INTEGER;
            const bs = b.sequence ?? Number.MAX_SAFE_INTEGER;
            return as !== bs ? as - bs : a.id - b.id;
        })
        .map((d: any) => {
            const c = stopLegCoords(d);
            return {
                key: String(d.id),
                orderId: d.orderId,
                type: d.type === 'pickup' ? 'pickup' : 'delivery',
                stopId: d.id,
                waybillNumber: d.waybillNumber,
                customerName: d.customerName,
                city: d.city,
                address: d.address,
                companyName: d.companyName,
                serviceType: d.serviceType,
                codRequired: d.codRequired,
                codAmount: d.codAmount,
                pieces: d.pieces,
                weight: d.weight,
                lat: c.lat,
                lng: c.lng,
                accuracy: c.accuracy,
                locked: FINISHED_STOP_STATUSES.includes(d.status ?? ''),
                status: d.status,
            } satisfies SequencerStop;
        });
}

const initialsOf = (name?: string | null) =>
    (name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]!.toUpperCase())
        .join('') || '?';

/** AED amounts read as money, not as raw floats — thousands separated, cents only when they exist. */
const fmtAed = (value: number | string | null | undefined) => {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (n === null || n === undefined || Number.isNaN(n)) return '0';
    return n.toLocaleString('en-AE', {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
    });
};

const todayISO = () => new Date().toISOString().slice(0, 10);

type DriverView = 'dispatch' | 'routes' | 'drivers' | 'cod' | 'shifts' | 'reports';

const VIEW_TABS: { value: DriverView; label: string }[] = [
    { value: 'dispatch', label: 'Dispatch' },
    { value: 'routes', label: 'Routes' },
    { value: 'drivers', label: 'Drivers' },
    { value: 'cod', label: 'COD' },
    { value: 'shifts', label: 'Shifts' },
    { value: 'reports', label: 'Reports' },
];

/** Column templates lifted straight from the design's grid definitions. */
const ROUTES_GRID = '1.5fr 0.8fr 1.3fr 1fr 0.75fr 0.95fr 1.1fr 0.8fr';
const DRIVERS_GRID = '1fr 1.3fr 0.9fr 0.9fr 0.7fr';
// The trailing COD column in both grids carries the disambiguated "COD collected"
// header (bare "COD" meant three different things across tabs). At 10.5px uppercase
// mono with 0.06em tracking that label needs ~100px, which the old 0.8fr/1fr shares
// didn't give it — the header wrapped onto a second line and buckled the row.
const SHIFT_GRID = '1.4fr 1fr 1fr 0.9fr 0.7fr 1.25fr';
const PAYROLL_GRID = '1.6fr 0.9fr 0.9fr 0.7fr 0.9fr 0.6fr 0.6fr 1.1fr';
const REPORTS_GRID = '1.1fr 0.85fr 2fr 1.15fr 1.05fr 0.7fr 0.7fr';

const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted-foreground)',
};

export default function DriversSection() {
    const [view, setView] = useState<DriverView>('dispatch');
    const [routesView, setRoutesView] = useState<'list' | 'map'>('list');
    const [dispatchSelected, setDispatchSelected] = useState<SelectedOrder[]>([]);
    const [preloadedOrdersForWizard, setPreloadedOrdersForWizard] = useState<Array<{ id: number; mode: 'pickup_only' | 'delivery_only' | 'both' }>>([]);
    const [routeDetailsTab, setRouteDetailsTab] = useState<'list' | 'map'>('list');

    // Dialogs
    const [createDriverDialogOpen, setCreateDriverDialogOpen] = useState(false);
    const [editDriverDialogOpen, setEditDriverDialogOpen] = useState(false);
    const [createRouteWizardOpen, setCreateRouteWizardOpen] = useState(false);
    const [routeDetailsDialogOpen, setRouteDetailsDialogOpen] = useState(false);
    const [addOrdersDialogOpen, setAddOrdersDialogOpen] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [driverProfileDialogOpen, setDriverProfileDialogOpen] = useState(false);
    /** Dispatch board: push unassigned orders onto a route that already exists. */
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [assignRouteId, setAssignRouteId] = useState('');

    // Selected items
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [addOrders, setAddOrders] = useState<SelectedOrder[]>([]);
    const [qrRouteId, setQrRouteId] = useState('');
    /** Drives both the inline profile panel and the full-profile dialog. */
    const [profileDriverId, setProfileDriverId] = useState<number | null>(null);

    // Filters
    const [routeFilterDate, setRouteFilterDate] = useState('');
    const [routeFilterStatus, setRouteFilterStatus] = useState('all');
    const [routeFilterDriver, setRouteFilterDriver] = useState('');
    // Payroll works in ranges, not single days — default to the last 7 days.
    const [shiftFrom, setShiftFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().slice(0, 10);
    });
    const [shiftTo, setShiftTo] = useState(todayISO);
    const [shiftDriverId, setShiftDriverId] = useState<string>('all');
    /** Shift being corrected in the payroll dialog. */
    const [editingShift, setEditingShift] = useState<{ id: number; driverName: string; start: string; end: string } | null>(null);
    const [codDate, setCodDate] = useState(todayISO);
    const [dispatchFilters, setDispatchFilters] = useState<DispatchFilterState>({ ...EMPTY_DISPATCH_FILTERS });
    /** Quick city chip on the dispatch map — 'all' or a city name. */
    const [mapZone, setMapZone] = useState('all');
    /** Dispatch board driver filter — 'all' or a driver id. */
    const [dispatchDriver, setDispatchDriver] = useState('all');
    /** Expanded state of the "stuck routes" alert. */
    const [showStalled, setShowStalled] = useState(false);
    /** Opt-in to see already-failed orders in the dispatch unassigned panel. */
    const [showFailedUnassigned, setShowFailedUnassigned] = useState(false);

    // "Ubicar" dialog target (order without / with wrong coordinates)
    const [locateOrder, setLocateOrder] = useState<any | null>(null);
    // Which pin the dialog is correcting — the consignee (default) or the shipper/pickup address.
    const [locateTarget, setLocateTarget] = useState<'delivery' | 'shipper'>('delivery');

    // Manual stop reordering in route details
    const [reorderMode, setReorderMode] = useState(false);
    const [reorderStops, setReorderStops] = useState<SequencerStop[]>([]);

    // Live clock in the page subtitle — the board claims to be live, so the
    // timestamp has to actually move.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    // Forms
    const [newDriver, setNewDriver] = useState({
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: '',
        vehicleNumber: '',
        emiratesId: '',
        licenseNo: '',
    });

    // Queries
    const { data: dispatch, isLoading: dispatchLoading, refetch: refetchDispatch } =
        trpc.portal.drivers.getDispatchOverview.useQuery(
            {},
            { refetchInterval: 60_000 },
        );

    const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } =
        trpc.portal.drivers.getAllDrivers.useQuery();

    const { data: routes, isLoading: routesLoading, refetch: refetchRoutes } =
        trpc.portal.drivers.getAllRoutes.useQuery();

    const { data: reports, isLoading: reportsLoading, refetch: refetchReports } =
        trpc.portal.drivers.getAllReports.useQuery({});

    const { data: shiftReport, isLoading: shiftReportLoading, refetch: refetchShiftReport } =
        trpc.portal.drivers.getShiftReport.useQuery({
            from: shiftFrom,
            to: shiftTo,
            driverId: shiftDriverId === 'all' ? undefined : Number(shiftDriverId),
        });

    const { data: codRecon, isLoading: codLoading, refetch: refetchCod } =
        trpc.portal.drivers.getCodReconciliation.useQuery({ date: codDate }, { enabled: view === 'cod' });

    const { data: routeDetails, refetch: refetchRouteDetails } = trpc.portal.drivers.getRouteDetails.useQuery(
        { routeId: selectedRouteId || '' },
        { enabled: !!selectedRouteId }
    );

    const { data: availableOrders, refetch: refetchAvailableOrders } = trpc.portal.drivers.getAvailableOrders.useQuery(
        undefined,
        { enabled: addOrdersDialogOpen || view === 'dispatch' || (view === 'routes' && routesView === 'map') }
    );

    const pickableAvailableOrders = useMemo(
        () => pickableOrders(availableOrders as any[] | undefined, addOrders.map(o => o.id)),
        [availableOrders, addOrders],
    );

    const { data: driverProfile, isLoading: profileLoading } = trpc.portal.drivers.getDriverPerformance.useQuery(
        { driverId: profileDriverId || 0 },
        { enabled: !!profileDriverId }
    );

    // Master/detail: land on a driver instead of an empty panel.
    useEffect(() => {
        if (view === 'drivers' && profileDriverId === null && drivers && drivers.length > 0) {
            setProfileDriverId(drivers[0].id);
        }
    }, [view, profileDriverId, drivers]);

    // Filtered routes
    const filteredRoutes = useMemo(() => {
        if (!routes) return [];
        return routes.filter((r: any) => {
            if (routeFilterStatus !== 'all' && r.status !== routeFilterStatus) return false;
            if (routeFilterDate && !new Date(r.date).toISOString().startsWith(routeFilterDate)) return false;
            if (routeFilterDriver && !r.driver?.fullName?.toLowerCase().includes(routeFilterDriver.toLowerCase())) return false;
            return true;
        });
    }, [routes, routeFilterStatus, routeFilterDate, routeFilterDriver]);

    const routeStatusCounts = useMemo(() => {
        const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        for (const r of (routes as any[] | undefined) || []) {
            if (r.status in counts) counts[r.status as keyof typeof counts]++;
        }
        return counts;
    }, [routes]);

    // Mutations
    const createDriverMutation = trpc.portal.drivers.createDriver.useMutation({
        onSuccess: () => {
            toast.success('Driver created successfully');
            setCreateDriverDialogOpen(false);
            setNewDriver({ username: '', password: '', fullName: '', email: '', phone: '', vehicleNumber: '', emiratesId: '', licenseNo: '' });
            refetchDrivers();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateDriverMutation = trpc.portal.drivers.updateDriver.useMutation({
        onSuccess: () => {
            toast.success('Driver updated successfully');
            setEditDriverDialogOpen(false);
            setSelectedDriver(null);
            refetchDrivers();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteDriverMutation = trpc.portal.drivers.deleteDriver.useMutation({
        onSuccess: () => {
            toast.success('Driver deleted successfully');
            refetchDrivers();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateRouteStatusMutation = trpc.portal.drivers.updateRouteStatus.useMutation({
        onSuccess: () => {
            toast.success('Route status updated');
            refetchRoutes();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateReportStatusMutation = trpc.portal.drivers.updateReportStatus.useMutation({
        onSuccess: () => {
            toast.success('Report status updated');
            refetchReports();
        },
        onError: (error) => toast.error(error.message),
    });

    const addOrdersToRouteMutation = trpc.portal.drivers.addOrdersToRoute.useMutation({
        onSuccess: () => {
            toast.success('Orders added to route');
            setAddOrdersDialogOpen(false);
            setAddOrders([]);
            // Shared by the route-details picker and the dispatch board's assign flow.
            setAssignDialogOpen(false);
            setAssignRouteId('');
            setDispatchSelected([]);
            refetchRouteDetails();
            refetchRoutes();
            refetchAvailableOrders();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteRouteMutation = trpc.portal.drivers.deleteRoute.useMutation({
        onSuccess: () => {
            toast.success('Route deleted successfully');
            refetchRoutes();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteReportMutation = trpc.portal.drivers.deleteReport.useMutation({
        onSuccess: () => {
            toast.success('Report deleted successfully');
            refetchReports();
        },
        onError: (error) => toast.error(error.message),
    });

    const removeOrderFromRouteMutation = trpc.portal.drivers.removeOrderFromRoute.useMutation({
        onSuccess: () => {
            toast.success('Paquete eliminado de la ruta');
            refetchRouteDetails();
            refetchRoutes();
        },
        onError: (error) => toast.error(error.message),
    });

    const optimizeRouteMutation = trpc.portal.drivers.optimizeRoute.useMutation({
        onSuccess: (data) => {
            toast.success(`Ruta optimizada — ${data.optimized} paradas reordenadas`);
            refetchRouteDetails();
        },
        onError: (error) => toast.error(error.message),
    });

    const shiftMutationOptions = {
        onSuccess: () => {
            refetchShiftReport();
            refetchDispatch();
            setEditingShift(null);
        },
        onError: (error: { message: string }) => toast.error(error.message),
    };
    const updateShiftMutation = trpc.portal.drivers.updateShift.useMutation({
        ...shiftMutationOptions,
        onSuccess: () => { toast.success('Shift updated'); shiftMutationOptions.onSuccess(); },
    });
    const closeShiftMutation = trpc.portal.drivers.closeShift.useMutation({
        ...shiftMutationOptions,
        onSuccess: () => { toast.success('Shift closed'); shiftMutationOptions.onSuccess(); },
    });
    const deleteShiftMutation = trpc.portal.drivers.deleteShift.useMutation({
        ...shiftMutationOptions,
        onSuccess: () => { toast.success('Shift deleted'); shiftMutationOptions.onSuccess(); },
    });

    const markCashRemittedMutation = trpc.portal.drivers.markCashRemitted.useMutation({
        onSuccess: (data) => {
            toast.success(
                data.routes === 0
                    ? 'No pending cash on this date'
                    : `AED ${fmtAed(data.amount)} marked as remitted across ${data.routes} route${data.routes !== 1 ? 's' : ''}`
            );
            refetchCod();
            refetchDispatch();
        },
        onError: (error) => toast.error(error.message),
    });

    const { data: geoCaps } = trpc.portal.drivers.getGeoCapabilities.useQuery(undefined, {
        enabled: view === 'dispatch' || (view === 'routes' && routesView === 'map'),
        staleTime: 5 * 60 * 1000,
    });

    const geocodePendingMutation = trpc.portal.drivers.geocodePendingOrders.useMutation({
        onSuccess: (data) => {
            if (data.geocoded > 0) {
                toast.success(`${data.geocoded} pedido${data.geocoded !== 1 ? 's' : ''} ubicado${data.geocoded !== 1 ? 's' : ''} — ${data.remaining} restante${data.remaining !== 1 ? 's' : ''}`);
            } else {
                toast.info(`Sin resultados en este lote — ${data.remaining} pendiente${data.remaining !== 1 ? 's' : ''} (direcciones muy imprecisas: usar "Ubicar" manual)`);
            }
            refetchAvailableOrders();
        },
        onError: (error) => toast.error(error.message),
    });

    const reorderStopsMutation = trpc.portal.drivers.reorderRouteStops.useMutation({
        onSuccess: () => {
            toast.success('Secuencia guardada');
            setReorderMode(false);
            refetchRouteDetails();
        },
        onError: (error) => toast.error(error.message),
    });

    // Handlers
    const handleCreateDriver = () => {
        if (!newDriver.username || !newDriver.password || !newDriver.fullName) {
            toast.error('Username, password, and full name are required');
            return;
        }
        createDriverMutation.mutate({ ...newDriver });
    };

    const handleUpdateDriver = () => {
        if (!selectedDriver) return;
        updateDriverMutation.mutate({
            id: selectedDriver.id,
            fullName: selectedDriver.fullName || undefined,
            email: selectedDriver.email || undefined,
            phone: selectedDriver.phone || undefined,
            vehicleNumber: selectedDriver.vehicleNumber || undefined,
            emiratesId: selectedDriver.emiratesId || undefined,
            licenseNo: selectedDriver.licenseNo || undefined,
            status: selectedDriver.status || undefined,
        });
    };

    const handleDeleteDriver = (id: number, name: string) => {
        if (confirm(`Are you sure you want to delete driver "${name}"?`)) {
            deleteDriverMutation.mutate({ id });
        }
    };

    const handleUpdateReportStatus = (reportId: number, status: 'pending' | 'in_review' | 'resolved' | 'rejected') => {
        updateReportStatusMutation.mutate({ id: reportId, status });
    };

    const handleAddOrdersToRoute = () => {
        if (!selectedRouteId || addOrders.length === 0) {
            toast.error('Select at least one order');
            return;
        }

        addOrdersToRouteMutation.mutate({
            routeId: selectedRouteId,
            orders: addOrders,
        });
    };

    const handleDeleteRoute = (routeId: string) => {
        if (confirm(`Are you sure you want to delete route ${routeId}?`)) {
            deleteRouteMutation.mutate({ routeId });
        }
    };

    const handleDeleteReport = (id: number) => {
        if (confirm('Are you sure you want to delete this report?')) {
            deleteReportMutation.mutate({ id });
        }
    };

    const openQRForRoute = (routeId: string) => {
        setQrRouteId(routeId);
        setQrDialogOpen(true);
    };

    const openRouteDetails = (routeId: string) => {
        setSelectedRouteId(routeId);
        setReorderMode(false);
        setRouteDetailsDialogOpen(true);
    };

    const getStatusBadge = (status: string) => {
        const statusTones: Record<string, string> = {
            active: 'b-green',
            inactive: 'b-gray',
            suspended: 'b-red',
            pending: 'b-amber',
            in_progress: 'b-blue',
            completed: 'b-green',
            cancelled: 'b-gray',
            delivered: 'b-green',
            attempted: 'b-amber',
            returned: 'b-red',
            in_review: 'b-blue',
            resolved: 'b-green',
            rejected: 'b-red',
        };
        return (
            <span className={`badge2 ${statusTones[status] || 'b-gray'}`}>
                {status.replace('_', ' ')}
            </span>
        );
    };

    const formatActiveTime = (seconds: number | null) => {
        if (seconds === null || seconds === undefined) return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.round((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const getSuccessRateColor = (rate: number) => {
        if (rate >= 90) return 'text-[var(--st-green)]';
        if (rate >= 70) return 'text-[var(--st-amber)]';
        return 'text-primary';
    };

    // ── Shared derived data ────────────────────────────────────────────
    const driverList = (drivers as any[] | undefined) || [];
    const allAvailable = (availableOrders as any[] | undefined) || [];
    const ordersById = useMemo(() => new Map(allAvailable.map((o: any) => [o.id, o])), [allAvailable]);

    // The live map plots what is on the road right now — stops of in-progress
    // routes — not the unassigned pool. Those live in the panel beside it.
    const liveStops = dispatch?.liveStops || [];

    /**
     * Cities with the most stops currently on the road. Grouped through the
     * canonical city helper so "Abu Dhabi" and "Abu dhabi" are one chip, not two.
     */
    const zoneChips = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of liveStops) {
            const city = normalizeCity(s.city) ?? s.city;
            if (!city) continue;
            counts.set(city, (counts.get(city) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([city, count]) => ({ city, count }));
    }, [liveStops]);

    const toLiveMapPoints = (list: typeof liveStops): MapPoint[] =>
        list.map((s) => ({
            id: s.stopId,
            lat: s.lat,
            lng: s.lng,
            label: s.waybillNumber,
            // 'available' makes OrdersMap color the pin by stop status, which is
            // exactly what we want here: delivered green, moving blue, waiting amber,
            // problem red.
            kind: 'available' as PinKind,
            status: s.status,
            accuracy: s.accuracy,
            details: {
                customerName: s.customerName,
                city: s.city,
                codRequired: s.codRequired,
                codAmount: s.codAmount,
                type: s.type,
            },
        }));

    /**
     * Which legs an order shows on the dispatch map — the mode the admin picked
     * if it's selected, otherwise the server's default.
     *
     * A package that hasn't been collected yet deliberately shows ONLY its
     * pickup pin. Its delivery address is real but there is nothing there to
     * deliver until the driver has been to the shipper, and drawing it invites
     * assigning a drop-off for a parcel that isn't in the van. The delivery leg
     * still gets created (mode 'both') and appears in the route sequencer, which
     * is where the full trip is meant to be reviewed.
     *
     * Note 'both' is only ever offered while the pickup is still open, so this
     * is exactly the "not collected yet" case.
     */
    const plannedLegs = (o: any): Array<'pickup' | 'delivery'> => {
        const mode = dispatchSelected.find(s => s.id === o.id)?.mode ?? o.defaultMode ?? 'delivery_only';
        if (mode === 'both' || mode === 'pickup_only') return ['pickup'];
        return ['delivery'];
    };

    /** An order expanded into the stop(s) it would produce, positioned per leg. */
    interface PlannedStop { order: any; type: 'pickup' | 'delivery'; lat: number | null; lng: number | null; accuracy: string | null; }

    const toPlannedStops = (list: any[]): PlannedStop[] =>
        list.flatMap((o: any) => plannedLegs(o).map(type => {
            const c = stopLegCoords({ ...o, type });
            return { order: o, type, lat: c.lat, lng: c.lng, accuracy: c.accuracy };
        }));

    /**
     * One pin per leg, each at its OWN address: a pickup pins the shipper, a
     * delivery pins the consignee. Previously every pin used the consignee's
     * coordinates, so a pickup showed up at the customer's door — the map said
     * nothing about where the driver would actually be sent to collect.
     */
    const toMapPoints = (stops: PlannedStop[]): MapPoint[] =>
        stops
            .filter(s => s.lat !== null && s.lng !== null)
            .map(({ order: o, type, lat, lng, accuracy }) => ({
                id: `${o.id}:${type}`,
                lat: lat!,
                lng: lng!,
                label: o.waybillNumber || String(o.id),
                kind: (dispatchSelected.some(s => s.id === o.id)
                    ? 'selected'
                    : type === 'pickup' ? 'pickup' : 'delivery') as PinKind,
                status: o.status,
                accuracy,
                details: {
                    customerName: type === 'pickup' ? (o.shipperName || o.customerName) : o.customerName,
                    address: o.address,
                    city: type === 'pickup' ? (o.shipperCity || o.city) : o.city,
                    emirate: o.emirate,
                    pieces: o.pieces,
                    weight: o.weight,
                    serviceType: o.serviceType,
                    codRequired: o.codRequired,
                    codAmount: o.codAmount,
                    type,
                },
            }));

    /** Map pin ids carry their leg (`123:pickup`) — recover the order id. */
    const orderIdOfPin = (id: number | string) => Number(String(id).split(':')[0]);

    const toggleOrderSelection = (id: number) => {
        setDispatchSelected(prev => {
            if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
            const o = ordersById.get(id);
            return [...prev, { id, mode: (o?.defaultMode ?? 'delivery_only') as OrderMode }];
        });
    };

    const launchWizardWithSelection = () => {
        setPreloadedOrdersForWizard([...dispatchSelected]);
        setDispatchSelected([]);
        setCreateRouteWizardOpen(true);
    };

    /**
     * Routes an unassigned order can still be pushed onto from the dispatch board:
     * anything not finished or cancelled. Creating a *new* route is deliberately not
     * offered here — that belongs to the Routes view.
     */
    const assignableRoutes = useMemo(() => {
        return ((routes as any[] | undefined) || [])
            .filter(r => r.status === 'pending' || r.status === 'in_progress')
            .sort((a, b) => {
                if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });
    }, [routes]);

    const handleAssignToExistingRoute = () => {
        if (!assignRouteId) {
            toast.error('Pick a route first');
            return;
        }
        addOrdersToRouteMutation.mutate({ routeId: assignRouteId, orders: dispatchSelected });
    };

    /** Per-order stop-mode cards — shared by the dispatch board and the routes map. */
    const renderSelectionCards = () => {
        if (dispatchSelected.length === 0) return null;
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Selected for the route ({dispatchSelected.length})
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                    {dispatchSelected.map((sel) => {
                        const o = ordersById.get(sel.id);
                        if (!o) return null;
                        const canPickup = o.canPickup ?? true;
                        const canDeliver = o.canDeliver ?? true;
                        const canBoth = o.canBoth ?? (canPickup && canDeliver);
                        const modeMeta: { mode: OrderMode; label: string; enabled: boolean }[] = [
                            { mode: 'both', label: '🔄 Pickup + Delivery', enabled: canBoth },
                            { mode: 'pickup_only', label: '📦 Pickup only', enabled: canPickup },
                            { mode: 'delivery_only', label: '🚚 Delivery only', enabled: canDeliver },
                        ];
                        return (
                            <div key={sel.id} className="rounded-lg border border-border bg-[var(--surface-2)] p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-xs font-medium truncate">{o.waybillNumber}</span>
                                        {getStatusBadge(o.status)}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setDispatchSelected(prev => prev.filter(s => s.id !== sel.id))}
                                        className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                        aria-label="Remove from selection"
                                    >
                                        <XCircle className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-sm font-medium truncate">{o.customerName}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {[o.address, o.city].filter(Boolean).join(', ')}
                                </p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {modeMeta.map(({ mode, label, enabled }) => {
                                        const active = sel.mode === mode;
                                        return (
                                            <button
                                                key={mode}
                                                type="button"
                                                disabled={!enabled}
                                                onClick={() => enabled && setDispatchSelected(prev =>
                                                    prev.map(s => (s.id === sel.id ? { ...s, mode } : s))
                                                )}
                                                className={`min-w-0 py-1.5 px-1 rounded-md text-[11px] font-semibold border transition-all text-center leading-tight ${
                                                    active
                                                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                                        : enabled
                                                        ? 'bg-background border-input hover:border-primary/50 hover:bg-muted/40'
                                                        : 'bg-muted/30 border-border text-muted-foreground/40 cursor-not-allowed'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    /**
     * The selection bar. On the dispatch board the action is "put these on an
     * existing route"; in the Routes map it's "start a new route from these",
     * which keeps route creation where the design puts it.
     */
    const renderSelectionBanner = (action: 'assign' | 'create') => dispatchSelected.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-primary/10 border border-border flex-wrap">
            <span className="text-sm text-primary font-medium">
                {dispatchSelected.length} order{dispatchSelected.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDispatchSelected([])}>
                    Clear
                </Button>
                {action === 'assign' ? (
                    <Button size="sm" onClick={() => setAssignDialogOpen(true)}>
                        <Truck className="w-3.5 h-3.5 mr-1.5" />
                        Assign to route
                    </Button>
                ) : (
                    <Button size="sm" onClick={launchWizardWithSelection}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Create route with selection
                    </Button>
                )}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: DISPATCH
    // ═══════════════════════════════════════════════════════════════════
    const rosterAll = dispatch?.roster || [];
    const selectedDriverName = dispatchDriver === 'all'
        ? null
        : rosterAll.find(d => String(d.driverId) === dispatchDriver)?.driverName
            ?? driverList.find((d: any) => String(d.id) === dispatchDriver)?.fullName
            ?? null;

    // Driver filter narrows the map and the roster together, so the board always
    // reads as one coherent answer to "what is this driver doing right now".
    const driverLiveStops = selectedDriverName
        ? liveStops.filter(s => s.driverName === selectedDriverName)
        : liveStops;
    const zoneLiveStops = mapZone === 'all'
        ? driverLiveStops
        : driverLiveStops.filter(s => (normalizeCity(s.city) ?? s.city) === mapZone);
    // Same pool Create Route and Add Orders work from — this panel used to render the
    // raw getAvailableOrders() result, so it listed every already-failed order too and
    // showed more than twice as many rows as the other pickers.
    const unassignedOrders = pickableOrders(
        allAvailable,
        dispatchSelected.map(o => o.id),
        { includeFailed: showFailedUnassigned },
    );
    const hiddenFailedCount = countHiddenByDefault(allAvailable);
    const roster = dispatchDriver === 'all'
        ? rosterAll
        : rosterAll.filter(d => String(d.driverId) === dispatchDriver);
    const cashAlerts = dispatch?.cashAlerts || [];
    const failedStops = dispatch?.failedStops || [];
    const stalledRoutes = dispatch?.stalledRoutes || [];
    const staleShifts = dispatch?.staleShifts || [];
    /** Stops on stalled routes that genuinely still need someone — the part that isn't just a status. */
    const stalledPendingWork = stalledRoutes.reduce((sum, r) => sum + r.openStops, 0);
    /** Stalled routes that are safe to close outright: every stop already handled. */
    const stalledClosable = stalledRoutes.filter(r => r.openStops === 0).length;

    const renderDispatch = () => (
        <div className="space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Active Drivers</span>
                        <span className="ic"><Users className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{dispatch?.activeDrivers ?? 0}</div>
                    <div className="sub">on duty now</div>
                </div>

                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Active Routes</span>
                        <span className="ic"><RouteIcon className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{dispatch?.activeRoutes ?? 0}</div>
                    <div className="sub">today</div>
                </div>

                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Stops Remaining</span>
                        <span className="ic"><MapPin className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val text-[var(--st-amber)]">{dispatch?.stopsRemaining ?? 0}</div>
                    <div className="sub">across all routes</div>
                </div>

                <div className="kpi accent">
                    <div className="kt">
                        <span className="lab">COD to collect</span>
                        <span className="ic"><DollarSign className="w-[18px] h-[18px]" /></span>
                    </div>
                    {/* Money reads as mono here, unlike the Outfit numerals on the plain KPIs — same
                        treatment the design gives the accent card. */}
                    <div
                        className="val"
                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}
                    >
                        {fmtAed(dispatch?.codToCollect)}{' '}
                        <span className="text-[15px] opacity-60">AED</span>
                    </div>
                    <div className="sub">
                        {dispatch?.codDriversPending ?? 0} driver{(dispatch?.codDriversPending ?? 0) !== 1 ? 's' : ''} holding cash
                    </div>
                </div>
            </div>

            {/* driver filter — scopes the live map and the roster together */}
            <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[12.5px] text-muted-foreground">Showing</span>
                <Select value={dispatchDriver} onValueChange={(v) => { setDispatchDriver(v); setMapZone('all'); }}>
                    <SelectTrigger className="h-9 w-[210px] text-[13px] bg-card border-border">
                        <SelectValue placeholder="All drivers" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All drivers</SelectItem>
                        {rosterAll.map(d => (
                            <SelectItem key={d.driverId} value={String(d.driverId)}>
                                {d.driverName}{d.dutyState === 'active' ? ' · on duty' : ''}
                            </SelectItem>
                        ))}
                        {/* Drivers with no route and no open shift still belong in the list —
                            picking one is how you confirm they have nothing going on. */}
                        {driverList
                            .filter((d: any) => !rosterAll.some(r => r.driverId === d.id))
                            .map((d: any) => (
                                <SelectItem key={d.id} value={String(d.id)}>{d.fullName}</SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                {dispatchDriver !== 'all' && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDispatchDriver('all')}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Clear filter
                    </Button>
                )}
                {selectedDriverName && driverLiveStops.length === 0 && (
                    <span className="text-[12.5px] text-muted-foreground">
                        {selectedDriverName} has no route on the road right now.
                    </span>
                )}
            </div>

            {/* main grid — live map + right column */}
            <div className="grid gap-4 xl:[grid-template-columns:1.62fr_1fr]">
                {/* MAP */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col min-w-0">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                        <span className="font-display font-semibold text-[14.5px] mr-1 inline-flex items-center gap-2">
                            <MapIcon className="w-[18px] h-[18px] text-primary" /> Live map
                        </span>
                        <button
                            onClick={() => setMapZone('all')}
                            className={`px-[11px] py-[5px] rounded-full text-xs font-display font-semibold transition-colors ${
                                mapZone === 'all'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-[var(--surface-2)] text-[var(--ink-2)] border border-border'
                            }`}
                        >
                            All
                        </button>
                        {zoneChips.map(({ city, count }) => (
                            <button
                                key={city}
                                onClick={() => setMapZone(mapZone === city ? 'all' : city)}
                                className={`px-[11px] py-[5px] rounded-full text-xs font-display font-semibold transition-colors ${
                                    mapZone === city
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-[var(--surface-2)] text-[var(--ink-2)] border border-border'
                                }`}
                            >
                                {city} · {count}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 relative min-h-[420px]">
                        {zoneLiveStops.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground px-6 text-center">
                                <RouteIcon className="w-8 h-8 opacity-30" />
                                <p className="text-sm">
                                    {liveStops.length === 0
                                        ? 'No routes on the road right now'
                                        : 'No stops on the road in this zone'}
                                </p>
                                <p className="text-xs">
                                    The live map only shows stops of routes a driver has started.
                                </p>
                            </div>
                        ) : (
                            <OrdersMap
                                points={toLiveMapPoints(zoneLiveStops)}
                                onPointClick={(stopId) => {
                                    const stop = zoneLiveStops.find(s => s.stopId === stopId);
                                    if (stop) openRouteDetails(stop.routeId);
                                }}
                                className="absolute inset-0 h-full w-full rounded-none border-0"
                            />
                        )}

                        {/* legend — pins are colored by STOP status; there is no driver GPS feed */}
                        <div className="absolute bottom-3.5 left-3.5 z-10 inline-flex items-center gap-4 bg-card border border-border rounded-xl px-3.5 py-2.5 shadow-lg text-xs font-display font-semibold text-[var(--ink-2)]">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--st-green)]" />Delivered
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--st-blue)]" />On the way
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-[var(--st-amber)]" />Waiting
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary" />Problem
                            </span>
                        </div>

                        {zoneLiveStops.length > 0 && (
                            <div className="absolute top-3.5 right-3.5 z-10 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-[15px] py-2 shadow-lg text-[13px] font-display font-bold">
                                <RouteIcon className="w-4 h-4" />
                                {zoneLiveStops.length} stop{zoneLiveStops.length !== 1 ? 's' : ''} · {dispatch?.liveRouteCount ?? 0} route{(dispatch?.liveRouteCount ?? 0) !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* right column */}
                <div className="flex flex-col gap-4 min-w-0">
                    {/* unassigned orders */}
                    <div className="bg-card border border-border rounded-2xl overflow-hidden flex-none">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <span className="font-display font-semibold text-[14.5px] inline-flex items-center gap-2">
                                <Inbox className="w-[18px] h-[18px] text-primary" /> Unassigned orders
                            </span>
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                                {unassignedOrders.length}
                            </span>
                        </div>
                        {/* The default pool hides already-failed orders, but never silently:
                            they are retryable, so the count and the way back stay visible. */}
                        {hiddenFailedCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowFailedUnassigned(v => !v)}
                                className="w-full px-4 py-2 border-b border-border text-left text-[11.5px] text-muted-foreground hover:bg-[var(--surface-2)] transition-colors flex items-center gap-1.5"
                            >
                                {showFailedUnassigned ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                {showFailedUnassigned
                                    ? `Including ${hiddenFailedCount} previously failed — hide`
                                    : `${hiddenFailedCount} previously failed order${hiddenFailedCount !== 1 ? 's' : ''} hidden — show`}
                            </button>
                        )}
                        <div className="p-2.5 flex flex-col gap-2 max-h-[224px] overflow-y-auto">
                            {unassignedOrders.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">
                                    Nothing waiting for a route.
                                </p>
                            ) : unassignedOrders.slice(0, 60).map((o: any) => {
                                const selected = dispatchSelected.some(s => s.id === o.id);
                                return (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => toggleOrderSelection(o.id)}
                                        // shrink-0: inside a scrolling flex column the rows would
                                        // otherwise compress into each other once the list overflows.
                                        className={`flex shrink-0 items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                                            selected
                                                ? 'border border-dashed border-primary bg-primary/10'
                                                : 'border border-border bg-[var(--surface-2)] hover:border-primary/40'
                                        }`}
                                    >
                                        <span className={`w-[18px] h-[18px] rounded-md border flex-none grid place-items-center ${
                                            selected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                                        }`}>
                                            {selected && <CheckCircle2 className="w-3 h-3" />}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block font-mono font-bold text-[12.5px] truncate">{o.waybillNumber}</span>
                                            <span className="block text-[11.5px] text-muted-foreground truncate">
                                                {[o.city, o.weight ? `${o.weight} kg` : null].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        {o.codRequired === 1 && (
                                            <span className="font-mono text-[11px] font-bold text-[var(--st-amber)] bg-[var(--st-amber-bg)] px-2 py-0.5 rounded-md flex-none">
                                                COD {fmtAed(o.codAmount)}
                                            </span>
                                        )}
                                        {/* Unassigned orders no longer appear on the live map, so a
                                            missing pin has to be visible (and fixable) from this list. */}
                                        {(!o.latitude || !o.longitude) && (
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                title="No location — click to place a pin"
                                                onClick={(e) => { e.stopPropagation(); setLocateTarget('delivery'); setLocateOrder(o); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault(); e.stopPropagation();
                                                        setLocateTarget('delivery'); setLocateOrder(o);
                                                    }
                                                }}
                                                className="flex-none grid place-items-center w-6 h-6 rounded-md text-[var(--st-amber)] bg-[var(--st-amber-bg)] hover:opacity-80"
                                            >
                                                <MapPinOff className="w-3.5 h-3.5" />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* roster */}
                    <div className="bg-card border border-border rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <span className="font-display font-semibold text-[14.5px] inline-flex items-center gap-2">
                                <Users className="w-[18px] h-[18px]" /> Drivers on duty
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                                {dispatch?.activeDrivers ?? 0} active
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[300px]">
                            {dispatchLoading ? (
                                <p className="text-center py-8 text-sm text-muted-foreground">Loading roster…</p>
                            ) : roster.length === 0 ? (
                                <p className="text-center py-8 text-sm text-muted-foreground">No routes assigned today</p>
                            ) : roster.map((d) => (
                                <button
                                    key={d.driverId}
                                    type="button"
                                    onClick={() => { setProfileDriverId(d.driverId); setView('drivers'); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-[var(--surface-2)] transition-colors text-left"
                                >
                                    <span className="w-[38px] h-[38px] rounded-xl bg-[var(--surface-2)] grid place-items-center font-display font-bold text-[13px] relative flex-none">
                                        {d.initials}
                                        <span
                                            className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] rounded-full border-2 border-card"
                                            style={{ background: d.dutyState === 'active' ? 'var(--st-green)' : 'var(--st-gray)' }}
                                        />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-display font-semibold text-[13.5px] truncate">{d.driverName}</span>
                                        {/* Spell the state out. A green dot plus "No route" read as
                                            "this driver is out delivering", which is how a merely
                                            clocked-in driver looked like one on the road. */}
                                        <span className="block text-[11.5px] text-muted-foreground font-mono truncate">
                                            {d.onDutySince
                                                ? `Clocked in ${new Date(d.onDutySince).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                                                : 'Not clocked in'}
                                            {d.vehicleNumber ? ` · ${d.vehicleNumber}` : ''}
                                        </span>
                                    </span>
                                    <span className="text-right flex-none">
                                        {d.totalStops > 0 ? (
                                            <>
                                                <span className={`block font-mono font-bold text-[13px] ${d.dutyState === 'active' ? 'text-[var(--st-green)]' : 'text-muted-foreground'}`}>
                                                    {d.delivered}/{d.totalStops}
                                                </span>
                                                <span className="block text-[11px] text-muted-foreground">
                                                    {d.codCollected > 0 ? `AED ${fmtAed(d.codCollected)}` : 'No COD'}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="block font-display font-semibold text-[12px] text-[var(--st-amber)]">
                                                    Available
                                                </span>
                                                <span className="block text-[11px] text-muted-foreground">no route assigned</span>
                                            </>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {renderSelectionBanner('assign')}

            {/* alerts strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {failedStops.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--st-amber-bg)] border border-[color-mix(in_srgb,var(--st-amber)_30%,transparent)]">
                        <AlertTriangle className="w-5 h-5 text-[var(--st-amber)] flex-none" />
                        <div className="text-[13px] min-w-0">
                            <b className="font-display">Failed attempt</b>
                            {' · '}
                            <span className="text-muted-foreground">
                                {failedStops[0].driverName}, {failedStops[0].waybillNumber}
                                {failedStops.length > 1 && ` +${failedStops.length - 1} more`}
                            </span>
                        </div>
                    </div>
                )}
                {cashAlerts.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary/10 border border-[color-mix(in_srgb,var(--primary)_28%,transparent)]">
                        <DollarSign className="w-5 h-5 text-primary flex-none" />
                        <div className="text-[13px] min-w-0">
                            <b className="font-display">Cash &gt; {fmtAed(dispatch?.cashAlertThreshold)} AED</b>
                            {' · '}
                            <span className="text-muted-foreground">
                                {cashAlerts.length} driver{cashAlerts.length !== 1 ? 's' : ''} must remit
                            </span>
                        </div>
                    </div>
                )}
                {(dispatch?.unassignedRoutes ?? 0) > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--st-blue-bg)] border border-[color-mix(in_srgb,var(--st-blue)_28%,transparent)]">
                        <RouteIcon className="w-5 h-5 text-[var(--st-blue)] flex-none" />
                        <div className="text-[13px] min-w-0">
                            <b className="font-display">Unassigned routes</b>
                            {' · '}
                            <span className="text-muted-foreground">
                                {dispatch!.unassignedRoutes} route{dispatch!.unassignedRoutes !== 1 ? 's' : ''} without a driver
                            </span>
                        </div>
                    </div>
                )}
                {/* Shifts nobody closed. These are excluded from "on duty" upstream, so the
                    board no longer shows the driver as working — but the miss still has to
                    be corrected or it inflates their payroll hours. */}
                {staleShifts.length > 0 && (
                    <div className="md:col-span-3 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--st-amber-bg)] border border-[color-mix(in_srgb,var(--st-amber)_30%,transparent)] flex-wrap">
                        <Clock className="w-5 h-5 text-[var(--st-amber)] flex-none" />
                        <div className="text-[13px] min-w-0 flex-1">
                            <b className="font-display">
                                {staleShifts.length} driver{staleShifts.length !== 1 ? 's' : ''} never clocked out
                            </b>
                            <div className="text-muted-foreground mt-0.5">
                                {staleShifts.slice(0, 3).map(s => `${s.driverName} (${s.hoursOpen}h)`).join(', ')}
                                {staleShifts.length > 3 && ` +${staleShifts.length - 3}`}
                                {' — '}open longer than {dispatch?.staleShiftHours ?? 16}h, so they are not counted as on duty.
                                Fix the clock-out in Shifts before running payroll.
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 text-xs flex-none" onClick={() => setView('shifts')}>
                            Go to Shifts
                        </Button>
                    </div>
                )}

                {/* Routes nobody is working: the driver clocked out (or never in) without
                    closing them. Expandable, because "6 routes stuck" on its own doesn't
                    tell an operator whether there's real work outstanding or just a status
                    left behind — openStops is the difference, so it leads. */}
                {stalledRoutes.length > 0 && (
                    <div className="md:col-span-3 rounded-xl bg-[var(--st-amber-bg)] border border-[color-mix(in_srgb,var(--st-amber)_30%,transparent)] overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowStalled(v => !v)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                        >
                            <AlertCircle className="w-5 h-5 text-[var(--st-amber)] flex-none" />
                            <div className="text-[13px] min-w-0 flex-1">
                                <b className="font-display">
                                    {stalledRoutes.length} route{stalledRoutes.length !== 1 ? 's' : ''} still marked "in progress" with nobody on duty
                                </b>
                                <div className="text-muted-foreground mt-0.5">
                                    {stalledPendingWork === 0
                                        ? 'All stops on these routes were completed — only the route status was never closed.'
                                        : `${stalledPendingWork} stop${stalledPendingWork !== 1 ? 's' : ''} on these routes still need handling; the rest are only missing their closing status.`}
                                </div>
                            </div>
                            {showStalled
                                ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-none" />
                                : <ChevronDown className="w-4 h-4 text-muted-foreground flex-none" />}
                        </button>

                        {showStalled && (
                            <div className="border-t border-[color-mix(in_srgb,var(--st-amber)_25%,transparent)]">
                                {stalledRoutes.map(r => (
                                    <div key={r.routeId} className="flex items-center gap-3 px-4 py-2.5 border-b border-[color-mix(in_srgb,var(--st-amber)_15%,transparent)] last:border-b-0 flex-wrap">
                                        <button
                                            onClick={() => openRouteDetails(r.routeId)}
                                            className="font-mono text-[12.5px] font-bold hover:text-primary transition-colors"
                                        >
                                            {r.routeId}
                                        </button>
                                        <span className="text-[12.5px] text-muted-foreground flex-1 min-w-[180px]">
                                            {r.driverName} · {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        <span className={`text-[12px] font-mono ${r.openStops > 0 ? 'text-[var(--st-amber)] font-bold' : 'text-muted-foreground'}`}>
                                            {r.openStops > 0
                                                ? `${r.openStops} of ${r.totalStops} stops still open`
                                                : `all ${r.totalStops} stops done`}
                                        </span>
                                        {r.openStops === 0 ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                disabled={updateRouteStatusMutation.isPending}
                                                onClick={() => updateRouteStatusMutation.mutate({ routeId: r.routeId, status: 'completed' })}
                                            >
                                                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Close route
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => openRouteDetails(r.routeId)}
                                            >
                                                Review stops
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                {stalledClosable > 1 && (
                                    <div className="px-4 py-2.5 flex justify-end">
                                        <Button
                                            size="sm"
                                            className="h-8 text-xs"
                                            disabled={updateRouteStatusMutation.isPending}
                                            onClick={() => {
                                                const targets = stalledRoutes.filter(r => r.openStops === 0);
                                                if (!confirm(`Close ${targets.length} routes whose stops are all done?`)) return;
                                                targets.forEach(r => updateRouteStatusMutation.mutate({ routeId: r.routeId, status: 'completed' }));
                                            }}
                                        >
                                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Close all {stalledClosable} finished routes
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {failedStops.length === 0 && cashAlerts.length === 0 && stalledRoutes.length === 0
                    && staleShifts.length === 0 && (dispatch?.unassignedRoutes ?? 0) === 0 && !dispatchLoading && (
                    <div className="md:col-span-3 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--st-green-bg)] border border-[color-mix(in_srgb,var(--st-green)_28%,transparent)]">
                        <ShieldCheck className="w-5 h-5 text-[var(--st-green)] flex-none" />
                        <div className="text-[13px]">
                            <b className="font-display">All clear</b>
                            {' · '}
                            <span className="text-muted-foreground">No failed stops, stuck routes, unassigned routes or cash alerts</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: ROUTES
    // ═══════════════════════════════════════════════════════════════════
    const renderRoutesMap = () => {
        const filtered = filterAvailableOrders(allAvailable, dispatchFilters);
        // Missing coordinates are now judged PER LEG: an order can have the
        // customer's pin and still have no idea where its pickup is.
        const planned = toPlannedStops(filtered);
        const withCoords = planned.filter(s => s.lat !== null && s.lng !== null);
        const withoutCoords = planned.filter(s => s.lat === null || s.lng === null);

        return (
            <div className="space-y-3">
                <DispatchFilters
                    value={dispatchFilters}
                    onChange={setDispatchFilters}
                    statuses={distinctStatuses(allAvailable)}
                    emirates={distinctEmirates(allAvailable)}
                    shown={filtered.length}
                    total={allAvailable.length}
                />
                {renderSelectionBanner('create')}
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                        {withCoords.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[520px] gap-2 text-muted-foreground rounded-xl border border-border">
                                <MapPin className="w-8 h-8 opacity-30" />
                                <p className="text-sm">Ningún pedido filtrado tiene coordenadas</p>
                                <p className="text-xs">Usa "Ubicar" en el panel para ponerles pin</p>
                            </div>
                        ) : (
                            <OrdersMap
                                points={toMapPoints(withCoords)}
                                onPointClick={(id) => toggleOrderSelection(orderIdOfPin(id))}
                                onEditLocation={(id) => {
                                    const o = ordersById.get(orderIdOfPin(id));
                                    if (!o) return;
                                    // Correct the pin the marker actually stands for.
                                    const type = String(id).endsWith(':pickup') ? 'pickup' : 'delivery';
                                    setLocateTarget(stopLocationTarget({ type, isReturn: o.isReturn }));
                                    setLocateOrder(o);
                                }}
                                className="h-[520px]"
                            />
                        )}
                        <p className="text-xs text-muted-foreground text-center mt-2">
                            Cada pin está en su propia dirección: <span className="text-[var(--st-green)] font-medium">verde = recogida (remitente)</span> · <span className="text-[var(--st-blue)] font-medium">azul = entrega (cliente)</span>.
                            Un paquete sin recoger solo muestra su recogida — la entrega aparece cuando esté en la furgoneta.
                            <br />
                            Clic para seleccionar (✓) · pines abiertos en abanico = varias paradas en la misma dirección · borde punteado = ubicación aproximada.
                        </p>
                    </div>

                    {/* Pedidos sin ubicación — nunca se ocultan en silencio */}
                    <div className="rounded-xl border border-border flex flex-col max-h-[520px] min-w-0">
                        <div className="p-3 border-b border-border space-y-2">
                            {withoutCoords.length > 0 ? (
                                <span className="badge2 b-amber">
                                    <MapPinOff className="w-3 h-3 mr-1" />
                                    {withoutCoords.length} parada{withoutCoords.length !== 1 ? 's' : ''} sin ubicación
                                </span>
                            ) : (
                                <span className="badge2 b-green">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Todas las paradas tienen ubicación
                                </span>
                            )}
                            {geoCaps?.geocoding && withoutCoords.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs"
                                    disabled={geocodePendingMutation.isPending}
                                    onClick={() => geocodePendingMutation.mutate({ limit: 25 })}
                                >
                                    {geocodePendingMutation.isPending
                                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Geocodificando...</>
                                        : <><MapPin className="w-3.5 h-3.5 mr-1.5" /> Geocodificar direcciones</>}
                                </Button>
                            )}
                            {!geoCaps?.geocoding && withoutCoords.length > 0 && (
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    Geocodificación automática no configurada (GOOGLE_MAPS_API_KEY) — ubica manualmente con "Ubicar".
                                </p>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-border">
                            {withoutCoords.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-8 px-3">
                                    Todas las paradas filtradas aparecen en el mapa.
                                </p>
                            ) : withoutCoords.map(({ order: o, type }) => {
                                const isPickup = type === 'pickup';
                                return (
                                    <div key={`${o.id}:${type}`} className="p-3 space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-xs font-medium truncate">{o.waybillNumber}</span>
                                            {getStatusBadge(o.status)}
                                        </div>
                                        <p className={`text-[10px] font-bold uppercase ${isPickup ? 'text-[var(--st-green)]' : 'text-[var(--st-blue)]'}`}>
                                            {isPickup ? 'Falta ubicación de recogida' : 'Falta ubicación de entrega'}
                                        </p>
                                        <p className="text-sm font-medium truncate">
                                            {isPickup ? (o.shipperName || o.customerName) : o.customerName}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {(isPickup
                                                ? [o.shipperCity, o.emirate]
                                                : [o.address, o.city, o.emirate]
                                            ).filter(Boolean).join(', ')}
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs w-full mt-1"
                                            onClick={() => {
                                                setLocateTarget(stopLocationTarget({ type, isReturn: o.isReturn }));
                                                setLocateOrder(o);
                                            }}
                                        >
                                            <MapPin className="w-3 h-3 mr-1" /> Ubicar
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {renderSelectionCards()}
            </div>
        );
    };

    const renderRoutes = () => (
        <div className="space-y-4">
            {/* status chips + toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                    <span className="badge2 b-amber">Pending · {routeStatusCounts.pending}</span>
                    <span className="badge2 b-blue">In progress · {routeStatusCounts.in_progress}</span>
                    <span className="badge2 b-green">Completed · {routeStatusCounts.completed}</span>
                    {routeStatusCounts.cancelled > 0 && (
                        <span className="badge2 b-gray">Cancelled · {routeStatusCounts.cancelled}</span>
                    )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="h-9 inline-flex items-center gap-2 px-3 border border-border rounded-lg bg-card">
                        <Calendar className="w-4 h-4 text-muted-foreground flex-none" />
                        <input
                            type="date"
                            value={routeFilterDate}
                            onChange={(e) => setRouteFilterDate(e.target.value)}
                            className="bg-transparent text-[13px] outline-none text-foreground w-[120px]"
                        />
                    </div>
                    <Select value={routeFilterStatus} onValueChange={setRouteFilterStatus}>
                        <SelectTrigger className="h-9 w-[150px] text-[13px] bg-card border-border">
                            <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="h-9 inline-flex items-center gap-2 px-3 border border-border rounded-lg bg-card">
                        <Search className="w-4 h-4 text-muted-foreground flex-none" />
                        <input
                            value={routeFilterDriver}
                            onChange={(e) => setRouteFilterDriver(e.target.value)}
                            placeholder="Search driver..."
                            className="bg-transparent text-[13px] outline-none text-foreground w-[130px] placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="inline-flex p-[3px] rounded-lg bg-[var(--surface-2)] border border-border">
                        {(['list', 'map'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setRoutesView(v)}
                                className={`px-[11px] py-[5px] rounded-md font-display font-semibold text-xs transition-colors ${
                                    routesView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                                }`}
                            >
                                {v === 'list' ? 'List' : 'Map'}
                            </button>
                        ))}
                    </div>
                    <Button
                        className="h-9"
                        onClick={() => { setPreloadedOrdersForWizard([]); setCreateRouteWizardOpen(true); }}
                    >
                        <Plus className="mr-1.5 h-4 w-4" /> New route
                    </Button>
                </div>
            </div>

            {routesView === 'map' ? renderRoutesMap() : (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <div className="min-w-[1000px]">
                            <div
                                className="grid gap-3 px-[18px] py-3 bg-[var(--surface-2)] border-b border-border"
                                style={{ gridTemplateColumns: ROUTES_GRID }}
                            >
                                <div style={thStyle}>Route ID</div>
                                <div style={thStyle}>Date</div>
                                <div style={thStyle}>Driver</div>
                                <div style={thStyle}>Zone</div>
                                <div style={thStyle}>Stops</div>
                                <div style={thStyle} title="COD assigned to the route, delivered or not — see Shifts for what was actually collected">COD due</div>
                                <div style={thStyle}>Status</div>
                                <div style={{ ...thStyle, textAlign: 'right' }}>Actions</div>
                            </div>

                            {routesLoading ? (
                                <p className="text-center py-10 text-muted-foreground">Loading routes...</p>
                            ) : filteredRoutes.length === 0 ? (
                                <p className="text-center py-10 text-muted-foreground">No routes found</p>
                            ) : filteredRoutes.map((route: any) => (
                                <div
                                    key={route.id}
                                    className="grid gap-3 px-[18px] py-3.5 border-b border-border last:border-b-0 items-center hover:bg-[var(--surface-2)] transition-colors"
                                    style={{ gridTemplateColumns: ROUTES_GRID }}
                                >
                                    <button
                                        onClick={() => openRouteDetails(route.id)}
                                        className="font-mono font-bold text-[12.5px] text-left hover:text-primary transition-colors truncate"
                                    >
                                        {route.id}
                                    </button>
                                    <div className="text-[13px] text-[var(--ink-2)]">
                                        {new Date(route.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                    </div>
                                    <div className="text-[13px] font-medium truncate">
                                        {route.driver?.fullName || <span className="text-muted-foreground italic font-normal">Unassigned</span>}
                                    </div>
                                    <div className="text-[13px] text-[var(--ink-2)] truncate">{zoneLabel(route.zone) || '—'}</div>
                                    <div className="font-mono text-[12.5px]">
                                        <span className="text-[var(--st-green)] font-bold">{route.deliveryStats?.delivered || 0}</span>
                                        <span className="text-muted-foreground">/{route.deliveryStats?.total || 0}</span>
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        {route.codTotal > 0 && (
                                            <span className="font-mono text-[11px] font-bold text-[var(--st-amber)] bg-[var(--st-amber-bg)] px-2 py-0.5 rounded-md">
                                                {fmtAed(route.codTotal)}
                                            </span>
                                        )}
                                        {route.returnCount > 0 && (
                                            <RotateCcw className="w-[15px] h-[15px] text-[var(--st-amber)]" aria-label={`${route.returnCount} returns`} />
                                        )}
                                        {!route.codTotal && !route.returnCount && <span className="text-muted-foreground text-xs">—</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {getStatusBadge(route.status)}
                                        {route.status === 'pending' && (
                                            <button
                                                title="Mark In Progress"
                                                className="h-6 w-6 grid place-items-center rounded text-[var(--st-blue)] hover:bg-[var(--st-blue-bg)]"
                                                onClick={() => updateRouteStatusMutation.mutate({ routeId: route.id, status: 'in_progress' })}
                                            >
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        {route.status === 'in_progress' && (
                                            <button
                                                title="Mark Completed"
                                                className="h-6 w-6 grid place-items-center rounded text-[var(--st-green)] hover:bg-[var(--st-green-bg)]"
                                                onClick={() => updateRouteStatusMutation.mutate({ routeId: route.id, status: 'completed' })}
                                            >
                                                <CheckCircle className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-1 justify-end text-muted-foreground">
                                        <button title="Show QR code" onClick={() => openQRForRoute(route.id)} className="p-1 rounded hover:bg-muted/50">
                                            <QrCode className="h-[18px] w-[18px] text-primary" />
                                        </button>
                                        <button title="View details" onClick={() => openRouteDetails(route.id)} className="p-1 rounded hover:bg-muted/50">
                                            <Eye className="h-[18px] w-[18px]" />
                                        </button>
                                        <button title="Delete route" onClick={() => handleDeleteRoute(route.id)} className="p-1 rounded hover:bg-muted/50 hover:text-primary">
                                            <Trash2 className="h-[18px] w-[18px]" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: DRIVERS (master / detail)
    // ═══════════════════════════════════════════════════════════════════
    const avgSuccessRate = useMemo(() => {
        const rated = driverList.filter(d => d.stats?.successRate !== null && d.stats?.successRate !== undefined);
        if (rated.length === 0) return null;
        return Math.round(rated.reduce((sum, d) => sum + d.stats.successRate, 0) / rated.length);
    }, [driverList]);

    const rosterById = useMemo(
        () => new Map(roster.map(r => [r.driverId, r])),
        [roster],
    );
    const activeRouteForProfile = useMemo(() => {
        if (!profileDriverId || !routes) return null;
        return (routes as any[])
            .filter(r => r.driverId === profileDriverId && r.status === 'in_progress')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
    }, [routes, profileDriverId]);

    const renderDrivers = () => {
        const liveEntry = profileDriverId ? rosterById.get(profileDriverId) : undefined;
        const rate = driverProfile?.stats.successRate ?? 0;
        const progress = activeRouteForProfile
            ? Math.round(((activeRouteForProfile.deliveryStats?.delivered || 0) / Math.max(1, activeRouteForProfile.deliveryStats?.total || 0)) * 100)
            : null;

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="bg-card border border-border rounded-2xl px-[18px] py-4">
                        <div className="text-[12.5px] text-muted-foreground">Total drivers</div>
                        <div className="font-display font-semibold text-[28px] mt-1.5">{driverList.length}</div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl px-[18px] py-4">
                        <div className="text-[12.5px] text-muted-foreground">On duty now</div>
                        <div className="font-display font-semibold text-[28px] mt-1.5 text-[var(--st-green)]">{dispatch?.activeDrivers ?? 0}</div>
                    </div>
                    <div className="bg-card border border-border rounded-2xl px-[18px] py-4">
                        <div className="text-[12.5px] text-muted-foreground">Avg. success rate</div>
                        <div className="font-display font-semibold text-[28px] mt-1.5">
                            {avgSuccessRate === null ? '—' : `${avgSuccessRate}%`}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 xl:[grid-template-columns:1.15fr_1fr] items-start">
                    {/* table */}
                    <div className="bg-card border border-border rounded-2xl overflow-hidden min-w-0">
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <span className="font-display font-semibold text-[14.5px]">Drivers</span>
                            <Button size="sm" className="h-8" onClick={() => setCreateDriverDialogOpen(true)}>
                                <Plus className="mr-1.5 h-[15px] w-[15px]" /> Add Driver
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <div className="min-w-[520px]">
                                <div
                                    className="grid gap-2.5 px-4 py-2.5 bg-[var(--surface-2)] border-b border-border"
                                    style={{ gridTemplateColumns: DRIVERS_GRID }}
                                >
                                    <div style={thStyle}>User</div>
                                    <div style={thStyle}>Name</div>
                                    <div style={thStyle}>Vehicle</div>
                                    <div style={thStyle}>Status</div>
                                    <div style={{ ...thStyle, textAlign: 'right' }}>Act</div>
                                </div>
                                {driversLoading ? (
                                    <p className="text-center py-10 text-muted-foreground">Loading drivers...</p>
                                ) : driverList.length === 0 ? (
                                    <p className="text-center py-10 text-muted-foreground">No drivers found</p>
                                ) : driverList.map((driver: any) => {
                                    const selected = driver.id === profileDriverId;
                                    return (
                                        <div
                                            key={driver.id}
                                            onClick={() => setProfileDriverId(driver.id)}
                                            className={`grid gap-2.5 px-4 py-3 border-b border-border last:border-b-0 items-center cursor-pointer transition-colors ${
                                                selected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'
                                            }`}
                                            style={{ gridTemplateColumns: DRIVERS_GRID }}
                                        >
                                            <div className="font-mono text-xs text-[var(--ink-2)] truncate">{driver.username}</div>
                                            <div className={`text-[13px] font-semibold flex items-center gap-1.5 truncate ${selected ? 'text-primary' : ''}`}>
                                                <span className="truncate">{driver.fullName}</span>
                                                <BarChart2 className="w-[13px] h-[13px] opacity-60 flex-none" />
                                            </div>
                                            <div className="font-mono text-xs text-[var(--ink-2)] truncate">{driver.vehicleNumber || '—'}</div>
                                            <div>{getStatusBadge(driver.status)}</div>
                                            <div className="flex gap-0.5 justify-end text-muted-foreground">
                                                <button
                                                    title="Edit driver"
                                                    onClick={(e) => { e.stopPropagation(); setSelectedDriver({ ...driver }); setEditDriverDialogOpen(true); }}
                                                    className="p-1 rounded hover:bg-muted/50"
                                                >
                                                    <Edit className="h-[17px] w-[17px]" />
                                                </button>
                                                <button
                                                    title="Delete driver"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteDriver(driver.id, driver.fullName); }}
                                                    className="p-1 rounded hover:bg-muted/50 hover:text-primary"
                                                >
                                                    <Trash2 className="h-[17px] w-[17px]" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* profile panel */}
                    <div className="bg-card border border-border rounded-2xl overflow-hidden min-w-0">
                        {!profileDriverId ? (
                            <p className="text-center py-16 text-sm text-muted-foreground">Select a driver to see their profile</p>
                        ) : profileLoading || !driverProfile ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                <div className="p-[18px] border-b border-border flex items-center gap-3.5">
                                    <span className="w-[54px] h-[54px] rounded-[15px] bg-[var(--surface-2)] grid place-items-center font-display font-bold text-xl relative flex-none">
                                        {initialsOf(driverProfile.driver.fullName)}
                                        <span
                                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-card"
                                            style={{ background: liveEntry?.dutyState === 'active' ? 'var(--st-green)' : 'var(--st-gray)' }}
                                        />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-display font-bold text-[19px] truncate">{driverProfile.driver.fullName}</div>
                                        <div className="text-xs text-muted-foreground font-mono truncate">
                                            {[driverProfile.driver.username, driverProfile.driver.vehicleNumber, driverProfile.driver.phone].filter(Boolean).join(' · ')}
                                        </div>
                                    </div>
                                    <span className={`badge2 ${liveEntry?.dutyState === 'active' ? 'b-green' : 'b-gray'} flex-none`}>
                                        {liveEntry?.dutyState === 'active' ? 'On duty' : 'Off duty'}
                                    </span>
                                </div>

                                <div className="p-[18px] flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-[76px] h-[76px] rounded-full flex-none grid place-items-center"
                                            style={{
                                                background: `conic-gradient(${
                                                    rate >= 90 ? 'var(--st-green)' : rate >= 70 ? 'var(--st-amber)' : 'var(--primary)'
                                                } 0 ${rate}%, var(--surface-2) ${rate}% 100%)`,
                                            }}
                                        >
                                            <div className="w-[54px] h-[54px] rounded-full bg-card grid place-items-center font-display font-bold text-[17px]">
                                                {rate}%
                                            </div>
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-2.5 min-w-0">
                                            <div className="bg-[var(--surface-2)] rounded-xl px-3 py-2.5">
                                                <div className="text-[11px] text-muted-foreground">Delivered</div>
                                                <div className="font-display font-bold text-[19px]">{driverProfile.stats.delivered}</div>
                                            </div>
                                            <div className="bg-[var(--surface-2)] rounded-xl px-3 py-2.5">
                                                <div className="text-[11px] text-muted-foreground">Routes</div>
                                                <div className="font-display font-bold text-[19px]">{driverProfile.stats.totalRoutes}</div>
                                            </div>
                                            <div className="bg-[var(--surface-2)] rounded-xl px-3 py-2.5">
                                                <div className="text-[11px] text-muted-foreground">COD total</div>
                                                <div className="font-mono font-bold text-[15px]">{fmtAed(driverProfile.stats.codTotal)}</div>
                                            </div>
                                            <div className="bg-[var(--surface-2)] rounded-xl px-3 py-2.5">
                                                <div className="text-[11px] text-muted-foreground">Attempts</div>
                                                <div className="font-display font-bold text-[19px] text-[var(--st-amber)]">{driverProfile.stats.attempted}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-border pt-3.5">
                                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-[0.06em] mb-2.5">
                                            {activeRouteForProfile ? `Current route · ${activeRouteForProfile.id}` : 'No route in progress'}
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                                            <div
                                                className="h-full bg-[var(--st-green)] transition-[width]"
                                                style={{ width: `${progress ?? 0}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-2 text-xs font-mono text-muted-foreground">
                                            <span>
                                                {activeRouteForProfile
                                                    ? `${activeRouteForProfile.deliveryStats?.delivered || 0}/${activeRouteForProfile.deliveryStats?.total || 0} stops · ${zoneLabel(activeRouteForProfile.zone) || 'No zone'}`
                                                    : 'Waiting for assignment'}
                                            </span>
                                            <span className="text-[var(--st-green)] font-bold">{progress ?? 0}%</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setDriverProfileDialogOpen(true)}
                                        className="h-10 border border-border rounded-lg bg-[var(--surface-2)] font-display font-semibold text-[13px] inline-flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                                    >
                                        <Maximize2 className="w-[17px] h-[17px]" /> View full profile
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: COD
    // ═══════════════════════════════════════════════════════════════════
    const renderCod = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="font-display font-semibold text-base">COD reconciliation by driver</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">
                        Cash the driver must hand over — card (Tap to Pay) settles directly and never passes through them
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="h-9 inline-flex items-center gap-2 px-3 border border-border rounded-lg bg-card">
                        <Calendar className="w-4 h-4 text-muted-foreground flex-none" />
                        <input
                            type="date"
                            value={codDate}
                            onChange={(e) => setCodDate(e.target.value)}
                            className="bg-transparent text-[13px] outline-none text-foreground w-[120px]"
                        />
                    </div>
                    <button
                        onClick={() => refetchCod()}
                        className="w-9 h-9 border border-border rounded-lg bg-card grid place-items-center hover:bg-muted/50 transition-colors"
                        aria-label="Refresh"
                    >
                        <RefreshCw className="w-[17px] h-[17px]" />
                    </button>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden py-[18px]">
                <div className="statline">
                    <div className="s">
                        <div className="l">Total expected</div>
                        <div className="v">{fmtAed(codRecon?.totals.expected)} <span className="text-[13px] text-muted-foreground">AED</span></div>
                    </div>
                    <div className="s">
                        <div className="l">Cash</div>
                        <div className="v">{fmtAed(codRecon?.totals.cash)} <span className="text-[13px] text-muted-foreground">AED</span></div>
                    </div>
                    <div className="s">
                        <div className="l">Card (Tap)</div>
                        <div className="v">{fmtAed(codRecon?.totals.card)} <span className="text-[13px] text-muted-foreground">AED</span></div>
                    </div>
                    <div className="s">
                        <div className="l">To remit</div>
                        <div className="v red">{fmtAed(codRecon?.totals.toRemit)} <span className="text-[13px] text-muted-foreground">AED</span></div>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-[18px] py-3.5 border-b border-border flex items-center justify-between">
                    <span className="font-display font-semibold text-[14.5px]">Drivers</span>
                    <span className="text-xs text-muted-foreground font-mono">
                        {new Date(`${codDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                </div>

                {codLoading ? (
                    <p className="text-center py-10 text-muted-foreground">Loading reconciliation...</p>
                ) : !codRecon || codRecon.drivers.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No driver routes on this date</p>
                ) : codRecon.drivers.map((d) => (
                    <div key={d.driverId} className="flex items-center gap-4 px-[18px] py-4 border-b border-border last:border-b-0 hover:bg-[var(--surface-2)] transition-colors flex-wrap">
                        <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] grid place-items-center font-display font-bold text-[13px] flex-none">
                            {d.initials}
                        </span>
                        <div className="flex-1 min-w-[140px]">
                            <div className="font-display font-semibold text-sm">{d.driverName}</div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                                {[d.vehicleNumber, d.zones.map(zoneLabel).filter(Boolean).join(', ')].filter(Boolean).join(' · ') || `${d.routeIds.length} route(s)`}
                            </div>
                        </div>
                        <div className="text-right w-[140px] flex-none">
                            <div className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                                <Banknote className="w-3 h-3" /> Cash / <CreditCard className="w-3 h-3" /> Card
                            </div>
                            <div className="font-mono text-[13px]">{fmtAed(d.cash)} / {fmtAed(d.card)}</div>
                        </div>
                        {d.discrepancy !== 0 && (
                            <div className="text-right w-[92px] flex-none">
                                <div className="text-[11px] text-muted-foreground">Variance</div>
                                <div className={`font-mono font-bold text-[13px] ${d.discrepancy < 0 ? 'text-primary' : 'text-[var(--st-green)]'}`}>
                                    {d.discrepancy > 0 ? '+' : ''}{fmtAed(d.discrepancy)}
                                </div>
                            </div>
                        )}
                        <div className="text-right w-[104px] flex-none">
                            <div className="text-[11px] text-muted-foreground">{d.fullyRemitted ? 'Remitted' : 'To remit'}</div>
                            <div className={`font-mono font-bold text-[15px] ${
                                d.fullyRemitted ? 'text-[var(--st-green)]' : d.toRemit > 0 ? 'text-primary' : 'text-muted-foreground'
                            }`}>
                                {fmtAed(d.fullyRemitted ? d.remitted : d.toRemit)}
                            </div>
                        </div>
                        {/* Three states: nothing collected in cash, cash pending hand-over, already handed over. */}
                        {!d.fullyRemitted && d.toRemit <= 0 ? (
                            <span className="inline-flex items-center px-3 py-[7px] rounded-lg font-display font-semibold text-[12.5px] text-muted-foreground bg-[var(--surface-2)] flex-none">
                                No cash collected
                            </span>
                        ) : d.fullyRemitted ? (
                            <span
                                className="inline-flex items-center gap-1.5 px-3 py-[7px] rounded-lg font-display font-semibold text-[12.5px] text-[var(--st-green)] bg-[var(--st-green-bg)] flex-none"
                                title={d.remittedAt ? `Handed over ${new Date(d.remittedAt).toLocaleString()}` : undefined}
                            >
                                <CheckCircle2 className="w-4 h-4" /> Remitted
                            </span>
                        ) : (
                            <Button
                                variant="outline"
                                className="h-[34px] px-3.5 font-display font-semibold text-[12.5px] flex-none"
                                disabled={d.toRemit <= 0 || markCashRemittedMutation.isPending}
                                onClick={() => {
                                    if (confirm(`Confirm that ${d.driverName} handed over AED ${fmtAed(d.toRemit)} in cash?`)) {
                                        markCashRemittedMutation.mutate({ driverId: d.driverId, date: codDate });
                                    }
                                }}
                            >
                                Mark remitted
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: SHIFTS  (payroll)
    // ═══════════════════════════════════════════════════════════════════
    const payroll = shiftReport?.payroll || [];
    const shiftGroups = shiftReport?.groups || [];
    const shiftTotals = shiftReport?.totals;

    /** Whole hours + minutes for reading; decimal hours is what payroll pays on. */
    const formatDuration = (seconds: number | null | undefined) => {
        if (seconds === null || seconds === undefined) return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.round((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const decimalHours = (seconds: number) => (seconds / 3600).toFixed(2);

    const setShiftPreset = (days: number) => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - (days - 1));
        setShiftFrom(from.toISOString().slice(0, 10));
        setShiftTo(to.toISOString().slice(0, 10));
    };

    const exportPayroll = async () => {
        if (payroll.length === 0) {
            toast.error('Nothing to export for this range');
            return;
        }
        const { downloadExcel } = await import('@/lib/reportUtils');
        const XLSX = await import('xlsx');

        const summary = payroll.map(r => ({
            Driver: r.driverName,
            Shifts: r.shiftCount,
            'Open shifts': r.openShiftCount,
            'On duty (h:m)': formatDuration(r.onDutySeconds),
            'On duty (hours)': Number(decimalHours(r.onDutySeconds)),
            'Active on route (hours)': Number(decimalHours(r.activeSeconds)),
            Routes: r.routeCount,
            'Stops completed': r.completedStops,
            'COD collected (AED)': r.codCollected,
        }));

        // Second sheet: every shift, so payroll can audit the summary line by line.
        const detail = shiftGroups.map(g => ({
            Driver: g.driverName,
            'Shift ID': g.shiftId ?? '(no shift record)',
            'Clock in': g.shiftStartTime ? new Date(g.shiftStartTime).toLocaleString('en-GB') : '',
            'Clock out': g.shiftEndTime
                ? new Date(g.shiftEndTime).toLocaleString('en-GB')
                : (g.shiftId ? 'STILL OPEN' : ''),
            'On duty (hours)': g.onDutySeconds === null ? '' : Number(decimalHours(g.onDutySeconds)),
            'Active on route (hours)': Number(decimalHours(g.totalActiveSeconds)),
            Routes: g.routes.length,
            'Stops completed': g.totalCompletedStops,
            'COD collected (AED)': g.totalCodCollected,
        }));

        const workbook = XLSX.utils.book_new();
        const summarySheet = XLSX.utils.json_to_sheet(summary);
        summarySheet['!cols'] = Object.keys(summary[0] || {}).map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll summary');
        if (detail.length > 0) {
            const detailSheet = XLSX.utils.json_to_sheet(detail);
            detailSheet['!cols'] = Object.keys(detail[0]).map(() => ({ wch: 20 }));
            XLSX.utils.book_append_sheet(workbook, detailSheet, 'Shift detail');
        }
        downloadExcel(workbook, `payroll-${shiftReport?.from}_${shiftReport?.to}.xlsx`);
        toast.success('Payroll export downloaded');
    };

    /** <input type="datetime-local"> wants local wall-clock, not an ISO/UTC string. */
    const toLocalInput = (value: Date | string | null | undefined) => {
        if (!value) return '';
        const d = new Date(value);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const renderShifts = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="max-w-[520px]">
                    <div className="font-display font-semibold text-base">Shifts &amp; payroll</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">
                        Clocked-in time, active route time and COD per driver. On-duty time is clipped to the
                        selected range, so a shift crossing midnight counts on the days it actually covers.
                    </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="seg">
                        {[{ label: 'Today', days: 1 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }].map(p => (
                            <button key={p.days} onClick={() => setShiftPreset(p.days)}>{p.label}</button>
                        ))}
                    </div>
                    <div className="h-9 inline-flex items-center gap-2 px-3 border border-border rounded-lg bg-card">
                        <Calendar className="w-4 h-4 text-muted-foreground flex-none" />
                        <input
                            type="date"
                            value={shiftFrom}
                            max={shiftTo}
                            onChange={(e) => setShiftFrom(e.target.value)}
                            className="bg-transparent text-[13px] outline-none text-foreground w-[118px]"
                            aria-label="From date"
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <input
                            type="date"
                            value={shiftTo}
                            min={shiftFrom}
                            onChange={(e) => setShiftTo(e.target.value)}
                            className="bg-transparent text-[13px] outline-none text-foreground w-[118px]"
                            aria-label="To date"
                        />
                    </div>
                    <Select value={shiftDriverId} onValueChange={setShiftDriverId}>
                        <SelectTrigger className="h-9 w-[170px] text-[13px] bg-card border-border">
                            <SelectValue placeholder="All drivers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All drivers</SelectItem>
                            {driverList.map((d: any) => (
                                <SelectItem key={d.id} value={String(d.id)}>{d.fullName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="h-9" onClick={exportPayroll}>
                        <Download className="w-4 h-4 mr-1.5" /> Export
                    </Button>
                    <button
                        onClick={() => refetchShiftReport()}
                        className="w-9 h-9 border border-border rounded-lg bg-card grid place-items-center hover:bg-muted/50 transition-colors flex-none"
                        aria-label="Refresh"
                    >
                        <RefreshCw className="w-[17px] h-[17px]" />
                    </button>
                </div>
            </div>

            {/* payroll totals */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden py-[18px]">
                <div className="statline">
                    <div className="s">
                        <div className="l">On duty</div>
                        <div className="v">{decimalHours(shiftTotals?.onDutySeconds || 0)} <span className="text-[13px] text-muted-foreground">h</span></div>
                    </div>
                    <div className="s">
                        <div className="l">Active on route</div>
                        <div className="v">{decimalHours(shiftTotals?.activeSeconds || 0)} <span className="text-[13px] text-muted-foreground">h</span></div>
                    </div>
                    <div className="s">
                        <div className="l">Stops completed</div>
                        <div className="v">{shiftTotals?.completedStops || 0}</div>
                    </div>
                    <div className="s">
                        <div className="l">COD collected</div>
                        <div className="v">{fmtAed(shiftTotals?.codCollected)} <span className="text-[13px] text-muted-foreground">AED</span></div>
                    </div>
                </div>
            </div>

            {(shiftTotals?.openShiftCount ?? 0) > 0 && (
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--st-amber-bg)] border border-[color-mix(in_srgb,var(--st-amber)_30%,transparent)]">
                    <AlertTriangle className="w-5 h-5 text-[var(--st-amber)] flex-none" />
                    <div className="text-[13px]">
                        <b className="font-display">{shiftTotals!.openShiftCount} shift{shiftTotals!.openShiftCount !== 1 ? 's' : ''} still open</b>
                        {' · '}
                        <span className="text-muted-foreground">
                            Counted up to now. Close them below before running payroll.
                        </span>
                    </div>
                </div>
            )}

            {/* per-driver payroll */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-[18px] py-3.5 border-b border-border flex items-center justify-between">
                    <span className="font-display font-semibold text-[14.5px]">Per driver</span>
                    <span className="text-xs text-muted-foreground font-mono">
                        {shiftReport?.from} → {shiftReport?.to}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <div className="min-w-[840px]">
                        <div className="grid gap-3 px-[18px] py-2.5 bg-[var(--surface-2)] border-b border-border" style={{ gridTemplateColumns: PAYROLL_GRID }}>
                            <div style={thStyle}>Driver</div>
                            <div style={thStyle}>Shifts</div>
                            <div style={thStyle}>On duty</div>
                            <div style={thStyle}>Hours</div>
                            <div style={thStyle}>Active</div>
                            <div style={thStyle}>Routes</div>
                            <div style={thStyle}>Stops</div>
                            <div style={{ ...thStyle, textAlign: 'right' }} title="COD collected on delivered stops only — see Routes for COD assigned regardless of delivery">COD collected</div>
                        </div>
                        {shiftReportLoading ? (
                            <p className="text-center py-10 text-muted-foreground">Loading payroll...</p>
                        ) : payroll.length === 0 ? (
                            <p className="text-center py-10 text-muted-foreground">No shifts or routes in this range</p>
                        ) : payroll.map((r) => (
                            <div
                                key={r.driverId}
                                className="grid gap-3 px-[18px] py-3 items-center border-b border-border last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
                                style={{ gridTemplateColumns: PAYROLL_GRID }}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-8 h-8 rounded-[10px] bg-[var(--surface-2)] grid place-items-center font-display font-bold text-[11px] flex-none">
                                        {r.initials}
                                    </span>
                                    <span className="text-[13px] font-semibold truncate">{r.driverName}</span>
                                </div>
                                <div className="text-[13px]">
                                    {r.shiftCount}
                                    {r.openShiftCount > 0 && (
                                        <span className="ml-1.5 text-[11px] text-[var(--st-amber)]">({r.openShiftCount} open)</span>
                                    )}
                                </div>
                                <div className="font-mono text-[12.5px] text-[var(--ink-2)]">{formatDuration(r.onDutySeconds)}</div>
                                <div className="font-mono text-[13px] font-bold">{decimalHours(r.onDutySeconds)}</div>
                                <div className="font-mono text-[12.5px] text-[var(--ink-2)]">{formatDuration(r.activeSeconds)}</div>
                                <div className="font-mono text-[12.5px]">{r.routeCount}</div>
                                <div className="font-mono text-[12.5px]">{r.completedStops}</div>
                                <div className="font-mono text-[12.5px] text-right">{fmtAed(r.codCollected)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* per-shift detail */}
            {shiftGroups.map((group) => (
                <div key={`${group.driverId}-${group.shiftId ?? 'unlinked'}`} className="bg-card border border-border rounded-2xl p-[18px]">
                    <div className="flex items-center justify-between flex-wrap gap-2.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="w-[34px] h-[34px] rounded-[10px] bg-[var(--surface-2)] grid place-items-center font-display font-bold text-xs flex-none">
                                {initialsOf(group.driverName)}
                            </span>
                            <span className="font-display font-semibold text-[15px]">{group.driverName}</span>
                            {group.shiftId ? (
                                <span className="text-[12.5px] text-muted-foreground font-mono">
                                    {new Date(group.shiftStartTime!).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {' → '}
                                    {group.shiftEndTime
                                        ? new Date(group.shiftEndTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                        : ''}
                                </span>
                            ) : (
                                <span className="badge2 b-amber">not linked to a reported shift yet</span>
                            )}
                            {group.shiftId && !group.shiftEndTime && <span className="badge2 b-green">on duty</span>}
                        </div>
                        <div className="flex items-center gap-[18px] text-[13px] flex-wrap">
                            {group.onDutySeconds !== null && (
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Clocked-in time inside the selected range">
                                    <Clock className="w-4 h-4" /> {formatDuration(group.onDutySeconds)} on duty
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="Time the app reported as actively working a route">
                                <RouteIcon className="w-4 h-4" /> {formatActiveTime(group.totalActiveSeconds)} active
                            </span>
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                                <DollarSign className="w-4 h-4" /> {fmtAed(group.totalCodCollected)} AED
                            </span>
                            <span className="text-muted-foreground">{group.totalCompletedStops} stops</span>
                            {group.shiftId && (
                                <span className="flex items-center gap-1">
                                    {!group.shiftEndTime && (
                                        <button
                                            title="Close this shift now"
                                            onClick={() => closeShiftMutation.mutate({ id: group.shiftId! })}
                                            disabled={closeShiftMutation.isPending}
                                            className="p-1.5 rounded hover:bg-muted/50 text-[var(--st-green)]"
                                        >
                                            <CheckCircle className="w-[17px] h-[17px]" />
                                        </button>
                                    )}
                                    <button
                                        title="Correct clock-in / clock-out"
                                        onClick={() => setEditingShift({
                                            id: group.shiftId!,
                                            driverName: group.driverName,
                                            start: toLocalInput(group.shiftStartTime),
                                            end: toLocalInput(group.shiftEndTime),
                                        })}
                                        className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
                                    >
                                        <Edit className="w-[17px] h-[17px]" />
                                    </button>
                                    <button
                                        title="Delete this shift record"
                                        onClick={() => {
                                            if (confirm(`Delete this shift for ${group.driverName}? Payroll totals for the range will change.`)) {
                                                deleteShiftMutation.mutate({ id: group.shiftId! });
                                            }
                                        }}
                                        disabled={deleteShiftMutation.isPending}
                                        className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-primary"
                                    >
                                        <Trash2 className="w-[17px] h-[17px]" />
                                    </button>
                                </span>
                            )}
                        </div>
                    </div>

                    {group.routes.length > 0 && (
                        <div className="mt-3.5 border border-border rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <div className="min-w-[640px]">
                                    <div className="grid gap-2.5 px-3.5 py-2.5 bg-[var(--surface-2)]" style={{ gridTemplateColumns: SHIFT_GRID }}>
                                        <div style={thStyle}>Route</div>
                                        <div style={thStyle}>Zone</div>
                                        <div style={thStyle}>Started</div>
                                        <div style={thStyle}>Active</div>
                                        <div style={thStyle}>Stops</div>
                                        <div style={thStyle} title="COD collected on delivered stops only — see Routes for COD assigned regardless of delivery">COD collected</div>
                                    </div>
                                    {group.routes.map((route) => (
                                        <div
                                            key={route.routeId}
                                            className="grid gap-2.5 px-3.5 py-2.5 items-center border-t border-border first:border-t-0 hover:bg-[var(--surface-2)] transition-colors"
                                            style={{ gridTemplateColumns: SHIFT_GRID }}
                                        >
                                            <button
                                                onClick={() => openRouteDetails(route.routeId)}
                                                className="font-mono text-[11.5px] text-left hover:text-primary transition-colors truncate"
                                            >
                                                {route.routeId}
                                            </button>
                                            <div className="text-[12.5px] text-[var(--ink-2)] truncate">{zoneLabel(route.zone) || '—'}</div>
                                            <div className="font-mono text-xs text-[var(--ink-2)]">
                                                {route.startedAt ? new Date(route.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </div>
                                            <div className="font-mono text-xs text-[var(--ink-2)]">{formatActiveTime(route.activeSeconds)}</div>
                                            <div className="font-mono text-xs">{route.completedStops}</div>
                                            <div className="font-mono text-xs">{fmtAed(route.codCollected)} AED</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW: REPORTS
    // ═══════════════════════════════════════════════════════════════════
    const reportList = (reports as any[] | undefined) || [];
    const pendingReports = reportList.filter(r => r.status === 'pending').length;

    /** Issue type keeps the design's outlined mono pill, tinted by severity. */
    const issueTypeTone = (type: string) => {
        const t = (type || '').toLowerCase();
        if (t.includes('vehicle') || t.includes('accident')) return 'var(--st-amber)';
        if (t.includes('customer') || t.includes('refus')) return 'var(--primary)';
        if (t.includes('address') || t.includes('location')) return 'var(--st-blue)';
        return 'var(--st-gray)';
    };

    const renderReports = () => (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-border flex items-center justify-between gap-3">
                <div>
                    <span className="font-display font-semibold text-[14.5px]">Driver Reports</span>
                    <div className="text-xs text-muted-foreground">Issues reported by drivers</div>
                </div>
                <span className={`badge2 ${pendingReports > 0 ? 'b-amber' : 'b-green'}`}>
                    {pendingReports} pending
                </span>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                    <div
                        className="grid gap-3 px-[18px] py-2.5 bg-[var(--surface-2)] border-b border-border"
                        style={{ gridTemplateColumns: REPORTS_GRID }}
                    >
                        <div style={thStyle}>Driver</div>
                        <div style={thStyle}>Type</div>
                        <div style={thStyle}>Description</div>
                        <div style={thStyle}>Location</div>
                        <div style={thStyle}>Status</div>
                        <div style={{ ...thStyle, textAlign: 'right' }}>Date</div>
                        <div style={{ ...thStyle, textAlign: 'right' }}>Act</div>
                    </div>

                    {reportsLoading ? (
                        <p className="text-center py-10 text-muted-foreground">Loading reports...</p>
                    ) : reportList.length === 0 ? (
                        <p className="text-center py-10 text-muted-foreground">No reports found</p>
                    ) : reportList.map((report: any) => (
                        <div
                            key={report.id}
                            className="grid gap-3 px-[18px] py-3.5 border-b border-border last:border-b-0 items-center hover:bg-[var(--surface-2)] transition-colors"
                            style={{ gridTemplateColumns: REPORTS_GRID }}
                        >
                            <div className="text-[13px] font-medium truncate">{report.driver?.fullName || '—'}</div>
                            <div>
                                <span
                                    className="inline-flex items-center px-2.5 py-[3px] rounded-md font-mono text-[11px] border"
                                    style={{
                                        color: issueTypeTone(report.issueType),
                                        borderColor: `color-mix(in srgb, ${issueTypeTone(report.issueType)} 35%, var(--border))`,
                                    }}
                                >
                                    {report.issueType}
                                </span>
                            </div>
                            <div className="text-[12.5px] text-[var(--ink-2)] line-clamp-2">{report.description || '—'}</div>
                            <div className="font-mono text-[11.5px] text-muted-foreground truncate">
                                {report.latitude && report.longitude ? (
                                    <a
                                        href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-primary inline-flex items-center gap-1"
                                    >
                                        <MapPin className="w-3 h-3" />
                                        {parseFloat(report.latitude).toFixed(4)}, {parseFloat(report.longitude).toFixed(4)}
                                    </a>
                                ) : '—'}
                            </div>
                            <div>
                                {/* The badge doubles as the status control — same affordance the
                                    design shows, but still editable like the old dropdown. */}
                                <Select
                                    value={report.status}
                                    onValueChange={(value) => handleUpdateReportStatus(report.id, value as any)}
                                >
                                    <SelectTrigger
                                        size="sm"
                                        aria-label="Change report status"
                                        className="w-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
                                    >
                                        {getStatusBadge(report.status)}
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="in_review">In Review</SelectItem>
                                        <SelectItem value="resolved">Resolved</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="font-mono text-[11.5px] text-muted-foreground text-right">
                                {new Date(report.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                <div className="text-[10px] opacity-70">
                                    {new Date(report.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                </div>
                            </div>
                            <div className="flex gap-0.5 justify-end text-muted-foreground">
                                {report.photoUrl && (
                                    <a
                                        href={report.photoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="View photo"
                                        className="p-1 rounded hover:bg-muted/50"
                                    >
                                        <Eye className="h-[17px] w-[17px]" />
                                    </a>
                                )}
                                <button
                                    title="Delete report"
                                    onClick={() => handleDeleteReport(report.id)}
                                    className="p-1 rounded hover:bg-muted/50 hover:text-primary"
                                >
                                    <Trash2 className="h-[17px] w-[17px]" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════

    return (
        <div className="space-y-4">
            {/* page header + subnav */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h2 className="font-display font-bold text-[26px] tracking-[-0.02em] m-0">Drivers</h2>
                        <span className="badge2 b-green">LIVE</span>
                    </div>
                    <div className="text-[13px] text-muted-foreground font-mono mt-1">
                        Dispatch · {dispatch?.activeRoutes ?? 0} route{(dispatch?.activeRoutes ?? 0) !== 1 ? 's' : ''} ·{' '}
                        {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })} ·{' '}
                        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                <div className="seg overflow-x-auto max-w-full">
                    {VIEW_TABS.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setView(tab.value)}
                            className={view === tab.value ? 'on' : ''}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {view === 'dispatch' && renderDispatch()}
            {view === 'routes' && renderRoutes()}
            {view === 'drivers' && renderDrivers()}
            {view === 'cod' && renderCod()}
            {view === 'shifts' && renderShifts()}
            {view === 'reports' && renderReports()}

            {/* Create Driver Dialog */}
            <Dialog open={createDriverDialogOpen} onOpenChange={setCreateDriverDialogOpen}>
                <DialogContent className="bg-card border-border !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <UserPlus className="w-6 h-6 text-primary" />
                                </div>
                                Add New Driver
                            </DialogTitle>
                            <DialogDescription>Create a new driver account</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Username *</Label>
                                    <Input
                                        value={newDriver.username}
                                        onChange={(e) => setNewDriver({ ...newDriver, username: e.target.value })}
                                        placeholder="driver1"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Password *</Label>
                                    <Input
                                        type="password"
                                        value={newDriver.password}
                                        onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                                        placeholder="••••••••"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Full Name *</Label>
                                <Input
                                    value={newDriver.fullName}
                                    onChange={(e) => setNewDriver({ ...newDriver, fullName: e.target.value })}
                                    placeholder="John Doe"
                                    className="bg-white/5 border-border"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        type="email"
                                        value={newDriver.email}
                                        onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
                                        placeholder="john@example.com"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={newDriver.phone}
                                        onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                                        placeholder="+971 50 123 4567"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vehicle Number</Label>
                                    <Input
                                        value={newDriver.vehicleNumber}
                                        onChange={(e) => setNewDriver({ ...newDriver, vehicleNumber: e.target.value })}
                                        placeholder="DXB-12345"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Emirates ID</Label>
                                    <Input
                                        value={newDriver.emiratesId}
                                        onChange={(e) => setNewDriver({ ...newDriver, emiratesId: e.target.value })}
                                        placeholder="784-XXXX-XXXXXXX-X"
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="pt-6 mt-6 border-t border-border">
                            <Button variant="outline" onClick={() => setCreateDriverDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateDriver} disabled={createDriverMutation.isPending}>
                                {createDriverMutation.isPending ? 'Creating...' : 'Create Driver'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Driver Dialog */}
            <Dialog open={editDriverDialogOpen} onOpenChange={setEditDriverDialogOpen}>
                <DialogContent className="bg-card border-border !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Edit className="w-6 h-6 text-primary" />
                                </div>
                                Edit Driver
                            </DialogTitle>
                            <DialogDescription>Update driver information</DialogDescription>
                        </DialogHeader>
                        {selectedDriver && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input
                                        value={selectedDriver.fullName}
                                        onChange={(e) => setSelectedDriver({ ...selectedDriver, fullName: e.target.value })}
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            value={selectedDriver.email || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, email: e.target.value })}
                                            className="bg-white/5 border-border"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone</Label>
                                        <Input
                                            value={selectedDriver.phone || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, phone: e.target.value })}
                                            className="bg-white/5 border-border"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Vehicle Number</Label>
                                        <Input
                                            value={selectedDriver.vehicleNumber || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, vehicleNumber: e.target.value })}
                                            className="bg-white/5 border-border"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={selectedDriver.status}
                                            onValueChange={(value) => setSelectedDriver({ ...selectedDriver, status: value })}
                                        >
                                            <SelectTrigger className="bg-white/5 border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border">
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                                <SelectItem value="suspended">Suspended</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                        <DialogFooter className="pt-6 mt-6 border-t border-border">
                            <Button variant="outline" onClick={() => setEditDriverDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleUpdateDriver} disabled={updateDriverMutation.isPending}>
                                {updateDriverMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Correct a driver's clock-in / clock-out (payroll control) */}
            <Dialog open={!!editingShift} onOpenChange={(open) => { if (!open) setEditingShift(null); }}>
                <DialogContent className="bg-card border-border !w-[92vw] !max-w-[520px] p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-5">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Clock className="w-6 h-6 text-primary" />
                                </div>
                                Correct shift
                            </DialogTitle>
                            <DialogDescription>
                                {editingShift?.driverName} — this changes the hours payroll pays on.
                            </DialogDescription>
                        </DialogHeader>

                        {editingShift && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Clock in</Label>
                                    <Input
                                        type="datetime-local"
                                        value={editingShift.start}
                                        onChange={(e) => setEditingShift({ ...editingShift, start: e.target.value })}
                                        className="bg-white/5 border-border"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Clock out</Label>
                                    <Input
                                        type="datetime-local"
                                        value={editingShift.end}
                                        onChange={(e) => setEditingShift({ ...editingShift, end: e.target.value })}
                                        className="bg-white/5 border-border"
                                    />
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Leave empty to re-open the shift. A shift longer than 16h is rejected — split it in two instead.
                                    </p>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="pt-5 mt-5 border-t border-border">
                            <Button variant="outline" onClick={() => setEditingShift(null)}>Cancel</Button>
                            <Button
                                disabled={!editingShift?.start || updateShiftMutation.isPending}
                                onClick={() => {
                                    if (!editingShift) return;
                                    updateShiftMutation.mutate({
                                        id: editingShift.id,
                                        startTime: new Date(editingShift.start).toISOString(),
                                        endTime: editingShift.end ? new Date(editingShift.end).toISOString() : null,
                                    });
                                }}
                            >
                                {updateShiftMutation.isPending
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                                    : <><CheckCircle2 className="w-4 h-4 mr-2" /> Save</>}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign unassigned orders to a route that already exists (dispatch board) */}
            <Dialog open={assignDialogOpen} onOpenChange={(open) => { setAssignDialogOpen(open); if (!open) setAssignRouteId(''); }}>
                <DialogContent className="bg-card border-border !w-[95vw] !max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-5">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Truck className="w-6 h-6 text-primary" />
                                </div>
                                Assign to a route
                            </DialogTitle>
                            <DialogDescription>
                                Adds {dispatchSelected.length} order{dispatchSelected.length !== 1 ? 's' : ''} to a route that already exists.
                                To start a new one, use <b>New route</b> in the Routes view.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-2 mb-5">
                            <Label>Route</Label>
                            {assignableRoutes.length === 0 ? (
                                <p className="text-sm text-muted-foreground border border-border rounded-lg p-3">
                                    No open routes to add to — every route is completed or cancelled.
                                    Create one from the Routes view first.
                                </p>
                            ) : (
                                <Select value={assignRouteId} onValueChange={setAssignRouteId}>
                                    <SelectTrigger className="bg-white/5 border-border">
                                        <SelectValue placeholder="Pick a route..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {assignableRoutes.map((r: any) => (
                                            <SelectItem key={r.id} value={r.id}>
                                                {r.id} · {r.driver?.fullName || 'Unassigned'} · {zoneLabel(r.zone) || 'No zone'} ·{' '}
                                                {r.status === 'in_progress' ? 'on the road' : 'pending'} · {r.deliveryStats?.total || 0} stops
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {renderSelectionCards()}

                        <DialogFooter className="pt-5 mt-5 border-t border-border">
                            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleAssignToExistingRoute}
                                disabled={!assignRouteId || dispatchSelected.length === 0 || addOrdersToRouteMutation.isPending}
                            >
                                {addOrdersToRouteMutation.isPending ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...</>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Assign {dispatchSelected.length} order{dispatchSelected.length !== 1 ? 's' : ''}</>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Route Wizard */}
            <CreateRouteWizard
                open={createRouteWizardOpen}
                onOpenChange={setCreateRouteWizardOpen}
                drivers={drivers || []}
                preloadedOrders={preloadedOrdersForWizard}
                onSuccess={(routeId) => {
                    setQrRouteId(routeId);
                    setQrDialogOpen(true);
                    setPreloadedOrdersForWizard([]);
                    refetchRoutes();
                    refetchDispatch();
                    refetchAvailableOrders();
                }}
            />

            {/* "Ubicar" — quick pin dialog for orders without/with wrong coordinates */}
            <SetLocationDialog
                order={locateOrder}
                open={!!locateOrder}
                target={locateTarget}
                onOpenChange={(open) => { if (!open) { setLocateOrder(null); setLocateTarget('delivery'); } }}
                onSaved={async () => {
                    refetchAvailableOrders();
                    const fresh = await refetchRouteDetails();
                    // While reordering, the sequencer runs off local state — without
                    // this the pin saves but doesn't show up until you leave and
                    // re-enter reorder mode. Re-resolve coordinates, keep the order.
                    if (reorderMode && fresh.data?.deliveries) {
                        const byId = new Map(toSequencerStops(fresh.data.deliveries).map(s => [s.key, s]));
                        setReorderStops(prev => prev.map(s => byId.get(s.key) ?? s));
                    }
                }}
            />

            {/* QR Code Dialog */}
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogContent className="bg-card border-border !w-[90vw] !max-w-[420px] p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <QrCode className="w-5 h-5 text-primary" />
                                </div>
                                Route QR Code
                            </DialogTitle>
                            <DialogDescription>
                                Driver scans this to load route <span className="font-mono font-medium text-foreground">{qrRouteId}</span>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col items-center gap-4">
                            <div className="p-4 bg-white rounded-2xl shadow-lg">
                                <QRCode
                                    value={qrRouteId}
                                    size={220}
                                    level="M"
                                />
                            </div>
                            <div className="text-center">
                                <p className="font-mono font-bold text-lg">{qrRouteId}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    The driver opens the app, taps "Scan Route QR", and scans this code to load all their stops instantly.
                                </p>
                            </div>
                            <div className="flex gap-2 w-full">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        navigator.clipboard.writeText(qrRouteId);
                                        toast.success('Route ID copied to clipboard');
                                    }}
                                >
                                    Copy ID
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => {
                                        const printWindow = window.open('', '_blank');
                                        if (printWindow) {
                                            printWindow.document.write(`
                                                <html><head><title>Route QR - ${qrRouteId}</title>
                                                <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:monospace;gap:16px}
                                                h2{font-size:24px;margin:0}p{color:#666;margin:0;font-size:14px}</style></head>
                                                <body>
                                                <img src="${(document.querySelector('svg[data-qr]') as SVGElement | null)?.parentElement?.querySelector('img')?.src || ''}" style="width:280px;height:280px" />
                                                <h2>${qrRouteId}</h2>
                                                <p>Scan to load route in driver app</p>
                                                <script>window.onload=()=>window.print()</script>
                                                </body></html>
                                            `);
                                        }
                                    }}
                                >
                                    <Download className="w-4 h-4 mr-2" /> Print
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Driver Profile Dialog */}
            <Dialog open={driverProfileDialogOpen} onOpenChange={setDriverProfileDialogOpen}>
                <DialogContent className="bg-card border-border !w-[95vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Activity className="w-6 h-6 text-primary" />
                                </div>
                                Driver Profile
                            </DialogTitle>
                        </DialogHeader>

                        {profileLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : driverProfile ? (
                            <div className="space-y-6">
                                {/* Driver Info */}
                                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white/5 border border-border">
                                    <div>
                                        <h3 className="text-xl font-bold">{driverProfile.driver.fullName}</h3>
                                        <p className="text-sm text-muted-foreground font-mono">{driverProfile.driver.username}</p>
                                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                                            {driverProfile.driver.phone && <span>{driverProfile.driver.phone}</span>}
                                            {driverProfile.driver.vehicleNumber && (
                                                <span className="flex items-center gap-1">
                                                    <Truck className="w-3 h-3" /> {driverProfile.driver.vehicleNumber}
                                                </span>
                                            )}
                                            {driverProfile.driver.licenseNo && <span>License: {driverProfile.driver.licenseNo}</span>}
                                        </div>
                                    </div>
                                    {getStatusBadge(driverProfile.driver.status)}
                                </div>

                                {/* Performance Stats */}
                                <div>
                                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Performance (All Time)</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className={`text-2xl font-mono font-bold ${getSuccessRateColor(driverProfile.stats.successRate)}`}>
                                                {driverProfile.stats.successRate}%
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Success Rate</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-2xl font-mono font-bold text-foreground">
                                                {driverProfile.stats.delivered}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Delivered</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-2xl font-mono font-bold text-foreground">
                                                {driverProfile.stats.totalRoutes}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Total Routes</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-2xl font-mono font-bold text-[var(--st-amber)]">
                                                {fmtAed(driverProfile.stats.codTotal)} AED
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">COD Total</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mt-3">
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-[var(--st-amber)]">
                                                {driverProfile.stats.attempted}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Attempted</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-primary">
                                                {driverProfile.stats.returned}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Returned</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-[var(--st-blue)]">
                                                {driverProfile.stats.totalReports}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Reports Filed</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Last 30 days */}
                                <div className="p-3 rounded-lg bg-secondary border border-border flex items-center gap-3">
                                    <BarChart2 className="w-4 h-4 text-[var(--st-blue)] flex-shrink-0" />
                                    <span className="text-sm text-muted-foreground">
                                        <span className="font-bold">{driverProfile.stats.recentRoutes}</span> routes in the last 30 days •{' '}
                                        <span className="font-bold">{driverProfile.stats.totalPieces}</span> total pieces handled
                                    </span>
                                </div>

                                {/* Recent Routes */}
                                {driverProfile.recentRoutes.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Routes</h4>
                                        <div className="space-y-2">
                                            {driverProfile.recentRoutes.map((r: any) => (
                                                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-border">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-sm font-medium">{r.id}</span>
                                                        {r.zone && <span className="text-xs text-muted-foreground">{zoneLabel(r.zone)}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span>
                                                        {getStatusBadge(r.status)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-center py-8 text-muted-foreground">Driver not found</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Route Details Dialog */}
            <Dialog open={routeDetailsDialogOpen} onOpenChange={(open) => {
                setRouteDetailsDialogOpen(open);
                if (!open) setReorderMode(false);
            }}>
                <DialogContent className="bg-card border-border !w-[95vw] !max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />

                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <MapPin className="w-6 h-6 text-primary" />
                                </div>
                                Route: {routeDetails?.id}
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                {routeDetails?.driver?.fullName || 'Unassigned'} • {zoneLabel(routeDetails?.zone) || 'No zone'} • {routeDetails?.deliveries?.length || 0} stops
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openQRForRoute(routeDetails?.id || '')}
                                    className="gap-2"
                                >
                                    <QrCode className="h-4 w-4 text-primary" /> Show QR
                                </Button>
                                {/* The sequencer is map AND list at once, so this toggle has nothing to switch while reordering. */}
                                {!reorderMode && (
                                    <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                                        <button
                                            onClick={() => setRouteDetailsTab('list')}
                                            className={`px-3 py-1.5 transition-colors ${routeDetailsTab === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                                        >
                                            Lista
                                        </button>
                                        <button
                                            onClick={() => setRouteDetailsTab('map')}
                                            className={`px-3 py-1.5 transition-colors ${routeDetailsTab === 'map' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                                        >
                                            Mapa
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {reorderMode ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setReorderMode(false)}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            size="sm"
                                            disabled={reorderStopsMutation.isPending}
                                            onClick={() => {
                                                if (selectedRouteId) {
                                                    reorderStopsMutation.mutate({
                                                        routeId: selectedRouteId,
                                                        stopIds: reorderStops.map(s => s.stopId!),
                                                    });
                                                }
                                            }}
                                            className="gap-2"
                                        >
                                            {reorderStopsMutation.isPending
                                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                                                : <><CheckCircle2 className="h-4 w-4" /> Guardar secuencia</>}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!routeDetails?.deliveries?.length}
                                            onClick={() => {
                                                setReorderStops(toSequencerStops(routeDetails?.deliveries));
                                                setReorderMode(true);
                                            }}
                                            className="gap-2"
                                        >
                                            <ListOrdered className="h-4 w-4" /> Reordenar
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={optimizeRouteMutation.isPending || !routeDetails?.deliveries?.length}
                                            onClick={() => {
                                                if (selectedRouteId) {
                                                    optimizeRouteMutation.mutate({ routeId: selectedRouteId });
                                                }
                                            }}
                                            className="gap-2"
                                        >
                                            {optimizeRouteMutation.isPending ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Optimizando...</>
                                            ) : (
                                                <><TrendingUp className="h-4 w-4 text-[var(--st-green)]" /> Optimizar ruta</>
                                            )}
                                        </Button>
                                        <Button onClick={() => setAddOrdersDialogOpen(true)}>
                                            <Plus className="mr-2 h-4 w-4" /> Add Orders
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Route map view (read-only; reordering uses the sequencer below) */}
                        {!reorderMode && routeDetailsTab === 'map' && (() => {
                            // Position per leg — same rule the server optimizer uses (stopLegCoords).
                            const resolved = (routeDetails?.deliveries || [])
                                // Failed stops (failed pickup / failed delivery) are done for this route —
                                // no need to keep pinning them on the route map. They still show in the list.
                                .filter((d: any) => d.status !== 'failed')
                                .map((d: any) => {
                                    const c = stopLegCoords(d);
                                    return { ...d, _lat: c.lat, _lng: c.lng, _accuracy: c.accuracy };
                                });
                            const stopsWithCoords = resolved.filter((d: any) => d._lat != null && d._lng != null);
                            const stopsNoCoords = resolved.filter((d: any) => d._lat == null || d._lng == null);
                            const mapPoints: MapPoint[] = stopsWithCoords.map((d: any, idx: number) => ({
                                id: d.id,
                                lat: d._lat,
                                lng: d._lng,
                                label: d.waybillNumber || (d.sequence != null ? String(d.sequence) : String(idx + 1)),
                                kind: (d.type === 'pickup' ? 'pickup' : 'delivery') as PinKind,
                                sequence: d.sequence ?? idx + 1,
                                accuracy: d._accuracy,
                                details: {
                                    customerName: d.customerName,
                                    address: d.address,
                                    city: d.city,
                                    pieces: d.pieces,
                                    weight: d.weight,
                                    serviceType: d.serviceType,
                                    codRequired: d.codRequired,
                                    codAmount: d.codAmount,
                                    type: d.type,
                                },
                            })).sort((a: MapPoint, b: MapPoint) => (a.sequence ?? 0) - (b.sequence ?? 0));

                            return (
                                <div className="mb-4 space-y-2">
                                    {stopsNoCoords.length > 0 && (
                                        <p className="text-xs px-3 py-2 rounded-lg border border-[var(--st-amber)]/40 bg-[var(--st-amber-bg)] text-[var(--st-amber)]">
                                            {stopsNoCoords.length} parada{stopsNoCoords.length !== 1 ? 's' : ''} sin coordenadas — se muestra{stopsNoCoords.length !== 1 ? 'n' : ''} solo en la lista:{' '}
                                            {stopsNoCoords.map((d: any) => d.waybillNumber).filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                    {stopsWithCoords.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                                            <MapPin className="w-8 h-8 opacity-30" />
                                            <p className="text-sm">No hay paradas con coordenadas en esta ruta</p>
                                            <p className="text-xs">Usa "Ubicar" en el mapa de despacho para ponerles pin</p>
                                        </div>
                                    ) : (
                                        <>
                                            <OrdersMap
                                                points={mapPoints}
                                                showRoute
                                                className="h-[360px]"
                                                onEditLocation={(stopId) => {
                                                    const stop = resolved.find((d: any) => d.id === stopId);
                                                    if (!stop) return;
                                                    setLocateTarget(stopLocationTarget(stop));
                                                    setLocateOrder({
                                                        id: stop.orderId,
                                                        waybillNumber: stop.waybillNumber,
                                                        customerName: stop.customerName,
                                                        address: stop.address,
                                                        city: stop.city,
                                                        latitude: stop.latitude,
                                                        longitude: stop.longitude,
                                                        locationAccuracy: stop.locationAccuracy,
                                                        shipperLat: stop.shipperLat,
                                                        shipperLng: stop.shipperLng,
                                                    });
                                                }}
                                            />
                                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                                Verde = pickups (en el remitente) · Azul = entregas · Número = secuencia actual · Pasa el mouse sobre un pin para corregir su ubicación
                                            </p>
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Reorder mode — map + drag&drop list, the single place stop order is decided */}
                        {reorderMode && (
                            <RouteStopSequencer
                                stops={reorderStops}
                                onChange={setReorderStops}
                                disabled={reorderStopsMutation.isPending}
                                mapClassName="h-[380px]"
                                origin={routeDetails?.startLat && routeDetails?.startLng ? {
                                    lat: parseFloat(routeDetails.startLat),
                                    lng: parseFloat(routeDetails.startLng),
                                    label: routeDetails.startAddress || 'Origen',
                                } : null}
                                onEditLocation={(stop) => {
                                    const d = (routeDetails?.deliveries || []).find((x: any) => x.id === stop.stopId);
                                    if (!d) return;
                                    setLocateTarget(stopLocationTarget(d));
                                    setLocateOrder({
                                        id: d.orderId,
                                        waybillNumber: d.waybillNumber,
                                        customerName: d.customerName,
                                        address: d.address,
                                        city: d.city,
                                        latitude: d.latitude,
                                        longitude: d.longitude,
                                        locationAccuracy: d.locationAccuracy,
                                        shipperLat: d.shipperLat,
                                        shipperLng: d.shipperLng,
                                    });
                                }}
                            />
                        )}

                        <div className={reorderMode ? 'hidden' : (routeDetailsTab === 'map' ? 'max-h-[250px] overflow-y-auto' : 'max-h-[450px] overflow-y-auto')}>
                            {routeDetails?.deliveries && routeDetails.deliveries.length > 0 ? (
                                <div className="space-y-2">
                                    {routeDetails.deliveries.map((delivery: any) => {
                                        const isReturn = delivery.isReturn === 1 || delivery.orderType === 'return';
                                        const isExchange = delivery.orderType === 'exchange';
                                        const proofPhotos = getProofPhotoUrls(delivery);
                                        return (
                                            <div
                                                key={delivery.id}
                                                className="rounded-lg border bg-white/5 border-border p-4"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="font-mono font-medium text-sm">{delivery.waybillNumber}</span>
                                                            <Badge variant="outline" className="!bg-[var(--st-blue-bg)] !text-[var(--st-blue)] !border-transparent text-xs">
                                                                <Building2 className="w-3 h-3 mr-1" />{delivery.companyName}
                                                            </Badge>
                                                            {isReturn && (
                                                                <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                                                    <RotateCcw className="w-3 h-3 mr-1" />Return
                                                                </Badge>
                                                            )}
                                                            {isExchange && (
                                                                <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                                                    Exchange
                                                                </Badge>
                                                            )}
                                                            {delivery.codRequired ? (
                                                                <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                                                    <DollarSign className="w-3 h-3 mr-0.5" />COD {delivery.codAmount} AED
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="!bg-[var(--st-green-bg)] !text-[var(--st-green)] !border-transparent text-xs">Prepaid</Badge>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 text-sm mb-1">
                                                            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                            <span className="font-medium">{delivery.customerName}</span>
                                                            <span className="text-muted-foreground">•</span>
                                                            <span className="text-muted-foreground truncate">{delivery.city}</span>
                                                        </div>

                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                                            <span>{delivery.pieces} pc{delivery.pieces > 1 ? 's' : ''} • {delivery.weight} kg</span>
                                                            {delivery.deliveredAt && (
                                                                <span>Delivered: {new Date(delivery.deliveredAt).toLocaleString()}</span>
                                                            )}
                                                            {proofPhotos.map((photoUrl, photoIndex) => (
                                                                <a
                                                                    key={photoUrl}
                                                                    href={photoUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    Proof {photoIndex + 1}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                        {getStatusBadge(delivery.status)}
                                                        <button
                                                            onClick={() => {
                                                                setLocateTarget(stopLocationTarget(delivery));
                                                                setLocateOrder({
                                                                    id: delivery.orderId,
                                                                    waybillNumber: delivery.waybillNumber,
                                                                    customerName: delivery.customerName,
                                                                    address: delivery.address,
                                                                    city: delivery.city,
                                                                    latitude: delivery.latitude,
                                                                    longitude: delivery.longitude,
                                                                    locationAccuracy: delivery.locationAccuracy,
                                                                    shipperLat: delivery.shipperLat,
                                                                    shipperLng: delivery.shipperLng,
                                                                });
                                                            }}
                                                            className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors"
                                                        >
                                                            <MapPin className="w-3 h-3" />
                                                            Ubicar
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (confirm(`¿Eliminar el paquete ${delivery.waybillNumber} de esta ruta?`)) {
                                                                    removeOrderFromRouteMutation.mutate({
                                                                        routeId: routeDetails.id,
                                                                        orderId: delivery.orderId,
                                                                    });
                                                                }
                                                            }}
                                                            disabled={removeOrderFromRouteMutation.isPending}
                                                            className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No deliveries in this route</p>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Orders to Route Dialog */}
            <Dialog open={addOrdersDialogOpen} onOpenChange={(open) => {
                setAddOrdersDialogOpen(open);
                if (!open) setAddOrders([]);
            }}>
                <DialogContent className="bg-card border-border !w-[95vw] !max-w-[1040px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
                    <div className="w-full h-1 bg-primary" />

                    <div className="p-6 min-w-0">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Package className="w-6 h-6 text-primary" />
                                </div>
                                Add Orders to Route
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Select orders to assign to route <span className="font-mono font-medium text-foreground">{selectedRouteId}</span>
                            </DialogDescription>
                        </DialogHeader>

                        <OrderPickList
                            orders={pickableAvailableOrders}
                            value={addOrders}
                            onChange={setAddOrders}
                            maxHeightClass="max-h-[55vh]"
                        />

                        <DialogFooter className="pt-4 mt-4 border-t border-border">
                            <Button type="button" variant="outline" onClick={() => setAddOrdersDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleAddOrdersToRoute}
                                disabled={addOrders.length === 0 || addOrdersToRouteMutation.isPending}
                            >
                                {addOrdersToRouteMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Add {addOrders.length} Order{addOrders.length !== 1 ? 's' : ''}
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
