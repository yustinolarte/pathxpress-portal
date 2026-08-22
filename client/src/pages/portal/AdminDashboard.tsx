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
import { LogOut, Users, Package, TrendingUp, FileText, Download, DollarSign, Plus, LayoutDashboard, Calculator, Wallet, MessageSquare, Trash2, Mail, BookOpen, BarChart3, StickyNote, Key, RotateCcw, ArrowLeftRight, Truck, Eye, Pencil, Globe, Sparkles, Rocket, Shirt, Coins, ShieldCheck, Zap, Filter, AlertTriangle, ChevronDown, ChevronUp, X, Clock, UserPlus, Building2, Calendar, Ban, CheckCircle2, MapPin } from 'lucide-react';
import { APP_LOGO, abbreviateServiceType } from '@/const';
import { statusBadgeClass } from '@/lib/statusStyles';
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
import AdminReturnExchangeDialog from '@/components/AdminReturnExchangeDialog';
import EditOrderDialog from '@/components/EditOrderDialog';
import AdminInternationalShipping from '@/components/AdminInternationalShipping';
import CreateClientWizard from '@/components/CreateClientWizard';
import EmailStudioPanel from '@/components/EmailStudioPanel';
import AdminClientLocationsSection from '@/components/AdminClientLocationsSection';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';

const ORDERS_PAGE_SIZE = 50;
const INBOX_PAGE_SIZE = 25;

function toDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const ALL_STATUSES = [
  'pending_pickup', 'picked_up', 'failed_pickup', 'in_transit', 'out_for_delivery',
  'delivered', 'failed_delivery', 'address_issue', 'rescheduled', 'damaged', 'on_hold', 'returned', 'returned_to_sender', 'exchange', 'canceled', 'delivery_attempted'
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout, loading } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('analytics');

  // Client editing state
  const [editClientDialogOpen, setEditClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    tierId: 'auto',
    codAllowed: false,
    codFeePercent: '',
    codMinFee: '',
    codMaxFee: '',
    // Card on Delivery (CCOD) settings
    cardOnDeliveryAllowed: false,
    cardFeePercent: '',
    cardMinFee: '',
    cardMaxFee: '',
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
    // Billing settlement
    defaultSettlementPeriod: 'custom' as 'weekly' | 'biweekly' | 'monthly' | 'custom',
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
  const [orderFilterDeliveryFrom, setOrderFilterDeliveryFrom] = useState('');
  const [orderFilterDeliveryTo, setOrderFilterDeliveryTo] = useState('');
  const [orderFilterStatuses, setOrderFilterStatuses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('orderFilterStatuses');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Statuses added after this filter was first saved — merge them in so
          // they show up checked by default instead of being silently excluded.
          const newlyAddedStatuses = ['failed_pickup', 'rescheduled', 'address_issue', 'damaged'];
          return Array.from(new Set([...parsed, ...newlyAddedStatuses.filter(s => !parsed.includes(s))]));
        }
      }
    } catch {}
    return ALL_STATUSES;
  });
  const [orderSortDirection, setOrderSortDirection] = useState<'newest' | 'oldest'>('newest');
  const [orderPage, setOrderPage] = useState(0);
  const [requestPage, setRequestPage] = useState(0);
  const [requestStatus, setRequestStatus] = useState<'all' | 'new' | 'contacted' | 'scheduled' | 'completed'>('all');
  const [requestSearch, setRequestSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [requestDetailOpen, setRequestDetailOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(() => new Set());
  const [selectingAllRequests, setSelectingAllRequests] = useState(false);
  const [messagePage, setMessagePage] = useState(0);
  const [messageStatus, setMessageStatus] = useState<'all' | 'new' | 'read' | 'archived'>('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [messageDetailOpen, setMessageDetailOpen] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([]);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [emailOrderDraft, setEmailOrderDraft] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('orderFilterStatuses', JSON.stringify(orderFilterStatuses));
  }, [orderFilterStatuses]);

  // Reset to first page whenever any filter changes
  useEffect(() => {
    setOrderPage(0);
  }, [orderFilterClientId, orderFilterDateFrom, orderFilterDateTo, orderFilterDeliveryFrom, orderFilterDeliveryTo, orderFilterStatuses, orderSortDirection]);

  useEffect(() => {
    setRequestPage(0);
    setSelectedRequestIds(new Set());
  }, [requestStatus, requestSearch]);
  useEffect(() => setSelectedRequestIds(new Set()), [requestPage]);
  useEffect(() => setMessagePage(0), [messageStatus, messageSearch]);

  // Create client dialog state
  const [createClientWizardOpen, setCreateClientWizardOpen] = useState(false);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);

  // Admin return/exchange dialog state — order set for "from existing order", null for manual entry
  const [returnExchangeDialogOpen, setReturnExchangeDialogOpen] = useState(false);
  const [returnExchangeOrder, setReturnExchangeOrder] = useState<any>(null);

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

  // Active/Inactive/All filter for the clients table
  const [clientStatusFilter, setClientStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const setClientStatusMutation = trpc.portal.admin.setClientStatus.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.status === 'active' ? 'Client reactivated' : 'Client deactivated');
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to update client status: ${error.message}`);
    },
  });

  const handleToggleClientStatus = (client: any) => {
    const nextStatus = client.status === 'active' ? 'inactive' : 'active';
    const message = nextStatus === 'inactive'
      ? `Deactivate ${client.companyName}? They will be hidden from new order creation and locked out of the customer portal (they'll see a "contact support" message on login). Order history is kept and this can be undone.`
      : `Reactivate ${client.companyName}? They will reappear in order creation and regain portal login access.`;
    if (confirm(message)) {
      setClientStatusMutation.mutate({ clientId: client.id, status: nextStatus });
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
    const map = new Map<number, { companyName: string; billingEmail: string }>();
    clients?.forEach(c => map.set(c.id, { companyName: c.companyName, billingEmail: c.billingEmail }));
    return map;
  }, [clients]);

  // Deactivated clients can't be picked when creating a new shipment
  const activeClients = useMemo(() => clients?.filter(c => c.status === 'active'), [clients]);

  const clientCounts = useMemo(() => ({
    active: clients?.filter(c => c.status === 'active').length ?? 0,
    inactive: clients?.filter(c => c.status === 'inactive').length ?? 0,
    all: clients?.length ?? 0,
  }), [clients]);

  const visibleClients = useMemo(() => {
    if (!clients) return clients;
    if (clientStatusFilter === 'all') return clients;
    return clients.filter(c => c.status === clientStatusFilter);
  }, [clients, clientStatusFilter]);

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
        cardOnDeliveryAllowed: editForm.cardOnDeliveryAllowed,
        cardFeePercent: editForm.cardFeePercent,
        cardMinFee: editForm.cardMinFee,
        cardMaxFee: editForm.cardMaxFee,
        fodAllowed: editForm.fodAllowed,
        fodFee: editForm.fodFee,
        bulletAllowed: editForm.bulletAllowed,
        customBulletBaseRate: editForm.customBulletBaseRate,
        customBulletPerKg: editForm.customBulletPerKg,
        intlAllowed: editForm.intlAllowed,
        intlDiscountPercent: editForm.intlDiscountPercent,
        defaultSettlementPeriod: editForm.defaultSettlementPeriod,
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
        cardOnDeliveryAllowed: !!editingClient.cardOnDeliveryAllowed,
        cardFeePercent: editingClient.cardFeePercent || '',
        cardMinFee: editingClient.cardMinFee || '',
        cardMaxFee: editingClient.cardMaxFee || '',
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
        defaultSettlementPeriod: (editingClient.defaultSettlementPeriod || 'custom') as 'weekly' | 'biweekly' | 'monthly' | 'custom',
      });
    }
  }, [editingClient]);


  const utils = trpc.useUtils();

  const handleExportRequests = async () => {
    const rows = await utils.portal.admin.exportQuoteRequests.fetch({
      status: requestStatus === 'all' ? undefined : requestStatus,
      search: requestSearch || undefined,
    });
    const safeCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = ['Date', 'Status', 'Name', 'Phone', 'Email', 'Service', 'Pickup Address', 'Delivery Address', 'Weight', 'Comments'];
    const csvRows = rows.map((request) => [
      new Date(request.createdAt).toISOString(), request.status, request.name, request.phone,
      request.email, request.serviceType, request.pickupAddress, request.deliveryAddress,
      request.weight, request.comments,
    ].map(safeCell).join(','));
    const blob = new Blob([`\uFEFF${headers.map(safeCell).join(',')}\n${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pickup-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openRequestDetails = (request: any) => {
    setSelectedRequest(request);
    setRequestDetailOpen(true);
  };

  const openMessageDetails = (message: any) => {
    setSelectedMessage(message);
    setMessageDetailOpen(true);
    if (message.status === 'new') {
      updateMessageStatusMutation.mutate({ messageId: message.id, status: 'read' });
    }
  };

  const applyQuickOrderFilter = (filter: 'today' | 'week' | 'pending' | 'out') => {
    if (filter === 'pending' || filter === 'out') {
      setOrderFilterDateFrom('');
      setOrderFilterDateTo('');
      setOrderFilterDeliveryFrom('');
      setOrderFilterDeliveryTo('');
      setOrderFilterStatuses([filter === 'pending' ? 'pending_pickup' : 'out_for_delivery']);
      return;
    }

    const today = new Date();
    const from = new Date(today);
    if (filter === 'week') {
      const day = (today.getDay() + 6) % 7;
      from.setDate(today.getDate() - day);
    }
    setOrderFilterStatuses(ALL_STATUSES);
    setOrderFilterDeliveryFrom('');
    setOrderFilterDeliveryTo('');
    setOrderFilterDateFrom(toDateInputValue(from));
    setOrderFilterDateTo(toDateInputValue(today));
  };

  // Server-side filtered/sorted/paginated orders. Filters drive the query input;
  // with no date filter the server defaults to the current month.
  const orderQueryInput = useMemo(() => ({
    page: orderPage,
    pageSize: ORDERS_PAGE_SIZE,
    clientId: orderFilterClientId !== 'all' ? Number(orderFilterClientId) : undefined,
    dateFrom: orderFilterDateFrom || undefined,
    dateTo: orderFilterDateTo || undefined,
    deliveryFrom: orderFilterDeliveryFrom || undefined,
    deliveryTo: orderFilterDeliveryTo || undefined,
    statuses: orderFilterStatuses.length < ALL_STATUSES.length ? orderFilterStatuses : undefined,
    sort: orderSortDirection,
  }), [orderPage, orderFilterClientId, orderFilterDateFrom, orderFilterDateTo, orderFilterDeliveryFrom, orderFilterDeliveryTo, orderFilterStatuses, orderSortDirection]);

  // Fetch orders (current page) + KPI stats (counts over full history)
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.portal.admin.getAllOrders.useQuery(orderQueryInput);
  // No scope filter: these two feed the Overview KPI row, where every other tile
  // (today/week/month, status distribution, FADR) counts the whole network. Asking
  // for domestic only made "Total Orders" disagree with the status chart below it.
  const { data: ordersStats } = trpc.portal.admin.getOrdersStats.useQuery({});
  const allOrders = ordersData?.rows ?? [];
  const ordersTotal = ordersData?.total ?? 0;

  // Paginated inbound requests and sidebar unread badges.
  const { data: quoteRequestsData, isLoading: requestsLoading, refetch: refetchRequests } = trpc.portal.admin.getQuoteRequestsPaged.useQuery({
    page: requestPage,
    pageSize: INBOX_PAGE_SIZE,
    status: requestStatus === 'all' ? undefined : requestStatus,
    search: requestSearch || undefined,
  });
  const quoteRequests = quoteRequestsData?.rows ?? [];
  const quoteRequestsTotal = quoteRequestsData?.total ?? 0;
  const requestPageCount = Math.max(1, Math.ceil(quoteRequestsTotal / INBOX_PAGE_SIZE));
  const selectedRequestCount = selectedRequestIds.size;
  const selectedRequestsOnPage = quoteRequests.filter((request: any) => selectedRequestIds.has(request.id)).length;
  const allRequestsOnPageSelected = quoteRequests.length > 0 && selectedRequestsOnPage === quoteRequests.length;
  const { data: inboxCounts, refetch: refetchInboxCounts } = trpc.portal.admin.getInboxCounts.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const deleteRequestMutation = trpc.portal.admin.deleteQuoteRequest.useMutation({
    onSuccess: (_result, variables) => {
      toast.success('Request deleted successfully');
      setSelectedRequestIds((current) => {
        const next = new Set(current);
        next.delete(variables.requestId);
        return next;
      });
      refetchRequests();
      refetchInboxCounts();
    },
    onError: (error) => {
      toast.error(`Failed to delete request: ${error.message}`);
    },
  });

  const bulkDeleteRequestsMutation = trpc.portal.admin.bulkDeleteQuoteRequests.useMutation({
    onSuccess: ({ deletedCount }) => {
      toast.success(`${deletedCount} request${deletedCount === 1 ? '' : 's'} deleted successfully`);
      setSelectedRequestIds(new Set());
      setRequestPage(0);
      refetchRequests();
      refetchInboxCounts();
    },
    onError: (error) => {
      toast.error(`Failed to delete selected requests: ${error.message}`);
    },
  });

  const toggleRequestSelection = (requestId: number, checked: boolean) => {
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      if (checked) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  };

  const toggleCurrentRequestPage = (checked: boolean) => {
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      quoteRequests.forEach((request: any) => {
        if (checked) next.add(request.id);
        else next.delete(request.id);
      });
      return next;
    });
  };

  const selectAllMatchingRequests = async () => {
    setSelectingAllRequests(true);
    try {
      const rows = await utils.portal.admin.exportQuoteRequests.fetch({
        status: requestStatus === 'all' ? undefined : requestStatus,
        search: requestSearch || undefined,
      });
      setSelectedRequestIds(new Set(rows.map((request) => request.id)));
      toast.success(`${rows.length} matching request${rows.length === 1 ? '' : 's'} selected`);
    } catch (error) {
      toast.error(`Failed to select matching requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSelectingAllRequests(false);
    }
  };

  const deleteSelectedRequests = () => {
    const requestIds = Array.from(selectedRequestIds);
    if (requestIds.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${requestIds.length} selected pickup request${requestIds.length === 1 ? '' : 's'}? This permanently deletes only the selected records and cannot be undone.`,
    );
    if (confirmed) bulkDeleteRequestsMutation.mutate({ requestIds });
  };

  const updateRequestStatusMutation = trpc.portal.admin.updateQuoteRequestStatus.useMutation({
    onSuccess: () => {
      toast.success('Request status updated');
      refetchRequests();
      refetchInboxCounts();
    },
    onError: (error) => toast.error(`Failed to update request: ${error.message}`),
  });

  const { data: contactMessagesData, isLoading: messagesLoading, refetch: refetchMessages } = trpc.portal.admin.getContactMessagesPaged.useQuery({
    page: messagePage,
    pageSize: INBOX_PAGE_SIZE,
    status: messageStatus === 'all' ? undefined : messageStatus,
    search: messageSearch || undefined,
  });
  const contactMessages = contactMessagesData?.rows ?? [];
  const contactMessagesTotal = contactMessagesData?.total ?? 0;
  const messagePageCount = Math.max(1, Math.ceil(contactMessagesTotal / INBOX_PAGE_SIZE));

  const deleteMessageMutation = trpc.portal.admin.deleteContactMessage.useMutation({
    onSuccess: () => {
      toast.success('Message deleted successfully');
      refetchMessages();
      refetchInboxCounts();
    },
    onError: (error) => {
      toast.error(`Failed to delete message: ${error.message}`);
    },
  });

  const updateMessageStatusMutation = trpc.portal.admin.updateContactMessageStatus.useMutation({
    onSuccess: () => {
      refetchMessages();
      refetchInboxCounts();
    },
    onError: (error) => toast.error(`Failed to update message: ${error.message}`),
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

  // Server already returns this page filtered + sorted.
  const orders = allOrders;
  const orderPageCount = Math.max(1, Math.ceil(ordersTotal / ORDERS_PAGE_SIZE));

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
    // Inactive accounts still count as registered, but the split is what an admin
    // actually wants to know from a "Total Clients" tile.
    activeClients: clients?.filter((c: any) => c.status === 'active').length || 0,
    totalOrders: ordersStats?.totalOrders || 0,
    activeOrders: ordersStats?.activeOrders || 0,
  };

  const menuItems: ModernMenuItem[] = [
    { icon: 'dashboard', label: 'Overview', value: 'analytics', section: 'Operations' },
    { icon: 'group', label: 'Clients', value: 'clients', section: 'Operations' },
    { icon: 'package_2', label: 'All Orders', value: 'orders', section: 'Operations' },
    { icon: 'local_shipping', label: 'Drivers', value: 'drivers', section: 'Operations' },
    { icon: 'receipt_long', label: 'Billing', value: 'billing', section: 'Finance' },
    { icon: 'payments', label: 'COD Management', value: 'cod', section: 'Finance' },
    { icon: 'trending_up', label: 'Rates & Pricing', value: 'rates', section: 'Finance' },
    { icon: 'public', label: 'International', value: 'international', section: 'Finance' },
    { icon: 'summarize', label: 'Reports', value: 'reports', section: 'Inbox' },
    { icon: 'chat', label: 'Requests', value: 'requests', section: 'Inbox', badge: inboxCounts?.requests },
    { icon: 'mail', label: 'Messages', value: 'messages', section: 'Inbox', badge: inboxCounts?.messages },
    { icon: 'forward_to_inbox', label: 'Email Studio', value: 'email', section: 'Inbox' },
    { icon: 'menu_book', label: 'Guide', value: 'guide', section: 'Inbox' },
  ];

  return (
    <ModernDashboardLayout
      menuItems={menuItems}
      activeItem={activeTab}
      onItemClick={async (value: string, searchData?: string) => {
        if (value === 'tracking' && searchData) {
          const results = await utils.portal.admin.globalSearch.fetch({ term: searchData });
          const exactOrder = results.find(result => result.type === 'order' && result.label.toLowerCase() === searchData.toLowerCase());
          if (exactOrder) {
            setSelectedOrder(exactOrder.entity);
            setViewOrderDialogOpen(true);
          } else if (results.length > 0) {
            setGlobalSearchQuery(searchData);
            setGlobalSearchResults(results);
            setGlobalSearchOpen(true);
          } else {
            toast.error(`No results found for “${searchData}”`);
          }
        } else {
          setActiveTab(value);
        }
      }}
      user={user}
      logout={handleLogout}
      title="Admin Portal"
      onCreateShipment={() => setCreateOrderDialogOpen(true)}
      searchPlaceholder="Search orders, clients or drivers..."
    >
      <div className="min-h-full p-2 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview + Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4 mt-0">
            <AdminAnalytics
              totalClients={stats.totalClients}
              activeClients={stats.activeClients}
              totalOrders={stats.totalOrders}
              activeOrders={stats.activeOrders}
            />
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">

            {/* Alert Panels */}
            {clientAlerts && (clientAlerts.overdueClients.length > 0 || clientAlerts.inactiveClients.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Overdue Invoices Alert */}
                {clientAlerts.overdueClients.length > 0 && (
                  <Card className="alert-soft red rounded-2xl shadow-sm block p-0">
                    <CardHeader className="pb-2">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setAlertsExpanded(prev => !prev)}
                      >
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-foreground"><b className="font-display">{clientAlerts.overdueClients.length} client(s)</b> with overdue invoices</span>
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
                                <span className="pill">{c.invoiceCount} inv</span>
                                <span className="money text-primary">
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
                  <Card className="alert-soft amber rounded-2xl shadow-sm block p-0">
                    <CardHeader className="pb-2">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setAlertsExpanded(prev => !prev)}
                      >
                        <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--st-amber)' }}>
                          <Clock className="h-4 w-4" />
                          <span className="text-foreground"><b className="font-display">{clientAlerts.inactiveClients.length} client(s)</b> inactive 30+ days</span>
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
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs" style={{ color: 'var(--st-amber)' }}>{c.daysSinceLastOrder} days ago</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    const client = clients?.find(cl => cl.id === c.clientId);
                                    if (client) handleToggleClientStatus(client);
                                  }}
                                >
                                  Deactivate
                                </Button>
                              </div>
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
              <Card className={`bg-card rounded-2xl border border-border shadow-sm ${client360Id ? 'flex-1 min-w-0' : 'w-full'}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <p className="eyebrow mb-2">Clients</p>
                    <CardTitle className="text-xl">Client Accounts</CardTitle>
                    <CardDescription>Manage all registered client accounts</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 rounded-lg border border-border p-1">
                      {(['active', 'inactive', 'all'] as const).map(f => (
                        <Button
                          key={f}
                          variant={clientStatusFilter === f ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 px-3 text-xs capitalize"
                          onClick={() => setClientStatusFilter(f)}
                        >
                          {f} ({clientCounts[f]})
                        </Button>
                      ))}
                    </div>
                    <Button onClick={() => setCreateClientWizardOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Client
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {clientsLoading ? (
                    <p className="text-center py-8 text-muted-foreground">Loading clients...</p>
                  ) : visibleClients && visibleClients.length > 0 ? (
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
                          {visibleClients.map((client) => {
                            const isOverdue = clientAlerts?.overdueClients.some(c => c.clientId === client.id);
                            const inactiveAlert = clientAlerts?.inactiveClients.find(c => c.clientId === client.id);
                            const isSelected = client360Id === client.id;
                            return (
                              <TableRow
                                key={client.id}
                                className={`${isSelected ? 'bg-primary/10' : ''} ${client.status === 'inactive' ? 'opacity-60' : ''}`}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      className="text-left font-display font-semibold hover:text-primary transition-colors"
                                      onClick={() => setClient360Id(isSelected ? null : client.id)}
                                    >
                                      {client.companyName}
                                    </button>
                                    {isOverdue && (
                                      <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Has overdue invoices" />
                                    )}
                                    {inactiveAlert && (
                                      <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--st-amber)' }} aria-label={`Inactive for ${inactiveAlert.daysSinceLastOrder} days`} />
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{client.contactName}</TableCell>
                                <TableCell className="text-xs">{client.billingEmail}</TableCell>
                                <TableCell>{client.country}</TableCell>
                                <TableCell>
                                  {/* Segment badge — placeholder, real data comes from client360 */}
                                  <button
                                    className="pill cursor-pointer hover:border-primary transition-colors"
                                    onClick={() => setClient360Id(isSelected ? null : client.id)}
                                    title="Click to see Client 360"
                                  >
                                    360 View
                                  </button>
                                </TableCell>
                                <TableCell>
                                  {client.customDomBaseRate || client.customSddBaseRate ? (
                                    <span className="pill custom">Custom</span>
                                  ) : client.manualRateTierId ? (
                                    <span className="pill">Manual Tier</span>
                                  ) : (
                                    <span className="pill">Auto</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={statusBadgeClass(client.status)}>
                                    {client.status}
                                  </span>
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
                                      className="text-muted-foreground hover:text-foreground"
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
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <Key className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleClientStatus(client)}
                                      title={client.status === 'active' ? 'Deactivate Client' : 'Reactivate Client'}
                                      className={client.status === 'active' ? 'text-muted-foreground hover:text-foreground' : 'hover:text-primary'}
                                      style={client.status === 'inactive' ? { color: 'var(--st-green)' } : undefined}
                                    >
                                      {client.status === 'active' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
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
                    <p className="text-center py-8 text-muted-foreground">
                      {clientStatusFilter === 'all' ? 'No clients found' : `No ${clientStatusFilter} clients`}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Client 360 Side Panel */}
              {client360Id !== null && (
                <div className="w-80 shrink-0">
                  <Card className="bg-card rounded-2xl border border-border shadow-sm sticky top-4">
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
                              <span className="badge2 b-amber">Gold Client</span>
                            )}
                            {client360Data.clientSegment === 'silver' && (
                              <span className="badge2 b-gray">Silver Client</span>
                            )}
                            {client360Data.clientSegment === 'bronze' && (
                              <span className="badge2 b-gray">Bronze Client</span>
                            )}
                            {client360Data.clientSegment === 'new' && (
                              <span className="badge2 b-blue">New Client</span>
                            )}
                            <span className="text-xs text-muted-foreground">{client360Data.currentRateTier}</span>
                          </div>

                          {/* Shipments */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-xs text-muted-foreground">This Month</p>
                              <p className="font-display text-2xl font-bold tracking-tight">{client360Data.shipmentsThisMonth}</p>
                              <p className="text-xs text-muted-foreground">vs {client360Data.shipmentsLastMonth} last</p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="text-xs text-muted-foreground">Last Active</p>
                              <p className="font-display text-2xl font-bold tracking-tight">
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
                              <span className={client360Data.pendingInvoicesBalance > 0 ? 'money' : 'text-muted-foreground'} style={client360Data.pendingInvoicesBalance > 0 ? { color: 'var(--st-amber)' } : undefined}>
                                {client360Data.pendingInvoicesBalance > 0
                                  ? `AED ${client360Data.pendingInvoicesBalance.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`
                                  : '—'}
                              </span>
                            </div>
                            {client360Data.overdueInvoicesBalance > 0 && (
                              <div className="flex justify-between text-sm">
                                <span>Overdue</span>
                                <span className="money text-primary">
                                  AED {client360Data.overdueInvoicesBalance.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span>Pending COD</span>
                              <span className={client360Data.pendingCODAmount > 0 ? 'money' : 'text-muted-foreground'} style={client360Data.pendingCODAmount > 0 ? { color: 'var(--st-amber)' } : undefined}>
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
                                  const lastIdx = client360Data.monthlyShipmentTrend.length - 1;
                                  return client360Data.monthlyShipmentTrend.map((m, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: ${m.count}`}>
                                      <div
                                        className="w-full rounded-sm"
                                        style={{
                                          height: `${(m.count / maxVal) * 44}px`,
                                          background: i === lastIdx ? 'var(--primary)' : 'var(--ink)',
                                          opacity: i === lastIdx ? 1 : 0.82,
                                        }}
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
                                      <span className={`${statusBadgeClass(o.status)} !text-[10.5px] !py-0.5 !px-2`}>
                                        {o.status.replace(/_/g, ' ')}
                                      </span>
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
            <Card className="bg-card rounded-2xl border border-border shadow-sm">
              <CardHeader>
                <p className="eyebrow mb-2">Operations</p>
                <CardTitle className="text-xl">All Orders</CardTitle>
                <div className="flex justify-between items-center">
                  <CardDescription>View and manage all shipments</CardDescription>
                  <div className="flex gap-2">
                    <Button onClick={() => setCreateOrderDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Order
                    </Button>
                    <Button variant="outline" onClick={() => { setReturnExchangeOrder(null); setReturnExchangeDialogOpen(true); }}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      New Return/Exchange
                    </Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      if (ordersTotal === 0) {
                        toast.error("No orders to export");
                        return;
                      }

                      // Export ALL orders matching the current filters (every page),
                      // not just the visible one. Fetched on demand.
                      const exportRows: typeof orders = [];
                      let p = 0;
                      // eslint-disable-next-line no-constant-condition
                      while (true) {
                        const res = await utils.portal.admin.getAllOrders.fetch({ ...orderQueryInput, page: p, pageSize: 200 });
                        exportRows.push(...res.rows);
                        if (res.rows.length < 200 || exportRows.length >= res.total) break;
                        p++;
                      }

                      // CSV Header
                      let csvContent = "data:text/csv;charset=utf-8,";
                      csvContent += "Waybill,Client,Consignee,Phone,City,Service,Weight(kg),Pieces,COD Amount,Status,Created At\n";

                      // Rows
                      exportRows.forEach(order => {
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
                <div className="flex flex-wrap items-center gap-2 mb-3" aria-label="Quick order filters">
                  <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em] mr-1">Quick filters</span>
                  <Button variant="outline" size="sm" onClick={() => applyQuickOrderFilter('today')}>Today</Button>
                  <Button variant="outline" size="sm" onClick={() => applyQuickOrderFilter('week')}>This Week</Button>
                  <Button variant="outline" size="sm" onClick={() => applyQuickOrderFilter('pending')}>Pending Pickup</Button>
                  <Button variant="outline" size="sm" onClick={() => applyQuickOrderFilter('out')}>Out for Delivery</Button>
                </div>
                {/* Filters */}
                <div className="bg-secondary p-4 rounded-xl border border-border flex flex-wrap items-center gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em]">Client</span>
                    <select
                      value={orderFilterClientId}
                      onChange={(e) => setOrderFilterClientId(e.target.value)}
                      className="h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground min-w-[160px]"
                    >
                      <option value="all">All Clients</option>
                      {clients?.map((client) => (
                        <option key={client.id} value={client.id.toString()}>
                          {client.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em]">Date range</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={orderFilterDateFrom}
                        onChange={(e) => setOrderFilterDateFrom(e.target.value)}
                        className="w-[140px] h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <input
                        type="date"
                        value={orderFilterDateTo}
                        onChange={(e) => setOrderFilterDateTo(e.target.value)}
                        className="w-[140px] h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                    </div>
                  </div>
                  <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em]">Status</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-[180px] h-9 border border-border rounded-lg bg-background font-medium text-foreground text-sm px-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                          <span className="truncate">
                            {orderFilterStatuses.length === ALL_STATUSES.length
                              ? "All Statuses"
                              : `${orderFilterStatuses.length} Selected`}
                          </span>
                          <Filter className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="start">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="max-h-60 overflow-y-auto">
                          <DropdownMenuCheckboxItem
                            checked={orderFilterStatuses.length === ALL_STATUSES.length}
                            onCheckedChange={(checked) => {
                              setOrderFilterStatuses(checked ? ALL_STATUSES : []);
                            }}
                            onSelect={(e) => e.preventDefault()}
                            className="font-semibold"
                          >
                            Select All
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
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
                              onSelect={(e) => e.preventDefault()}
                              className="capitalize"
                            >
                              {status.replace(/_/g, ' ')}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                  <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em]">Status Date</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={orderFilterDeliveryFrom}
                        onChange={(e) => setOrderFilterDeliveryFrom(e.target.value)}
                        className="w-[140px] h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <input
                        type="date"
                        value={orderFilterDeliveryTo}
                        onChange={(e) => setOrderFilterDeliveryTo(e.target.value)}
                        className="w-[140px] h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.1em]">Sort</span>
                    <select
                      value={orderSortDirection}
                      onChange={(e) => setOrderSortDirection(e.target.value as 'newest' | 'oldest')}
                      className="h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                    </select>
                  </div>
                  {(orderFilterClientId !== 'all' || orderFilterDateFrom || orderFilterDateTo || orderFilterStatuses.length !== ALL_STATUSES.length || orderFilterDeliveryFrom || orderFilterDeliveryTo) && (
                    <>
                      <div className="hidden md:block h-8 w-[1px] bg-border"></div>
                      <button
                        onClick={() => {
                          setOrderFilterClientId('all');
                          setOrderFilterDateFrom('');
                          setOrderFilterDateTo('');
                          setOrderFilterStatuses(ALL_STATUSES);
                          setOrderFilterDeliveryFrom('');
                          setOrderFilterDeliveryTo('');
                        }}
                        className="h-9 px-4 rounded-lg border border-border bg-background hover:bg-muted/50 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear Filters
                      </button>
                    </>
                  )}
                </div>

                {ordersLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading orders...</p>
                ) : orders && orders.length > 0 ? (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table className="min-w-[1320px]">
                        <TableHeader>
                          <TableRow className="[&>th]:px-1">
                            <TableHead>Waybill</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Consignee</TableHead>
                            <TableHead>Destination</TableHead>
                            <TableHead>Weight</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead>COD</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead title="Most recent status update">Updated</TableHead>
                            <TableHead className="min-w-[176px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map((order) => {
                            return (
                              <TableRow key={order.id} className="[&>td]:px-1">
                                <TableCell className="wb font-medium">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {order.waybillNumber}
                                    {order.isReturn === 1 && order.orderType !== 'exchange' && (
                                      <Badge variant="outline" className="b-blue !bg-[var(--st-blue-bg)] !text-[var(--st-blue)] !border-transparent text-xs flex items-center gap-1" title="Return">
                                        <RotateCcw className="h-4 w-4" />
                                      </Badge>
                                    )}
                                    {order.orderType === 'exchange' && (
                                      <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs flex items-center gap-1" title="Exchange">
                                        <ArrowLeftRight className="h-4 w-4" />
                                        {order.exchangeOrderId && (
                                          <span
                                            className="ml-1 underline cursor-pointer opacity-80 hover:opacity-100"
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
                                <TableCell className="font-display font-semibold">
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
                                <TableCell>{abbreviateServiceType(order.serviceType)}</TableCell>
                                <TableCell>
                                  {order.codRequired ? (
                                    <span className="money">
                                      {order.codAmount} {order.codCurrency}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={`${statusBadgeClass(order.status)} capitalize`}>
                                    {order.status.replace(/_/g, ' ')}
                                  </span>
                                </TableCell>
                                <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  {(() => {
                                    const date = order.deliveryDateReal ?? order.lastStatusUpdate;
                                    return date ? new Date(date).toLocaleDateString() : <span className="text-muted-foreground text-sm">-</span>;
                                  })()}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedOrder(order); setViewOrderDialogOpen(true); }} title="View order details" aria-label={`View ${order.waybillNumber}`}>
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setOrderToEdit(order); setEditOrderDialogOpen(true); }} title="Edit order" aria-label={`Edit ${order.waybillNumber}`}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedShipmentId(order.id); setTrackingDialogOpen(true); }} title="Add tracking event" aria-label={`Add tracking event to ${order.waybillNumber}`}>
                                      <Package className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      disabled={deleteOrderMutation.isPending}
                                      onClick={() => handleDeleteOrder(order.id, order.waybillNumber)}
                                      title="Delete order"
                                      aria-label={`Delete ${order.waybillNumber}`}
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

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {orders.map((order) => {
                        return (
                          <div key={order.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
                            {/* Top row: waybill + status */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="wb font-bold text-sm">{order.waybillNumber}</span>
                                {order.isReturn === 1 && order.orderType !== 'exchange' && (
                                  <Badge variant="outline" className="!bg-[var(--st-blue-bg)] !text-[var(--st-blue)] !border-transparent text-xs">
                                    <RotateCcw className="h-3 w-3 mr-1" />Return
                                  </Badge>
                                )}
                                {order.orderType === 'exchange' && (
                                  <Badge variant="outline" className="!bg-[var(--st-amber-bg)] !text-[var(--st-amber)] !border-transparent text-xs">
                                    <ArrowLeftRight className="h-3 w-3 mr-1" />Exchange
                                  </Badge>
                                )}
                              </div>
                              <span className={`${statusBadgeClass(order.status)} capitalize !text-[11px] shrink-0`}>
                                {order.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {/* Client */}
                            <div className="text-xs font-display font-semibold">
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
                              <span className="pill">{abbreviateServiceType(order.serviceType)}</span>
                              <span className="text-xs text-muted-foreground">{order.weight} kg</span>
                              {order.codRequired && (
                                <span className="money text-xs">
                                  COD {order.codAmount} {order.codCurrency}
                                </span>
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

                {/* Pagination */}
                {ordersTotal > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Showing {orderPage * ORDERS_PAGE_SIZE + 1}–{orderPage * ORDERS_PAGE_SIZE + orders.length} of {ordersTotal}
                    </p>
                    <Pagination className="mx-0 w-auto justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (orderPage > 0) setOrderPage(orderPage - 1); }}
                            className={orderPage === 0 ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-3 text-sm text-muted-foreground">Page {orderPage + 1} of {orderPageCount}</span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (orderPage + 1 < orderPageCount) setOrderPage(orderPage + 1); }}
                            className={orderPage + 1 >= orderPageCount ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
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

          {/* Email Studio Tab */}
          <TabsContent value="email" className="space-y-4">
            <EmailStudioPanel initialOrder={emailOrderDraft ? {
              order: emailOrderDraft,
              clientName: clientsMap.get(emailOrderDraft.clientId)?.companyName,
              recipientEmail: clientsMap.get(emailOrderDraft.clientId)?.billingEmail,
            } : undefined} />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <AdminReports />
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-border shadow-sm">
              <CardHeader>
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">Inbound</p>
                    <CardTitle className="text-xl">Pickup Requests</CardTitle>
                    <CardDescription>Track each request from first contact through completion</CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={requestSearch}
                      onChange={(event) => setRequestSearch(event.target.value)}
                      placeholder="Search name, phone, email or address"
                      className="sm:w-72 bg-background"
                    />
                    <Select value={requestStatus} onValueChange={(value: typeof requestStatus) => setRequestStatus(value)}>
                      <SelectTrigger className="sm:w-40 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleExportRequests} className="gap-2">
                      <Download className="h-4 w-4" /> Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedRequestCount > 0 && (
                  <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{selectedRequestCount} request{selectedRequestCount === 1 ? '' : 's'} selected</p>
                      <p className="text-xs text-muted-foreground">Only these exact records will be deleted.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedRequestCount < quoteRequestsTotal && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllMatchingRequests}
                          disabled={selectingAllRequests || bulkDeleteRequestsMutation.isPending}
                        >
                          {selectingAllRequests ? 'Selecting...' : `Select all ${quoteRequestsTotal} matching`}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setSelectedRequestIds(new Set())} disabled={bulkDeleteRequestsMutation.isPending}>
                        Clear selection
                      </Button>
                      <Button variant="destructive" size="sm" className="gap-2" onClick={deleteSelectedRequests} disabled={bulkDeleteRequestsMutation.isPending}>
                        <Trash2 className="h-4 w-4" />
                        {bulkDeleteRequestsMutation.isPending ? 'Deleting...' : `Delete selected (${selectedRequestCount})`}
                      </Button>
                    </div>
                  </div>
                )}
                {requestsLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading requests...</p>
                ) : quoteRequests.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={allRequestsOnPageSelected ? true : selectedRequestsOnPage > 0 ? 'indeterminate' : false}
                                onCheckedChange={(checked) => toggleCurrentRequestPage(checked === true)}
                                aria-label="Select all requests on this page"
                              />
                            </TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead>Pickup</TableHead>
                            <TableHead>Weight</TableHead>
                            <TableHead className="min-w-[150px]">Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quoteRequests.map((req: any) => (
                            <TableRow key={req.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedRequestIds.has(req.id)}
                                  onCheckedChange={(checked) => toggleRequestSelection(req.id, checked === true)}
                                  aria-label={`Select request from ${req.name}`}
                                />
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <p className="font-medium">{req.name}</p>
                                <p className="text-xs text-muted-foreground">{req.phone} · {req.email}</p>
                              </TableCell>
                              <TableCell>{req.serviceType}</TableCell>
                              <TableCell className="max-w-[260px] truncate" title={req.pickupAddress}>{req.pickupAddress}</TableCell>
                              <TableCell>{req.weight}</TableCell>
                              <TableCell>
                                <Select
                                  value={req.status}
                                  onValueChange={(status: 'new' | 'contacted' | 'scheduled' | 'completed') =>
                                    updateRequestStatusMutation.mutate({ requestId: req.id, status })
                                  }
                                >
                                  <SelectTrigger className="h-8 bg-background"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="contacted">Contacted</SelectItem>
                                    <SelectItem value="scheduled">Scheduled</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button variant="ghost" size="sm" onClick={() => openRequestDetails(req)} title="View full request">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this request?')) {
                                      deleteRequestMutation.mutate({ requestId: req.id });
                                    }
                                  }}
                                  title="Delete request"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                      <p className="text-xs text-muted-foreground">
                        Showing {requestPage * INBOX_PAGE_SIZE + 1}–{requestPage * INBOX_PAGE_SIZE + quoteRequests.length} of {quoteRequestsTotal}
                      </p>
                      <Pagination className="mx-0 w-auto justify-end">
                        <PaginationContent>
                          <PaginationItem><PaginationPrevious href="#" onClick={(event) => { event.preventDefault(); setRequestPage((page) => Math.max(0, page - 1)); }} className={requestPage === 0 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>
                          <PaginationItem><span className="px-3 text-xs">Page {requestPage + 1} of {requestPageCount}</span></PaginationItem>
                          <PaginationItem><PaginationNext href="#" onClick={(event) => { event.preventDefault(); setRequestPage((page) => Math.min(requestPageCount - 1, page + 1)); }} className={requestPage >= requestPageCount - 1 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No requests found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-border shadow-sm">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">Inbound</p>
                    <CardTitle className="text-xl">Contact Messages</CardTitle>
                    <CardDescription>Review and archive inquiries from the Contact Us form</CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search messages" className="sm:w-64 bg-background" />
                    <Select value={messageStatus} onValueChange={(value: typeof messageStatus) => setMessageStatus(value)}>
                      <SelectTrigger className="sm:w-36 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {messagesLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading messages...</p>
                ) : contactMessages.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {contactMessages.map((msg: any) => (
                            <TableRow key={msg.id} className={msg.status === 'new' ? 'bg-primary/5' : ''}>
                              <TableCell className="whitespace-nowrap">{new Date(msg.createdAt).toLocaleDateString()}</TableCell>
                              <TableCell className="font-medium">{msg.name}</TableCell>
                              <TableCell>{msg.email}</TableCell>
                              <TableCell className="max-w-[360px] truncate" title={msg.message}>{msg.message}</TableCell>
                              <TableCell><span className={`badge2 ${msg.status === 'new' ? 'b-amber' : msg.status === 'read' ? 'b-blue' : 'b-gray'}`}>{msg.status}</span></TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button variant="ghost" size="sm" onClick={() => openMessageDetails(msg)} title="Read message"><Eye className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => updateMessageStatusMutation.mutate({ messageId: msg.id, status: msg.status === 'archived' ? 'read' : 'archived' })} title={msg.status === 'archived' ? 'Restore' : 'Archive'}>
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={() => { if (confirm('Are you sure you want to delete this message?')) deleteMessageMutation.mutate({ messageId: msg.id }); }} title="Delete message"><Trash2 className="h-4 w-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                      <p className="text-xs text-muted-foreground">Showing {messagePage * INBOX_PAGE_SIZE + 1}–{messagePage * INBOX_PAGE_SIZE + contactMessages.length} of {contactMessagesTotal}</p>
                      <Pagination className="mx-0 w-auto justify-end"><PaginationContent>
                        <PaginationItem><PaginationPrevious href="#" onClick={(event) => { event.preventDefault(); setMessagePage((page) => Math.max(0, page - 1)); }} className={messagePage === 0 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>
                        <PaginationItem><span className="px-3 text-xs">Page {messagePage + 1} of {messagePageCount}</span></PaginationItem>
                        <PaginationItem><PaginationNext href="#" onClick={(event) => { event.preventDefault(); setMessagePage((page) => Math.min(messagePageCount - 1, page + 1)); }} className={messagePage >= messagePageCount - 1 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>
                      </PaginationContent></Pagination>
                    </div>
                  </>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No messages found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Guide Tab */}
          <TabsContent value="guide" className="space-y-4">
            <Card className="bg-card rounded-2xl border border-border shadow-sm">
              <CardHeader>
                <p className="eyebrow mb-2">Reference</p>
                <CardTitle className="text-xl">Waybill Guide</CardTitle>
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
                    <div className="border border-border rounded-lg overflow-hidden relative aspect-[100/150] bg-white shadow-sm p-5 text-slate-950 flex flex-col">
                      <div className="flex items-center justify-between border-b-2 border-slate-950 pb-3">
                        <div className="font-display text-xl font-black tracking-tight">PATH<span className="text-red-600">X</span>PRESS</div>
                        <div className="text-right"><p className="text-[9px] uppercase tracking-widest text-slate-500">Service</p><p className="text-xs font-bold">DOM · NEXT DAY</p></div>
                      </div>
                      <div className="py-4 text-center border-b border-slate-300">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Waybill number</p>
                        <p className="font-mono text-lg font-black tracking-wide">PX202600143-K7X</p>
                        <div className="h-12 mt-2 mx-auto w-[88%]" style={{ background: 'repeating-linear-gradient(90deg,#0f172a 0 2px,transparent 2px 4px,#0f172a 4px 5px,transparent 5px 8px)' }} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 py-4 border-b border-slate-300 text-[10px] leading-snug">
                        <div><p className="uppercase tracking-wider text-slate-500 mb-1">From</p><p className="font-bold text-xs">PATHXPRESS QA</p><p>Dubai, UAE</p><p>+971 50 000 0000</p></div>
                        <div><p className="uppercase tracking-wider text-slate-500 mb-1">Deliver to</p><p className="font-bold text-xs">Sample Customer</p><p>Business Bay, Dubai</p><p>+971 50 123 4567</p></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-4 text-center text-[10px]">
                        <div className="border border-slate-300 rounded p-2"><p className="text-slate-500 uppercase">Pieces</p><p className="font-bold text-sm">1</p></div>
                        <div className="border border-slate-300 rounded p-2"><p className="text-slate-500 uppercase">Weight</p><p className="font-bold text-sm">2.5 kg</p></div>
                        <div className="border-2 border-red-600 rounded p-2"><p className="text-red-600 uppercase font-bold">COD</p><p className="font-bold text-sm">AED 125</p></div>
                      </div>
                      <div className="mt-auto pt-3 border-t-2 border-slate-950 flex items-end justify-between gap-3">
                        <div><p className="text-[9px] uppercase tracking-wider text-slate-500">Special instructions</p><p className="text-[10px] font-medium">Call before delivery</p></div>
                        <div className="grid grid-cols-4 gap-[2px] w-12 h-12 bg-slate-950 p-1" aria-label="Sample QR code">
                          {Array.from({ length: 16 }, (_, index) => <span key={index} className={(index * 7) % 5 < 3 ? 'bg-white' : 'bg-slate-950'} />)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Key Elements</h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-[8px] bg-primary text-white font-display flex items-center justify-center text-xs font-bold shrink-0">1</div>
                        <div>
                          <p className="font-medium text-sm">Waybill Number (Barcode)</p>
                          <p className="text-xs text-muted-foreground">Used for scanning and tracking via App and Sortation.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-[8px] bg-primary text-white font-display flex items-center justify-center text-xs font-bold shrink-0">2</div>
                        <div>
                          <p className="font-medium text-sm">COD Amount</p>
                          <p className="text-xs text-muted-foreground">Clearly visible for drivers to collect payment.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-[8px] bg-primary text-white font-display flex items-center justify-center text-xs font-bold shrink-0">3</div>
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
          <DialogContent className="bg-card border-border !w-[95vw] !max-w-[1200px] p-0 gap-0">
            <div className="w-full h-1.5 bg-primary" />
            <div className="p-8">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-y border-border my-6">

                {/* Column 1: Pricing & Rates */}
                <div className="space-y-6 pr-6 md:border-r border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-normal">Pricing & Rates</h3>
                  </div>

                  <div className="p-3 rounded-xl border border-border bg-secondary space-y-2">
                    <p className="text-xs font-display font-semibold" style={{ color: 'var(--st-blue)' }}>Zone-Based Rates Active</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Shipping rates for this client are configured in the <span className="font-semibold text-foreground">Rates &amp; Pricing</span> tab using Zone 1 / Zone 2 / Zone 3 pricing based on destination emirate.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      If no zone rates are set, volume-based tiers apply automatically.
                    </p>
                  </div>
                </div>

                {/* Column 2: Payment & COD */}
                <div className="space-y-6 px-0 md:px-8 md:border-r border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4" style={{ color: 'var(--st-green)' }} />
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-normal">Payment & COD</h3>
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

                  {/* Card on Delivery (CCOD) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/30 group transition-all hover:bg-background/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="editCardOnDeliveryAllowed" className="text-sm font-medium cursor-pointer">Enable Card on Delivery</Label>
                        <p className="text-[10px] text-muted-foreground">Consignee pays by card on the driver's phone (Tap to Pay)</p>
                      </div>
                      <Checkbox
                        id="editCardOnDeliveryAllowed"
                        checked={editForm.cardOnDeliveryAllowed}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, cardOnDeliveryAllowed: checked as boolean })}
                      />
                    </div>

                    <div className={`space-y-4 transition-all duration-300 ${!editForm.cardOnDeliveryAllowed ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Card Fee (%)</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-7 text-sm bg-background/50"
                              value={editForm.cardFeePercent}
                              onChange={(e) => setEditForm({ ...editForm, cardFeePercent: e.target.value })}
                              placeholder="3.3"
                            />
                            <span className="absolute left-2.5 top-2.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" /></span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground">Min Fee (AED)</Label>
                          <Input
                            className="h-9 text-sm bg-background/50"
                            value={editForm.cardMinFee}
                            onChange={(e) => setEditForm({ ...editForm, cardMinFee: e.target.value })}
                            placeholder="2.00"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Fee Cap (Optional)</Label>
                        <Input
                          className="h-9 text-sm bg-background/50"
                          value={editForm.cardMaxFee}
                          onChange={(e) => setEditForm({ ...editForm, cardMaxFee: e.target.value })}
                          placeholder="e.g. 50.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Settlement Period */}
                  <div className="p-3 rounded-xl border border-border bg-secondary space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-mono text-[11px] uppercase text-muted-foreground tracking-[0.12em]">Settlement Cycle</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Default billing period applied automatically when invoicing this client.</p>
                    <Select
                      value={editForm.defaultSettlementPeriod}
                      onValueChange={(v: 'weekly' | 'biweekly' | 'monthly' | 'custom') => setEditForm({ ...editForm, defaultSettlementPeriod: v })}
                    >
                      <SelectTrigger className="h-9 text-sm bg-background/50 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom (admin chooses dates)</SelectItem>
                        <SelectItem value="weekly">Weekly — every 7 days</SelectItem>
                        <SelectItem value="biweekly">Biweekly — every 14 days</SelectItem>
                        <SelectItem value="monthly">Monthly — previous calendar month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Column 3: Specialized Services */}
                <div className="space-y-6 md:pl-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4" style={{ color: 'var(--st-amber)' }} />
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-normal">Services</h3>
                  </div>

                  <div className="space-y-4">
                    {/* Bullet Service */}
                    <div className="p-4 rounded-xl border border-primary/25 bg-primary/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Rocket className="w-5 h-5 text-primary" />
                          <span className="font-display text-sm font-bold uppercase text-primary tracking-wider">Bullet (4H)</span>
                        </div>
                        <Checkbox
                          id="editBulletAllowed"
                          checked={editForm.bulletAllowed}
                          onCheckedChange={(checked) => setEditForm({ ...editForm, bulletAllowed: checked as boolean })}
                        />
                      </div>
                      <div className={`grid grid-cols-2 gap-4 transition-opacity ${!editForm.bulletAllowed ? 'opacity-30' : 'opacity-100'}`}>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-primary/70">Base (5kg)</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-8 text-sm bg-background/50 border-primary/20 font-mono"
                              value={editForm.customBulletBaseRate}
                              onChange={(e) => setEditForm({ ...editForm, customBulletBaseRate: e.target.value })}
                              placeholder="50.00"
                              disabled={!editForm.bulletAllowed}
                            />
                            <span className="absolute left-2.5 top-2.5 font-mono text-[10px] text-primary/50 font-bold">AED</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-primary/70">Extra KG</Label>
                          <div className="relative">
                            <Input
                              className="h-9 pl-8 text-sm bg-background/50 border-primary/20 font-mono"
                              value={editForm.customBulletPerKg}
                              onChange={(e) => setEditForm({ ...editForm, customBulletPerKg: e.target.value })}
                              placeholder="5.00"
                              disabled={!editForm.bulletAllowed}
                            />
                            <span className="absolute left-2.5 top-2.5 font-mono text-[10px] text-primary/50 font-bold">AED</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fit on Delivery */}
                    <div className="p-4 rounded-xl border border-border bg-secondary flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shirt className="w-5 h-5" style={{ color: 'var(--st-blue)' }} />
                        <div className="space-y-1">
                          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--st-blue)' }}>Fit on Delivery</span>
                          <div className="flex items-center gap-2">
                            <Label className="font-mono text-[10px] text-muted-foreground uppercase">Fee (AED):</Label>
                            <Input
                              className="h-6 w-16 p-1 text-xs bg-background/50 border-border text-center font-mono"
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
                    <div className="p-4 rounded-xl border border-border bg-secondary flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5" style={{ color: 'var(--st-blue)' }} />
                        <div className="space-y-1">
                          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--st-blue)' }}>International</span>
                          <div className="flex items-center gap-2">
                            <Label className="font-mono text-[10px] text-muted-foreground uppercase">Discount (%):</Label>
                            <Input
                              className="h-6 w-16 p-1 text-xs bg-background/50 border-border text-center font-mono"
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

              {editingClient?.id && (
                <div className="space-y-4 pb-8 border-b border-border mb-6">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-normal">Locations</h3>
                  </div>
                  <AdminClientLocationsSection clientId={editingClient.id} />
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditClientDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
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
          <DialogContent className="bg-card border-border !w-[90vw] !max-w-[600px] max-h-[90vh] overflow-y-auto p-0 gap-0">
            <div className="w-full h-1 bg-primary" />
            <div className="p-6">
              <DialogHeader className="mb-6">
                <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <StickyNote className="w-6 h-6 text-primary" />
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
                  className="min-h-[200px] resize-y bg-white/5 border-border"
                />
              </div>
              <DialogFooter className="pt-6 mt-6 border-t border-border">
                <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveNotes}
                  disabled={updateNotesMutation.isPending}
                >
                  {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent className="bg-card border-border !w-[90vw] !max-w-[480px] max-h-[90vh] overflow-y-auto p-0 gap-0">
            <div className="w-full h-1 bg-primary" />
            <div className="p-6">
              <DialogHeader className="mb-6">
                <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Key className="w-6 h-6 text-primary" />
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
                  className="bg-white/5 border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters long.
                </p>
              </div>
              <DialogFooter className="pt-6 mt-6 border-t border-border">
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={updatePasswordMutation.isPending || newPassword.length < 8}
                >
                  {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={requestDetailOpen} onOpenChange={setRequestDetailOpen}>
          <DialogContent className="sm:max-w-2xl bg-card border-border">
            <DialogHeader>
              <DialogTitle>Pickup Request Details</DialogTitle>
              <DialogDescription>Complete information submitted from the public website.</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground mb-1">Customer</p><p className="font-medium">{selectedRequest.name}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Submitted</p><p>{new Date(selectedRequest.createdAt).toLocaleString()}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Phone</p><a className="text-primary hover:underline" href={`tel:${selectedRequest.phone}`}>{selectedRequest.phone}</a></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Email</p><a className="text-primary hover:underline" href={`mailto:${selectedRequest.email}`}>{selectedRequest.email}</a></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Service</p><p>{selectedRequest.serviceType}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Weight / Volume</p><p>{selectedRequest.weight}</p></div>
                </div>
                <div><p className="text-xs text-muted-foreground mb-1">Pickup Address</p><p className="rounded-lg bg-background border border-border p-3 text-sm whitespace-pre-wrap">{selectedRequest.pickupAddress}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Delivery Address</p><p className="rounded-lg bg-background border border-border p-3 text-sm whitespace-pre-wrap">{selectedRequest.deliveryAddress || 'Not provided'}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Additional Comments</p><p className="rounded-lg bg-background border border-border p-3 text-sm whitespace-pre-wrap">{selectedRequest.comments || 'No additional comments'}</p></div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border">
                  <Label htmlFor="request-detail-status">Workflow status</Label>
                  <Select
                    value={selectedRequest.status}
                    onValueChange={(status: 'new' | 'contacted' | 'scheduled' | 'completed') => {
                      setSelectedRequest({ ...selectedRequest, status });
                      updateRequestStatusMutation.mutate({ requestId: selectedRequest.id, status });
                    }}
                  >
                    <SelectTrigger id="request-detail-status" className="sm:w-48 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={messageDetailOpen} onOpenChange={setMessageDetailOpen}>
          <DialogContent className="sm:max-w-xl bg-card border-border">
            <DialogHeader>
              <DialogTitle>Contact Message</DialogTitle>
              <DialogDescription>{selectedMessage ? `Received ${new Date(selectedMessage.createdAt).toLocaleString()}` : ''}</DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground mb-1">From</p><p className="font-medium">{selectedMessage.name}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Email</p><a className="text-primary hover:underline" href={`mailto:${selectedMessage.email}`}>{selectedMessage.email}</a></div>
                </div>
                <div className="rounded-lg bg-background border border-border p-4 whitespace-pre-wrap text-sm leading-relaxed">{selectedMessage.message}</div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => updateMessageStatusMutation.mutate({ messageId: selectedMessage.id, status: 'archived' })}>Archive</Button>
                  <Button asChild><a href={`mailto:${selectedMessage.email}`}>Reply by Email</a></Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Search results</DialogTitle>
              <DialogDescription>{globalSearchResults.length} result(s) for “{globalSearchQuery}”</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {globalSearchResults.map((result) => {
                const Icon = result.type === 'order' ? Package : result.type === 'client' ? Building2 : Truck;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => {
                      setGlobalSearchOpen(false);
                      if (result.type === 'order') {
                        setSelectedOrder(result.entity);
                        setViewOrderDialogOpen(true);
                      } else if (result.type === 'client') {
                        setActiveTab('clients');
                        setClient360Id(result.id);
                      } else {
                        setActiveTab('drivers');
                        toast.info(`Drivers opened for ${result.label}`);
                      }
                    }}
                  >
                    <span className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{result.label}</span>
                      <span className="block text-xs text-muted-foreground truncate">{result.subtitle}</span>
                    </span>
                    <Badge variant="outline" className="capitalize">{result.type}</Badge>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {selectedOrder && (
          <OrderDetailsDialog
            open={viewOrderDialogOpen}
            onOpenChange={setViewOrderDialogOpen}
            order={selectedOrder}
            clients={clients}
            onSendEmail={(order) => {
              setViewOrderDialogOpen(false);
              setEmailOrderDraft(order);
              setActiveTab('email');
            }}
            onCreateReturnExchange={(order) => {
              setViewOrderDialogOpen(false);
              setReturnExchangeOrder(order);
              setReturnExchangeDialogOpen(true);
            }}
            onEdit={(order) => {
              setViewOrderDialogOpen(false);
              setOrderToEdit(order);
              setEditOrderDialogOpen(true);
            }}
            onAddTrackingEvent={(order) => {
              setViewOrderDialogOpen(false);
              setSelectedShipmentId(order.id);
              setTrackingDialogOpen(true);
            }}
            onDeleteOrder={(order) => deleteOrderMutation.mutate({ orderId: order.id })}
          />
        )}

        {/* Admin Create Order Dialog */}
        {/* The dialog decides whether to stay open (create-another) or close, so
            this callback only refreshes the list. */}
        <AdminCreateOrderDialog
          open={createOrderDialogOpen}
          onOpenChange={setCreateOrderDialogOpen}
          clients={activeClients}
          onSuccess={() => {
            refetchOrders();
          }}
        />

        {/* Admin Return/Exchange Dialog */}
        <AdminReturnExchangeDialog
          open={returnExchangeDialogOpen}
          onOpenChange={setReturnExchangeDialogOpen}
          order={returnExchangeOrder}
          clients={clients}
          onSuccess={() => {
            setReturnExchangeDialogOpen(false);
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


