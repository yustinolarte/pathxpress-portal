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
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';
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
  RotateCcw,
  CheckCircle2,
  Scale,
  AlertCircle,
  AlertTriangle,
  Globe
} from 'lucide-react';
import ModernDashboardLayout, { ModernMenuItem } from '@/components/ModernDashboardLayout';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { toast } from 'sonner';
import CustomerInvoices from '@/components/CustomerInvoices';
import CustomerCODPanel from '@/components/CustomerCODPanel';
import CustomerRateCalculator from '@/components/CustomerRateCalculator';
import CustomerReports from '@/components/CustomerReports';
import BulkShipmentDialog from '@/components/BulkShipmentDialog';
import CustomerAnalytics from '@/components/CustomerAnalytics';
import ReturnsExchangesPanel from '@/components/ReturnsExchangesPanel';
import InternationalRateCalculator from '@/components/InternationalRateCalculator';
import CreateIntlShipmentForm from '@/components/CreateIntlShipmentForm';
import CreateShipmentForm from '@/components/CreateShipmentForm';
import CustomerPortalGuide from '@/components/CustomerPortalGuide';
import * as XLSX from 'xlsx';

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { token, user, logout } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createIntlDialogOpen, setCreateIntlDialogOpen] = useState(false);
  const [trackingWaybill, setTrackingWaybill] = useState('');
  const [searchedWaybill, setSearchedWaybill] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [intlFilterStatus, setIntlFilterStatus] = useState<string>('all');
  const [intlFilterDateFrom, setIntlFilterDateFrom] = useState('');
  const [intlFilterDateTo, setIntlFilterDateTo] = useState('');
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedIntlOrderIds, setSelectedIntlOrderIds] = useState<number[]>([]);
  const [chartPeriod, setChartPeriod] = useState<7 | 30>(7);

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

  // Fetch customer's intl orders
  const { data: intlOrders, isLoading: isLoadingIntl, refetch: refetchIntl } = trpc.portal.customer.getMyIntlOrders.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Fetch client account settings (for FOD, COD permissions)
  const { data: clientSettings } = trpc.portal.customer.getMyAccount.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Filtered orders based on status and date, sorted newest first
  const filteredOrders = orders?.filter((order: any) => {
    let matchesStatus = true;
    let matchesDate = true;

    if (filterStatus.length > 0) {
      matchesStatus = filterStatus.includes(order.status);
    }

    if (filterDateFrom && filterDateTo) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate >= filterDateFrom && orderDate <= filterDateTo;
    } else if (filterDateFrom) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate >= filterDateFrom;
    } else if (filterDateTo) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate <= filterDateTo;
    }

    return matchesStatus && matchesDate;
  })?.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const toggleStatusFilter = (status: string) => {
    setFilterStatus(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const filteredIntlOrders = intlOrders?.filter((order: any) => {
    let matchesStatus = true;
    let matchesDate = true;

    if (intlFilterStatus !== 'all') {
      matchesStatus = order.status === intlFilterStatus;
    }

    if (intlFilterDateFrom && intlFilterDateTo) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate >= intlFilterDateFrom && orderDate <= intlFilterDateTo;
    } else if (intlFilterDateFrom) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate >= intlFilterDateFrom;
    } else if (intlFilterDateTo) {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      matchesDate = orderDate <= intlFilterDateTo;
    }

    return matchesStatus && matchesDate;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      if (filteredOrders) {
        setSelectedOrderIds(filteredOrders.map((order: any) => order.id));
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

  const handleSelectAllIntl = (checked: boolean) => {
    if (checked) {
      if (filteredIntlOrders) {
        setSelectedIntlOrderIds(filteredIntlOrders.map((order: any) => order.id));
      }
    } else {
      setSelectedIntlOrderIds([]);
    }
  };

  const handleSelectIntlRow = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIntlOrderIds((prev) => [...prev, id]);
    } else {
      setSelectedIntlOrderIds((prev) => prev.filter((orderId) => orderId !== id));
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

  const handleExportIntlOrders = () => {
    if (!filteredIntlOrders || filteredIntlOrders.length === 0) {
      toast.error('No international orders to export');
      return;
    }

    const data = filteredIntlOrders.map((order: any) => ({
      'Waybill': order.waybillNumber,
      'Customer': order.customerName,
      'Destination': order.destinationCountry,
      'Service': order.serviceType,
      'Weight': order.weight,
      'Customs Value': `${order.customsValue || 0} ${order.customsCurrency || 'USD'}`,
      'Status': getStatusLabel(order.status),
      'Created At': new Date(order.createdAt).toLocaleDateString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Intl_Orders');
    XLSX.writeFile(workbook, `Intl_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('International orders exported successfully');
  };

  const handleBulkDownloadIntlWaybills = async () => {
    let ordersToDownload = [];

    if (selectedIntlOrderIds.length > 0) {
      ordersToDownload = intlOrders?.filter((o: any) => selectedIntlOrderIds.includes(o.id)) || [];
    } else {
      ordersToDownload = filteredIntlOrders || [];
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

      for (const order of ordersToDownload) {
        try {
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
        link.download = `Intl_Waybills_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success(`Downloaded ${count} international waybills`);
      } else {
        toast.error('Failed to generate any international waybills');
      }
    } catch (error) {
      console.error('Bulk download error:', error);
      toast.error('Failed to download international waybills');
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

  // Derived metrics computed from orders data
  const _now = new Date();
  const _thisMonthStart = new Date(_now.getFullYear(), _now.getMonth(), 1);
  const _lastMonthStart = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
  const _lastMonthEnd = new Date(_now.getFullYear(), _now.getMonth(), 0, 23, 59, 59);

  const _shipmentsThisMonth = orders?.filter((o: any) => new Date(o.createdAt) >= _thisMonthStart).length || 0;
  const _shipmentsLastMonth = orders?.filter((o: any) => {
    const d = new Date(o.createdAt);
    return d >= _lastMonthStart && d <= _lastMonthEnd;
  }).length || 0;
  const monthlyChangePct = _shipmentsLastMonth > 0
    ? Math.round(((_shipmentsThisMonth - _shipmentsLastMonth) / _shipmentsLastMonth) * 100)
    : _shipmentsThisMonth > 0 ? 100 : 0;
  const shipmentsBarWidth = _shipmentsLastMonth > 0
    ? Math.min(Math.round((_shipmentsThisMonth / _shipmentsLastMonth) * 100), 100)
    : _shipmentsThisMonth > 0 ? 100 : 0;

  const _deliveredThisMonth = orders?.filter((o: any) =>
    o.status === 'delivered' && o.deliveryDateReal && o.deliveryDateEstimated &&
    new Date(o.deliveryDateReal) >= _thisMonthStart
  ) || [];
  const _deliveredLastMonth = orders?.filter((o: any) =>
    o.status === 'delivered' && o.deliveryDateReal && o.deliveryDateEstimated &&
    new Date(o.deliveryDateReal) >= _lastMonthStart && new Date(o.deliveryDateReal) <= _lastMonthEnd
  ) || [];
  const _onTimeThisMonth = _deliveredThisMonth.filter((o: any) =>
    new Date(o.deliveryDateReal) <= new Date(o.deliveryDateEstimated)
  ).length;
  const _onTimeLastMonth = _deliveredLastMonth.filter((o: any) =>
    new Date(o.deliveryDateReal) <= new Date(o.deliveryDateEstimated)
  ).length;
  const _onTimeRateThisMonth = _deliveredThisMonth.length > 0
    ? Math.round((_onTimeThisMonth / _deliveredThisMonth.length) * 100) : null;
  const _onTimeRateLastMonth = _deliveredLastMonth.length > 0
    ? Math.round((_onTimeLastMonth / _deliveredLastMonth.length) * 100) : null;
  const onTimeChangePct = _onTimeRateThisMonth !== null && _onTimeRateLastMonth !== null
    ? _onTimeRateThisMonth - _onTimeRateLastMonth : null;

  const _codOrders = orders?.filter((o: any) => o.codRequired === 1) || [];
  const _pendingCODOrders = _codOrders.filter((o: any) => o.status !== 'delivered' && o.status !== 'canceled');
  const codBarWidth = _codOrders.length > 0
    ? Math.round((_pendingCODOrders.length / _codOrders.length) * 100) : 0;

  const chartDays = chartPeriod === 7 ? 7 : 30;
  const chartData = Array.from({ length: chartDays }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (chartDays - 1 - i));
    const dayStr = date.toISOString().split('T')[0];
    const count = orders?.filter((o: any) => new Date(o.createdAt).toISOString().split('T')[0] === dayStr).length || 0;
    const label = chartPeriod === 7
      ? date.toLocaleDateString('en', { weekday: 'short' })
      : date.getDate().toString();
    return { label, count };
  });
  const chartMax = Math.max(...chartData.map(d => d.count), 1);

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

  const menuItems: ModernMenuItem[] = [
    { icon: 'dashboard', label: 'Overview', value: 'overview' },
    { icon: 'bar_chart', label: 'Analytics', value: 'analytics' },
    { icon: 'package_2', label: 'My Orders', value: 'orders' },
    { icon: 'swap_horiz', label: 'Returns & Exchanges', value: 'returns' },
    { icon: 'search', label: 'Track Shipment', value: 'tracking' },
    { icon: 'calculate', label: 'Rate Calculator', value: 'calculator' },
    { icon: 'public', label: 'International', value: 'international' },
    { icon: 'receipt_long', label: 'Invoices', value: 'invoices' },
    { icon: 'payments', label: 'COD', value: 'cod' },
    { icon: 'summarize', label: 'Reports', value: 'reports' },
    { icon: 'menu_book', label: 'Guide', value: 'guide' },
  ];

  return (
    <ModernDashboardLayout
      menuItems={menuItems}
      activeItem={activeTab}
      onItemClick={(value: string, searchData?: string) => {
        setActiveTab(value);
        if (value === 'tracking' && searchData) {
          handleViewTracking(searchData);
        }
      }}
      user={user}
      logout={handleLogout}
      title="Customer Portal"
      onCreateShipment={() => setCreateDialogOpen(true)}
    >
      <div className="min-h-full p-4 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <h2 className="text-2xl font-bold">Overview</h2>

            {metricsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-card p-6 rounded-xl shadow-sm border border-primary/5 animate-pulse">
                    <div className="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
                    <div className="h-8 bg-slate-700 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Total Shipments This Month */}
                  <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                        <span className="material-symbols-outlined">inventory_2</span>
                      </div>
                      <span className={`text-xs font-bold flex items-center gap-1 ${monthlyChangePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        <span className="material-symbols-outlined text-xs">{monthlyChangePct >= 0 ? 'trending_up' : 'trending_down'}</span>
                        {monthlyChangePct >= 0 ? '+' : ''}{monthlyChangePct}% vs last month
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Shipments This Month</p>
                    <h3 className="text-2xl font-bold mt-1">{metrics?.totalShipmentsThisMonth || 0}</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${shipmentsBarWidth}%` }}></div>
                    </div>
                  </div>

                  {/* On-Time Delivery % */}
                  <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 bg-green-500/10 rounded-lg text-green-500">
                        <span className="material-symbols-outlined">verified</span>
                      </div>
                      {onTimeChangePct !== null ? (
                        <span className={`text-xs font-bold flex items-center gap-1 ${onTimeChangePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          <span className="material-symbols-outlined text-xs">{onTimeChangePct >= 0 ? 'trending_up' : 'trending_down'}</span>
                          {onTimeChangePct >= 0 ? '+' : ''}{onTimeChangePct}% vs last month
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">No prev. data</span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">On-Time Delivery</p>
                    <h3 className="text-2xl font-bold mt-1">{metrics?.onTimePercentage || 0}%</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${metrics?.onTimePercentage || 0}%` }}></div>
                    </div>
                  </div>

                  {/* Pending COD */}
                  <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-500">
                        <span className="material-symbols-outlined">payments</span>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">
                        {_codOrders.length > 0 ? `${_pendingCODOrders.length}/${_codOrders.length} orders` : 'No COD orders'}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Pending COD (AED)</p>
                    <h3 className="text-2xl font-bold mt-1">{metrics?.totalPendingCOD || '0.00'}</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${codBarWidth}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Chart Section */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-lg font-bold text-foreground">Shipping Performance</h2>
                          <p className="text-sm text-muted-foreground">Daily shipment volume — last {chartPeriod} days</p>
                        </div>
                        <select
                          className="text-sm bg-background border border-primary/10 rounded-lg focus:ring-primary/20 text-foreground px-2 py-1"
                          value={chartPeriod}
                          onChange={(e) => setChartPeriod(Number(e.target.value) as 7 | 30)}
                        >
                          <option value={7}>Last 7 Days</option>
                          <option value={30}>Last 30 Days</option>
                        </select>
                      </div>
                      <div className="flex items-end justify-between h-64 gap-1 px-2">
                        {chartData.map((item, i) => {
                          const heightPct = chartMax > 0 ? Math.max((item.count / chartMax) * 100, item.count > 0 ? 4 : 0) : 0;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                              <div
                                className="w-full bg-primary/20 rounded-t-lg relative group-hover:bg-primary transition-colors"
                                style={{ height: `${heightPct}%` }}
                              >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-sm border border-primary/10">
                                  {item.count} shipments
                                </div>
                              </div>
                              {(chartPeriod === 7 || i % 5 === 0 || i === chartData.length - 1) && (
                                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Secondary Stats */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300 flex items-center gap-4">
                        <div className="size-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                          <span className="material-symbols-outlined">timer</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Avg. Delivery Time</p>
                          <p className="text-lg font-bold text-foreground">{metrics?.averageDeliveryHours || 0} Hours</p>
                        </div>
                      </div>
                      <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300 flex items-center gap-4">
                        <div className="size-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                          <span className="material-symbols-outlined">route</span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Active Shipments</p>
                          <p className="text-lg font-bold text-foreground">{stats.activeOrders}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activity List */}
                  <div className="space-y-6">
                    <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300 h-full">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-foreground">Recent Shipments</h2>
                        <button className="text-primary text-xs font-bold hover:underline" onClick={() => setActiveTab('orders')}>View All</button>
                      </div>
                      <div className="space-y-6">
                        {filteredOrders?.slice(0, 4).map((order) => (
                          <div key={order.id} className="flex gap-4">
                            <div className="relative flex flex-col items-center">
                              <div className={`size-10 rounded-full flex items-center justify-center border ${order.status === 'delivered' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                order.status === 'in_transit' ? 'bg-primary/10 text-primary border-primary/20' :
                                  order.status === 'failed_delivery' || order.status === 'returned' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                    'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                }`}>
                                <span className="material-symbols-outlined text-lg">
                                  {order.status === 'delivered' ? 'check_circle' :
                                    order.status === 'in_transit' ? 'local_shipping' :
                                      order.status === 'failed_delivery' || order.status === 'returned' ? 'warning' : 'schedule'}
                                </span>
                              </div>
                              <div className="w-0.5 h-full bg-border mt-2"></div>
                            </div>
                            <div className="flex-1 pb-6 border-b border-border">
                              <div className="flex justify-between items-start mb-1">
                                <p className="text-sm font-bold text-foreground">{order.waybillNumber}</p>
                                <span className="text-[10px] text-muted-foreground font-medium">{new Date(order.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${order.status === 'delivered' ? 'bg-green-500/10 text-green-500' :
                                  order.status === 'in_transit' ? 'bg-primary/10 text-primary' :
                                    order.status === 'failed_delivery' || order.status === 'returned' ? 'bg-red-500/10 text-red-500' :
                                      'bg-yellow-500/10 text-yellow-500'
                                  }`}>
                                  {order.status.replace(/_/g, ' ')}
                                </span>
                                <p className="text-xs text-muted-foreground">{order.city}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(!filteredOrders || filteredOrders.length === 0) && (
                          <div className="text-sm text-muted-foreground text-center py-4">No recent shipments found.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-0">
            <CustomerAnalytics />
          </TabsContent>

          {/* Orders Tab */}
          {/* Orders Tab */}
          <TabsContent value="orders" className="flex flex-col h-full mt-0">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <h2 className="text-3xl font-black tracking-tight text-foreground">My Shipments</h2>
              <div className="flex justify-end gap-2">
                <BulkShipmentDialog token={token} onSuccess={refetch} />
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Create New Shipment
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-background text-foreground !w-[98vw] !max-w-[1400px] p-0 gap-0 border-border max-h-[90vh] overflow-y-auto antialiased font-sans rounded-2xl shadow-xl">
                    <div className="w-full h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                    <div className="p-6">
                      <DialogHeader className="mb-5">
                        <DialogTitle className="text-xl font-bold flex items-center gap-3">
                          <Package className="w-6 h-6 text-primary" />
                          Create New Shipment
                        </DialogTitle>
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
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-card p-4 rounded-2xl border border-primary/10 flex flex-wrap items-center justify-between shadow-xl shadow-primary/5 gap-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date range</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="w-[140px] h-9 bg-background border-border rounded-lg text-sm text-foreground"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="date"
                      className="w-[140px] h-9 bg-background border-border rounded-lg text-sm text-foreground"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                <div className="flex items-center gap-2 relative">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</span>
                  <div className="relative">
                    <button
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className="w-[200px] h-9 border border-border rounded-lg bg-background font-medium text-foreground text-sm px-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <span className="truncate">
                        {filterStatus.length === 0
                          ? 'All Status'
                          : `${filterStatus.length} selected`}
                      </span>
                      <span className="material-symbols-outlined text-sm text-muted-foreground">expand_more</span>
                    </button>
                    {statusDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 w-[220px] z-50 bg-card border border-border rounded-lg shadow-xl p-2 space-y-0.5" style={{ backdropFilter: 'blur(20px)' }}>
                          {[
                            { value: 'pending_pickup', label: 'Pending Pickup' },
                            { value: 'picked_up', label: 'Picked Up' },
                            { value: 'in_transit', label: 'In Transit' },
                            { value: 'out_for_delivery', label: 'Out for Delivery' },
                            { value: 'delivered', label: 'Delivered' },
                            { value: 'failed_delivery', label: 'Failed / Returned' },
                            { value: 'on_hold', label: 'On Hold' },
                            { value: 'cancelled', label: 'Cancelled' },
                          ].map((status) => (
                            <label
                              key={status.value}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                            >
                              <Checkbox
                                checked={filterStatus.includes(status.value)}
                                onCheckedChange={() => toggleStatusFilter(status.value)}
                              />
                              <span className="text-sm text-foreground">{status.label}</span>
                            </label>
                          ))}
                          {filterStatus.length > 0 && (
                            <>
                              <div className="h-px bg-border my-1" />
                              <button
                                onClick={() => setFilterStatus([])}
                                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 px-2.5 text-left hover:bg-muted/50 rounded-md transition-colors"
                              >
                                Clear all
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <button
                  onClick={handleBulkDownloadWaybills}
                  disabled={bulkDownloading || (selectedOrderIds.length === 0 && (!filterDateFrom || !filterDateTo))}
                  className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-primary/5 border border-transparent hover:border-primary/10 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDownloading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-lg">description</span>
                  )}
                  Download Waybills {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length})` : ''}
                </button>
              </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-hidden bg-card border border-primary/10 rounded-2xl shadow-xl shadow-primary/5 flex flex-col">
              <div className="p-0 overflow-y-auto">
                {isLoadingOrders ? (
                  <p className="text-center py-8 text-muted-foreground">Loading shipments...</p>
                ) : filteredOrders && filteredOrders.length > 0 ? (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5 hover:bg-primary/5 border-b border-primary/10">
                            <TableHead className="w-[50px] font-bold text-foreground tracking-wide text-xs uppercase">
                              <Checkbox
                                checked={filteredOrders && filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                                onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                              />
                            </TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Waybill</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Customer</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Destination</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Weight</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Service</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">COD</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Status</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Created</TableHead>
                            <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredOrders.map((order) => (
                            <TableRow key={order.id} className="cursor-pointer hover:bg-muted/30 border-b border-primary/10 transition-colors group">
                              <TableCell>
                                <Checkbox
                                  checked={selectedOrderIds.includes(order.id)}
                                  onCheckedChange={(checked) => handleSelectRow(order.id, checked as boolean)}
                                />
                              </TableCell>
                              <TableCell className="font-mono font-medium">
                                <div className="flex items-center gap-2">
                                  <Button variant="link" className="p-0 h-auto text-primary underline" onClick={() => handleViewTracking(order.waybillNumber)}>
                                    {order.waybillNumber}
                                  </Button>
                                  {order.isReturn === 1 && (
                                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs flex items-center gap-1" title="Return">
                                      <RotateCcw className="h-4 w-4" />
                                    </Badge>
                                  )}
                                  {order.fitOnDelivery === 1 && (
                                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs flex items-center gap-1">
                                      <Package className="h-3 w-3" /> FOD
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
                                  <Button variant="ghost" size="sm" onClick={() => generateWaybillPDF(order)} title="Download Waybill">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {order.status === 'pending_pickup' && (
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={() => handleCancelOrder(order.id, order.waybillNumber)} title="Cancel Order" disabled={cancelOrderMutation.isPending}>
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

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3 p-3">
                      {filteredOrders.map((order) => (
                        <div key={order.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
                          {/* Top row: waybill + status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                className="font-mono font-bold text-primary text-sm underline"
                                onClick={() => handleViewTracking(order.waybillNumber)}
                              >
                                {order.waybillNumber}
                              </button>
                              {order.isReturn === 1 && (
                                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
                                  <RotateCcw className="h-3 w-3 mr-1" />Return
                                </Badge>
                              )}
                              {order.fitOnDelivery === 1 && (
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                                  <Package className="h-3 w-3 mr-1" />FOD
                                </Badge>
                              )}
                            </div>
                            <Badge className={`${getStatusColor(order.status)} border-none text-white text-xs shrink-0`}>
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          {/* Customer + destination */}
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{order.customerName}</span>
                            <span className="text-xs text-muted-foreground">{order.city}, {order.destinationCountry}</span>
                          </div>
                          {/* Service + weight + COD + date */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{order.serviceType}</span>
                            <span className="text-xs text-muted-foreground">{order.weight} kg</span>
                            {order.codRequired === 1 && order.codAmount && (
                              <Badge className="bg-orange-500 text-white border-none text-xs">
                                COD {order.codCurrency || 'AED'} {parseFloat(order.codAmount).toFixed(2)}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">{new Date(order.createdAt).toLocaleDateString()}</span>
                          </div>
                          {/* Actions */}
                          <div className="flex gap-2 pt-1 border-t border-border">
                            <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => generateWaybillPDF(order)}>
                              <Download className="h-3.5 w-3.5 mr-1" />Waybill
                            </Button>
                            {order.status === 'pending_pickup' && (
                              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleCancelOrder(order.id, order.waybillNumber)} disabled={cancelOrderMutation.isPending}>
                                <X className="h-3.5 w-3.5 mr-1" />Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center bg-card/50 rounded-2xl border-2 border-dashed border-primary/20 py-20 m-4">
                    <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6">
                      <span className="material-symbols-outlined text-5xl">inventory_2</span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">No shipments found</h3>
                    <p className="text-muted-foreground text-center max-w-sm mb-8">
                      You haven't created any shipments yet. Get started by creating your first shipment or uploading in bulk.
                    </p>
                    <Button
                      onClick={() => setCreateDialogOpen(true)}
                      className="px-8 py-6 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined">add_circle</span>
                      Create Your First Shipment
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Tracking Tab */}
          <TabsContent value="tracking" className="space-y-8 mt-0">
            {/* Hero Section */}
            <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tight text-foreground">Where's your cargo?</h1>
              <p className="text-muted-foreground max-w-xl text-lg">Enter your tracking details below to get real-time status updates and estimated delivery times for your shipment.</p>
            </div>

            {/* Main Tracking Card */}
            <div className="bg-card rounded-2xl shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden">
              <div className="p-1">
                <div className="h-48 w-full rounded-xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-primary/10"></div>
                  <img
                    className="w-full h-full object-cover opacity-80 mix-blend-overlay grayscale hover:grayscale-0 transition-all duration-700"
                    alt="Shipping containers"
                    src="https://images.unsplash.com/photo-1494412519320-ce681dcfa2e4?q=80&w=2062&auto=format&fit=crop"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent"></div>
                  <div className="absolute bottom-6 left-8">
                    <span className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">Real-time GPS Tracking</span>
                  </div>
                </div>
              </div>

              <div className="px-8 pb-10 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-3 space-y-3">
                    <label className="text-sm font-bold text-foreground ml-1" htmlFor="waybill">Waybill Number</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-muted-foreground group-focus-within:text-primary transition-colors">qr_code_scanner</span>
                      </div>
                      <Input
                        id="waybill"
                        placeholder="e.g. PX-12345"
                        value={trackingWaybill}
                        onChange={(e) => setTrackingWaybill(e.target.value)}
                        className="block w-full pl-12 pr-4 py-4 h-14 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-lg font-medium placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-1">
                    <Button
                      onClick={() => setSearchedWaybill(trackingWaybill)}
                      className="w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group"
                    >
                      <span>Track</span>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {trackingData && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                {/* Status Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 rounded-2xl bg-card border border-border">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-1">
                      <Package className="w-4 h-4 text-primary" /> Waybill Number
                    </p>
                    <h3 className="text-4xl font-mono font-bold text-foreground tracking-tight">{trackingData.order.waybillNumber}</h3>
                  </div>
                  <div className={`px-5 py-2.5 rounded-full border ${trackingData.order.status === 'delivered' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                    trackingData.order.status === 'cancelled' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                      'bg-blue-500/10 border-blue-500/20 text-blue-500'
                    } flex items-center gap-2.5 shadow-sm`}>
                    {trackingData.order.status === 'delivered' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    <span className="font-bold uppercase tracking-wide text-sm">{trackingData.order.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors group">
                    <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                      <Truck className="w-4 h-4" />
                      <span className="text-xs uppercase font-bold">Service</span>
                    </div>
                    <p className="text-xl font-semibold">{trackingData.order.serviceType}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors group">
                    <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                      <Package className="w-4 h-4" />
                      <span className="text-xs uppercase font-bold">Pieces</span>
                    </div>
                    <p className="text-xl font-semibold">{trackingData.order.pieces || 1}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors group">
                    <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                      <Scale className="w-4 h-4" />
                      <span className="text-xs uppercase font-bold">Weight</span>
                    </div>
                    <p className="text-xl font-semibold">{trackingData.order.weight} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors group">
                    <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                      <CreditCard className="w-4 h-4" />
                      <span className="text-xs uppercase font-bold">COD Amount</span>
                    </div>
                    <p className="text-xl font-semibold">
                      {trackingData.order.codRequired ? `${trackingData.order.codAmount} ${trackingData.order.codCurrency || 'AED'}` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Addresses */}
                <div className="grid md:grid-cols-2 gap-6 p-6 rounded-2xl bg-card border border-border">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-wider">Origin</span>
                    </div>
                    <p className="pl-8 text-lg font-medium text-foreground/90">{trackingData.order.shipperCity}, {trackingData.order.shipperCountry}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <MapPin className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-wider">Destination</span>
                    </div>
                    <p className="pl-8 text-lg font-medium text-foreground">{trackingData.order.city}, {trackingData.order.destinationCountry}</p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="p-6 rounded-2xl bg-card border border-border">
                  <h4 className="text-lg font-bold flex items-center gap-2 mb-6 text-foreground">
                    <Calendar className="w-5 h-5 text-primary" /> Tracking History
                  </h4>
                  <div className="relative space-y-0">
                    <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />
                    {trackingData.trackingEvents.sort((a, b) => new Date(b.eventDatetime).getTime() - new Date(a.eventDatetime).getTime()).map((event, i) => (
                      <div key={event.id} className="relative pl-12 pb-8 last:pb-0 group">
                        <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-[#0f1115] transition-transform group-hover:scale-110 ${i === 0 ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'
                          }`}>
                          {i === 0 ? <Truck className="w-4 h-4 text-primary-foreground" /> : <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />}
                        </div>

                        <div className="p-4 rounded-xl border border-transparent hover:bg-muted/30 hover:border-white/5 transition-all">
                          <div className="flex flex-col md:flex-row justify-between md:items-center gap-1 mb-2">
                            <p className={`font-bold text-lg ${i === 0 ? 'text-primary' : 'text-foreground/90'}`}>{event.statusLabel}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-2 py-1 rounded w-fit">
                              <Calendar className="w-3 h-3" />
                              {new Date(event.eventDatetime).toLocaleString()}
                            </div>
                          </div>
                          {event.description && <p className="text-muted-foreground mb-2">{event.description}</p>}

                          {/* Embedded POD Image */}
                          {event.podFileUrl && (
                            <div className="mt-3 animate-fade-in">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-green-500" /> Proof of Delivery
                              </p>
                              <div className="relative group/image overflow-hidden rounded-lg border border-border max-w-[240px]">
                                <img
                                  src={event.podFileUrl}
                                  alt="POD"
                                  className="w-full h-auto object-cover transition-transform duration-500 group-hover/image:scale-105 cursor-zoom-in"
                                  onClick={() => event.podFileUrl && window.open(event.podFileUrl, '_blank')}
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                  <span className="text-xs text-white font-medium">View Full</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {trackingError && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-medium">{trackingError.message || 'Shipment not found. Please check your waybill number.'}</p>
              </div>
            )}

            {/* Quick Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <div className="p-6 bg-card rounded-2xl border border-primary/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">On-Time Delivery</h3>
                  <p className="text-sm text-muted-foreground">98% of our shipments arrive exactly when scheduled.</p>
                </div>
              </div>
              <div className="p-6 bg-card rounded-2xl border border-primary/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">security</span>
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">Handled with Care</h3>
                  <p className="text-sm text-muted-foreground">Every parcel is treated with the highest standards of safety and attention.</p>
                </div>
              </div>
              <div className="p-6 bg-card rounded-2xl border border-primary/10 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">support_agent</span>
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">24/7 Support</h3>
                  <p className="text-sm text-muted-foreground">Live agents available at any time to assist you.</p>
                </div>
              </div>
            </div>

            {/* Sample Map Element */}
            {trackingData && (
              <div className="relative w-full h-[400px] rounded-2xl overflow-hidden border border-primary/10 shadow-sm bg-card animate-in fade-in duration-500 mt-8">
                <div className="absolute inset-0">
                  <div className="w-full h-full bg-background/50 flex items-center justify-center relative overflow-hidden">
                    <svg className="absolute inset-0 opacity-10" height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <pattern height="40" id="map-grid" patternUnits="userSpaceOnUse" width="40">
                          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5"></path>
                        </pattern>
                      </defs>
                      <rect fill="url(#map-grid)" height="100%" width="100%"></rect>
                    </svg>
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 relative">
                        <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-25"></div>
                        <span className="material-symbols-outlined text-primary text-3xl">location_on</span>
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Interactive Tracking Map</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Status: Active</p>
                    </div>
                  </div>
                </div>
                <div className="absolute top-6 left-6 bg-card/90 backdrop-blur p-4 rounded-xl border border-primary/10 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-foreground">Live Global Network Active</span>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Rate Calculator Tab */}
          <TabsContent value="calculator" className="space-y-4">
            <CustomerRateCalculator />
          </TabsContent>

          {/* Returns & Exchanges Tab */}
          <TabsContent value="returns" className="space-y-4 mt-0">
            <ReturnsExchangesPanel token={token} codAllowed={!!clientSettings?.codAllowed} />
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

          {/* International Tab */}
          <TabsContent value="international" className="space-y-4 mt-0">
            {clientSettings?.intlAllowed === 1 ? (
              <>
                <div className="flex justify-end gap-2">
                  <Dialog open={createIntlDialogOpen} onOpenChange={setCreateIntlDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all rounded-xl h-11 px-6">
                        <Globe className="mr-2 h-5 w-5" />
                        Create International Shipment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-strong !w-[95vw] !max-w-[1200px] p-0 gap-0 border-primary/20 max-h-[90vh] overflow-y-auto rounded-3xl">
                      <div className="w-full h-1.5 bg-gradient-to-r from-primary to-primary/50" />
                      <div className="p-6">
                        <DialogHeader className="mb-6">
                          <DialogTitle className="text-2xl font-black text-foreground flex items-center gap-3 tracking-tight">
                            <Globe className="w-7 h-7 text-primary" />
                            Create International Shipment
                          </DialogTitle>
                          <DialogDescription className="text-base text-muted-foreground font-medium">
                            Ship packages globally using PathXpress international network.
                          </DialogDescription>
                        </DialogHeader>
                        <CreateIntlShipmentForm
                          token={token}
                          clientId={clientSettings.id}
                          onSuccess={() => {
                            setCreateIntlDialogOpen(false);
                            refetchIntl();
                          }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Orders Table */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                  <h2 className="text-3xl font-black tracking-tight text-foreground">International Shipments</h2>
                </div>

                <div className="bg-card p-4 rounded-xl border border-primary/5 shadow-sm mb-6">
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex flex-wrap gap-4 items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date range</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            className="w-[140px] h-9 bg-background border-primary/10 rounded-lg text-sm"
                            value={intlFilterDateFrom}
                            onChange={(e) => setIntlFilterDateFrom(e.target.value)}
                          />
                          <span className="text-muted-foreground text-sm">to</span>
                          <Input
                            type="date"
                            className="w-[140px] h-9 bg-background border-primary/10 rounded-lg text-sm"
                            value={intlFilterDateTo}
                            onChange={(e) => setIntlFilterDateTo(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</span>
                        <Select value={intlFilterStatus} onValueChange={setIntlFilterStatus}>
                          <SelectTrigger className="w-[180px] h-9 border-primary/10 rounded-lg bg-background font-medium">
                            <SelectValue placeholder="All Status" />
                          </SelectTrigger>
                          <SelectContent className="border-primary/10">
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
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkDownloadIntlWaybills}
                        disabled={bulkDownloading || (selectedIntlOrderIds.length === 0 && (!intlFilterDateFrom || !intlFilterDateTo))}
                        className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-primary/5 border border-transparent hover:border-primary/10 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {bulkDownloading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-lg">description</span>
                        )}
                        Waybills {selectedIntlOrderIds.length > 0 ? `(${selectedIntlOrderIds.length})` : ''}
                      </button>
                      <button
                        onClick={handleExportIntlOrders}
                        className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-primary/5 border border-transparent hover:border-primary/10 rounded-lg text-sm font-semibold transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">download</span>
                        Export
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden bg-card border border-primary/5 rounded-xl shadow-sm flex flex-col">
                  <div className="p-0 overflow-y-auto">
                    {isLoadingIntl ? (
                      <p className="text-center py-8 text-muted-foreground">Loading international shipments...</p>
                    ) : filteredIntlOrders && filteredIntlOrders.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">
                                <Checkbox
                                  checked={filteredIntlOrders && filteredIntlOrders.length > 0 && selectedIntlOrderIds.length === filteredIntlOrders.length}
                                  onCheckedChange={(checked) => handleSelectAllIntl(checked as boolean)}
                                />
                              </TableHead>
                              <TableHead>Waybill</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Destination</TableHead>
                              <TableHead>Weight</TableHead>
                              <TableHead>Service</TableHead>
                              <TableHead>Customs Value</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredIntlOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIntlOrderIds.includes(order.id)}
                                    onCheckedChange={(checked) => handleSelectIntlRow(order.id, checked as boolean)}
                                  />
                                </TableCell>
                                <TableCell className="font-mono font-medium">{order.waybillNumber}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{order.customerName}</span>
                                    <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{order.destinationCountry}</span>
                                    <span className="text-xs text-muted-foreground">{order.city}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{order.weight} kg</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                    {order.serviceType}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {order.customsValue ? (
                                    <div className="flex items-center gap-1 font-mono text-xs">
                                      <span className="text-muted-foreground">{order.customsCurrency}</span>
                                      <span>{order.customsValue}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge className={getStatusColor(order.status)}>
                                    {getStatusLabel(order.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {new Date(order.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => generateWaybillPDF(order as any)}
                                      title="Download Waybill"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSearchedWaybill(order.waybillNumber);
                                        setTrackingDialogOpen(true);
                                      }}
                                      title="Track Shipment"
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-12 flex flex-col items-center justify-center">
                        <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No International Shipments</h3>
                        <p className="text-muted-foreground max-w-sm">
                          You haven't created any international shipments yet. Click the button above to get started.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-8 text-center max-w-2xl mx-auto mt-10">
                <Globe className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-foreground mb-2">International Shipping</h2>
                <p className="text-muted-foreground mb-6">
                  International shipping allows you to send packages globally from the UAE. This feature requires account activation and specific pricing agreements.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <a href="mailto:support@pathxpress.net" className="bg-yellow-600 hover:bg-yellow-500 text-white px-6 py-2 rounded-md font-medium transition-colors">
                    Contact Sales to Enable
                  </a>
                </div>

                <div className="mt-12 text-left pt-8 border-t border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-400" /> Rate Calculator</h3>
                  <p className="text-sm text-muted-foreground mb-4">You can still check international rates and services using our calculator:</p>
                  <InternationalRateCalculator />
                </div>
              </div>
            )}
          </TabsContent>

          {/* Guide Tab */}
          <TabsContent value="guide" className="space-y-4 mt-0">
            <CustomerPortalGuide />
          </TabsContent>
        </Tabs>
      </div>
      {/* Tracking Dialog */}
      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent className="glass-strong border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <Badge className={getStatusColor(trackingData?.order?.status || 'pending')}>
                  {getStatusLabel(trackingData?.order?.status || 'pending')}
                </Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-lg">
                <div><span className="text-muted-foreground">Waybill:</span> <span className="ml-2 font-medium">{trackingData?.order?.waybillNumber}</span></div>
                <div><span className="text-muted-foreground">Service:</span> <span className="ml-2 font-medium">{trackingData?.order?.serviceType}</span></div>
                <div><span className="text-muted-foreground">Destination:</span> <span className="ml-2 font-medium">{trackingData?.order?.city}, {trackingData?.order?.destinationCountry}</span></div>
                <div><span className="text-muted-foreground">Weight:</span> <span className="ml-2 font-medium">{trackingData?.order?.weight} kg</span></div>
              </div>
              <div className="mt-6">
                <h4 className="font-semibold mb-4">Tracking History</h4>
                <div className="relative space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
                  {trackingData?.trackingEvents?.sort((a, b) => new Date(b.eventDatetime).getTime() - new Date(a.eventDatetime).getTime()).map((event, i) => (
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
    </ModernDashboardLayout >
  );
}
