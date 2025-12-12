import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LogOut, Users, Package, TrendingUp, FileText, Download, DollarSign, Plus, LayoutDashboard, Calculator, Wallet, MessageSquare, Trash2, Mail, BookOpen } from 'lucide-react';
import { APP_LOGO } from '@/const';
import DashboardLayout, { MenuItem } from '@/components/DashboardLayout';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { toast } from 'sonner';
import BillingPanel from '@/components/BillingPanel';
import CODPanel from '@/components/CODPanel';
import AddTrackingEventDialog from '@/components/AddTrackingEventDialog';
import RatesPanel from '@/components/RatesPanel';
import AdminReports from '@/components/AdminReports';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { token, user, logout } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Client editing state
  const [editClientDialogOpen, setEditClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    tierId: 'auto',
    codAllowed: false,
    codFeePercent: '',
    codMinFee: '',
  });

  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [orderFilterClientId, setOrderFilterClientId] = useState<string>('all');
  const [orderFilterDateFrom, setOrderFilterDateFrom] = useState('');
  const [orderFilterDateTo, setOrderFilterDateTo] = useState('');

  // Create client dialog state
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    companyName: '',
    contactName: '',
    billingEmail: '',
    phone: '',
    billingAddress: '',
    city: '',
    country: 'UAE',
    codAllowed: false,
    country: 'UAE',
    codAllowed: false,
  });

  // Client User Creation State
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [selectedClientForUser, setSelectedClientForUser] = useState<any>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
  });

  const deleteClientMutation = trpc.portal.admin.deleteClient.useMutation({
    onSuccess: () => {
      toast.success('Client deleted successfully');
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to delete client: ${error.message}`);
    },
  });

  const createClientUserMutation = trpc.portal.admin.createCustomerUser.useMutation({
    onSuccess: () => {
      toast.success('User login created successfully');
      setCreateUserDialogOpen(false);
      setNewUser({ email: '', password: '' });
      setSelectedClientForUser(null);
    },
    onError: (error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });

  const handleDeleteClient = (clientId: number) => {
    if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
      deleteClientMutation.mutate({
        token: token || '',
        clientId,
      });
    }
  };

  const handleCreateUser = () => {
    if (!newUser.email || !newUser.password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newUser.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (!selectedClientForUser) return;

    createClientUserMutation.mutate({
      token: token || '',
      clientId: selectedClientForUser.id,
      email: newUser.email,
      password: newUser.password,
    });
  };

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!token || !user || user.role !== 'admin') {
      setLocation('/portal/login');
    }
  }, [token, user, setLocation]);

  // Fetch clients
  const { data: clients, isLoading: clientsLoading, refetch: refetchClients } = trpc.portal.clients.list.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const { data: rateTiers } = trpc.portal.rates.listTiers.useQuery(
    { token: token || '' },
    { enabled: !!token }
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
      // Update Tier
      await updateTierMutation.mutateAsync({
        token: token || '',
        clientId: editingClient.id,
        tierId: editForm.tierId === 'auto' ? null : parseInt(editForm.tierId),
      });

      // Update Settings
      await updateSettingsMutation.mutateAsync({
        token: token || '',
        clientId: editingClient.id,
        codAllowed: editForm.codAllowed,
        codFeePercent: editForm.codFeePercent,
        codMinFee: editForm.codMinFee,
      });
    } catch (error) {
      // handled by onError
    }
  };

  useEffect(() => {
    if (editingClient) {
      setEditForm({
        tierId: editingClient.manualRateTierId ? editingClient.manualRateTierId.toString() : 'auto',
        codAllowed: !!editingClient.codAllowed,
        codFeePercent: editingClient.codFeePercent || '',
        codMinFee: editingClient.codMinFee || '',
      });
    }
  }, [editingClient]);

  const createClientMutation = trpc.portal.admin.createClient.useMutation({
    onSuccess: () => {
      toast.success('Client created successfully');
      setCreateClientDialogOpen(false);
      setNewClient({
        companyName: '',
        contactName: '',
        billingEmail: '',
        phone: '',
        billingAddress: '',
        city: '',
        country: 'UAE',
        codAllowed: false,
      });
      refetchClients();
    },
    onError: (error) => {
      toast.error(`Failed to create client: ${error.message}`);
    },
  });

  // Fetch all orders
  const { data: allOrders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.portal.admin.getAllOrders.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Fetch quote requests
  const { data: quoteRequests, isLoading: requestsLoading, refetch: refetchRequests } = trpc.portal.admin.getQuoteRequests.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

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
  const { data: contactMessages, isLoading: messagesLoading, refetch: refetchMessages } = trpc.portal.admin.getContactMessages.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const deleteMessageMutation = trpc.portal.admin.deleteContactMessage.useMutation({
    onSuccess: () => {
      toast.success('Message deleted successfully');
      refetchMessages();
    },
    onError: (error) => {
      toast.error(`Failed to delete message: ${error.message}`);
    },
  });

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
      return true;
    });
  }, [allOrders, orderFilterClientId, orderFilterDateFrom, orderFilterDateTo]);

  const handleCreateClient = () => {
    if (!newClient.companyName || !newClient.contactName || !newClient.billingEmail) {
      toast.error('Please fill in all required fields');
      return;
    }

    createClientMutation.mutate({
      token: token || '',
      client: newClient,
    });
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    setLocation('/portal/login');
  };

  if (!token || !user) {
    return null;
  }

  const stats = {
    totalClients: clients?.length || 0,
    totalOrders: orders?.length || 0,
    activeOrders: orders?.filter(o => o.status !== 'delivered' && o.status !== 'canceled').length || 0,
  };

  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Overview', value: 'overview' },
    { icon: Users, label: 'Clients', value: 'clients' },
    { icon: Package, label: 'All Orders', value: 'orders' },
    { icon: FileText, label: 'Billing', value: 'billing' },
    { icon: Wallet, label: 'COD Management', value: 'cod' },
    { icon: TrendingUp, label: 'Rates & Pricing', value: 'rates' },
    { icon: FileText, label: 'Reports', value: 'reports' },
    { icon: MessageSquare, label: 'Requests', value: 'requests' },
    { icon: Mail, label: 'Messages', value: 'messages' },
    { icon: BookOpen, label: 'Guide', value: 'guide' },
  ];

  return (
    <DashboardLayout
      menuItems={menuItems}
      activeItem={activeTab}
      onItemClick={setActiveTab}
      user={user}
      logout={handleLogout}
      title="Admin Portal"
    >
      <div className="min-h-full p-4 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-strong border-blue-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Total Clients
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalClients}</div>
                </CardContent>
              </Card>
              <Card className="glass-strong border-green-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Total Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalOrders}</div>
                </CardContent>
              </Card>
              <Card className="glass-strong border-purple-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Active Today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeOrders}</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">
            <Card className="glass-strong border-blue-500/20">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Client Accounts</CardTitle>
                  <CardDescription>Manage all registered client accounts</CardDescription>
                </div>
                <Button onClick={() => setCreateClientDialogOpen(true)}>
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
                          <TableHead>Rate Tier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>COD Allowed</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client) => (
                          <TableRow key={client.id}>
                            <TableCell className="font-medium">{client.companyName}</TableCell>
                            <TableCell>{client.contactName}</TableCell>
                            <TableCell>{client.billingEmail}</TableCell>
                            <TableCell>{client.country}</TableCell>
                            <TableCell>
                              {client.manualRateTierId ? (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                                  Manual Tier
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Auto (Volume)</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                                {client.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{client.codAllowed ? 'Yes' : 'No'}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
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
                                    setSelectedClientForUser(client);
                                    setNewUser({ ...newUser, email: client.billingEmail }); // Pre-fill email
                                    setCreateUserDialogOpen(true);
                                  }}
                                  title="Create Login User"
                                >
                                  <Users className="h-4 w-4" />
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No clients found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <Card className="glass-strong border-blue-500/20">
              <CardHeader>
                <CardTitle>All Orders</CardTitle>
                <CardDescription>View and manage all shipments</CardDescription>
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
                  {(orderFilterClientId !== 'all' || orderFilterDateFrom || orderFilterDateTo) && (
                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setOrderFilterClientId('all');
                          setOrderFilterDateFrom('');
                          setOrderFilterDateTo('');
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Waybill</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>COD</TableHead>
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
                              {order.codRequired ? (
                                <Badge variant="default" className="bg-orange-500">
                                  {order.codAmount} {order.codCurrency}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.status.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => generateWaybillPDF(order)}
                                  title="Download Waybill"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedShipmentId(order.id);
                                    setTrackingDialogOpen(true);
                                  }}
                                  title="Add Tracking Event"
                                >
                                  <Package className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No orders found</p>
                )}
              </CardContent>
            </Card>
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
            <AdminReports token={token} />
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <Card className="glass-strong border-blue-500/20">
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
                                      token: token || '',
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
            <Card className="glass-strong border-blue-500/20">
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
                                      token: token || '',
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
            <Card className="glass-strong border-blue-500/20">
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
        </Tabs>

        {/* Edit Client Settings Dialog */}
        <Dialog open={editClientDialogOpen} onOpenChange={setEditClientDialogOpen}>
          <DialogContent className="glass-strong">
            <DialogHeader>
              <DialogTitle>Client Settings: {editingClient?.companyName}</DialogTitle>
              <DialogDescription>
                Configure rate tiers and COD preferences.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">

              {/* Rate Tier Section */}
              <div className="space-y-2">
                <Label>Rate Tier</Label>
                <Select
                  value={editForm.tierId}
                  onValueChange={(val) => setEditForm({ ...editForm, tierId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier or use automatic" />
                  </SelectTrigger>
                  <SelectContent className="glass-strong">
                    <SelectItem value="auto">Automatic (Volume-based)</SelectItem>
                    {rateTiers?.filter((t: any) => t.serviceType === 'DOM').map((tier: any) => (
                      <SelectItem key={tier.id} value={tier.id.toString()}>
                        Tier {tier.minVolume}-{tier.maxVolume || '∞'}: {tier.baseRate} AED (0-{tier.maxWeight}kg)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Overrides the automatic volume-based tier assignment.
                </p>
              </div>

              <div className="h-px bg-border/50" />

              {/* COD Settings Section */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="editCodAllowed"
                    checked={editForm.codAllowed}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, codAllowed: checked as boolean })}
                  />
                  <Label htmlFor="editCodAllowed">Allow COD (Cash on Delivery)</Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="editCodPercent">COD Fee Percentage (%)</Label>
                    <Input
                      id="editCodPercent"
                      value={editForm.codFeePercent}
                      onChange={(e) => setEditForm({ ...editForm, codFeePercent: e.target.value })}
                      placeholder="Default: 3.3"
                      disabled={!editForm.codAllowed}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editCodMin">Min COD Fee (AED)</Label>
                    <Input
                      id="editCodMin"
                      value={editForm.codMinFee}
                      onChange={(e) => setEditForm({ ...editForm, codMinFee: e.target.value })}
                      placeholder="Default: 2.0"
                      disabled={!editForm.codAllowed}
                    />
                  </div>
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditClientDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveClientSettings}
                disabled={updateSettingsMutation.isPending || updateTierMutation.isPending}
              >
                {(updateSettingsMutation.isPending || updateTierMutation.isPending) ? 'Saving...' : 'Save Settings'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Client Dialog */}
        <Dialog open={createClientDialogOpen} onOpenChange={setCreateClientDialogOpen}>
          <DialogContent className="glass-strong max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>
                Create a new client account for the portal
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={newClient.companyName}
                  onChange={(e) => setNewClient({ ...newClient, companyName: e.target.value })}
                  placeholder="Enter company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Name *</Label>
                <Input
                  id="contactName"
                  value={newClient.contactName}
                  onChange={(e) => setNewClient({ ...newClient, contactName: e.target.value })}
                  placeholder="Enter contact name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing Email *</Label>
                <Input
                  id="billingEmail"
                  type="email"
                  value={newClient.billingEmail}
                  onChange={(e) => setNewClient({ ...newClient, billingEmail: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="+971 XX XXX XXXX"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="billingAddress">Billing Address</Label>
                <Input
                  id="billingAddress"
                  value={newClient.billingAddress}
                  onChange={(e) => setNewClient({ ...newClient, billingAddress: e.target.value })}
                  placeholder="Enter billing address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={newClient.city}
                  onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                  placeholder="Enter city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select
                  value={newClient.country}
                  onValueChange={(value) => setNewClient({ ...newClient, country: value })}
                >
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAE">United Arab Emirates</SelectItem>
                    <SelectItem value="Saudi Arabia">Saudi Arabia</SelectItem>
                    <SelectItem value="Qatar">Qatar</SelectItem>
                    <SelectItem value="Kuwait">Kuwait</SelectItem>
                    <SelectItem value="Bahrain">Bahrain</SelectItem>
                    <SelectItem value="Oman">Oman</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 col-span-2">
                <Checkbox
                  id="codAllowed"
                  checked={newClient.codAllowed}
                  onCheckedChange={(checked) => setNewClient({ ...newClient, codAllowed: checked as boolean })}
                />
                <Label htmlFor="codAllowed" className="cursor-pointer">
                  Allow COD (Cash on Delivery)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateClientDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateClient}
                disabled={createClientMutation.isPending}
              >
                {createClientMutation.isPending ? 'Creating...' : 'Create Client'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Tracking Event Dialog */}
        {selectedShipmentId && (
          <AddTrackingEventDialog
            open={trackingDialogOpen}
            onOpenChange={setTrackingDialogOpen}
            shipmentId={selectedShipmentId}
            token={token || ''}
            onSuccess={() => {
              // Refresh orders list
              refetchOrders();
            }}
          />
        )}

        {/* Create User Dialog */}
        <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
          <DialogContent className="glass-strong">
            <DialogHeader>
              <DialogTitle>Create User Login</DialogTitle>
              <DialogDescription>
                Create a login for {selectedClientForUser?.companyName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="userEmail">Email Address</Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userPassword">Password</Label>
                <Input
                  id="userPassword"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={createClientUserMutation.isPending}
              >
                {createClientUserMutation.isPending ? 'Creating...' : 'Create Login'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout >
  );
}
