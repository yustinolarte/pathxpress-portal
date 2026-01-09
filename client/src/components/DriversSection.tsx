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
import {
    Users, Truck, Package, AlertTriangle, Plus, Eye, Edit, Trash2,
    RefreshCw, MapPin, Clock, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';

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
            setNewRoute({ id: '', date: new Date().toISOString().split('T')[0], driverId: '', zone: '', vehicleInfo: '' });
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
        addOrdersToRouteMutation.mutate({
            token: token || '',
            routeId: selectedRouteId,
            orderIds: selectedOrderIds,
        });
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
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="dashboard" className="flex items-center gap-2">
                        <Truck className="h-4 w-4" /> Dashboard
                    </TabsTrigger>
                    <TabsTrigger value="drivers" className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> Drivers
                    </TabsTrigger>
                    <TabsTrigger value="routes" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> Routes
                    </TabsTrigger>
                    <TabsTrigger value="deliveries" className="flex items-center gap-2">
                        <Package className="h-4 w-4" /> Deliveries
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Reports
                    </TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="glass-strong border-blue-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Active Drivers
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dashboardStats?.drivers.active || 0}</div>
                                <p className="text-xs text-muted-foreground">of {dashboardStats?.drivers.total || 0} total</p>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-green-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <MapPin className="w-4 h-4" /> Routes Today
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dashboardStats?.routes.today || 0}</div>
                                <p className="text-xs text-muted-foreground">of {dashboardStats?.routes.total || 0} total</p>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-purple-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Package className="w-4 h-4" /> Deliveries
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dashboardStats?.deliveries.delivered || 0}</div>
                                <p className="text-xs text-muted-foreground">{dashboardStats?.deliveries.pending || 0} pending</p>
                            </CardContent>
                        </Card>

                        <Card className="glass-strong border-orange-500/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Pending Reports
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{dashboardStats?.reports.pending || 0}</div>
                                <p className="text-xs text-muted-foreground">need attention</p>
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
                                            <TableHead>Deliveries</TableHead>
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
                                                    <span className="text-green-400">{route.deliveryStats?.delivered || 0}</span>
                                                    <span className="text-muted-foreground">/</span>
                                                    <span>{route.deliveryStats?.total || 0}</span>
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
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Create Route</DialogTitle>
                        <DialogDescription>Create a new delivery route</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Route ID *</Label>
                                <Input
                                    value={newRoute.id}
                                    onChange={(e) => setNewRoute({ ...newRoute, id: e.target.value })}
                                    placeholder="DXB-2025-001"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Date *</Label>
                                <Input
                                    type="date"
                                    value={newRoute.date}
                                    onChange={(e) => setNewRoute({ ...newRoute, date: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Assign Driver</Label>
                            <Select
                                value={newRoute.driverId}
                                onValueChange={(value) => setNewRoute({ ...newRoute, driverId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select driver (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Unassigned</SelectItem>
                                    {drivers?.map((driver: any) => (
                                        <SelectItem key={driver.id} value={driver.id.toString()}>
                                            {driver.fullName} ({driver.vehicleNumber || 'No vehicle'})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Zone</Label>
                                <Input
                                    value={newRoute.zone}
                                    onChange={(e) => setNewRoute({ ...newRoute, zone: e.target.value })}
                                    placeholder="Downtown Dubai"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Vehicle Info</Label>
                                <Input
                                    value={newRoute.vehicleInfo}
                                    onChange={(e) => setNewRoute({ ...newRoute, vehicleInfo: e.target.value })}
                                    placeholder="White Van"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateRouteDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateRoute} disabled={createRouteMutation.isPending}>
                            {createRouteMutation.isPending ? 'Creating...' : 'Create Route'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Route Details Dialog */}
            <Dialog open={routeDetailsDialogOpen} onOpenChange={setRouteDetailsDialogOpen}>
                <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Route Details: {routeDetails?.id}</DialogTitle>
                        <DialogDescription>
                            {routeDetails?.driver?.fullName || 'Unassigned'} • {routeDetails?.zone || 'No zone'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="flex justify-end mb-4">
                            <Button onClick={() => setAddOrdersDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Orders
                            </Button>
                        </div>
                        {routeDetails?.deliveries && routeDetails.deliveries.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Waybill</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>City</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Delivered At</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {routeDetails.deliveries.map((delivery: any) => (
                                        <TableRow key={delivery.id}>
                                            <TableCell className="font-mono">{delivery.waybillNumber}</TableCell>
                                            <TableCell>{delivery.customerName}</TableCell>
                                            <TableCell>{delivery.city}</TableCell>
                                            <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                                            <TableCell>
                                                {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-center py-8 text-muted-foreground">No deliveries in this route</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Orders to Route Dialog */}
            <Dialog open={addOrdersDialogOpen} onOpenChange={(open) => {
                setAddOrdersDialogOpen(open);
                if (!open) setSelectedOrderIds([]);
            }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Add Orders to Route</DialogTitle>
                        <DialogDescription>Select orders to add to route {selectedRouteId}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 max-h-[400px] overflow-y-auto">
                        {availableOrders && availableOrders.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10"></TableHead>
                                        <TableHead>Waybill</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>City</TableHead>
                                        <TableHead>Type</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {availableOrders.map((order: any) => (
                                        <TableRow
                                            key={order.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => toggleOrderSelection(order.id)}
                                        >
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOrderIds.includes(order.id)}
                                                    onChange={() => toggleOrderSelection(order.id)}
                                                    className="h-4 w-4 rounded border-gray-300"
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono">{order.waybillNumber}</TableCell>
                                            <TableCell>{order.customerName}</TableCell>
                                            <TableCell>{order.city}</TableCell>
                                            <TableCell>
                                                {order.codRequired ? (
                                                    <Badge className="bg-orange-500/20 text-orange-400">COD {order.codAmount}</Badge>
                                                ) : (
                                                    <Badge className="bg-green-500/20 text-green-400">Prepaid</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-center py-8 text-muted-foreground">No available orders to add</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOrdersDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleAddOrdersToRoute}
                            disabled={selectedOrderIds.length === 0 || addOrdersToRouteMutation.isPending}
                        >
                            {addOrdersToRouteMutation.isPending ? 'Adding...' : `Add ${selectedOrderIds.length} Order(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

