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
            <div className="flex justify-end">
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
  const [formData, setFormData] = useState({
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
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
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

  // Auto-calculate rate when weight or service type changes
  useEffect(() => {
    if (formData.weight > 0 && user?.clientId) {
      calculateRateMutation.mutate({
        token,
        clientId: user.clientId,
        serviceType: formData.serviceType as 'DOM' | 'SDD',
        weight: formData.weight,
      });
    }
  }, [formData.weight, formData.serviceType]);

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
    createMutation.mutate({ token, shipment: formData });
  };

  const canSaveShipper = formData.shipperName && formData.shipperAddress && formData.shipperCity && formData.shipperPhone;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Shipper Information */}
        <div className="col-span-2 flex items-center justify-between">
          <h3 className="font-semibold">Shipper Information</h3>
          <div className="flex gap-2">
            {savedShippers.length > 0 && (
              <Select onValueChange={handleLoadShipper}>
                <SelectTrigger className="w-[200px]">
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
                  disabled={!canSaveShipper}
                  title={!canSaveShipper ? "Fill in shipper information first" : "Save this shipper for future use"}
                >
                  <Save className="mr-2 h-4 w-4" />
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
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Name:</strong> {formData.shipperName}</p>
                    <p><strong>Address:</strong> {formData.shipperAddress}</p>
                    <p><strong>City:</strong> {formData.shipperCity}</p>
                    <p><strong>Phone:</strong> {formData.shipperPhone}</p>
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
          <div className="col-span-2">
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Manage saved shippers ({savedShippers.length})
              </summary>
              <div className="mt-2 space-y-2">
                {savedShippers.map((shipper) => (
                  <div key={shipper.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <div>
                      <p className="font-medium">{shipper.nickname}</p>
                      <p className="text-xs text-muted-foreground">{shipper.shipperName} - {shipper.shipperCity}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteShipper(shipper.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        <div>
          <Label>Shipper Name *</Label>
          <Input
            value={formData.shipperName}
            onChange={(e) => setFormData({ ...formData, shipperName: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Shipper Phone *</Label>
          <Input
            value={formData.shipperPhone}
            onChange={(e) => setFormData({ ...formData, shipperPhone: e.target.value })}
            required
          />
        </div>
        <div className="col-span-2">
          <Label>Shipper Address *</Label>
          <Input
            value={formData.shipperAddress}
            onChange={(e) => setFormData({ ...formData, shipperAddress: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Shipper City *</Label>
          <Input
            value={formData.shipperCity}
            onChange={(e) => setFormData({ ...formData, shipperCity: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Shipper Country *</Label>
          <Input
            value={formData.shipperCountry}
            onChange={(e) => setFormData({ ...formData, shipperCountry: e.target.value })}
            required
          />
        </div>

        {/* Consignee Information */}
        <div className="col-span-2 mt-4">
          <h3 className="font-semibold mb-2">Consignee Information</h3>
        </div>
        <div>
          <Label>Customer Name *</Label>
          <Input
            value={formData.customerName}
            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Customer Phone *</Label>
          <Input
            value={formData.customerPhone}
            onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
            required
          />
        </div>
        <div className="col-span-2">
          <Label>Delivery Address *</Label>
          <Input
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>City *</Label>
          <Input
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Emirate (if UAE)</Label>
          <Select value={formData.emirate} onValueChange={(value) => setFormData({ ...formData, emirate: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select emirate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dubai">Dubai</SelectItem>
              <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
              <SelectItem value="Sharjah">Sharjah</SelectItem>
              <SelectItem value="Ajman">Ajman</SelectItem>
              <SelectItem value="Ras Al Khaimah">Ras Al Khaimah</SelectItem>
              <SelectItem value="Fujairah">Fujairah</SelectItem>
              <SelectItem value="Umm Al Quwain">Umm Al Quwain</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Shipment Details */}
        <div className="col-span-2 mt-4">
          <h3 className="font-semibold mb-2">Shipment Details</h3>
        </div>
        <div>
          <Label>Service Type *</Label>
          <Select value={formData.serviceType} onValueChange={(value) => setFormData({ ...formData, serviceType: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DOM">Domestic Express (DOM) - Next Business Day</SelectItem>
              <SelectItem value="SDD">Same-Day Delivery (SDD) - City Limits</SelectItem>
            </SelectContent>
          </Select>
          {formData.serviceType === 'SDD' && (
            <p className="text-xs text-yellow-400 mt-1">Cut-off: 14:00 | Min 4 shipments/collection</p>
          )}
        </div>
        <div className="col-span-2">
          <Label>Weight (kg) *</Label>
          <Input
            type="number"
            step="0.1"
            value={formData.weight}
            onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
            required
          />
          {calculatedRate && (
            <div className="mt-2 p-3 bg-green-500/10 rounded-lg border border-green-500/30">
              <p className="text-sm font-semibold text-green-400">Estimated Shipping Cost</p>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-muted-foreground">Base Rate (0-{calculatedRate.appliedTier?.maxWeight || 5}kg):</span>
                <span className="text-sm font-medium">{calculatedRate.baseRate.toFixed(2)} AED</span>
              </div>
              {calculatedRate.additionalKgCharge > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Additional Weight:</span>
                  <span className="text-sm font-medium">+{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                </div>
              )}
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-green-500/30">
                <span className="text-sm font-semibold">Total Shipping:</span>
                <span className="text-lg font-bold text-green-400">{calculatedRate.totalRate.toFixed(2)} AED</span>
              </div>
              {calculatedCODFee > 0 && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">COD Fee:</span>
                  <span className="text-sm font-medium text-orange-400">+{calculatedCODFee.toFixed(2)} AED</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <Label>Length (cm)</Label>
          <Input
            type="number"
            value={formData.length}
            onChange={(e) => setFormData({ ...formData, length: parseFloat(e.target.value) || 0 })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label>Width (cm)</Label>
          <Input
            type="number"
            value={formData.width}
            onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) || 0 })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label>Height (cm)</Label>
          <Input
            type="number"
            value={formData.height}
            onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) || 0 })}
            placeholder="Optional"
          />
        </div>
        <div className="col-span-2">
          <Label>Special Instructions</Label>
          <Textarea
            value={formData.specialInstructions}
            onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
            placeholder="Any special handling instructions..."
            rows={3}
          />
        </div>

        {/* COD Section */}
        <div className="col-span-2 mt-4">
          <h3 className="font-semibold mb-2">Cash on Delivery (COD)</h3>
        </div>
        <div className="col-span-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="codRequired"
              checked={formData.codRequired === 1}
              onCheckedChange={(checked) => setFormData({ ...formData, codRequired: checked ? 1 : 0, codAmount: checked ? formData.codAmount : '' })}
            />
            <Label htmlFor="codRequired" className="cursor-pointer">
              This shipment requires Cash on Delivery (COD)
            </Label>
          </div>
        </div>
        {formData.codRequired === 1 && (
          <div className="col-span-2">
            <Label>COD Amount to Collect *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.codAmount}
              onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })}
              placeholder="Enter amount to collect from customer"
              required
            />
            {calculatedCODFee > 0 && (
              <p className="text-xs text-orange-400 mt-1">
                COD Fee (3.3%, min 2 AED): {calculatedCODFee.toFixed(2)} AED
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating...' : 'Create Shipment'}
        </Button>
      </div>
    </form>
  );
}
