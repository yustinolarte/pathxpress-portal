import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Users, Package, TrendingUp, FileText, Download, DollarSign, Plus, LayoutDashboard, Calculator, Wallet, MessageSquare, Trash2, Mail, BookOpen, BarChart3, StickyNote, Key, RotateCcw, ArrowLeftRight, Truck, Eye, Pencil, Globe, Sparkles, Rocket, Shirt, Coins, ShieldCheck, Zap, Filter, AlertTriangle, ChevronDown, ChevronUp, X, Clock, UserPlus, Building2 } from 'lucide-react';
import { APP_LOGO } from '@/const';
import ModernDashboardLayout, { ModernMenuItem } from '@/components/ModernDashboardLayout';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { toast } from 'sonner';
import BillingPanel from '@/components/BillingPanel';
import CODPanel from '@/components/CODPanel';
import AddTrackingEventDialog from '@/components/AddTrackingEventDialog';
import RatesPanel from '@/components/RatesPanel';
import AdminReports from '@/components/AdminReports';
import AdminAnalytics from '@/components/AdminAnalytics';
import OrderDetailsDialog from '@/components/OrderDetailsDialog';
import DriversSection from '@/components/DriversSection';
import AdminCreateOrderDialog from '@/components/AdminCreateOrderDialog';
import EditOrderDialog from '@/components/EditOrderDialog';
import AdminInternationalShipping from '@/components/AdminInternationalShipping';
import CreateClientWizard from '@/components/CreateClientWizard';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout, loading } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const ALL_STATUSES = [
    'pending_pickup', 'picked_up', 'in_transit', 'out_for_delivery',
    'delivered', 'failed_delivery', 'on_hold', 'returned', 'exchange', 'canceled'
  ];

  // Client editing state
  const [editClientDialogOpen, setEditClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    tierId: 'auto',
    codAllowed: false,
    codFeePercent: '',
    codMinFee: '',
    codMaxFee: '',
    // Custom rates
    customDomBaseRate: '',
    customDomPerKg: '',
    customSddBaseRate: '',
    customSddPerKg: '',
    // FOD settings
    fodAllowed: false,
    fodFee: '',
    // Internatioanl settings
    intlAllowed: false,
    intlDiscountPercent: '',
    // Bullet settings
    bulletAllowed: false,
    customBulletBaseRate: '',
    customBulletPerKg: '',
  });

  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [viewOrderDialogOpen, setViewOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<any>(null);
  const [orderFilterClientId, setOrderFilterClientId] = useState<string>('all');
  const [orderFilterDateFrom, setOrderFilterDateFrom] = useState('');
  const [orderFilterDateTo, setOrderFilterDateTo] = useState('');
  const [orderFilterStatuses, setOrderFilterStatuses] = useState<string[]>(ALL_STATUSES);
  const [orderSortDirection, setOrderSortDirection] = useState<'newest' | 'oldest'>('newest');

  // Create client dialog state
  const [createClientWizardOpen, setCreateClientWizardOpen] = useState(false);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);

  // Client Notes Dialog State
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedClientForNotes, setSelectedClientForNotes] = useState<any>(null);
  const [clientNotes, setClientNotes] = useState('');

  // Password Change Dialog State
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedClientForPassword, setSelectedClientForPassword] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');

  // Client 360 Panel State
  const [client360Id, setClient360Id] = useState<number | null>(null);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const deleteClientMutation = trpc.portal.admin.deleteClient.useMutation({
    onSuccess: () => {
      toast.success('Client deleted successfully');
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to delete client: ${error.message}`);
    },
  });

  const handleDeleteClient = (clientId: number) => {
    if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
      deleteClientMutation.mutate({
        clientId,
      });
    }
  };

  // Update client notes mutation
  const updateNotesMutation = trpc.portal.admin.updateClientNotes.useMutation({
    onSuccess: () => {
      toast.success('Notes updated successfully');
      setNotesDialogOpen(false);
      setSelectedClientForNotes(null);
      setClientNotes('');
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to update notes: ${error.message}`);
    },
  });

  // Update user password mutation
  const updatePasswordMutation = trpc.portal.admin.updateUserPassword.useMutation({
    onSuccess: () => {
      toast.success('Password updated successfully');
      setPasswordDialogOpen(false);
      setSelectedClientForPassword(null);
      setNewPassword('');
    },
    onError: (error) => {
      toast.error(`Failed to update password: ${error.message}`);
    },
  });

  const handleSaveNotes = () => {
    if (!selectedClientForNotes) return;
    updateNotesMutation.mutate({
      clientId: selectedClientForNotes.id,
      notes: clientNotes,
    });
  };

  const handleChangePassword = () => {
    if (!selectedClientForPassword) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    updatePasswordMutation.mutate({
      clientId: selectedClientForPassword.id,
      newPassword: newPassword,
    });
  };

  // Redirect if not authenticated or not admin (wait for session to load first)
  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      setLocation('/portal/login');
    }
  }, [user, loading, setLocation]);

  // Fetch clients
  const { data: clients, isLoading: clientsLoading, refetch: refetchClients } = trpc.portal.clients.list.useQuery();

  // O(1) client lookup map — avoids O(n²) array.find() per table row
  const clientsMap = useMemo(() => {
    const map = new Map<number, { companyName: string }>();
    clients?.forEach(c => map.set(c.id, { companyName: c.companyName }));
    return map;
  }, [clients]);

  const { data: rateTiers } = trpc.portal.rates.listTiers.useQuery();

  const { data: clientAlerts } = trpc.portal.admin.getClientAlerts.useQuery(
    undefined,
    { enabled: activeTab === 'clients', refetchInterval: 120000 }
  );

  const { data: client360Data, isLoading: client360Loading } = trpc.portal.admin.getClient360.useQuery(
    { clientId: client360Id! },
    { enabled: client360Id !== null }
  );

  const updateTierMutation = trpc.portal.clients.updateTier.useMutation();
  const updateSettingsMutation = trpc.portal.clients.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('Client settings updated successfully');
      setEditClientDialogOpen(false);
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  const handleSaveClientSettings = async () => {
    if (!editingClient) return;

    try {
      // Update Tier (and custom rates if applicable)
      const isCustom = editForm.tierId === 'custom';
      await updateTierMutation.mutateAsync({
        clientId: editingClient.id,
        tierId: editForm.tierId === 'auto' || isCustom ? null : parseInt(editForm.tierId),
        // Pass custom rates if using custom tier
        customDomBaseRate: isCustom ? editForm.customDomBaseRate : undefined,
        customDomPerKg: isCustom ? editForm.customDomPerKg : undefined,
        customSddBaseRate: isCustom ? editForm.customSddBaseRate : undefined,
        customSddPerKg: isCustom ? editForm.customSddPerKg : undefined,
      });

      // Update Settings
      await updateSettingsMutation.mutateAsync({
        clientId: editingClient.id,
        codAllowed: editForm.codAllowed,
        codFeePercent: editForm.codFeePercent,
        codMinFee: editForm.codMinFee,
        codMaxFee: editForm.codMaxFee,
        fodAllowed: editForm.fodAllowed,
        fodFee: editForm.fodFee,
        bulletAllowed: editForm.bulletAllowed,
        customBulletBaseRate: editForm.customBulletBaseRate,
        customBulletPerKg: editForm.customBulletPerKg,
        intlAllowed: editForm.intlAllowed,
        intlDiscountPercent: editForm.intlDiscountPercent,
      });
    } catch (error) {
      // handled by onError
    }
  };

  useEffect(() => {
    if (editingClient) {
      // Determine tier type: auto, custom, or a specific tier ID
      let tierId = 'auto';
      if (editingClient.customDomBaseRate || editingClient.customSddBaseRate) {
        tierId = 'custom';
      } else if (editingClient.manualRateTierId) {
        tierId = editingClient.manualRateTierId.toString();
      }

      setEditForm({
        tierId,
        codAllowed: !!editingClient.codAllowed,
        codFeePercent: editingClient.codFeePercent || '',
        codMinFee: editingClient.codMinFee || '',
        codMaxFee: editingClient.codMaxFee || '',
        customDomBaseRate: editingClient.customDomBaseRate || '',
        customDomPerKg: editingClient.customDomPerKg || '',
        customSddBaseRate: editingClient.customSddBaseRate || '',
        customSddPerKg: editingClient.customSddPerKg || '',
        fodAllowed: !!editingClient.fodAllowed,
        fodFee: editingClient.fodFee || '',
        bulletAllowed: !!editingClient.bulletAllowed,
        customBulletBaseRate: editingClient.customBulletBaseRate || '',
        customBulletPerKg: editingClient.customBulletPerKg || '',
        intlAllowed: !!editingClient.intlAllowed,
        intlDiscountPercent: editingClient.intlDiscountPercent || '',
      });
    }
  }, [editingClient]);


  // Fetch all orders
  const { data: allOrders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.portal.admin.getAllOrders.useQuery();

  // Fetch quote requests
  const { data: quoteRequests, isLoading: requestsLoading, refetch: refetchRequests } = trpc.portal.admin.getQuoteRequests.useQuery();

  const deleteRequestMutation = trpc.portal.admin.deleteQuoteRequest.useMutation({
    onSuccess: () => {
      toast.success('Request deleted successfully');
      refetchRequests();
    },
    onError: (error) => {
      toast.error(`Failed to delete request: ${error.message}`);
    },
  });

  // Fetch contact messages
  const { data: contactMessages, isLoading: messagesLoading, refetch: refetchMessages } = trpc.portal.admin.getContactMessages.useQuery();

  const deleteMessageMutation = trpc.portal.admin.deleteContactMessage.useMutation({
    onSuccess: () => {
      toast.success('Message deleted successfully');
      refetchMessages();
    },
    onError: (error) => {
      toast.error(`Failed to delete message: ${error.message}`);
    },
  });

  // Delete order mutation
  const deleteOrderMutation = trpc.portal.admin.deleteOrder.useMutation({
    onSuccess: () => {
      toast.success('Order deleted successfully');
      refetchOrders();
    },
    onError: (error) => {
      toast.error(`Failed to delete order: ${error.message}`);
    },
  });

  const handleDeleteOrder = (orderId: number, waybillNumber: string) => {
    if (confirm(`Are you sure you want to delete order ${waybillNumber}? This will also delete all related tracking events, COD records, and invoice items. This action cannot be undone.`)) {
      deleteOrderMutation.mutate({
        orderId,
      });
    }
  };

  // Filter orders
  const orders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders.filter(order => {
      if (orderFilterClientId !== 'all' && order.clientId.toString() !== orderFilterClientId) return false;
      if (orderFilterDateFrom) {
        const orderDate = new Date(order.createdAt);
        if (orderDate < new Date(orderFilterDateFrom)) return false;
      }
      if (orderFilterDateTo) {
        const orderDate = new Date(order.createdAt);
        const toDate = new Date(orderFilterDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (orderDate > toDate) return false;
      }
      if (!orderFilterStatuses.includes(order.status)) return false;
      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return orderSortDirection === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [allOrders, orderFilterClientId, orderFilterDateFrom, orderFilterDateTo, orderFilterStatuses, orderSortDirection]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    setLocation('/portal/login');
  };

  if (loading || !user) {
    return null;
  }

  const stats = {
    totalClients: clients?.length || 0,
    totalOrders: orders?.length || 0,
    activeOrders: orders?.filter(o => o.status !== 'delivered' && o.status !== 'canceled' && o.status !== 'returned').length || 0,
  };

  const menuItems: ModernMenuItem[] = [
    { icon: 'dashboard', label: 'Overview', value: 'overview' },
    { icon: 'bar_chart', label: 'Analytics', value: 'analytics' },
    { icon: 'group', label: 'Clients', value: 'clients' },
    { icon: 'package_2', label: 'All Orders', value: 'orders' },
    { icon: 'local_shipping', label: 'Drivers', value: 'drivers' },
    { icon: 'receipt_long', label: 'Billing', value: 'billing' },
    { icon: 'payments', label: 'COD Management', value: 'cod' },
    { icon: 'trending_up', label: 'Rates & Pricing', value: 'rates' },
    { icon: 'public', label: 'International', value: 'international' },
    { icon: 'summarize', label: 'Reports', value: 'reports' },
    { icon: 'chat', label: 'Requests', value: 'requests' },
    { icon: 'mail', label: 'Messages', value: 'messages' },
    { icon: 'menu_book', label: 'Guide', value: 'guide' },
  ];

  return (
    <ModernDashboardLayout
      menuItems={menuItems}
      activeItem={activeTab}
      onItemClick={(value: string, searchData?: string) => {
        if (value === 'tracking' && searchData) {
          const matchingOrder = (allOrders || []).find((o) =>
            o.waybillNumber.toLowerCase() === searchData.toLowerCase()
          );
          if (matchingOrder) {
            setSelectedOrder(matchingOrder);
            setViewOrderDialogOpen(true);
          } else {
            toast.error(`Order ${searchData} not found`);
          }
        } else {
          setActiveTab(value);
        }
      }}
      user={user}
      logout={handleLogout}
      title="Admin Portal"
      onCreateShipment={() => setCreateOrderDialogOpen(true)}
    >
      <div className="min-h-full p-4 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <h2 className="text-2xl font-bold">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <span className="material-symbols-outlined">group</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">All time</span>
                </div>
                <p className="text-muted-foreground text-sm font-medium">Total Clients</p>
                <h3 className="text-2xl font-bold mt-1">{stats.totalClients}</h3>
                <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(stats.totalClients, 100)}%` }}></div>
                </div>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-500">
                    <span className="material-symbols-outlined">package_2</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">All time</span>
                </div>
                <p className="text-muted-foreground text-sm font-medium">Total Orders</p>
                <h3 className="text-2xl font-bold mt-1">{stats.totalOrders}</h3>
                <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((stats.totalOrders / Math.max(stats.totalOrders, 1)) * 100, 100)}%` }}></div>
                </div>
              </div>
              <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-green-500/10 rounded-lg text-green-500">
                    <span className="material-symbols-outlined">local_shipping</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {stats.totalOrders > 0 ? `${Math.round((stats.activeOrders / stats.totalOrders) * 100)}% of total` : 'No orders'}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm font-medium">Active Orders</p>
                <h3 className="text-2xl font-bold mt-1">{stats.activeOrders}</h3>
                <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.totalOrders > 0 ? (stats.activeOrders / stats.totalOrders) * 100 : 0}%` }}></div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4 mt-0">
            <AdminAnalytics />
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">

            {/* Alert Panels */}
            {clientAlerts && (clientAlerts.overdueClients.length > 0 || clientAlerts.inactiveClients.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Overdue Invoices Alert */}
                {clientAlerts.overdueClients.length > 0 && (
                  <Card className="bg-red-500/5 rounded-2xl border border-red-500/20 shadow-xl shadow-primary/5">
                    <CardHeader className="pb-2">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setAlertsExpanded(prev => !prev)}
                      >
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                          {clientAlerts.overdueClients.length} client(s) with overdue invoices
                        </CardTitle>
                        {alertsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CardHeader>
                    {alertsExpanded && (
                      <CardContent className="pt-0">
                        <div className="space-y-2 mt-2">
                          {clientAlerts.overdueClients.map(c => (
                            <div key={c.clientId} className="flex items-center justify-between text-sm">
                              <span className="font-medium">{c.companyName}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{c.invoiceCount} inv</Badge>
                                <span className="text-red-400 font-mono">
                                  AED {c.overdueBalance.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* Inactive Clients Alert */}
                {clientAlerts.inactiveClients.length > 0 && (
                  <Card className="bg-yellow-500/5 rounded-2xl border border-yellow-500/20 shadow-xl shadow-primary/5">
                    <CardHeader className="pb-2">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setAlertsExpanded(prev => !prev)}
                      >
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-400">
                          <Clock className="h-4 w-4" />
                          {clientAlerts.inactiveClients.length} client(s) inactive 30+ days
                        </CardTitle>
                        {alertsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CardHeader>
                    {alertsExpanded && (
                      <CardContent className="pt-0">
                        <div className="space-y-2 mt-2">
                          {clientAlerts.inactiveClients.map(c => (
                            <div key={c.clientId} className="flex items-center justify-between text-sm">
                              <span className="font-medium">{c.companyName}</span>
                              <span className="text-yellow-400 text-xs">{c.daysSinceLastOrder} days ago</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}
              </div>
            )}

            <div className="flex gap-4">
              {/* Clients Table */}
              <Card className={`bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 ${client360Id ? 'flex-1 min-w-0' : 'w-full'}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Client Accounts</CardTitle>
                    <CardDescription>Manage all registered client accounts</CardDescription>
                  </div>
                  <Button onClick={() => setCreateClientWizardOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Client
                  </Button>
                </CardHeader>
                <CardContent>
                  {clientsLoading ? (
                    <p className="text-center py-8 text-muted-foreground">Loading clients...</p>
                  ) : clients && clients.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Company Name</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Country</TableHead>
                            <TableHead>Segment</TableHead>
                            <TableHead>Rate Tier</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>COD</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clients.map((client) => {
                            const isOverdue = clientAlerts?.overdueClients.some(c => c.clientId === client.id);
                            const inactiveAlert = clientAlerts?.inactiveClients.find(c => c.clientId === client.id);
                            const isSelected = client360Id === client.id;
                            return (
                              <TableRow
                                key={client.id}
                                className={isSelected ? 'bg-blue-500/10 border-blue-500/30' : ''}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      className="text-left hover:text-blue-400 transition-colors"
                                      onClick={() => setClient360Id(isSelected ? null : client.id)}
                                    >
                                      {client.companyName}
                                    </button>
                                    {isOverdue && (
                                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" aria-label="Has overdue invoices" />
                                    )}
                                    {inactiveAlert && (
                                      <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0" aria-label={`Inactive for ${inactiveAlert.daysSinceLastOrder} days`} />
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{client.contactName}</TableCell>
                                <TableCell className="text-xs">{client.billingEmail}</TableCell>
                                <TableCell>{client.country}</TableCell>
                                <TableCell>
                                  {/* Segment badge — placeholder, real data comes from client360 */}
                                  <Badge
                                    variant="outline"
                                    className="text-xs cursor-pointer"
                                    onClick={() => setClient360Id(isSelected ? null : client.id)}
                                    title="Click to see Client 360"
                                  >
                                    360 View
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {client.customDomBaseRate || client.customSddBaseRate ? (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                                      ✨ Custom
                                    </Badge>
                                  ) : client.manualRateTierId ? (
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                                      Manual Tier
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Auto</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                                    {client.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{client.codAllowed ? 'Yes' : 'No'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1 flex-wrap">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingClient(client);
                                        setEditClientDialogOpen(true);
                                      }}
                                      title="Edit Settings"
                                    >
                                      <LayoutDashboard className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedClientForNotes(client);
                                        setClientNotes(client.notes || '');
                                        setNotesDialogOpen(true);
                                      }}
                                      title="Client Notes"
                                      className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                    >
                                      <StickyNote className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedClientForPassword(client);
                                        setNewPassword('');
                                        setPasswordDialogOpen(true);
                                      }}
                                      title="Change Password"
                                      className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                    >
                                      <Key className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                      onClick={() => handleDeleteClient(client.id)}
                                      title="Delete Client"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">No clients found</p>
                  )}
                </CardContent>
              </Card>

              {/* Client 360 Side Panel */}
              {client360Id !== null && (
                <div className="w-80 shrink-0">
                  <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 sticky top-4">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {clients?.find(c => c.id === client360Id)?.companyName || 'Client'}
                          </CardTitle>
                          <CardDescription className="mt-0.5">360° View</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setClient360Id(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {client360Loading ? (
                        <div className="flex items-center justify-center py-8">
                          <span className="text-sm text-muted-foreground">Loading...</span>
                        </div>
                      ) : client360Data ? (
                        <>
                          {/* Segment Badge */}
                          <div className="flex items-center gap-2">
                            {client360Data.clientSegment === 'gold' && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40">Gold Client</Badge>
                            )}
                            {client360Data.clientSegment === 'silver' && (
                              <Badge className="bg-slate-400/20 text-slate-300 border-slate-400/40">Silver Client</Badge>
                            )}
                            {client360Data.clientSegment === 'bronze' && (
                              <Badge className="bg-orange-700/20 text-orange-400 border-orange-700/40">Bronze Client</Badge>
                            )}
                            {client360Data.clientSegment === 'new' && (
                              <Badge variant="outline">New Client</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{client360Data.currentRateTier}</span>
                          </div>

                          {/* Shipments */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-xs text-muted-foreground">This Month</p>
                              <p className="text-2xl font-bold text-blue-400">{client360Data.shipmentsThisMonth}</p>
                              <p className="text-xs text-muted-foreground">vs {client360Data.shipmentsLastMonth} last</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-xs text-muted-foreground">Last Active</p>
                              <p className="text-2xl font-bold">
                                {client360Data.daysSinceLastOrder !== null ? client360Data.daysSinceLastOrder : '—'}
                              </p>
                              <p className="text-xs text-muted-foreground">days ago</p>
                            </div>
                          </div>

                          {/* Financial */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Financial</p>
                            <div className="flex justify-between text-sm">
                              <span>Pending Invoices</span>
                              <span className={client360Data.pendingInvoicesBalance > 0 ? 'text-yellow-400 font-mono' : 'text-muted-foreground'}>
                                {client360Data.pendingInvoicesBalance > 0
                                  ? `AED ${client360Data.pendingInvoicesBalance.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`
                                  : '—'}
                              </span>
                            </div>
                            {client360Data.overdueInvoicesBalance > 0 && (
                              <div className="flex justify-between text-sm">
                                <span>Overdue</span>
                                <span className="text-red-400 font-mono">
                                  AED {client360Data.overdueInvoicesBalance.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span>Pending COD</span>
                              <span className={client360Data.pendingCODAmount > 0 ? 'text-orange-400 font-mono' : 'text-muted-foreground'}>
                                {client360Data.pendingCODAmount > 0
                                  ? `AED ${client360Data.pendingCODAmount.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`
                                  : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Monthly Trend (mini bar chart) */}
                          {client360Data.monthlyShipmentTrend.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">6-Month Trend</p>
                              <div className="flex items-end gap-1 h-12">
                                {(() => {
                                  const maxVal = Math.max(...client360Data.monthlyShipmentTrend.map(m => m.count), 1);
                                  return client360Data.monthlyShipmentTrend.map((m, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: ${m.count}`}>
                                      <div
                                        className="w-full bg-blue-500/60 rounded-sm"
                                        style={{ height: `${(m.count / maxVal) * 44}px` }}
                                      />
                                    </div>
                                  ));
                                })()}
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {client360Data.monthlyShipmentTrend[0]?.month?.slice(5)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {client360Data.monthlyShipmentTrend[client360Data.monthlyShipmentTrend.length - 1]?.month?.slice(5)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Recent Orders */}
                          {client360Data.recentOrders.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent Shipments</p>
                              <div className="space-y-1">
                                {client360Data.recentOrders.map((o, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-muted-foreground">{o.waybillNumber}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground">{o.city}</span>
                                      <Badge
                                        variant="outline"
                                        className="text-xs py-0 px-1"
                                        style={{
                                          borderColor: o.status === 'delivered' ? '#10b981' : o.status === 'returned' ? '#6b7280' : '#f59e0b',
                                          color: o.status === 'delivered' ? '#10b981' : o.status === 'returned' ? '#6b7280' : '#f59e0b',
                                        }}
                                      >
                                        {o.status.replace(/_/g, ' ')}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2 pt-2 border-t border-border">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => {
                                setOrderFilterClientId(client360Id.toString());
                                setActiveTab('orders');
                                setClient360Id(null);
                              }}
                            >
                              <Package className="h-3.5 w-3.5 mr-2" />
                              View Orders
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => {
                                setActiveTab('billing');
                                setClient360Id(null);
                              }}
                            >
                              <DollarSign className="h-3.5 w-3.5 mr-2" />
                              View Invoices
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => {
                                const client = clients?.find(c => c.id === client360Id);
                                if (client) {
                                  setEditingClient(client);
                                  setEditClientDialogOpen(true);
                                }
                              }}
                            >
                              <LayoutDashboard className="h-3.5 w-3.5 mr-2" />
                              Edit Client
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5">
              <CardHeader>
                <CardTitle>All Orders</CardTitle>
                <div className="flex justify-between items-center">
                  <CardDescription>View and manage all shipments</CardDescription>
                  <div className="flex gap-2">
                    <Button onClick={() => setCreateOrderDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Order
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      if (!orders || orders.length === 0) {
                        toast.error("No orders to export");
                        return;
                      }

                      // CSV Header
                      let csvContent = "data:text/csv;charset=utf-8,";
                      csvContent += "Waybill,Client,Consignee,Phone,City,Service,Weight(kg),Pieces,COD Amount,Status,Created At\n";

                      // Rows
                      orders.forEach(order => {
                        const clientName = clientsMap.get(order.clientId)?.companyName || 'Unknown Client';
                        const row = [
                          order.waybillNumber,
                          `"${clientName.replace(/"/g, '""')}"`, // Handle commas in name
                          `"${order.customerName.replace(/"/g, '""')}"`,
                          order.customerPhone,
                          order.city,
                          order.serviceType,
                          order.weight,
                          order.pieces,
                          order.codRequired ? order.codAmount : "0",
                          order.status,
                          new Date(order.createdAt).toLocaleDateString()
                        ].join(",");
                        csvContent += row + "\n";
                      });

                      // Download
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", `orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}>
                      <Download className="mr-2 h-4 w-4" />
                      Export to Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm font-medium mb-2 block">Filter by Client</label>
                    <select
                      value={orderFilterClientId}
                      onChange={(e) => setOrderFilterClientId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    >
                      <option value="all">All Clients</option>
                      {clients?.map((client) => (
                        <option key={client.id} value={client.id.toString()}>
                          {client.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-sm font-medium mb-2 block">From Date</label>
                    <input
                      type="date"
                      value={orderFilterDateFrom}
                      onChange={(e) => setOrderFilterDateFrom(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-sm font-medium mb-2 block">To Date</label>
                    <input
                      type="date"
                      value={orderFilterDateTo}
                      onChange={(e) => setOrderFilterDateTo(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between h-10 px-3 font-normal text-left overflow-hidden">
                          <span className="truncate">
                            {orderFilterStatuses.length === ALL_STATUSES.length
                              ? "All Statuses"
                              : `${orderFilterStatuses.length} Selected`}
                          </span>
                          <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="start">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="max-h-60 overflow-y-auto">
                          {ALL_STATUSES.map((status) => (
                            <DropdownMenuCheckboxItem
                              key={status}
                              checked={orderFilterStatuses.includes(status)}
                              onCheckedChange={(checked) => {
                                setOrderFilterStatuses((prev) =>
                                  checked
                                    ? [...prev, status]
                                    : prev.filter((s) => s !== status)
                                );
                              }}
                              className="capitalize"
                            >
                              {status.replace(/_/g, ' ')}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-sm font-medium mb-2 block">Sort By</label>
                    <select
                      value={orderSortDirection}
                      onChange={(e) => setOrderSortDirection(e.target.value as 'newest' | 'oldest')}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                  {(orderFilterClientId !== 'all' || orderFilterDateFrom || orderFilterDateTo || orderFilterStatuses.length !== ALL_STATUSES.length) && (
                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setOrderFilterClientId('all');
                          setOrderFilterDateFrom('');
                          setOrderFilterDateTo('');
                          setOrderFilterStatuses(ALL_STATUSES);
                        }}
                        className="h-10 px-4 rounded-md border border-input bg-background hover:bg-accent"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>

                {ordersLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading orders...</p>
                ) : orders && orders.length > 0 ? (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Waybill</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Consignee</TableHead>
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
                          {orders.map((order) => {
                            const statusColors: Record<string, string> = {
                              pending_pickup: 'bg-yellow-500/80 hover:bg-yellow-500',
                              picked_up: 'bg-blue-500/80 hover:bg-blue-500',
                              in_transit: 'bg-indigo-500/80 hover:bg-indigo-500',
                              out_for_delivery: 'bg-purple-500/80 hover:bg-purple-500',
                              delivered: 'bg-green-500/80 hover:bg-green-500',
                              failed_delivery: 'bg-red-500/80 hover:bg-red-500',
                              returned: 'bg-gray-500/80 hover:bg-gray-500',
                              exchange: 'bg-amber-500/80 hover:bg-amber-500',
                              canceled: 'bg-slate-500/80 hover:bg-slate-500',
                            };

                            const canCreateReturn = ['failed_delivery', 'returned', 'exchange'].includes(order.status) && !order.isReturn;

                            return (
                              <TableRow key={order.id}>
                                <TableCell className="font-mono font-medium text-blue-500">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {order.waybillNumber}
                                    {order.isReturn === 1 && order.orderType !== 'exchange' && (
                                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs flex items-center gap-1" title="Return">
                                        <RotateCcw className="h-4 w-4" />
                                      </Badge>
                                    )}
                                    {order.orderType === 'exchange' && (
                                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs flex items-center gap-1" title="Exchange">
                                        <ArrowLeftRight className="h-4 w-4" />
                                        {order.exchangeOrderId && (
                                          <span
                                            className="ml-1 underline cursor-pointer hover:text-amber-300"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const linkedOrder = allOrders?.find((o: any) => o.id === order.exchangeOrderId);
                                              if (linkedOrder) {
                                                setSelectedOrder(linkedOrder);
                                                setViewOrderDialogOpen(true);
                                              }
                                            }}
                                            title={`View linked order: ${allOrders?.find((o: any) => o.id === order.exchangeOrderId)?.waybillNumber || ''}`}
                                          >
                                            → {allOrders?.find((o: any) => o.id === order.exchangeOrderId)?.waybillNumber?.slice(-3) || ''}
                                          </span>
                                        )}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium text-primary">
                                  {clientsMap.get(order.clientId)?.companyName || 'Unknown'}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span>{order.customerName}</span>
                                    <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{order.city}, {order.destinationCountry}</TableCell>
                                <TableCell>
                                  <span className="font-medium">{order.weight}</span>
                                  <span className="text-muted-foreground text-xs ml-1">kg</span>
                                </TableCell>
                                <TableCell>{order.serviceType}</TableCell>
                                <TableCell>
                                  {order.codRequired ? (
                                    <Badge variant="default" className="bg-orange-500 hover:bg-orange-600">
                                      {order.codAmount} {order.codCurrency}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge className={`${statusColors[order.status] || 'bg-gray-500'} border-none text-white capitalize shadow-sm`}>
                                    {order.status.replace(/_/g, ' ')}
                                  </Badge>
                                </TableCell>
                                <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedOrder(order); setViewOrderDialogOpen(true); }} title="View Order Details">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setOrderToEdit(order); setEditOrderDialogOpen(true); }} title="Edit Order">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedShipmentId(order.id); setTrackingDialogOpen(true); }} title="Add Tracking Event">
                                      <Package className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={() => handleDeleteOrder(order.id, order.waybillNumber)} title="Delete Order" disabled={deleteOrderMutation.isPending}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {orders.map((order) => {
                        const statusColors: Record<string, string> = {
                          pending_pickup: 'bg-yellow-500/80',
                          picked_up: 'bg-blue-500/80',
                          in_transit: 'bg-indigo-500/80',
                          out_for_delivery: 'bg-purple-500/80',
                          delivered: 'bg-green-500/80',
                          failed_delivery: 'bg-red-500/80',
                          returned: 'bg-gray-500/80',
                          exchange: 'bg-amber-500/80',
                          canceled: 'bg-slate-500/80',
                        };
                        return (
                          <div key={order.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
                            {/* Top row: waybill + status */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-blue-500 text-sm">{order.waybillNumber}</span>
                                {order.isReturn === 1 && order.orderType !== 'exchange' && (
                                  <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
                                    <RotateCcw className="h-3 w-3 mr-1" />Return
                                  </Badge>
                                )}
                                {order.orderType === 'exchange' && (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                                    <ArrowLeftRight className="h-3 w-3 mr-1" />Exchange
                                  </Badge>
                                )}
                              </div>
                              <Badge className={`${statusColors[order.status] || 'bg-gray-500'} border-none text-white capitalize text-xs shrink-0`}>
                                {order.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            {/* Client */}
                            <div className="text-xs font-medium text-primary">
                              {clients?.find(c => c.id === order.clientId)?.companyName || 'Unknown'}
                            </div>
                            {/* Consignee + destination row */}
                            <div className="flex items-center justify-between text-sm">
                              <div>
                                <p className="font-medium">{order.customerName}</p>
                                <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <p>{order.city}, {order.destinationCountry}</p>
                                <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            {/* Service + weight + COD */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{order.serviceType}</span>
                              <span className="text-xs text-muted-foreground">{order.weight} kg</span>
                              {order.codRequired && (
                                <Badge className="bg-orange-500 text-white border-none text-xs">
                                  COD {order.codAmount} {order.codCurrency}
                                </Badge>
                              )}
                            </div>
                            {/* Actions */}
                            <div className="flex gap-2 pt-1 border-t border-border">
                              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setSelectedOrder(order); setViewOrderDialogOpen(true); }}>
                                <Eye className="h-3.5 w-3.5 mr-1" />View
                              </Button>
                              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setOrderToEdit(order); setEditOrderDialogOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setSelectedShipmentId(order.id); setTrackingDialogOpen(true); }}>
                                <Package className="h-3.5 w-3.5 mr-1" />Track
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteOrder(order.id, order.waybillNumber)} disabled={deleteOrderMutation.isPending}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No orders found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drivers Tab */}
          <TabsContent value="drivers" className="space-y-4">
            <DriversSection />
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-4">
            <BillingPanel />
          </TabsContent>

          {/* COD Tab */}
          <TabsContent value="cod" className="space-y-4">
            <CODPanel />
          </TabsContent>

          {/* Rates Tab */}
          <TabsContent value="rates" className="space-y-4">
            <RatesPanel />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <AdminReports />
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5">
              <CardHeader>
                <CardTitle>Pickup Requests</CardTitle>
                <CardDescription>View all pickup requests from the website</CardDescription>
              </CardHeader>
              <CardContent>
                {requestsLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading requests...</p>
                ) : quoteRequests && quoteRequests.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Pickup Address</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quoteRequests.map((req: any) => (
                          <TableRow key={req.id}>
                            <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>{req.name}</TableCell>
                            <TableCell>{req.phone}</TableCell>
                            <TableCell>{req.email}</TableCell>
                            <TableCell>{req.serviceType}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={req.pickupAddress}>{req.pickupAddress}</TableCell>
                            <TableCell>{req.weight}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this request?')) {
                                    deleteRequestMutation.mutate({
                                      requestId: req.id,
                                    });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No requests found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5">
              <CardHeader>
                <CardTitle>Contact Messages</CardTitle>
                <CardDescription>View inquiries from the Contact Us form</CardDescription>
              </CardHeader>
              <CardContent>
                {messagesLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading messages...</p>
                ) : contactMessages && contactMessages.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contactMessages.map((msg: any) => (
                          <TableRow key={msg.id}>
                            <TableCell>{new Date(msg.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>{msg.name}</TableCell>
                            <TableCell>{msg.email}</TableCell>
                            <TableCell className="max-w-[300px] truncate" title={msg.message}>{msg.message}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this message?')) {
                                    deleteMessageMutation.mutate({
                                      messageId: msg.id,
                                    });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No messages found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Guide Tab */}
          <TabsContent value="guide" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5">
              <CardHeader>
                <CardTitle>Waybill Guide</CardTitle>
                <CardDescription>Instructions for printing and attaching waybills</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <h3 className="text-lg font-medium mb-2">Printing Specifications</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                    <li>Standard Size: 100mm x 150mm (4x6 inches) thermal label.</li>
                    <li>Ensure specific settings: No Scaling/100% Scale.</li>
                    <li>Resolution: 203 DPI or higher recommended.</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium mb-3">Shipment Label Layout</h3>
                    <div className="border border-border rounded-lg overflow-hidden relative aspect-[100/150] bg-white shadow-sm flex items-center justify-center">
                      <div className="text-center text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Preview of generated PDF</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Key Elements</h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                        <div>
                          <p className="font-medium text-sm">Waybill Number (Barcode)</p>
                          <p className="text-xs text-muted-foreground">Used for scanning and tracking via App and Sortation.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                        <div>
                          <p className="font-medium text-sm">COD Amount</p>
                          <p className="text-xs text-muted-foreground">Clearly visible for drivers to collect payment.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                        <div>
                          <p className="font-medium text-sm">Routing Code</p>
                          <p className="text-xs text-muted-foreground">Destination city/area code for efficient sorting.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* International Shipping Tab */}
          <TabsContent value="international" className="space-y-4">
            <AdminInternationalShipping />
          </TabsContent>
        </Tabs>

        {/* Edit Client Settings Dialog */}
        <Dialog open={editClientDialogOpen} onOpenChange={setEditClientDialogOpen}>
          <DialogContent className="glass-strong !w-[95vw] !max-w-[1200px] p-0 gap-0 border-white/10">
            <div className="w-full h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
            <div className="p-8">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle>Client Settings: {editingClient?.companyName}</DialogTitle>
                    <DialogDescription>
                      Configure rates, payments, and specialized services.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-y border-white/10 my-6">

                {/* Column 1: Pricing & Rates */}
                <div className="space-y-6 pr-6 md:border-r border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Pricing & Rates</h3>
                  </div>

                  <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                    <p className="text-xs font-semibold text-blue-400">Zone-Based Rates Active</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Shipping rates for this client are configured in the <span className="font-semibold text-foreground">Rates &amp; Pricing</span> tab using Zone 1 / Zone 2 / Zone 3 pricing based on destination emirate.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      If no zone rates are set, volume-based tiers apply automatically.
                    </p>
                  </div>
                </div>

                {/* Column 2: Payment & COD */}
                <div className="space-y-6 px-0 md:px-8 md:border-r border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Payment & COD</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/30 group transition-all hover:bg-background/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="editCodAllowed" className="text-sm font-medium cursor-pointer">Enable COD</Label>
                        <p className="text-[10px] text-muted-foreground">Allow Cash on Delivery</p>
                      </div>
                      <Checkbox
                        id="editCodAllowed"
                        checked={editForm.codAllowed}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, codAllowed: checked as boolean })}
                      />
                    </div>

                    <div className={`space-y-4 transition-all duration-300 ${!editForm.codAllowed ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Fee (%)</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-7 text-sm bg-background/50"
                              value={editForm.codFeePercent}
                              onChange={(e) => setEditForm({ ...editForm, codFeePercent: e.target.value })}
                              placeholder="3.3"
                            />
                            <span className="absolute left-2.5 top-2.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" /></span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Min Fee (AED)</Label>
                          <Input
                            className="h-9 text-sm bg-background/50"
                            value={editForm.codMinFee}
                            onChange={(e) => setEditForm({ ...editForm, codMinFee: e.target.value })}
                            placeholder="8.00"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Fee Cap (Optional)</Label>
                        <Input
                          className="h-9 text-sm bg-background/50"
                          value={editForm.codMaxFee}
                          onChange={(e) => setEditForm({ ...editForm, codMaxFee: e.target.value })}
                          placeholder="e.g. 50.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Specialized Services */}
                <div className="space-y-6 md:pl-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Services</h3>
                  </div>

                  <div className="space-y-4">
                    {/* Bullet Service */}
                    <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Rocket className="w-5 h-5 text-red-500" />
                          <span className="text-sm font-bold uppercase text-red-500 tracking-wider">Bullet (4H)</span>
                        </div>
                        <Checkbox
                          id="editBulletAllowed"
                          checked={editForm.bulletAllowed}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, bulletAllowed: checked as boolean })}
                        />
                      </div>
                      <div className={`grid grid-cols-2 gap-4 transition-opacity ${!editForm.bulletAllowed ? 'opacity-30' : 'opacity-100'}`}>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-red-500/70">Base (5kg)</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-8 text-sm bg-background/50 border-red-500/20"
                              value={editForm.customBulletBaseRate}
                              onChange={(e) => setEditForm({ ...editForm, customBulletBaseRate: e.target.value })}
                              placeholder="50.00"
                              disabled={!editForm.bulletAllowed}
                            />
                            <span className="absolute left-2.5 top-2.5 text-[10px] text-red-500/50 font-bold">AED</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-red-500/70">Extra KG</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-8 text-sm bg-background/50 border-red-500/20"
                              value={editForm.customBulletPerKg}
                              onChange={(e) => setEditForm({ ...editForm, customBulletPerKg: e.target.value })}
                              placeholder="5.00"
                              disabled={!editForm.bulletAllowed}
                            />
                            <span className="absolute left-2.5 top-2.5 text-[10px] text-red-500/50 font-bold">AED</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fit on Delivery */}
                    <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shirt className="w-5 h-5 text-blue-500" />
                        <div className="space-y-1">
                          <span className="text-sm font-bold uppercase text-blue-500 tracking-wider">Fit on Delivery</span>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-blue-500/70 font-bold uppercase">Fee (AED):</Label>
                            <Input
                              className="h-6 w-16 p-1 text-xs bg-background/50 border-blue-500/30 text-center font-mono"
                              value={editForm.fodFee}
                              onChange={(e) => setEditForm({ ...editForm, fodFee: e.target.value })}
                              placeholder="5.00"
                              disabled={!editForm.fodAllowed}
                            />
                          </div>
                        </div>
                      </div>
                      <Checkbox
                        id="editFodAllowed"
                        checked={editForm.fodAllowed}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, fodAllowed: checked as boolean })}
                      />
                    </div>

                    {/* International */}
                    <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-indigo-500" />
                        <div className="space-y-1">
                          <span className="text-sm font-bold uppercase text-indigo-500 tracking-wider">International</span>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-indigo-500/70 font-bold uppercase">Discount (%):</Label>
                            <Input
                              className="h-6 w-16 p-1 text-xs bg-background/50 border-indigo-500/30 text-center font-mono"
                              value={editForm.intlDiscountPercent}
                              onChange={(e) => setEditForm({ ...editForm, intlDiscountPercent: e.target.value })}
                              placeholder="10"
                              disabled={!editForm.intlAllowed}
                            />
                          </div>
                        </div>
                      </div>
                      <Checkbox
                        id="editIntlAllowed"
                        checked={editForm.intlAllowed}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, intlAllowed: checked as boolean })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditClientDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                  onClick={handleSaveClientSettings}
                  disabled={updateSettingsMutation.isPending || updateTierMutation.isPending}
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {(updateSettingsMutation.isPending || updateTierMutation.isPending) ? 'Saving...' : 'Save Configuration'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Client Wizard */}
        <CreateClientWizard
          open={createClientWizardOpen}
          onOpenChange={setCreateClientWizardOpen}
          onSuccess={refetchClients}
        />

        {/* Add Tracking Event Dialog */}
        {selectedShipmentId && (
          <AddTrackingEventDialog
            open={trackingDialogOpen}
            onOpenChange={setTrackingDialogOpen}
            shipmentId={selectedShipmentId}
            onSuccess={() => {
              // Refresh orders list
              refetchOrders();
            }}
          />
        )}

        {/* Client Notes Dialog */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent className="glass-strong !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
            <div className="w-full h-1 bg-gradient-to-r from-amber-600 to-orange-600" />
            <div className="p-6">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <StickyNote className="w-6 h-6 text-amber-400" />
                  </div>
                  Client Notes: {selectedClientForNotes?.companyName}
                </DialogTitle>
                <DialogDescription>
                  Add internal notes about this client. This information is only visible to admins.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="clientNotes">Notes</Label>
                <Textarea
                  id="clientNotes"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Enter notes about this client... (e.g., special arrangements, contact preferences, billing notes, etc.)"
                  className="min-h-[200px] resize-y bg-white/5 border-white/10"
                />
              </div>
              <DialogFooter className="pt-6 mt-6 border-t border-white/10">
                <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveNotes}
                  disabled={updateNotesMutation.isPending}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent className="glass-strong !w-[90vw] !max-w-[480px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
            <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />
            <div className="p-6">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Key className="w-6 h-6 text-blue-400" />
                  </div>
                  Change Password
                </DialogTitle>
                <DialogDescription>
                  Set a new password for {selectedClientForPassword?.companyName}'s user account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="bg-white/5 border-white/10"
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters long.
                </p>
              </div>
              <DialogFooter className="pt-6 mt-6 border-t border-white/10">
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={updatePasswordMutation.isPending || newPassword.length < 8}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {selectedOrder && (
          <OrderDetailsDialog
            open={viewOrderDialogOpen}
            onOpenChange={setViewOrderDialogOpen}
            order={selectedOrder}
            clients={clients}
          />
        )}

        {/* Admin Create Order Dialog */}
        <AdminCreateOrderDialog
          open={createOrderDialogOpen}
          onOpenChange={setCreateOrderDialogOpen}
          clients={clients}
          onSuccess={() => {
            setCreateOrderDialogOpen(false);
            refetchOrders();
          }}
        />

        {/* Edit Order Dialog */}
        <EditOrderDialog
          open={editOrderDialogOpen}
          onOpenChange={setEditOrderDialogOpen}
          order={orderToEdit}
          onSuccess={() => {
            refetchOrders();
          }}
        />


      </div>
    </ModernDashboardLayout>
  );
}
