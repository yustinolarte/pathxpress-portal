import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { APP_LOGO } from '@/const';
import { LogOut, Package, Plus, FileText, Download, DollarSign, Save, LayoutDashboard, Calculator, Search, Wallet } from 'lucide-react';
import DashboardLayout, { MenuItem } from '@/components/DashboardLayout';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { toast } from 'sonner';
import CustomerInvoices from '@/components/CustomerInvoices';
import CustomerCODPanel from '@/components/CustomerCODPanel';
import CustomerRateCalculator from '@/components/CustomerRateCalculator';
import CustomerReports from '@/components/CustomerReports';
import BulkShipmentDialog from '@/components/BulkShipmentDialog';

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { token, user, logout } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [trackingWaybill, setTrackingWaybill] = useState('');
  const [searchedWaybill, setSearchedWaybill] = useState('');

  const { data: trackingData, error: trackingError } = trpc.portal.publicTracking.track.useQuery(
    { waybillNumber: searchedWaybill },
    { enabled: !!searchedWaybill, retry: false }
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending_pickup: 'bg-yellow-500',
      in_transit: 'bg-blue-500',
      out_for_delivery: 'bg-purple-500',
      delivered: 'bg-green-500',
      failed_delivery: 'bg-red-500',
      returned: 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-400';
  };

  const getStatusLabel = (status: string) => status.replace(/_/g, ' ').toUpperCase();

  // Redirect if not authenticated or not customer
  useEffect(() => {
    if (!token || !user || user.role !== 'customer') {
      setLocation('/portal/login');
    }
  }, [token, user, setLocation]);

  // Fetch customer's orders
  const { data: orders, isLoading, refetch } = trpc.portal.customer.getMyOrders.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Fetch customer account
  const { data: account } = trpc.portal.customer.getMyAccount.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = trpc.portal.customer.getDashboardMetrics.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    setLocation('/portal/login');
  };

  if (!token || !user) {
    return null;
  }

  const stats = {
    totalOrders: orders?.length || 0,
    activeOrders: orders?.filter(o => o.status !== 'delivered' && o.status !== 'canceled').length || 0,
  };

  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Overview', value: 'overview' },
    { icon: Package, label: 'My Orders', value: 'orders' },
    { icon: Search, label: 'Track Shipment', value: 'tracking' },
    { icon: Calculator, label: 'Rate Calculator', value: 'calculator' },
    { icon: FileText, label: 'Invoices', value: 'invoices' },
    { icon: Wallet, label: 'COD', value: 'cod' },
    { icon: FileText, label: 'Reports', value: 'reports' },
  ];

  return (
    <DashboardLayout
      menuItems={menuItems}
      activeItem={activeTab}
      onItemClick={setActiveTab}
      user={user}
      logout={handleLogout}
      title="Customer Portal"
    >
      <div className="min-h-full p-4 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <h2 className="text-2xl font-bold">Overview</h2>

            {metricsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="glass-strong border-blue-500/20 animate-pulse">
                    <CardHeader className="pb-2">
                      <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 bg-slate-700 rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {/* Total Shipments This Month */}
                  <Card className="glass-strong border-blue-500/20 hover:border-blue-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Envíos del Mes</CardTitle>
                      <Package className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-400">{metrics?.totalShipmentsThisMonth || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">Mes actual</p>
                    </CardContent>
                  </Card>

                  {/* On-Time Delivery % */}
                  <Card className="glass-strong border-green-500/20 hover:border-green-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Entrega a Tiempo</CardTitle>
                      <Package className="h-4 w-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-400">{metrics?.onTimePercentage || 0}%</div>
                      <p className="text-xs text-muted-foreground mt-1">Este mes</p>
                    </CardContent>
                  </Card>

                  {/* Pending COD */}
                  <Card className="glass-strong border-yellow-500/20 hover:border-yellow-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">COD Pendiente</CardTitle>
                      <DollarSign className="h-4 w-4 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-400">{metrics?.totalPendingCOD || '0.00'} AED</div>
                      <p className="text-xs text-muted-foreground mt-1">Por cobrar</p>
                    </CardContent>
                  </Card>

                  {/* Average Delivery Time */}
                  <Card className="glass-strong border-purple-500/20 hover:border-purple-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Tiempo Promedio</CardTitle>
                      <Package className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-purple-400">{metrics?.averageDeliveryHours || 0}h</div>
                      <p className="text-xs text-muted-foreground mt-1">Tiempo de entrega</p>
                    </CardContent>
                  </Card>

                  {/* Active Shipments */}
                  <Card className="glass-strong border-cyan-500/20 hover:border-cyan-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Envíos Activos</CardTitle>
                      <Package className="h-4 w-4 text-cyan-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-cyan-400">{stats.activeOrders}</div>
                      <p className="text-xs text-muted-foreground mt-1">En tránsito</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Frequent Routes */}
                {metrics?.frequentRoutes && metrics.frequentRoutes.length > 0 && (
                  <Card className="glass-strong border-blue-500/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Rutas Más Frecuentes</CardTitle>
                      <CardDescription>Tus rutas de envío más utilizadas</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {metrics.frequentRoutes.map((route, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm">
                                {index + 1}
                              </div>
                              <span className="font-medium">{route.route}</span>
                            </div>
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                              {route.count} envíos
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="glass-strong border-blue-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Shipments</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats.totalOrders}</div>
                </CardContent>
              </Card>

              <Card className="glass-strong border-blue-500/20">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats.activeOrders}</div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
          </TabsContent>

          {/* Orders Tab */}
          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4 mt-0">
            {/* Actions */}
            <div className="flex justify-end gap-2">
              <BulkShipmentDialog token={token} onSuccess={refetch} />
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Shipment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong">
                  <DialogHeader>
                    <DialogTitle>Create New Shipment</DialogTitle>
                    <DialogDescription>
                      Fill in the shipment details to create a new order
                    </DialogDescription>
                  </DialogHeader>
                  <CreateShipmentForm
                    token={token}
                    onSuccess={() => {
                      setCreateDialogOpen(false);
                      refetch();
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            {/* Orders Table */}
            <Card className="glass-strong border-blue-500/20">
              <CardHeader>
                <CardTitle>My Shipments</CardTitle>
                <CardDescription>View and track all your shipments</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading shipments...</p>
                ) : orders && orders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Waybill</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono font-medium">{order.waybillNumber}</TableCell>
                            <TableCell>{order.customerName}</TableCell>
                            <TableCell>{order.city}, {order.destinationCountry}</TableCell>
                            <TableCell>{order.serviceType}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.status.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => generateWaybillPDF(order)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No shipments yet</p>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Shipment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tracking Tab */}
          <TabsContent value="tracking" className="space-y-4">
            <Card className="glass-strong border-blue-500/20">
              <CardHeader>
                <CardTitle>Track Shipment</CardTitle>
                <CardDescription>Enter waybill number to track</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter waybill number"
                    value={trackingWaybill}
                    onChange={(e) => setTrackingWaybill(e.target.value)}
                  />
                  <Button onClick={() => setSearchedWaybill(trackingWaybill)}>Track</Button>
                </div>
                {trackingData && (
                  <div className="space-y-4 mt-6">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold">Shipment Details</h3>
                      <Badge className={getStatusColor(trackingData.order.status)}>
                        {getStatusLabel(trackingData.order.status)}
                      </Badge>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Waybill:</span> <span className="ml-2 font-medium">{trackingData.order.waybillNumber}</span></div>
                      <div><span className="text-muted-foreground">Service:</span> <span className="ml-2 font-medium">{trackingData.order.serviceType}</span></div>
                      <div><span className="text-muted-foreground">Destination:</span> <span className="ml-2 font-medium">{trackingData.order.city}, {trackingData.order.destinationCountry}</span></div>
                      <div><span className="text-muted-foreground">Weight:</span> <span className="ml-2 font-medium">{trackingData.order.weight} kg</span></div>
                    </div>
                    <div className="mt-6">
                      <h4 className="font-semibold mb-4">Tracking History</h4>
                      <div className="relative space-y-4">
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
                        {trackingData.trackingEvents.sort((a, b) => new Date(b.eventDatetime).getTime() - new Date(a.eventDatetime).getTime()).map((event, i) => (
                          <div key={event.id} className="relative flex gap-4">
                            <div className={`relative z-10 w-4 h-4 rounded-full mt-1 ${i === 0 ? 'bg-primary' : 'bg-muted'}`} />
                            <div className="flex-1 pb-4">
                              <div className="flex justify-between">
                                <div className="flex-1">
                                  <p className="font-medium">{event.statusLabel}</p>
                                  {event.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                                  )}
                                  {event.podFileUrl && (
                                    <div className="mt-2">
                                      <a
                                        href={event.podFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 underline"
                                      >
                                        📄 View Proof of Delivery
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground text-right">
                                  <div>{new Date(event.eventDatetime).toLocaleDateString()}</div>
                                  <div>{new Date(event.eventDatetime).toLocaleTimeString()}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {trackingError && <div className="text-destructive text-sm">{trackingError.message || 'Shipment not found'}</div>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rate Calculator Tab */}
          <TabsContent value="calculator" className="space-y-4">
            <CustomerRateCalculator />
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <CustomerInvoices />
          </TabsContent>

          {/* COD Tab */}
          <TabsContent value="cod" className="space-y-4">
            <CustomerCODPanel />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <CustomerReports token={token} companyName={account?.companyName || 'Your Company'} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout >
  );
}

// Create Shipment Form Component
function CreateShipmentForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const { user } = usePortalAuth();
  const [formData, setFormData] = useState<{
    shipperName: string;
    shipperAddress: string;
    shipperCity: string;
    shipperCountry: string;
    shipperPhone: string;
    customerName: string;
    customerPhone: string;
    address: string;
    city: string;
    emirate: string;
    destinationCountry: string;
    pieces: number;
    weight: string; // Changed to string for better UX (no sticky 0)
    length: string; // Changed to string
    width: string;  // Changed to string
    height: string; // Changed to string
    serviceType: string;
    specialInstructions: string;
    codRequired: number;
    codAmount: string;
    codCurrency: string;
  }>({
    shipperName: '',
    shipperAddress: '',
    shipperCity: '',
    shipperCountry: 'UAE',
    shipperPhone: '',
    customerName: '',
    customerPhone: '',
    address: '',
    city: '',
    emirate: '',
    destinationCountry: 'UAE',
    pieces: 1,
    weight: '', // Default to empty string
    length: '',
    width: '',
    height: '',
    serviceType: 'DOM',
    specialInstructions: '',
    codRequired: 0,
    codAmount: '',
    codCurrency: 'AED',
  });
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [calculatedCODFee, setCalculatedCODFee] = useState<number>(0);
  const [showSaveShipperDialog, setShowSaveShipperDialog] = useState(false);
  const [shipperNickname, setShipperNickname] = useState('');

  // Fetch saved shippers from database
  const { data: savedShippers = [], refetch: refetchShippers } = trpc.portal.customer.getSavedShippers.useQuery(
    { token },
    { enabled: !!token }
  );

  // Create saved shipper mutation
  const createShipperMutation = trpc.portal.customer.createSavedShipper.useMutation({
    onSuccess: () => {
      toast.success('Shipper information saved!');
      setShowSaveShipperDialog(false);
      setShipperNickname('');
      refetchShippers();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save shipper');
    },
  });

  // Delete saved shipper mutation
  const deleteShipperMutation = trpc.portal.customer.deleteSavedShipper.useMutation({
    onSuccess: () => {
      toast.success('Shipper deleted');
      refetchShippers();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete shipper');
    },
  });

  // Save shipper to database
  const handleSaveShipper = () => {
    if (!shipperNickname.trim()) {
      toast.error('Please enter a nickname for this shipper');
      return;
    }

    createShipperMutation.mutate({
      token,
      nickname: shipperNickname,
      shipperName: formData.shipperName,
      shipperAddress: formData.shipperAddress,
      shipperCity: formData.shipperCity,
      shipperCountry: formData.shipperCountry,
      shipperPhone: formData.shipperPhone,
    });
  };

  // Load shipper data
  const handleLoadShipper = (shipperId: string) => {
    const shipper = savedShippers.find((s: any) => s.id.toString() === shipperId);
    if (shipper) {
      setFormData({
        ...formData,
        shipperName: shipper.shipperName,
        shipperAddress: shipper.shipperAddress,
        shipperCity: shipper.shipperCity,
        shipperCountry: shipper.shipperCountry,
        shipperPhone: shipper.shipperPhone,
      });
      toast.success(`Loaded shipper: ${shipper.nickname}`);
    }
  };

  // Delete saved shipper
  const handleDeleteShipper = (shipperId: number) => {
    deleteShipperMutation.mutate({
      token,
      shipperId,
    });
  };

  // Calculate rate mutation
  const calculateRateMutation = trpc.portal.rates.calculate.useMutation({
    onSuccess: (data) => {
      setCalculatedRate(data);
    },
  });

  // Calculate COD fee mutation
  const calculateCODMutation = trpc.portal.rates.calculateCOD.useMutation({
    onSuccess: (data) => {
      setCalculatedCODFee(data.fee);
    },
  });

  // Auto-calculate rate when weight, dimensions or service type changes
  useEffect(() => {
    const weightVal = parseFloat(formData.weight);
    const lengthVal = parseFloat(formData.length);
    const widthVal = parseFloat(formData.width);
    const heightVal = parseFloat(formData.height);

    if (!isNaN(weightVal) && weightVal > 0 && user?.clientId) {
      calculateRateMutation.mutate({
        token,
        clientId: user.clientId,
        serviceType: formData.serviceType as 'DOM' | 'SDD',
        weight: weightVal,
        length: !isNaN(lengthVal) ? lengthVal : undefined,
        width: !isNaN(widthVal) ? widthVal : undefined,
        height: !isNaN(heightVal) ? heightVal : undefined,
      });
    }
  }, [formData.weight, formData.length, formData.width, formData.height, formData.serviceType]);

  // Auto-calculate COD fee when COD amount changes
  useEffect(() => {
    if (formData.codRequired && formData.codAmount) {
      const amount = parseFloat(formData.codAmount);
      if (!isNaN(amount) && amount > 0) {
        calculateCODMutation.mutate({
          token,
          codAmount: amount,
        });
      }
    } else {
      setCalculatedCODFee(0);
    }
  }, [formData.codRequired, formData.codAmount]);

  const createMutation = trpc.portal.customer.createShipment.useMutation({
    onSuccess: () => {
      toast.success('Shipment created successfully!');
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create shipment');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate weight
    const weightVal = parseFloat(formData.weight);
    if (isNaN(weightVal) || weightVal <= 0) {
      toast.error('Please enter a valid weight greater than 0');
      return;
    }

    createMutation.mutate({
      token,
      shipment: {
        ...formData,
        weight: weightVal,
        length: parseFloat(formData.length) || 0,
        width: parseFloat(formData.width) || 0,
        height: parseFloat(formData.height) || 0,
      }
    });
  };

  const applyPreset = (preset: 'small' | 'medium' | 'large') => {
    if (preset === 'small') {
      setFormData({ ...formData, weight: '0.5', length: '10', width: '10', height: '10' });
    } else if (preset === 'medium') {
      setFormData({ ...formData, weight: '2.0', length: '30', width: '20', height: '10' });
    } else if (preset === 'large') {
      setFormData({ ...formData, weight: '5.0', length: '40', width: '30', height: '20' });
    }
    toast.info(`Applied ${preset} package preset`);
  };

  const canSaveShipper = formData.shipperName && formData.shipperAddress && formData.shipperCity && formData.shipperPhone;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* SECTION 1: SHIPPER */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Shipper Details
          </h3>
          <div className="flex gap-2">
            {savedShippers.length > 0 && (
              <Select onValueChange={handleLoadShipper}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Load saved shipper" />
                </SelectTrigger>
                <SelectContent>
                  {savedShippers.map((shipper: any) => (
                    <SelectItem key={shipper.id} value={shipper.id.toString()}>
                      {shipper.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog open={showSaveShipperDialog} onOpenChange={setShowSaveShipperDialog}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!canSaveShipper}
                  title={!canSaveShipper ? "Fill in shipper information first" : "Save this shipper for future use"}
                >
                  <Save className="mr-2 h-3 w-3" />
                  Save Shipper
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-strong">
                <DialogHeader>
                  <DialogTitle>Save Shipper Information</DialogTitle>
                  <DialogDescription>
                    Give this shipper a nickname to easily reuse this information later
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nickname *</Label>
                    <Input
                      value={shipperNickname}
                      onChange={(e) => setShipperNickname(e.target.value)}
                      placeholder="e.g., Main Warehouse, Dubai Office"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 bg-muted/50 p-3 rounded">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="font-medium">Name:</span> {formData.shipperName}</div>
                      <div><span className="font-medium">Phone:</span> {formData.shipperPhone}</div>
                      <div className="col-span-2"><span className="font-medium">Address:</span> {formData.shipperAddress}, {formData.shipperCity}</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowSaveShipperDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSaveShipper}>
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Saved Shippers Management */}
        {savedShippers.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-primary transition-colors">
              Manage saved shippers ({savedShippers.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-2">
              {savedShippers.map((shipper) => (
                <div key={shipper.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border border-transparent hover:border-border transition-colors">
                  <div>
                    <p className="font-medium">{shipper.nickname}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{shipper.shipperName} - {shipper.shipperCity}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive/80"
                    onClick={() => handleDeleteShipper(shipper.id)}
                  >
                    <LogOut className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Shipper Name *</Label>
            <Input
              value={formData.shipperName}
              onChange={(e) => setFormData({ ...formData, shipperName: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label>Shipper Phone *</Label>
            <Input
              value={formData.shipperPhone}
              onChange={(e) => setFormData({ ...formData, shipperPhone: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Shipper Address *</Label>
            <Input
              value={formData.shipperAddress}
              onChange={(e) => setFormData({ ...formData, shipperAddress: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
              placeholder="Building, Street, Area"
            />
          </div>
          <div className="space-y-2">
            <Label>City *</Label>
            <Input
              value={formData.shipperCity}
              onChange={(e) => setFormData({ ...formData, shipperCity: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label>Country *</Label>
            <Input
              value={formData.shipperCountry}
              onChange={(e) => setFormData({ ...formData, shipperCountry: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: CONSIGNEE */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4">
        <div className="border-b pb-2">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Consignee (Receiver)
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Customer Name *</Label>
            <Input
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label>Customer Phone *</Label>
            <Input
              value={formData.customerPhone}
              onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Delivery Address *</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
              placeholder="Building, Street, Area"
            />
          </div>
          <div className="space-y-2">
            <Label>City *</Label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
            />
          </div>
          <div className="space-y-2">
            <Label>Emirate (if UAE)</Label>
            <Select value={formData.emirate} onValueChange={(value) => setFormData({ ...formData, emirate: value })}>
              <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
                <SelectValue placeholder="Select emirate" />
              </SelectTrigger>
              <SelectContent>
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'].map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* SECTION 3: PACKAGE & SERVICE */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4">
        <div className="border-b pb-2 flex justify-between items-center">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Shipment Details
          </h3>
          <div className="flex gap-2 text-xs items-center">
            <span className="text-muted-foreground mr-1">Presets:</span>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyPreset('small')}>Small</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyPreset('medium')}>Medium</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyPreset('large')}>Large</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Service Type *</Label>
            <Select value={formData.serviceType} onValueChange={(value) => setFormData({ ...formData, serviceType: value })}>
              <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DOM">Domestic Express (DOM) - Next Business Day</SelectItem>
                <SelectItem value="SDD">Same-Day Delivery (SDD) - City Limits</SelectItem>
              </SelectContent>
            </Select>
            {formData.serviceType === 'SDD' && (
              <p className="text-xs text-yellow-500 flex items-center gap-1 font-medium bg-yellow-500/10 p-2 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 block"></span>
                Cut-off: 14:00 | Min 4 shipments/collection
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Weight (kg) *</Label>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="0.0"
                required
                className="bg-background/50 focus:bg-background transition-colors pr-8 font-mono"
              />
              <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">kg</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dimensions (L × W × H) cm</Label>
            <div className="flex gap-2">
              <Input className="bg-background/50 focus:bg-background transition-colors text-center px-1 font-mono" type="number" value={formData.length} onChange={(e) => setFormData({ ...formData, length: e.target.value })} placeholder="L" title="Length" />
              <Input className="bg-background/50 focus:bg-background transition-colors text-center px-1 font-mono" type="number" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="W" title="Width" />
              <Input className="bg-background/50 focus:bg-background transition-colors text-center px-1 font-mono" type="number" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} placeholder="H" title="Height" />
            </div>
          </div>

          {calculatedRate && (
            <div className="col-span-2 mt-1 p-3 bg-primary/10 rounded-lg border border-primary/20 flex justify-between items-center shadow-inner">
              <div>
                <p className="text-sm font-semibold text-primary">Estimated Cost</p>
                {calculatedRate.chargeableWeight && calculatedRate.chargeableWeight > parseFloat(formData.weight || '0') && (
                  <p className="text-[10px] text-muted-foreground">
                    Volumetric Weight: <span className="font-medium text-foreground">{calculatedRate.chargeableWeight.toFixed(2)} kg</span> applied
                  </p>
                )}
              </div>
              <div className="text-xl font-bold text-primary">{calculatedRate.totalRate.toFixed(2)} AED</div>
            </div>
          )}

          <div className="col-span-2 space-y-2">
            <Label>Special Instructions</Label>
            <Textarea
              value={formData.specialInstructions}
              onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
              placeholder="Any special handling instructions..."
              rows={2}
              className="bg-background/50 focus:bg-background transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      {/* SECTION 4: PAYMENT */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4">
        <div className="border-b pb-2">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-green-600" />
            Payment (COD)
          </h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border p-3 rounded bg-background/50 hover:bg-background transition-colors cursor-pointer" onClick={() => {
            const checked = formData.codRequired !== 1;
            setFormData({ ...formData, codRequired: checked ? 1 : 0, codAmount: checked ? formData.codAmount : '' });
          }}>
            <Checkbox
              id="codRequired"
              checked={formData.codRequired === 1}
              onCheckedChange={(checked) => setFormData({ ...formData, codRequired: checked ? 1 : 0, codAmount: checked ? formData.codAmount : '' })}
            />
            <Label htmlFor="codRequired" className="cursor-pointer flex-1 user-select-none">
              Collect Cash on Delivery (COD)
            </Label>
          </div>

          {formData.codRequired === 1 && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <Label>COD Amount (AED) *</Label>
              <div className="flex gap-4 items-center mt-1.5">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.codAmount}
                    onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })}
                    placeholder="0.00"
                    required
                    className="text-lg font-medium pl-8 font-mono bg-background/50 focus:bg-background transition-colors"
                  />
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                </div>
                {calculatedCODFee > 0 && (
                  <div className="text-sm border-l pl-4">
                    <span className="text-muted-foreground block text-xs">COD Fee</span>
                    <span className="font-semibold text-orange-500">{calculatedCODFee.toFixed(2)} AED</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur py-4 border-t flex justify-end gap-3 mt-4 -mx-6 px-6 z-10">
        <Button type="submit" disabled={createMutation.isPending} size="lg" className="w-full sm:w-auto shadow-lg hover:shadow-primary/25 transition-all">
          {createMutation.isPending ? (
            <>
              <span className="animate-spin mr-2">⏳</span> Creating Shipment...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Create Shipment
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
