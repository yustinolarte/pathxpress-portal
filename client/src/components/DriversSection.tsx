/**
 * Drivers Section for Admin Dashboard
 * Provides management of drivers, routes, deliveries, and reports
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
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
    DollarSign, RotateCcw, Weight, Boxes
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
    const { token } = usePortalAuth();
    const [activeTab, setActiveTab] = useState('dashboard');

    // Dialogs
    const [createDriverDialogOpen, setCreateDriverDialogOpen] = useState(false);
    const [editDriverDialogOpen, setEditDriverDialogOpen] = useState(false);
    const [createRouteDialogOpen, setCreateRouteDialogOpen] = useState(false);
    const [routeDetailsDialogOpen, setRouteDetailsDialogOpen] = useState(false);
    const [addOrdersDialogOpen, setAddOrdersDialogOpen] = useState(false);

    // Selected items
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
    const [orderModes, setOrderModes] = useState<Record<number, 'pickup_only' | 'delivery_only' | 'both'>>({});

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
        trpc.portal.drivers.getDashboardStats.useQuery(
            { token: token || '' },
            { enabled: !!token }
        );

    const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } =
        trpc.portal.drivers.getAllDrivers.useQuery(
            { token: token || '' },
            { enabled: !!token }
        );

    const { data: routes, isLoading: routesLoading, refetch: refetchRoutes } =
        trpc.portal.drivers.getAllRoutes.useQuery(
            { token: token || '' },
            { enabled: !!token }
        );

    const { data: deliveries, isLoading: deliveriesLoading, refetch: refetchDeliveries } =
        trpc.portal.drivers.getAllDeliveries.useQuery(
            { token: token || '' },
            { enabled: !!token }
        );

    const { data: reports, isLoading: reportsLoading, refetch: refetchReports } =
        trpc.portal.drivers.getAllReports.useQuery(
            { token: token || '' },
            { enabled: !!token }
        );

    const { data: routeDetails, refetch: refetchRouteDetails } = trpc.portal.drivers.getRouteDetails.useQuery(
        { token: token || '', routeId: selectedRouteId || '' },
        { enabled: !!token && !!selectedRouteId }
    );

    const { data: availableOrders, refetch: refetchAvailableOrders } = trpc.portal.drivers.getAvailableOrders.useQuery(
        { token: token || '' },
        { enabled: !!token && addOrdersDialogOpen }
    );

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
        onSuccess: () => {
            toast.success('Route created successfully');
            setCreateRouteDialogOpen(false);
            setNewRoute({ id: '', date: new Date().toISOString().split('T')[0], driverId: '', zone: '', vehicleInfo: '', notes: '' });
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
        createDriverMutation.mutate({ token: token || '', ...newDriver });
    };

    const handleUpdateDriver = () => {
        if (!selectedDriver) return;
        updateDriverMutation.mutate({
            token: token || '',
            id: selectedDriver.id,
            ...selectedDriver,
        });
    };

    const handleDeleteDriver = (id: number, name: string) => {
        if (confirm(`Are you sure you want to delete driver "${name}"?`)) {
            deleteDriverMutation.mutate({ token: token || '', id });
        }
    };

    const handleCreateRoute = () => {
        if (!newRoute.id || !newRoute.date) {
            toast.error('Route ID and date are required');
            return;
        }
        createRouteMutation.mutate({
            token: token || '',
            id: newRoute.id,
            date: newRoute.date,
            driverId: newRoute.driverId && newRoute.driverId !== 'none' ? parseInt(newRoute.driverId) : undefined,
            zone: newRoute.zone,
            vehicleInfo: newRoute.vehicleInfo,
        });
    };

    const handleUpdateReportStatus = (reportId: number, status: 'pending' | 'in_review' | 'resolved' | 'rejected') => {
        updateReportStatusMutation.mutate({ token: token || '', id: reportId, status });
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
            token: token || '',
            routeId: selectedRouteId,
            orders: ordersPayload,
        });
    };

    const handleDeleteRoute = (routeId: string) => {
        if (confirm(`Are you sure you want to delete route ${routeId}?`)) {
            deleteRouteMutation.mutate({ token: token || '', routeId });
        }
    };

    const handleDeleteReport = (id: number) => {
        if (confirm('Are you sure you want to delete this report?')) {
            deleteReportMutation.mutate({ token: token || '', id });
        }
    };

    const toggleOrderSelection = (orderId: number) => {
        setSelectedOrderIds(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
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

    return (
        <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5 bg-transparent border border-white/10 p-1.5 rounded-xl h-auto">
                    <TabsTrigger
                        value="dashboard"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Truck className="h-4 w-4" /> Dashboard
                    </TabsTrigger>
                    <TabsTrigger
                        value="drivers"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Users className="h-4 w-4" /> Drivers
                    </TabsTrigger>
                    <TabsTrigger
                        value="routes"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <MapPin className="h-4 w-4" /> Routes
                    </TabsTrigger>
                    <TabsTrigger
                        value="deliveries"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
                    >
                        <Package className="h-4 w-4" /> Deliveries
                    </TabsTrigger>
                    <TabsTrigger
                        value="reports"
                        className="flex items-center gap-2 py-3 rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-white transition-all duration-300"
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
                                    <div className="text-4xl font-mono font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
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
                                    <div className="text-4xl font-mono font-bold text-white mb-1 group-hover:text-green-400 transition-colors">
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
                                    <div className="text-4xl font-mono font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">
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
                                    <div className="text-4xl font-mono font-bold text-white mb-1 group-hover:text-red-400 transition-colors">
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
                                <CardDescription>Manage delivery drivers</CardDescription>
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
                                                <TableCell className="font-medium">{driver.fullName}</TableCell>
                                                <TableCell>{driver.phone || '-'}</TableCell>
                                                <TableCell>{driver.vehicleNumber || '-'}</TableCell>
                                                <TableCell>{getStatusBadge(driver.status)}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
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
                        <CardContent>
                            {routesLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading routes...</p>
                            ) : routes && routes.length > 0 ? (
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
                                        {routes.map((route: any) => (
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
                                                <TableCell>{getStatusBadge(route.status)}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
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
                        <CardContent>
                            {deliveriesLoading ? (
                                <p className="text-center py-8 text-muted-foreground">Loading deliveries...</p>
                            ) : deliveries && deliveries.length > 0 ? (
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
                                        {deliveries.map((delivery: any) => (
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
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Add New Driver</DialogTitle>
                        <DialogDescription>Create a new driver account</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Username *</Label>
                                <Input
                                    value={newDriver.username}
                                    onChange={(e) => setNewDriver({ ...newDriver, username: e.target.value })}
                                    placeholder="driver1"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Password *</Label>
                                <Input
                                    type="password"
                                    value={newDriver.password}
                                    onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Full Name *</Label>
                            <Input
                                value={newDriver.fullName}
                                onChange={(e) => setNewDriver({ ...newDriver, fullName: e.target.value })}
                                placeholder="John Doe"
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
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input
                                    value={newDriver.phone}
                                    onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                                    placeholder="+971 50 123 4567"
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
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Emirates ID</Label>
                                <Input
                                    value={newDriver.emiratesId}
                                    onChange={(e) => setNewDriver({ ...newDriver, emiratesId: e.target.value })}
                                    placeholder="784-XXXX-XXXXXXX-X"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDriverDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateDriver} disabled={createDriverMutation.isPending}>
                            {createDriverMutation.isPending ? 'Creating...' : 'Create Driver'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Driver Dialog */}
            <Dialog open={editDriverDialogOpen} onOpenChange={setEditDriverDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Edit Driver</DialogTitle>
                        <DialogDescription>Update driver information</DialogDescription>
                    </DialogHeader>
                    {selectedDriver && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    value={selectedDriver.fullName}
                                    onChange={(e) => setSelectedDriver({ ...selectedDriver, fullName: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        type="email"
                                        value={selectedDriver.email || ''}
                                        onChange={(e) => setSelectedDriver({ ...selectedDriver, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={selectedDriver.phone || ''}
                                        onChange={(e) => setSelectedDriver({ ...selectedDriver, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Vehicle Number</Label>
                                    <Input
                                        value={selectedDriver.vehicleNumber || ''}
                                        onChange={(e) => setSelectedDriver({ ...selectedDriver, vehicleNumber: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select
                                        value={selectedDriver.status}
                                        onValueChange={(value) => setSelectedDriver({ ...selectedDriver, status: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                            <SelectItem value="suspended">Suspended</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDriverDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateDriver} disabled={updateDriverMutation.isPending}>
                            {updateDriverMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Route Dialog */}
            <Dialog open={createRouteDialogOpen} onOpenChange={setCreateRouteDialogOpen}>
                <DialogContent className="glass-strong !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    {/* Decorative Top Line */}
                    <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />

                    <div className="p-6">
                        {/* Header */}
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/20">
                                    <MapPin className="w-6 h-6 text-blue-400" />
                                </div>
                                Create Route
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Set up a new delivery route for a driver
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Route ID & Date */}
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

                            {/* Assign Driver */}
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

                            {/* Zone & Vehicle */}
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

                            {/* Notes */}
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

                            {/* Footer */}
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
                                            Create Route
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Route Details Dialog */}
            <Dialog open={routeDetailsDialogOpen} onOpenChange={setRouteDetailsDialogOpen}>
                <DialogContent className="glass-strong !w-[95vw] !max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                    {/* Decorative Top Line */}
                    <div className="w-full h-1 bg-gradient-to-r from-indigo-600 to-purple-600" />

                    <div className="p-6">
                        {/* Header */}
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

                        <div className="flex justify-end mb-4">
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
                                                        {/* Top: waybill + badges */}
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

                                                        {/* Customer */}
                                                        <div className="flex items-center gap-2 text-sm mb-1">
                                                            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                            <span className="font-medium">{delivery.customerName}</span>
                                                            <span className="text-muted-foreground">•</span>
                                                            <span className="text-muted-foreground truncate">{delivery.city}</span>
                                                        </div>

                                                        {/* Details row */}
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <span>{delivery.pieces} pc{delivery.pieces > 1 ? 's' : ''} • {delivery.weight} kg</span>
                                                            {delivery.deliveredAt && (
                                                                <span>Delivered: {new Date(delivery.deliveredAt).toLocaleString()}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Status */}
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
                    {/* Decorative Top Line */}
                    <div className="w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-600" />

                    <div className="p-6">
                        {/* Header */}
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

                        {/* Selection summary */}
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
                                                    {/* Checkbox */}
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleOrderSelection(order.id)}
                                                        className="h-4 w-4 mt-1 rounded border-gray-300"
                                                    />

                                                    {/* Main info */}
                                                    <div className="flex-1 min-w-0">
                                                        {/* Top row: waybill + badges */}
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

                                                        {/* Customer + Address */}
                                                        <div className="flex items-center gap-2 text-sm mb-1">
                                                            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                            <span className="font-medium">{order.customerName}</span>
                                                            <span className="text-muted-foreground">•</span>
                                                            <span className="text-muted-foreground truncate">{order.address}</span>
                                                        </div>

                                                        {/* City + details row */}
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

                                                    {/* Stop Mode selector */}
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

                        {/* Footer */}
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

