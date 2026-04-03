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

    // Dialogs
    const [createDriverDialogOpen, setCreateDriverDialogOpen] = useState(false);
    const [editDriverDialogOpen, setEditDriverDialogOpen] = useState(false);
    const [createRouteDialogOpen, setCreateRouteDialogOpen] = useState(false);
    const [routeDetailsDialogOpen, setRouteDetailsDialogOpen] = useState(false);
    const [addOrdersDialogOpen, setAddOrdersDialogOpen] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [driverProfileDialogOpen, setDriverProfileDialogOpen] = useState(false);

    // Selected items
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [orderModes, setOrderModes] = useState<Record<number, 'pickup_only' | 'delivery_only' | 'both'>>({});
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

    const [newRoute, setNewRoute] = useState({
        id: '',
        date: new Date().toISOString().split('T')[0],
        driverId: '',
        zone: '',
        vehicleInfo: '',
        notes: '',
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
        { enabled: addOrdersDialogOpen }
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

    const createRouteMutation = trpc.portal.drivers.createRoute.useMutation({
        onSuccess: (_, variables) => {
            toast.success('Route created successfully');
            setCreateRouteDialogOpen(false);
            // Show QR code for the newly created route
            setQrRouteId(variables.id);
            setQrDialogOpen(true);
            setNewRoute({ id: '', date: new Date().toISOString().split('T')[0], driverId: '', zone: '', vehicleInfo: '', notes: '' });
            refetchRoutes();
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
            setSelectedOrderIds([]);
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
            ...selectedDriver,
        });
    };

    const handleDeleteDriver = (id: number, name: string) => {
        if (confirm(`Are you sure you want to delete driver "${name}"?`)) {
            deleteDriverMutation.mutate({ id });
        }
    };

    const handleCreateRoute = () => {
        if (!newRoute.id || !newRoute.date) {
            toast.error('Route ID and date are required');
            return;
        }
        createRouteMutation.mutate({
            id: newRoute.id,
            date: newRoute.date,
            driverId: newRoute.driverId && newRoute.driverId !== 'none' ? parseInt(newRoute.driverId) : undefined,
            zone: newRoute.zone,
            vehicleInfo: newRoute.vehicleInfo,
        });
    };

    const handleUpdateReportStatus = (reportId: number, status: 'pending' | 'in_review' | 'resolved' | 'rejected') => {
        updateReportStatusMutation.mutate({ id: reportId, status });
    };

    const handleAddOrdersToRoute = () => {
        if (!selectedRouteId || selectedOrderIds.length === 0) {
            toast.error('Select at least one order');
            return;
        }

        const ordersPayload = selectedOrderIds.map(id => ({
            id,
            mode: orderModes[id] || 'both'
        }));

        addOrdersToRouteMutation.mutate({
            routeId: selectedRouteId,
            orders: ordersPayload,
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

    const toggleOrderSelection = (orderId: number) => {
        setSelectedOrderIds(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
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
        const statusColors: Record<string, string> = {
            active: 'bg-green-500/20 text-green-400 border-green-500/30',
            inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
            pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            completed: 'bg-green-500/20 text-green-400 border-green-500/30',
            cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
            attempted: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
            returned: 'bg-red-500/20 text-red-400 border-red-500/30',
            in_review: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
            resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
            rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
        };
        return (
            <Badge variant="outline" className={statusColors[status] || 'bg-gray-500/20'}>
                {status.replace('_', ' ').toUpperCase()}
            </Badge>
        );
    };

    const getSuccessRateColor = (rate: number) => {
        if (rate >= 90) return 'text-green-400';
        if (rate >= 70) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5 bg-transparent border border-white/10 p-1.5 rounded-xl h-auto">
                    <TabsTrigger
                        value="dashboard"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Truck className="h-4 w-4" /> Dashboard
                    </TabsTrigger>
                    <TabsTrigger
                        value="drivers"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Users className="h-4 w-4" /> Drivers
                    </TabsTrigger>
                    <TabsTrigger
                        value="routes"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <MapPin className="h-4 w-4" /> Routes
                    </TabsTrigger>
                    <TabsTrigger
                        value="deliveries"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Package className="h-4 w-4" /> Deliveries
                    </TabsTrigger>
                    <TabsTrigger
                        value="reports"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <AlertTriangle className="h-4 w-4" /> Reports
                    </TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="glass-strong border-white/10 overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600" />
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-blue-400 bg-blue-500/5 px-2 py-1 rounded">ACTIVE</span>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-foreground mb-1 group-hover:text-blue-400 transition-colors">
                                        {dashboardStats?.drivers.active || 0}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Active Drivers</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-white/10 overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-600" />
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-green-400 bg-green-500/5 px-2 py-1 rounded">TODAY</span>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-foreground mb-1 group-hover:text-green-400 transition-colors">
                                        {dashboardStats?.routes.today || 0}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Active Routes</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-white/10 overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-purple-600" />
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                        <Package className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-purple-400 bg-purple-500/5 px-2 py-1 rounded">TOTAL</span>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-foreground mb-1 group-hover:text-purple-400 transition-colors">
                                        {dashboardStats?.deliveries.delivered || 0}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Deliveries Completed</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-white/10 overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-red-600" />
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-mono text-red-400 bg-red-500/5 px-2 py-1 rounded">ISSUES</span>
                                </div>
                                <div>
                                    <div className="text-4xl font-mono font-bold text-foreground mb-1 group-hover:text-red-400 transition-colors">
                                        {dashboardStats?.reports.pending || 0}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Pending Reports</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Drivers Tab */}
                <TabsContent value="drivers" className="space-y-4">
                    <Card className="glass-strong">
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
                                                        className="font-medium hover:text-blue-400 flex items-center gap-1 transition-colors"
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
                                                            <Activity className="h-4 w-4 text-blue-400" />
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
                    <Card className="glass-strong">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Routes</CardTitle>
                                <CardDescription>Daily delivery routes</CardDescription>
                            </div>
                            <Button onClick={() => setCreateRouteDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Create Route
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Filters */}
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    <Input
                                        type="date"
                                        value={routeFilterDate}
                                        onChange={(e) => setRouteFilterDate(e.target.value)}
                                        className="bg-white/5 border-white/10 h-8 text-sm"
                                        placeholder="Filter by date"
                                    />
                                </div>
                                <Select value={routeFilterStatus} onValueChange={setRouteFilterStatus}>
                                    <SelectTrigger className="bg-white/5 border-white/10 h-8 w-[140px] text-sm">
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
                                        className="bg-white/5 border-white/10 h-8 text-sm"
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
                                                        <span className="text-green-400 font-medium">{route.deliveryStats?.delivered || 0}</span>
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
                                                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                                                                <DollarSign className="w-3 h-3 mr-0.5" />{route.codTotal} AED
                                                            </Badge>
                                                        )}
                                                        {route.returnCount > 0 && (
                                                            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
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
                                                                className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300"
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
                                                                className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
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
                                                            <QrCode className="h-4 w-4 text-purple-400" />
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
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Deliveries Tab */}
                <TabsContent value="deliveries" className="space-y-4">
                    <Card className="glass-strong">
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
                                        className="bg-white/5 border-white/10 h-8 text-sm"
                                    />
                                </div>
                                <Select value={deliveryFilterStatus} onValueChange={setDeliveryFilterStatus}>
                                    <SelectTrigger className="bg-white/5 border-white/10 h-8 w-[150px] text-sm">
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
                                                    {delivery.proofPhotoUrl ? (
                                                        <a href={delivery.proofPhotoUrl} target="_blank" rel="noopener noreferrer">
                                                            <Badge variant="outline" className="cursor-pointer hover:bg-primary/20">
                                                                View
                                                            </Badge>
                                                        </a>
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
                    <Card className="glass-strong">
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
                <DialogContent className="glass-strong !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <UserPlus className="w-6 h-6 text-blue-400" />
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
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Password *</Label>
                                    <Input
                                        type="password"
                                        value={newDriver.password}
                                        onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                                        placeholder="••••••••"
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Full Name *</Label>
                                <Input
                                    value={newDriver.fullName}
                                    onChange={(e) => setNewDriver({ ...newDriver, fullName: e.target.value })}
                                    placeholder="John Doe"
                                    className="bg-white/5 border-white/10"
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
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={newDriver.phone}
                                        onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                                        placeholder="+971 50 123 4567"
                                        className="bg-white/5 border-white/10"
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
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Emirates ID</Label>
                                    <Input
                                        value={newDriver.emiratesId}
                                        onChange={(e) => setNewDriver({ ...newDriver, emiratesId: e.target.value })}
                                        placeholder="784-XXXX-XXXXXXX-X"
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="pt-6 mt-6 border-t border-white/10">
                            <Button variant="outline" onClick={() => setCreateDriverDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateDriver} disabled={createDriverMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                                {createDriverMutation.isPending ? 'Creating...' : 'Create Driver'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Driver Dialog */}
            <Dialog open={editDriverDialogOpen} onOpenChange={setEditDriverDialogOpen}>
                <DialogContent className="glass-strong !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-indigo-600 to-purple-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/20">
                                    <Edit className="w-6 h-6 text-indigo-400" />
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
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            value={selectedDriver.email || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, email: e.target.value })}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone</Label>
                                        <Input
                                            value={selectedDriver.phone || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, phone: e.target.value })}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Vehicle Number</Label>
                                        <Input
                                            value={selectedDriver.vehicleNumber || ''}
                                            onChange={(e) => setSelectedDriver({ ...selectedDriver, vehicleNumber: e.target.value })}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={selectedDriver.status}
                                            onValueChange={(value) => setSelectedDriver({ ...selectedDriver, status: value })}
                                        >
                                            <SelectTrigger className="bg-white/5 border-white/10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="glass-strong">
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                                <SelectItem value="suspended">Suspended</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                        <DialogFooter className="pt-6 mt-6 border-t border-white/10">
                            <Button variant="outline" onClick={() => setEditDriverDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleUpdateDriver} disabled={updateDriverMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                                {updateDriverMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Route Dialog */}
            <Dialog open={createRouteDialogOpen} onOpenChange={setCreateRouteDialogOpen}>
                <DialogContent className="glass-strong !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />

                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <MapPin className="w-6 h-6 text-blue-400" />
                                </div>
                                Create Route
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Set up a new delivery route — a QR code will be generated automatically
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Hash className="w-4 h-4 text-muted-foreground" />
                                        Route ID *
                                    </Label>
                                    <Input
                                        value={newRoute.id}
                                        onChange={(e) => setNewRoute({ ...newRoute, id: e.target.value })}
                                        placeholder="DXB-2025-001"
                                        className="bg-white/5 border-white/10"
                                    />
                                    <p className="text-xs text-muted-foreground">Unique identifier for this route</p>
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-muted-foreground" />
                                        Date *
                                    </Label>
                                    <Input
                                        type="date"
                                        value={newRoute.date}
                                        onChange={(e) => setNewRoute({ ...newRoute, date: e.target.value })}
                                        className="bg-white/5 border-white/10"
                                    />
                                    <p className="text-xs text-muted-foreground">Scheduled delivery date</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-muted-foreground" />
                                    Assign Driver
                                </Label>
                                <Select
                                    value={newRoute.driverId}
                                    onValueChange={(value) => setNewRoute({ ...newRoute, driverId: value })}
                                >
                                    <SelectTrigger className="bg-white/5 border-white/10">
                                        <SelectValue placeholder="Select driver (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Unassigned</SelectItem>
                                        {drivers?.filter((d: any) => d.status === 'active').map((driver: any) => (
                                            <SelectItem key={driver.id} value={driver.id.toString()}>
                                                <div className="flex items-center gap-2">
                                                    <span>{driver.fullName}</span>
                                                    <span className="text-muted-foreground">•</span>
                                                    <span className="text-xs text-muted-foreground">{driver.vehicleNumber || 'No vehicle'}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Only active drivers are shown</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-muted-foreground" />
                                        Zone
                                    </Label>
                                    <Select
                                        value={newRoute.zone}
                                        onValueChange={(value) => setNewRoute({ ...newRoute, zone: value === 'other' ? '' : ZONE_OPTIONS.find(z => z.value === value)?.label || value })}
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10">
                                            <SelectValue placeholder="Select zone" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                            {ZONE_OPTIONS.map((zone) => (
                                                <SelectItem key={zone.value} value={zone.value}>
                                                    {zone.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {newRoute.zone === '' && (
                                        <Input
                                            value={newRoute.zone}
                                            onChange={(e) => setNewRoute({ ...newRoute, zone: e.target.value })}
                                            placeholder="Enter custom zone"
                                            className="bg-white/5 border-white/10 mt-2"
                                        />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Truck className="w-4 h-4 text-muted-foreground" />
                                        Vehicle Info
                                    </Label>
                                    <Input
                                        value={newRoute.vehicleInfo}
                                        onChange={(e) => setNewRoute({ ...newRoute, vehicleInfo: e.target.value })}
                                        placeholder="White Van - DXB 12345"
                                        className="bg-white/5 border-white/10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                    Notes
                                </Label>
                                <Textarea
                                    value={newRoute.notes}
                                    onChange={(e) => setNewRoute({ ...newRoute, notes: e.target.value })}
                                    placeholder="Special instructions or notes for this route..."
                                    rows={3}
                                    className="bg-white/5 border-white/10 resize-none"
                                />
                            </div>

                            <DialogFooter className="pt-4 border-t border-white/10">
                                <Button type="button" variant="outline" onClick={() => setCreateRouteDialogOpen(false)}>Cancel</Button>
                                <Button
                                    onClick={handleCreateRoute}
                                    disabled={createRouteMutation.isPending}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {createRouteMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Create Route & Generate QR
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* QR Code Dialog */}
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogContent className="glass-strong !w-[90vw] !max-w-[420px] p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-purple-600 to-pink-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/20">
                                    <QrCode className="w-5 h-5 text-purple-400" />
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
                                    className="flex-1 bg-purple-600 hover:bg-purple-700"
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
                <DialogContent className="glass-strong !w-[95vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <Activity className="w-6 h-6 text-blue-400" />
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
                                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
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
                                            <div className="text-2xl font-mono font-bold text-yellow-400">
                                                {driverProfile.stats.codTotal} AED
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">COD Total</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mt-3">
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-orange-400">
                                                {driverProfile.stats.attempted}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Attempted</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-red-400">
                                                {driverProfile.stats.returned}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Returned</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
                                            <div className="text-lg font-mono font-bold text-purple-400">
                                                {driverProfile.stats.totalReports}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Reports Filed</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Last 30 days */}
                                <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 flex items-center gap-3">
                                    <BarChart2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                    <span className="text-sm text-blue-300">
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
                                                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
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
                <DialogContent className="glass-strong !w-[95vw] !max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-indigo-600 to-purple-600" />

                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/20">
                                    <MapPin className="w-6 h-6 text-indigo-400" />
                                </div>
                                Route: {routeDetails?.id}
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                {routeDetails?.driver?.fullName || 'Unassigned'} • {routeDetails?.zone || 'No zone'} • {routeDetails?.deliveries?.length || 0} stops
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex justify-between items-center mb-4 gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openQRForRoute(routeDetails?.id || '')}
                                className="gap-2"
                            >
                                <QrCode className="h-4 w-4 text-purple-400" /> Show QR
                            </Button>
                            <Button onClick={() => setAddOrdersDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                                <Plus className="mr-2 h-4 w-4" /> Add Orders
                            </Button>
                        </div>

                        <div className="max-h-[450px] overflow-y-auto">
                            {routeDetails?.deliveries && routeDetails.deliveries.length > 0 ? (
                                <div className="space-y-2">
                                    {routeDetails.deliveries.map((delivery: any) => {
                                        const isReturn = delivery.isReturn === 1 || delivery.orderType === 'return';
                                        const isExchange = delivery.orderType === 'exchange';
                                        return (
                                            <div
                                                key={delivery.id}
                                                className="rounded-lg border bg-white/5 border-white/10 p-4"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="font-mono font-medium text-sm">{delivery.waybillNumber}</span>
                                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                                                                <Building2 className="w-3 h-3 mr-1" />{delivery.companyName}
                                                            </Badge>
                                                            {isReturn && (
                                                                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                                                                    <RotateCcw className="w-3 h-3 mr-1" />Return
                                                                </Badge>
                                                            )}
                                                            {isExchange && (
                                                                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                                                                    Exchange
                                                                </Badge>
                                                            )}
                                                            {delivery.codRequired ? (
                                                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                                                                    <DollarSign className="w-3 h-3 mr-0.5" />COD {delivery.codAmount} AED
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">Prepaid</Badge>
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

                                                    <div className="flex-shrink-0">
                                                        {getStatusBadge(delivery.status)}
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
                if (!open) setSelectedOrderIds([]);
            }}>
                <DialogContent className="glass-strong !w-[95vw] !max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    <div className="w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-600" />

                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/20">
                                    <Package className="w-6 h-6 text-emerald-400" />
                                </div>
                                Add Orders to Route
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Select orders to assign to route <span className="font-mono font-medium text-white">{selectedRouteId}</span>
                            </DialogDescription>
                        </DialogHeader>

                        {selectedOrderIds.length > 0 && (
                            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                                <span className="text-sm text-emerald-400">
                                    <CheckCircle2 className="w-4 h-4 inline mr-1" />
                                    {selectedOrderIds.length} order{selectedOrderIds.length > 1 ? 's' : ''} selected
                                </span>
                            </div>
                        )}

                        <div className="max-h-[450px] overflow-y-auto">
                            {availableOrders && availableOrders.length > 0 ? (
                                <div className="space-y-2">
                                    {availableOrders.map((order: any) => {
                                        const isSelected = selectedOrderIds.includes(order.id);
                                        const isReturn = order.isReturn === 1 || order.orderType === 'return';
                                        const isExchange = order.orderType === 'exchange';
                                        return (
                                            <div
                                                key={order.id}
                                                onClick={() => toggleOrderSelection(order.id)}
                                                className={`
                                                    rounded-lg border p-4 cursor-pointer transition-all
                                                    ${isSelected
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/30'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleOrderSelection(order.id)}
                                                        className="h-4 w-4 mt-1 rounded border-gray-300"
                                                    />

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="font-mono font-medium text-sm">{order.waybillNumber}</span>
                                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                                                                <Building2 className="w-3 h-3 mr-1" />{order.companyName}
                                                            </Badge>
                                                            {isReturn && (
                                                                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                                                                    <RotateCcw className="w-3 h-3 mr-1" />Return
                                                                </Badge>
                                                            )}
                                                            {isExchange && (
                                                                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                                                                    <RefreshCw className="w-3 h-3 mr-1" />Exchange
                                                                </Badge>
                                                            )}
                                                            {order.serviceType === 'same-day' && (
                                                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">
                                                                    ⚡ Same Day
                                                                </Badge>
                                                            )}
                                                            {order.serviceType === 'express' && (
                                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                                                                    ⚡ Express
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 text-sm mb-1">
                                                            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                            <span className="font-medium">{order.customerName}</span>
                                                            <span className="text-muted-foreground">•</span>
                                                            <span className="text-muted-foreground truncate">{order.address}</span>
                                                        </div>

                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />{order.city}{order.emirate ? `, ${order.emirate}` : ''}
                                                            </span>
                                                            <span>{order.pieces} pc{order.pieces > 1 ? 's' : ''} • {order.weight} kg</span>
                                                            {order.codRequired ? (
                                                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                                                                    <DollarSign className="w-3 h-3 mr-0.5" />COD {order.codAmount} AED
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">Prepaid</Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                                                        <Select
                                                            value={orderModes[order.id] || 'both'}
                                                            onValueChange={(value: any) => setOrderModes(prev => ({ ...prev, [order.id]: value }))}
                                                        >
                                                            <SelectTrigger className="h-8 w-[160px] bg-white/5 border-white/10 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="both">🔄 Pickup + Delivery</SelectItem>
                                                                <SelectItem value="pickup_only">📦 Pickup Only</SelectItem>
                                                                <SelectItem value="delivery_only">🚚 Delivery Only</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-center py-8 text-muted-foreground">No available orders to add</p>
                            )}
                        </div>

                        <DialogFooter className="pt-4 mt-4 border-t border-white/10">
                            <Button type="button" variant="outline" onClick={() => setAddOrdersDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleAddOrdersToRoute}
                                disabled={selectedOrderIds.length === 0 || addOrdersToRouteMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700"
                            >
                                {addOrdersToRouteMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Add {selectedOrderIds.length} Order{selectedOrderIds.length !== 1 ? 's' : ''}
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
