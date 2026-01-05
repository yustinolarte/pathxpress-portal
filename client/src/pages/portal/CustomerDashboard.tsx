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
import {
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Filter,
  MoreHorizontal,
  FileText,
  Download,
  Plus,
  ArrowRight,
  TrendingUp,
  MapPin,
  Clock,
  Phone,
  Mail,
  User,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  Euro,
  ArrowLeftRight,
  Loader2,
  X,
  LogOut,
  Save,
  LayoutDashboard,
  Calculator,
  Wallet,
  BarChart3,
  RotateCcw
} from 'lucide-react';
import DashboardLayout, { MenuItem } from '@/components/DashboardLayout';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { toast } from 'sonner';
import CustomerInvoices from '@/components/CustomerInvoices';
import CustomerCODPanel from '@/components/CustomerCODPanel';
import CustomerRateCalculator from '@/components/CustomerRateCalculator';
import CustomerReports from '@/components/CustomerReports';
import BulkShipmentDialog from '@/components/BulkShipmentDialog';
import CustomerAnalytics from '@/components/CustomerAnalytics';
import ReturnsExchangesPanel from '@/components/ReturnsExchangesPanel';
import * as XLSX from 'xlsx';

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { token, user, logout } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [trackingWaybill, setTrackingWaybill] = useState('');
  const [searchedWaybill, setSearchedWaybill] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);

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
  const { data: orders, isLoading: isLoadingOrders, refetch } = trpc.portal.customer.getMyOrders.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Filtered orders based on status and date
  const filteredOrders = orders?.filter((order: any) => {
    let matchesStatus = true;
    let matchesDate = true;

    if (filterStatus !== 'all') {
      matchesStatus = order.status === filterStatus;
    }

    if (filterDateFrom) {
      const orderDate = new Date(order.createdAt).setHours(0, 0, 0, 0);
      const fromDate = new Date(filterDateFrom).setHours(0, 0, 0, 0);
      if (orderDate < fromDate) matchesDate = false;
    }

    if (filterDateTo && matchesDate) {
      const orderDate = new Date(order.createdAt).setHours(0, 0, 0, 0);
      const toDate = new Date(filterDateTo).setHours(0, 0, 0, 0);
      if (orderDate > toDate) matchesDate = false;
    }

    return matchesStatus && matchesDate;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      if (filteredOrders) {
        setSelectedOrderIds(filteredOrders.map((o: any) => o.id));
      }
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds((prev) => [...prev, id]);
    } else {
      setSelectedOrderIds((prev) => prev.filter((orderId) => orderId !== id));
    }
  };

  const handleExportOrders = () => {
    if (!filteredOrders || filteredOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }

    const data = filteredOrders.map((order: any) => ({
      'Waybill': order.waybillNumber,
      'Customer': order.customerName,
      'Phone': order.customerPhone,
      'City': order.city,
      'Status': getStatusLabel(order.status),
      'Service': order.serviceType,
      'Weight': order.weight,
      'COD Amount': order.codAmount || '0',
      'Created At': new Date(order.createdAt).toLocaleDateString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    XLSX.writeFile(workbook, `Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Orders exported successfully');
  };

  const handleBulkDownloadWaybills = async () => {
    let ordersToDownload = [];

    if (selectedOrderIds.length > 0) {
      ordersToDownload = orders?.filter((o: any) => selectedOrderIds.includes(o.id)) || [];
    } else {
      ordersToDownload = filteredOrders || [];
    }

    if (!ordersToDownload || ordersToDownload.length === 0) {
      toast.error('No orders to download waybills for');
      return;
    }

    setBulkDownloading(true);
    toast.info('Starting bulk download, please wait...');

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let count = 0;

      // Process sequentially to avoid browser hanging
      for (const order of ordersToDownload) {
        // We use a trick here: generateWaybillPDF saves the file, but we want the blob.
        // We'll modify generateWaybillPDF to accept a returnBlob flag, or just use the logic directly.
        // For now, let's assume we can't easily modify generateWaybillPDF to return blob without breaking other things.
        // So we will reconstruct the logic here mainly or try to use a modified version.

        // Actually, let's use a simpler approach: create a separate minimal generation function or
        // define a way to capture the PDF output.
        // Since we can't easily change the imported function's return type without affecting other calls,
        // we'll use the existing function but we need it to return the PDF object or blob instead of saving.

        // LIMITATION: generateWaybillPDF currently forces .save(). 
        // We need to modify generateWaybillPDF first to support returning the blob.

        // Let's assume we will modify generateWaybillPDF in the next step to support 'returnBlob' option.
        // For now, I will write this assuming generateWaybillPDF can return a blob if a second arg is true.
        // I will update generateWaybillPDF immediately after this.

        try {
          // We will modify generateWaybillPDF to take an optional second argument `returnBlob?: boolean`
          // @ts-ignore
          const pdfBlob = await generateWaybillPDF(order, true);
          if (pdfBlob) {
            zip.file(`${order.waybillNumber}.pdf`, pdfBlob);
            count++;
          }
        } catch (e) {
          console.error(`Failed to generate PDF for ${order.waybillNumber}`, e);
        }
      }

      if (count > 0) {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Waybills_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success(`Downloaded ${count} waybills`);
      } else {
        toast.error('Failed to generate any waybills');
      }

    } catch (error) {
      console.error('Bulk download error:', error);
      toast.error('Failed to download waybills');
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleViewTracking = (waybill: string) => {
    setSearchedWaybill(waybill);
    setTrackingDialogOpen(true);
  };

  // Cancel order mutation
  const cancelOrderMutation = trpc.portal.customer.cancelOrder.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || 'Order canceled successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to cancel order');
    },
  });

  const handleCancelOrder = (orderId: number, waybillNumber: string) => {
    if (confirm(`Are you sure you want to cancel order ${waybillNumber}? This action cannot be undone.`)) {
      cancelOrderMutation.mutate({
        token: token || '',
        orderId,
      });
    }
  };

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
    { icon: BarChart3, label: 'Analytics', value: 'analytics' },
    { icon: Package, label: 'My Orders', value: 'orders' },
    { icon: ArrowLeftRight, label: 'Returns & Exchanges', value: 'returns' },
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
                      <CardTitle className="text-sm font-medium text-muted-foreground">Shipments This Month</CardTitle>
                      <Package className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-400">{metrics?.totalShipmentsThisMonth || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">Current month</p>
                    </CardContent>
                  </Card>

                  {/* On-Time Delivery % */}
                  <Card className="glass-strong border-green-500/20 hover:border-green-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">On-Time Delivery</CardTitle>
                      <Package className="h-4 w-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-400">{metrics?.onTimePercentage || 0}%</div>
                      <p className="text-xs text-muted-foreground mt-1">This month</p>
                    </CardContent>
                  </Card>

                  {/* Pending COD */}
                  <Card className="glass-strong border-yellow-500/20 hover:border-yellow-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Pending COD</CardTitle>
                      <span className="h-4 w-4 text-yellow-400 font-bold text-xs flex items-center justify-center">AED</span>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-400">{metrics?.totalPendingCOD || '0.00'} AED</div>
                      <p className="text-xs text-muted-foreground mt-1">To collect</p>
                    </CardContent>
                  </Card>

                  {/* Average Delivery Time */}
                  <Card className="glass-strong border-purple-500/20 hover:border-purple-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Average Time</CardTitle>
                      <Package className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-purple-400">{metrics?.averageDeliveryHours || 0}h</div>
                      <p className="text-xs text-muted-foreground mt-1">Delivery time</p>
                    </CardContent>
                  </Card>

                  {/* Active Shipments */}
                  <Card className="glass-strong border-cyan-500/20 hover:border-cyan-400/40 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Active Shipments</CardTitle>
                      <Package className="h-4 w-4 text-cyan-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-cyan-400">{stats.activeOrders}</div>
                      <p className="text-xs text-muted-foreground mt-1">In transit</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Frequent Routes */}
                {metrics?.frequentRoutes && metrics.frequentRoutes.length > 0 && (
                  <Card className="glass-strong border-blue-500/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Most Frequent Routes</CardTitle>
                      <CardDescription>Your most used shipping routes</CardDescription>
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
                              {route.count} shipments
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

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4 mt-0">
            <h2 className="text-2xl font-bold">Analytics</h2>
            <CustomerAnalytics />
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
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>My Shipments</CardTitle>
                  <CardDescription>View and track all your shipments</CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    className="w-[140px] h-8"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                  <Input
                    type="date"
                    className="w-[140px] h-8"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownloadWaybills}
                    disabled={bulkDownloading || (selectedOrderIds.length === 0 && (!filterDateFrom || !filterDateTo))}
                  >
                    {bulkDownloading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download Waybills {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length})` : ''}
                  </Button>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending_pickup">Pending Pickup</SelectItem>
                      <SelectItem value="picked_up">Picked Up</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="failed_delivery">Failed / Returned</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                </div>
              </CardHeader>
              <CardContent>
                {isLoadingOrders ? (
                  <p className="text-center py-8 text-muted-foreground">Loading shipments...</p>
                ) : filteredOrders && filteredOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={filteredOrders && filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                              onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                            />
                          </TableHead>
                          <TableHead>Waybill</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>COD</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedOrderIds.includes(order.id)}
                                onCheckedChange={(checked) => handleSelectRow(order.id, checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="font-mono font-medium">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-primary underline"
                                  onClick={() => handleViewTracking(order.waybillNumber)}
                                >
                                  {order.waybillNumber}
                                </Button>
                                {order.isReturn === 1 && (
                                  <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs flex items-center gap-1">
                                    <RotateCcw className="h-3 w-3" /> RETURN
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{order.customerName}</TableCell>
                            <TableCell>{order.city}, {order.destinationCountry}</TableCell>
                            <TableCell>
                              <span className="font-medium">{order.weight}</span>
                              <span className="text-muted-foreground text-xs ml-1">kg</span>
                            </TableCell>
                            <TableCell>{order.serviceType}</TableCell>
                            <TableCell>
                              {order.codRequired === 1 && order.codAmount ? (
                                <Badge className="bg-orange-500 text-white border-none">
                                  {order.codCurrency || 'AED'} {parseFloat(order.codAmount).toFixed(2)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${getStatusColor(order.status)} border-none text-white shadow-sm`}>
                                {getStatusLabel(order.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => generateWaybillPDF(order)}
                                  title="Download Waybill"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {order.status === 'pending_pickup' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                    onClick={() => handleCancelOrder(order.id, order.waybillNumber)}
                                    title="Cancel Order"
                                    disabled={cancelOrderMutation.isPending}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No shipments found</p>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Shipment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tracking Dialog */}
            <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Shipment Tracking</DialogTitle>
                  <DialogDescription>
                    Tracking details for {searchedWaybill}
                  </DialogDescription>
                </DialogHeader>

                {trackingData ? (
                  <div className="space-y-4 mt-2">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold">Shipment Details</h3>
                      <Badge className={getStatusColor(trackingData.order.status)}>
                        {getStatusLabel(trackingData.order.status)}
                      </Badge>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-lg">
                      <div><span className="text-muted-foreground">Waybill:</span> <span className="ml-2 font-medium">{trackingData.order.waybillNumber}</span></div>
                      <div><span className="text-muted-foreground">Service:</span> <span className="ml-2 font-medium">{trackingData.order.serviceType}</span></div>
                      <div><span className="text-muted-foreground">Destination:</span> <span className="ml-2 font-medium">{trackingData.order.city}, {trackingData.order.destinationCountry}</span></div>
                      <div><span className="text-muted-foreground">Weight:</span> <span className="ml-2 font-medium">{trackingData.order.weight} kg</span></div>
                    </div>
                    <div className="mt-6">
                      <h4 className="font-semibold mb-4">Tracking History</h4>
                      <div className="relative space-y-4 max-h-[300px] overflow-y-auto pr-2">
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
                ) : trackingError ? (
                  <div className="p-4 text-center text-red-500">Failed to load tracking data</div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">Loading tracking data...</div>
                )}
              </DialogContent>
            </Dialog>
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

          {/* Returns & Exchanges Tab */}
          <TabsContent value="returns" className="space-y-4 mt-0">
            <ReturnsExchangesPanel token={token} />
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
        length: !isNaN(lengthVal) && lengthVal > 0 ? lengthVal : undefined,
        width: !isNaN(widthVal) && widthVal > 0 ? widthVal : undefined,
        height: !isNaN(heightVal) && heightVal > 0 ? heightVal : undefined,
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
          {savedShippers.length > 0 && (
            <Select onValueChange={handleLoadShipper}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="📋 Select saved shipper" />
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
        </div>

        {/* Saved Shippers Management */}
        {savedShippers.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-primary transition-colors">
              Select from saved shippers ({savedShippers.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-2">
              {savedShippers.map((shipper) => (
                <div
                  key={shipper.id}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded border border-transparent hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer group"
                  onClick={() => handleLoadShipper(shipper.id.toString())}
                >
                  <div className="flex-1">
                    <p className="font-medium group-hover:text-primary transition-colors">{shipper.nickname}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{shipper.shipperName} - {shipper.shipperCity}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteShipper(shipper.id);
                    }}
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
            <Label>Shipper Company *</Label>
            <Input
              value={formData.shipperName}
              onChange={(e) => setFormData({ ...formData, shipperName: e.target.value })}
              required
              className="bg-background/50 focus:bg-background transition-colors"
              placeholder="Company Name"
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

          <div className="space-y-2">
            <Label>City *</Label>
            <Select
              value={formData.shipperCity}
              onValueChange={(val) => setFormData({ ...formData, shipperCity: val })}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select City" />
              </SelectTrigger>
              <SelectContent>
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Country *</Label>
            <Select
              value={formData.shipperCountry}
              onValueChange={(val) => setFormData({ ...formData, shipperCountry: val })}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select Country" />
              </SelectTrigger>
              <SelectContent>
                {['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'].map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>

        {/* Save Shipper Button - Now at the bottom of the section */}
        <div className="pt-2 border-t flex justify-end">
          <Dialog open={showSaveShipperDialog} onOpenChange={setShowSaveShipperDialog}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canSaveShipper}
                className="gap-2"
                title={!canSaveShipper ? "Fill in shipper information first" : "Save this shipper for future use"}
              >
                <Save className="h-4 w-4" />
                Save Shipper for Future Use
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
            <Select
              value={formData.city}
              onValueChange={(val) => setFormData({ ...formData, city: val })}
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select City" />
              </SelectTrigger>
              <SelectContent>
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Country *</Label>
            <Select value={formData.destinationCountry} onValueChange={(value) => setFormData({ ...formData, destinationCountry: value })}>
              <SelectTrigger className="bg-background/50 focus:bg-background transition-colors">
                <SelectValue placeholder="Select Country" />
              </SelectTrigger>
              <SelectContent>
                {['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'].map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
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
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/40 rounded-lg">
          <span className="text-xs font-medium text-muted-foreground self-center mr-1">Quick Presets:</span>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-blue-500/20 hover:bg-blue-500/10 hover:text-blue-500" onClick={() => applyPreset('small')}>
            Small (0.5kg)
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-blue-500/20 hover:bg-blue-500/10 hover:text-blue-500" onClick={() => applyPreset('medium')}>
            Medium (2.0kg)
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-blue-500/20 hover:bg-blue-500/10 hover:text-blue-500" onClick={() => applyPreset('large')}>
            Large (5.0kg)
          </Button>
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
            <span className="h-5 w-5 text-green-600 font-bold text-sm flex items-center justify-center">AED</span>
            Payment (COD)
          </h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border p-3 rounded bg-background/50 hover:bg-background transition-colors">
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
