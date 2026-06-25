/**
 * Drivers Section for Admin Dashboard
 * Provides management of drivers, routes, deliveries, and reports
 */
import { useState, useMemo } from 'react';
import QRCode from 'react-qr-code';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import {
    Users, Truck, Package, AlertTriangle, Plus, Eye, Edit, Trash2,
    RefreshCw, MapPin, Clock, CheckCircle, XCircle, AlertCircle,
    Hash, Calendar, Building2, FileText, CheckCircle2, Loader2,
    DollarSign, RotateCcw, Weight, Boxes, UserPlus, QrCode,
    TrendingUp, BarChart2, Search, Filter, ChevronRight, Star,
    Activity, Download
} from 'lucide-react';
import CreateRouteWizard from '@/components/CreateRouteWizard';
import OrderPickList, { type SelectedOrder } from '@/components/OrderPickList';
import { OrdersMap } from '@/components/OrdersMap';
import type { MapPoint, PinKind } from '@/components/OrdersMap';
import { getProofPhotoUrls } from '@shared/podPhotos';

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

export default function DriversSection() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [routesView, setRoutesView] = useState<'list' | 'map'>('list');
    const [dispatchSelectedIds, setDispatchSelectedIds] = useState<number[]>([]);
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

    // Selected items
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [addOrders, setAddOrders] = useState<SelectedOrder[]>([]);
    const [qrRouteId, setQrRouteId] = useState('');
    const [profileDriverId, setProfileDriverId] = useState<number | null>(null);

    // Filters
    const [routeFilterDate, setRouteFilterDate] = useState('');
    const [routeFilterStatus, setRouteFilterStatus] = useState('all');
    const [routeFilterDriver, setRouteFilterDriver] = useState('');
    const [deliveryFilterStatus, setDeliveryFilterStatus] = useState('all');
    const [deliveryFilterWaybill, setDeliveryFilterWaybill] = useState('');

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
    const { data: dashboardStats, isLoading: statsLoading, refetch: refetchStats } =
        trpc.portal.drivers.getDashboardStats.useQuery();

    const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } =
        trpc.portal.drivers.getAllDrivers.useQuery();

    const { data: routes, isLoading: routesLoading, refetch: refetchRoutes } =
        trpc.portal.drivers.getAllRoutes.useQuery();

    const { data: deliveries, isLoading: deliveriesLoading, refetch: refetchDeliveries } =
        trpc.portal.drivers.getAllDeliveries.useQuery({});

    const { data: reports, isLoading: reportsLoading, refetch: refetchReports } =
        trpc.portal.drivers.getAllReports.useQuery({});

    const { data: routeDetails, refetch: refetchRouteDetails } = trpc.portal.drivers.getRouteDetails.useQuery(
        { routeId: selectedRouteId || '' },
        { enabled: !!selectedRouteId }
    );

    const { data: availableOrders, refetch: refetchAvailableOrders } = trpc.portal.drivers.getAvailableOrders.useQuery(
        undefined,
        { enabled: addOrdersDialogOpen || routesView === 'map' }
    );

    const { data: driverProfile, isLoading: profileLoading } = trpc.portal.drivers.getDriverPerformance.useQuery(
        { driverId: profileDriverId || 0 },
        { enabled: !!profileDriverId }
    );

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

    // Filtered deliveries
    const filteredDeliveries = useMemo(() => {
        if (!deliveries) return [];
        return deliveries.filter((d: any) => {
            if (deliveryFilterStatus !== 'all' && d.status !== deliveryFilterStatus) return false;
            if (deliveryFilterWaybill && !d.waybillNumber?.toLowerCase().includes(deliveryFilterWaybill.toLowerCase())) return false;
            return true;
        });
    }, [deliveries, deliveryFilterStatus, deliveryFilterWaybill]);

    // Mutations
    const createDriverMutation = trpc.portal.drivers.createDriver.useMutation({
        onSuccess: () => {
            toast.success('Driver created successfully');
            setCreateDriverDialogOpen(false);
            setNewDriver({ username: '', password: '', fullName: '', email: '', phone: '', vehicleNumber: '', emiratesId: '', licenseNo: '' });
            refetchDrivers();
            refetchStats();
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
            refetchStats();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateRouteStatusMutation = trpc.portal.drivers.updateRouteStatus.useMutation({
        onSuccess: () => {
            toast.success('Route status updated');
            refetchRoutes();
            refetchStats();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateReportStatusMutation = trpc.portal.drivers.updateReportStatus.useMutation({
        onSuccess: () => {
            toast.success('Report status updated');
            refetchReports();
            refetchStats();
        },
        onError: (error) => toast.error(error.message),
    });

    const addOrdersToRouteMutation = trpc.portal.drivers.addOrdersToRoute.useMutation({
        onSuccess: () => {
            toast.success('Orders added to route');
            setAddOrdersDialogOpen(false);
            setAddOrders([]);
            refetchRouteDetails();
            refetchRoutes();
            refetchAvailableOrders();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteRouteMutation = trpc.portal.drivers.deleteRoute.useMutation({
        onSuccess: () => {
            toast.success('Route deleted successfully');
            refetchRoutes();
            refetchStats();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteReportMutation = trpc.portal.drivers.deleteReport.useMutation({
        onSuccess: () => {
            toast.success('Report deleted successfully');
            refetchReports();
            refetchStats();
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

    const openDriverProfile = (driver: any) => {
        setProfileDriverId(driver.id);
        setDriverProfileDialogOpen(true);
    };

    const openQRForRoute = (routeId: string) => {
        setQrRouteId(routeId);
        setQrDialogOpen(true);
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

    const getSuccessRateColor = (rate: number) => {
        if (rate >= 90) return 'text-[var(--st-green)]';
        if (rate >= 70) return 'text-[var(--st-amber)]';
        return 'text-primary';
    };

    return (
        <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5 h-auto">
                    <TabsTrigger
                        value="dashboard"
                        className="flex items-center gap-2 py-3"
                    >
                        <Truck className="h-4 w-4" /> Dashboard
                    </TabsTrigger>
                    <TabsTrigger
                        value="drivers"
                        className="flex items-center gap-2 py-3"
                    >
                        <Users className="h-4 w-4" /> Drivers
                    </TabsTrigger>
                    <TabsTrigger
                        value="routes"
                        className="flex items-center gap-2 py-3"
                    >
                        <MapPin className="h-4 w-4" /> Routes
                    </TabsTrigger>
                    <TabsTrigger
                        value="deliveries"
                        className="flex items-center gap-2 py-3"
                    >
                        <Package className="h-4 w-4" /> Deliveries
                    </TabsTrigger>
                    <TabsTrigger
                        value="reports"
                        className="flex items-center gap-2 py-3"
                    >
                        <AlertTriangle className="h-4 w-4" /> Reports
                    </TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="kpi">
                            <div className="kt">
                                <span className="lab">Active Drivers</span>
                                <span className="ic"><Users className="w-[18px] h-[18px]" /></span>
                            </div>
                            <div className="val">{dashboardStats?.drivers.active || 0}</div>
                            <div className="sub">on duty now</div>
                        </div>

                        <div className="kpi">
                            <div className="kt">
                                <span className="lab">Active Routes</span>
                                <span className="ic"><MapPin className="w-[18px] h-[18px]" /></span>
                            </div>
                            <div className="val">{dashboardStats?.routes.today || 0}</div>
                            <div className="sub">today</div>
                        </div>

                        <div className="kpi">
                            <div className="kt">
                                <span className="lab">Deliveries Completed</span>
                                <span className="ic"><Package className="w-[18px] h-[18px]" /></span>
                            </div>
                            <div className="val">{dashboardStats?.deliveries.delivered || 0}</div>
                            <div className="sub">total</div>
                        </div>

                        <div className="kpi accent">
                            <div className="kt">
                                <span className="lab">Pending Reports</span>
                                <span className="ic"><AlertTriangle className="w-[18px] h-[18px]" /></span>
                            </div>
                            <div className="val">{dashboardStats?.reports.pending || 0}</div>
                            <div className="sub">require review</div>
                        </div>
                    </div>
                </TabsContent>

                {/* Drivers Tab */}
                <TabsContent value="drivers" className="space-y-4">
                    <Card className="bg-card border-border">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Drivers</CardTitle>
                                <CardDescription>Manage delivery drivers — click a name to view performance</CardDescription>
                            </div>
                            <Button onClick={() => setCreateDriverDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Driver
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {driversLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading drivers...</p>
                            ) : drivers && drivers.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Username</TableHead>
                                            <TableHead>Full Name</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead>Vehicle</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {drivers.map((driver: any) => (
                                            <TableRow key={driver.id}>
                                                <TableCell className="font-mono">{driver.username}</TableCell>
                                                <TableCell>
                                                    <button
                                                        className="font-medium hover:text-primary flex items-center gap-1 transition-colors"
                                                        onClick={() => openDriverProfile(driver)}
                                                    >
                                                        {driver.fullName}
                                                        <BarChart2 className="w-3 h-3 opacity-50" />
                                                    </button>
                                                </TableCell>
                                                <TableCell>{driver.phone || '-'}</TableCell>
                                                <TableCell>{driver.vehicleNumber || '-'}</TableCell>
                                                <TableCell>{getStatusBadge(driver.status)}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            title="View performance"
                                                            onClick={() => openDriverProfile(driver)}
                                                        >
                                                            <Activity className="h-4 w-4 text-[var(--st-blue)]" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedDriver({ ...driver });
                                                                setEditDriverDialogOpen(true);
                                                            }}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive"
                                                            onClick={() => handleDeleteDriver(driver.id, driver.fullName)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No drivers found</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Routes Tab */}
                <TabsContent value="routes" className="space-y-4">
                    <Card className="bg-card border-border">
                        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                            <div>
                                <CardTitle>Routes</CardTitle>
                                <CardDescription>Daily delivery routes</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                                    <button
                                        onClick={() => setRoutesView('list')}
                                        className={`px-3 py-1.5 transition-colors ${routesView === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                                    >
                                        Lista
                                    </button>
                                    <button
                                        onClick={() => setRoutesView('map')}
                                        className={`px-3 py-1.5 transition-colors ${routesView === 'map' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                                    >
                                        Mapa
                                    </button>
                                </div>
                                <Button onClick={() => {
                                    setPreloadedOrdersForWizard([]);
                                    setCreateRouteWizardOpen(true);
                                }}>
                                    <Plus className="mr-2 h-4 w-4" /> Create Route
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Dispatch Map view */}
                            {routesView === 'map' && (() => {
                                const availableWithCoords = (availableOrders || []).filter((o: any) => o.latitude && o.longitude);
                                const dispatchPoints: MapPoint[] = availableWithCoords.map((o: any) => ({
                                    id: o.id,
                                    lat: parseFloat(o.latitude),
                                    lng: parseFloat(o.longitude),
                                    label: o.waybillNumber || String(o.id),
                                    kind: dispatchSelectedIds.includes(o.id) ? 'selected' : 'available',
                                    details: {
                                        customerName: o.customerName,
                                        address: o.address,
                                        city: o.city,
                                        emirate: o.emirate,
                                        pieces: o.pieces,
                                        weight: o.weight,
                                        serviceType: o.serviceType,
                                        codRequired: o.codRequired,
                                        codAmount: o.codAmount,
                                    },
                                }));
                                return (
                                    <div className="space-y-3">
                                        {dispatchSelectedIds.length > 0 && (
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-border">
                                                <span className="text-sm text-primary font-medium">
                                                    {dispatchSelectedIds.length} orden{dispatchSelectedIds.length > 1 ? 'es' : ''} seleccionada{dispatchSelectedIds.length > 1 ? 's' : ''}
                                                </span>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setDispatchSelectedIds([])}>
                                                        Limpiar
                                                    </Button>
                                                    <Button size="sm" onClick={() => {
                                                        setPreloadedOrdersForWizard(
                                                            dispatchSelectedIds.map(id => ({ id, mode: 'delivery_only' as const }))
                                                        );
                                                        setDispatchSelectedIds([]);
                                                        setCreateRouteWizardOpen(true);
                                                    }}>
                                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                                        Crear ruta con selección
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                        {availableWithCoords.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                                                <MapPin className="w-8 h-8 opacity-30" />
                                                <p className="text-sm">No hay pedidos disponibles con coordenadas</p>
                                            </div>
                                        ) : (
                                            <OrdersMap
                                                points={dispatchPoints}
                                                onPointClick={(id) => {
                                                    setDispatchSelectedIds(prev =>
                                                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                                                    );
                                                }}
                                                className="h-[520px]"
                                            />
                                        )}
                                        <p className="text-xs text-muted-foreground text-center">
                                            Haz clic en un pin para seleccionarlo. Los pines gris = disponibles, azul navy = seleccionados.
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* List view — Filters + Table */}
                            {routesView === 'list' && <><div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    <Input
                                        type="date"
                                        value={routeFilterDate}
                                        onChange={(e) => setRouteFilterDate(e.target.value)}
                                        className="bg-white/5 border-border h-8 text-sm"
                                        placeholder="Filter by date"
                                    />
                                </div>
                                <Select value={routeFilterStatus} onValueChange={setRouteFilterStatus}>
                                    <SelectTrigger className="bg-white/5 border-border h-8 w-[140px] text-sm">
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
                                <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    <Input
                                        value={routeFilterDriver}
                                        onChange={(e) => setRouteFilterDriver(e.target.value)}
                                        placeholder="Search driver..."
                                        className="bg-white/5 border-border h-8 text-sm"
                                    />
                                </div>
                                {(routeFilterDate || routeFilterStatus !== 'all' || routeFilterDriver) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => { setRouteFilterDate(''); setRouteFilterStatus('all'); setRouteFilterDriver(''); }}
                                    >
                                        <XCircle className="w-3 h-3 mr-1" /> Clear
                                    </Button>
                                )}
                            </div>

                            {routesLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading routes...</p>
                            ) : filteredRoutes.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Route ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Driver</TableHead>
                                            <TableHead>Zone</TableHead>
                                            <TableHead>Stops</TableHead>
                                            <TableHead>Info</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredRoutes.map((route: any) => (
                                            <TableRow key={route.id}>
                                                <TableCell className="font-mono font-medium">{route.id}</TableCell>
                                                <TableCell>{new Date(route.date).toLocaleDateString()}</TableCell>
                                                <TableCell>{route.driver?.fullName || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                                                <TableCell>{route.zone || '-'}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[var(--st-green)] font-medium">{route.deliveryStats?.delivered || 0}</span>
                                                        <span className="text-muted-foreground">/</span>
                                                        <span className="font-medium">{route.deliveryStats?.total || 0}</span>
                                                    </div>
                                                    {route.totalPieces > 0 && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {route.totalPieces} pcs • {route.totalWeight} kg
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {route.codTotal > 0 && (
                                                            <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                                                <DollarSign className="w-3 h-3 mr-0.5" />{route.codTotal} AED
                                                            </Badge>
                                                        )}
                                                        {route.returnCount > 0 && (
                                                            <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                                                <RotateCcw className="w-3 h-3 mr-0.5" />{route.returnCount} Return{route.returnCount > 1 ? 's' : ''}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {getStatusBadge(route.status)}
                                                        {/* Quick status change */}
                                                        {route.status === 'pending' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                title="Mark In Progress"
                                                                className="h-6 w-6 p-0 text-[var(--st-blue)] hover:opacity-80"
                                                                onClick={() => updateRouteStatusMutation.mutate({ routeId: route.id, status: 'in_progress' })}
                                                            >
                                                                <ChevronRight className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                        {route.status === 'in_progress' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                title="Mark Completed"
                                                                className="h-6 w-6 p-0 text-[var(--st-green)] hover:opacity-80"
                                                                onClick={() => updateRouteStatusMutation.mutate({ routeId: route.id, status: 'completed' })}
                                                            >
                                                                <CheckCircle className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            title="Show QR Code"
                                                            onClick={() => openQRForRoute(route.id)}
                                                        >
                                                            <QrCode className="h-4 w-4 text-primary" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            title="View Details"
                                                            onClick={() => {
                                                                setSelectedRouteId(route.id);
                                                                setRouteDetailsDialogOpen(true);
                                                            }}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive"
                                                            onClick={() => handleDeleteRoute(route.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No routes found</p>
                            )}</>}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Deliveries Tab */}
                <TabsContent value="deliveries" className="space-y-4">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>Deliveries</CardTitle>
                            <CardDescription>All delivery items from routes</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Filters */}
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    <Input
                                        value={deliveryFilterWaybill}
                                        onChange={(e) => setDeliveryFilterWaybill(e.target.value)}
                                        placeholder="Search waybill..."
                                        className="bg-white/5 border-border h-8 text-sm"
                                    />
                                </div>
                                <Select value={deliveryFilterStatus} onValueChange={setDeliveryFilterStatus}>
                                    <SelectTrigger className="bg-white/5 border-border h-8 w-[150px] text-sm">
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All statuses</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="delivered">Delivered</SelectItem>
                                        <SelectItem value="attempted">Attempted</SelectItem>
                                        <SelectItem value="returned">Returned</SelectItem>
                                    </SelectContent>
                                </Select>
                                {(deliveryFilterWaybill || deliveryFilterStatus !== 'all') && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => { setDeliveryFilterWaybill(''); setDeliveryFilterStatus('all'); }}
                                    >
                                        <XCircle className="w-3 h-3 mr-1" /> Clear
                                    </Button>
                                )}
                                <span className="text-xs text-muted-foreground self-center ml-auto">
                                    {filteredDeliveries.length} result{filteredDeliveries.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {deliveriesLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading deliveries...</p>
                            ) : filteredDeliveries.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Waybill</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>City</TableHead>
                                            <TableHead>Route</TableHead>
                                            <TableHead>Driver</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Proof</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDeliveries.map((delivery: any) => (
                                            <TableRow key={delivery.id}>
                                                <TableCell className="font-mono">{delivery.waybillNumber}</TableCell>
                                                <TableCell>{delivery.customerName}</TableCell>
                                                <TableCell>{delivery.city}</TableCell>
                                                <TableCell className="font-mono text-xs">{delivery.routeId}</TableCell>
                                                <TableCell>{delivery.driver?.fullName || '-'}</TableCell>
                                                <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                                                <TableCell>
                                                    {getProofPhotoUrls(delivery).length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {getProofPhotoUrls(delivery).map((photoUrl, photoIndex) => (
                                                                <a key={photoUrl} href={photoUrl} target="_blank" rel="noopener noreferrer">
                                                                    <Badge variant="outline" className="cursor-pointer hover:bg-primary/20">
                                                                        Photo {photoIndex + 1}
                                                                    </Badge>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No deliveries found</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Reports Tab */}
                <TabsContent value="reports" className="space-y-4">
                    <Card className="bg-card border-border">
                        <CardHeader>
                            <CardTitle>Driver Reports</CardTitle>
                            <CardDescription>Issues reported by drivers</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {reportsLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading reports...</p>
                            ) : reports && reports.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Driver</TableHead>
                                            <TableHead>Issue Type</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Photo</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reports.map((report: any) => (
                                            <TableRow key={report.id}>
                                                <TableCell>{new Date(report.createdAt).toLocaleString()}</TableCell>
                                                <TableCell>{report.driver?.fullName}</TableCell>
                                                <TableCell>{report.issueType}</TableCell>
                                                <TableCell className="max-w-[200px] truncate">{report.description || '-'}</TableCell>
                                                <TableCell>
                                                    {report.photoUrl ? (
                                                        <a href={report.photoUrl} target="_blank" rel="noopener noreferrer">
                                                            <Badge variant="outline" className="cursor-pointer hover:bg-primary/20">View</Badge>
                                                        </a>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell>{getStatusBadge(report.status)}</TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={report.status}
                                                        onValueChange={(value) => handleUpdateReportStatus(report.id, value as any)}
                                                    >
                                                        <SelectTrigger className="w-[120px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="pending">Pending</SelectItem>
                                                            <SelectItem value="in_review">In Review</SelectItem>
                                                            <SelectItem value="resolved">Resolved</SelectItem>
                                                            <SelectItem value="rejected">Rejected</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive ml-2"
                                                        onClick={() => handleDeleteReport(report.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No reports found</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

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
                    refetchStats();
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
                                Driver scans this to load route <span className="font-mono font-medium text-white">{qrRouteId}</span>
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
                                <p className="font-mono font-bold text-lg text-white">{qrRouteId}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    The driver opens the app, taps "Scan Route QR", and scans this code to load all their stops instantly.
                                </p>
                            </div>
                            <div className="flex gap-2 w-full">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        // Copy route ID to clipboard
                                        navigator.clipboard.writeText(qrRouteId);
                                        toast.success('Route ID copied to clipboard');
                                    }}
                                >
                                    Copy ID
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => {
                                        // Print the QR
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
            <Dialog open={driverProfileDialogOpen} onOpenChange={(open) => { setDriverProfileDialogOpen(open); if (!open) setProfileDriverId(null); }}>
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
                                                {driverProfile.stats.codTotal} AED
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
                                                        {r.zone && <span className="text-xs text-muted-foreground">{r.zone}</span>}
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
            <Dialog open={routeDetailsDialogOpen} onOpenChange={setRouteDetailsDialogOpen}>
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
                                {routeDetails?.driver?.fullName || 'Unassigned'} • {routeDetails?.zone || 'No zone'} • {routeDetails?.deliveries?.length || 0} stops
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
                            </div>
                            <div className="flex items-center gap-2">
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
                            </div>
                        </div>

                        {/* Route map view */}
                        {routeDetailsTab === 'map' && (() => {
                            const stopsWithCoords = (routeDetails?.deliveries || []).filter(
                                (d: any) => d.latitude && d.longitude
                            );
                            const mapPoints: MapPoint[] = stopsWithCoords.map((d: any, idx: number) => ({
                                id: d.id,
                                lat: parseFloat(d.latitude),
                                lng: parseFloat(d.longitude),
                                label: d.waybillNumber || (d.sequence != null ? String(d.sequence) : String(idx + 1)),
                                kind: (d.type === 'pickup' ? 'pickup' : 'delivery') as PinKind,
                                sequence: d.sequence ?? idx + 1,
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

                            return stopsWithCoords.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                                    <MapPin className="w-8 h-8 opacity-30" />
                                    <p className="text-sm">No hay paradas con coordenadas en esta ruta</p>
                                    <p className="text-xs">Agrega pedidos creados con el Location Picker para ver el mapa</p>
                                </div>
                            ) : (
                                <div className="mb-4">
                                    <OrdersMap points={mapPoints} showRoute className="h-[360px]" />
                                    <p className="text-xs text-muted-foreground mt-2 text-center">
                                        Verde = pickups · Azul = entregas · Número = secuencia actual
                                    </p>
                                </div>
                            );
                        })()}

                        <div className={routeDetailsTab === 'map' ? 'max-h-[250px] overflow-y-auto' : 'max-h-[450px] overflow-y-auto'}>
                            {routeDetails?.deliveries && routeDetails.deliveries.length > 0 ? (
                                <div className="space-y-2">
                                    {routeDetails.deliveries.map((delivery: any) => {
                                        const isReturn = delivery.isReturn === 1 || delivery.orderType === 'return';
                                        const isExchange = delivery.orderType === 'exchange';
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

                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <span>{delivery.pieces} pc{delivery.pieces > 1 ? 's' : ''} • {delivery.weight} kg</span>
                                                            {delivery.deliveredAt && (
                                                                <span>Delivered: {new Date(delivery.deliveredAt).toLocaleString()}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                        {getStatusBadge(delivery.status)}
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
                                Select orders to assign to route <span className="font-mono font-medium text-white">{selectedRouteId}</span>
                            </DialogDescription>
                        </DialogHeader>

                        <OrderPickList
                            orders={availableOrders as any[] | undefined}
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

