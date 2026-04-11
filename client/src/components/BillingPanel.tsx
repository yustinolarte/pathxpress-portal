import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileText, Download, DollarSign, Calendar, CheckCircle, Clock, AlertCircle, Edit, Eye, Loader2, Trash2, Globe, Package } from 'lucide-react';
import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';
import EditInvoiceDialog from '@/components/EditInvoiceDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';

export default function BillingPanel() {
  const utils = trpc.useUtils();

  // ─── Domestic state ───────────────────────────────────────────────────────
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [showPreviewStep, setShowPreviewStep] = useState(false);

  // ─── International state ──────────────────────────────────────────────────
  const [intlSelectedClient, setIntlSelectedClient] = useState<number | null>(null);
  const [intlPeriodStart, setIntlPeriodStart] = useState('');
  const [intlPeriodEnd, setIntlPeriodEnd] = useState('');
  const [intlGenerateDialogOpen, setIntlGenerateDialogOpen] = useState(false);
  const [intlSelectedShipmentIds, setIntlSelectedShipmentIds] = useState<number[]>([]);
  const [intlSelectAll, setIntlSelectAll] = useState(true);
  const [intlShowPreviewStep, setIntlShowPreviewStep] = useState(false);

  // ─── Shared state ─────────────────────────────────────────────────────────
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Filter states (shared by both tabs)
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: allInvoices, isLoading, refetch } = trpc.portal.billing.getAllInvoices.useQuery();
  const { data: clients } = trpc.portal.admin.getClients.useQuery();

  // Domestic billable shipments
  const { data: billableShipments, isLoading: isLoadingBillable } = trpc.portal.billing.getBillableShipments.useQuery(
    { clientId: selectedClient || 0, periodStart, periodEnd },
    { enabled: !!selectedClient && !!periodStart && !!periodEnd && generateDialogOpen }
  );

  // International billable shipments
  const { data: intlBillableShipments, isLoading: isLoadingIntlBillable } = trpc.portal.billing.getBillableIntlShipments.useQuery(
    { clientId: intlSelectedClient || 0, periodStart: intlPeriodStart, periodEnd: intlPeriodEnd },
    { enabled: !!intlSelectedClient && !!intlPeriodStart && !!intlPeriodEnd && intlGenerateDialogOpen }
  );

  // ─── Mutations ────────────────────────────────────────────────────────────

  const generateInvoice = trpc.portal.billing.generateInvoice.useMutation({
    onSuccess: () => {
      toast.success('Invoice generated successfully');
      setGenerateDialogOpen(false);
      setSelectedClient(null);
      setPeriodStart('');
      setPeriodEnd('');
      setShowPreviewStep(false);
      refetch();
    },
    onError: (error) => toast.error(error.message || 'Failed to generate invoice'),
  });

  const generateIntlInvoice = trpc.portal.billing.generateIntlInvoice.useMutation({
    onSuccess: () => {
      toast.success('International invoice generated successfully');
      setIntlGenerateDialogOpen(false);
      setIntlSelectedClient(null);
      setIntlPeriodStart('');
      setIntlPeriodEnd('');
      setIntlShowPreviewStep(false);
      refetch();
    },
    onError: (error) => toast.error(error.message || 'Failed to generate international invoice'),
  });

  const updateStatus = trpc.portal.billing.updateInvoiceStatus.useMutation({
    onSuccess: () => { toast.success('Invoice status updated'); refetch(); },
    onError: (error) => toast.error(error.message || 'Failed to update status'),
  });

  const deleteInvoiceMutation = trpc.portal.billing.deleteInvoice.useMutation({
    onSuccess: () => { toast.success('Invoice deleted successfully'); refetch(); },
    onError: (error) => toast.error(error.message || 'Failed to delete invoice'),
  });

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (billableShipments) {
      setSelectedShipmentIds(billableShipments.map((s: any) => s.id));
      setSelectAll(true);
    } else {
      setSelectedShipmentIds([]);
    }
  }, [billableShipments]);

  useEffect(() => {
    if (intlBillableShipments) {
      setIntlSelectedShipmentIds(intlBillableShipments.map((s: any) => s.id));
      setIntlSelectAll(true);
    } else {
      setIntlSelectedShipmentIds([]);
    }
  }, [intlBillableShipments]);

  // ─── Filtered invoice lists ───────────────────────────────────────────────

  const applyFilters = (list: any[]) => list.filter(invoice => {
    if (filterClientId !== 'all' && invoice.clientId.toString() !== filterClientId) return false;
    if (searchQuery && !invoice.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterDateFrom && new Date(invoice.issueDate) < new Date(filterDateFrom)) return false;
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(invoice.issueDate) > to) return false;
    }
    return true;
  });

  const domInvoices = useMemo(() => {
    if (!allInvoices) return [];
    return applyFilters(allInvoices.filter(i => !i.invoiceNumber?.startsWith('INTLINV-')));
  }, [allInvoices, filterClientId, filterDateFrom, filterDateTo, searchQuery]);

  const intlInvoices = useMemo(() => {
    if (!allInvoices) return [];
    return applyFilters(allInvoices.filter(i => i.invoiceNumber?.startsWith('INTLINV-')));
  }, [allInvoices, filterClientId, filterDateFrom, filterDateTo, searchQuery]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const toggleShipmentSelection = (id: number) => {
    setSelectedShipmentIds(prev => {
      const updated = prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id];
      setSelectAll(billableShipments ? updated.length === billableShipments.length : false);
      return updated;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedShipmentIds(checked && billableShipments ? billableShipments.map((s: any) => s.id) : []);
  };

  const toggleIntlShipmentSelection = (id: number) => {
    setIntlSelectedShipmentIds(prev => {
      const updated = prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id];
      setIntlSelectAll(intlBillableShipments ? updated.length === intlBillableShipments.length : false);
      return updated;
    });
  };

  const handleIntlSelectAll = (checked: boolean) => {
    setIntlSelectAll(checked);
    setIntlSelectedShipmentIds(checked && intlBillableShipments ? intlBillableShipments.map((s: any) => s.id) : []);
  };

  const handleDeleteInvoice = (invoiceId: number, invoiceNumber: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${invoiceNumber}?\n\nThis will allow the shipments to be billed again.`)) return;
    deleteInvoiceMutation.mutate({ invoiceId });
  };

  const handleStatusChange = (invoiceId: number, status: 'pending' | 'paid' | 'overdue') => {
    updateStatus.mutate({ invoiceId, status });
  };

  const handleDownloadPDF = async (invoice: any) => {
    try {
      const response = await fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { invoiceId: invoice.id } })));
      const result = await response.json();
      if (!result.result?.data?.json) { toast.error('Failed to load invoice details'); return; }
      const details = result.result.data.json;
      const client = clients?.find((c: any) => c.id === invoice.clientId);
      generateInvoicePDF({
        id: details.invoice.id,
        invoiceNumber: details.invoice.invoiceNumber,
        clientName: client?.companyName || `Client #${invoice.clientId}`,
        billingAddress: client?.billingAddress || null,
        billingEmail: client?.billingEmail || null,
        issueDate: new Date(details.invoice.issueDate),
        dueDate: new Date(details.invoice.dueDate),
        periodStart: new Date(details.invoice.periodFrom),
        periodEnd: new Date(details.invoice.periodTo),
        subtotal: details.invoice.subtotal,
        tax: details.invoice.taxes || '0',
        total: details.invoice.total,
        amountPaid: details.invoice.amountPaid || '0',
        balance: details.invoice.balance || details.invoice.total,
        status: details.invoice.status,
        currency: details.invoice.currency,
        isAdjusted: details.invoice.isAdjusted || false,
        adjustmentNotes: details.invoice.adjustmentNotes || null,
        adjustedAt: details.invoice.adjustedAt ? new Date(details.invoice.adjustedAt) : null,
        items: details.items.map((item: any) => ({ id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.total })),
      });
      toast.success('Invoice PDF downloaded');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePreviewInvoice = async (invoice: any) => {
    setPreviewLoading(true);
    setPreviewDialogOpen(true);
    try {
      const response = await fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { invoiceId: invoice.id } })));
      const result = await response.json();
      if (!result.result?.data?.json) { toast.error('Failed to load invoice details'); setPreviewDialogOpen(false); return; }
      const details = result.result.data.json;
      const client = clients?.find((c: any) => c.id === invoice.clientId);
      setPreviewInvoice({ ...details.invoice, clientName: client?.companyName || `Client #${invoice.clientId}`, billingAddress: client?.billingAddress || '', billingEmail: client?.billingEmail || '', items: details.items });
    } catch (error) {
      console.error('Error loading invoice:', error);
      toast.error('Failed to load invoice details');
      setPreviewDialogOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExportToExcel = (invoiceList: any[], filename: string) => {
    if (!invoiceList || invoiceList.length === 0) { toast.error('No invoices to export'); return; }
    const headers = ['Invoice Number', 'Client', 'Period From', 'Period To', 'Issue Date', 'Due Date', 'Total Amount', 'Balance Due', 'Currency', 'Status', 'Adjustment Notes'];
    const escape = (str: string | null | undefined) => str ? `"${str.toString().replace(/"/g, '""')}"` : '';
    const rows = invoiceList.map(inv => {
      const clientName = clients?.find(c => c.id === inv.clientId)?.companyName || `Client #${inv.clientId}`;
      return [escape(inv.invoiceNumber), escape(clientName), escape(formatDate(inv.periodFrom)), escape(formatDate(inv.periodTo)), escape(formatDate(inv.issueDate)), escape(formatDate(inv.dueDate)), inv.total, inv.balance || inv.total, inv.currency, inv.status, escape(inv.adjustmentNotes)].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
      case 'pending': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'overdue': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Overdue</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (date: Date | string) => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const formatCurrency = (amount: string, currency: string = 'AED') => `${currency} ${parseFloat(amount).toFixed(2)}`;

  const domPreviewTotal = useMemo(() => {
    if (!billableShipments) return 0;
    return billableShipments.filter((s: any) => selectedShipmentIds.includes(s.id)).reduce((sum: number, s: any) => sum + (s.calculatedRate || 0), 0);
  }, [billableShipments, selectedShipmentIds]);

  const intlPreviewTotal = useMemo(() => {
    if (!intlBillableShipments) return 0;
    return intlBillableShipments.filter((s: any) => intlSelectedShipmentIds.includes(s.id)).reduce((sum: number, s: any) => sum + (s.calculatedRate || 0), 0);
  }, [intlBillableShipments, intlSelectedShipmentIds]);

  // ─── Shared sub-components ────────────────────────────────────────────────

  const InvoiceTable = ({ invoiceList, exportFilename }: { invoiceList: any[]; exportFilename: string }) => (
    <Card className="bg-card rounded-2xl border border-primary/10 shadow-xl shadow-primary/5">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>View and manage client invoices</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleExportToExcel(invoiceList, exportFilename)}>
          <Download className="w-4 h-4 mr-2" />
          Export to Excel
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-sm font-medium mb-2 block">Invoice #</Label>
            <Input placeholder="Search invoice..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-sm font-medium mb-2 block">Filter by Client</Label>
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger><SelectValue placeholder="All Clients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients?.map((client) => <SelectItem key={client.id} value={client.id.toString()}>{client.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-sm font-medium mb-2 block">From Date</Label>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-sm font-medium mb-2 block">To Date</Label>
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
          {(filterClientId !== 'all' || filterDateFrom || filterDateTo || searchQuery) && (
            <div className="flex items-end">
              <Button variant="outline" onClick={() => { setFilterClientId('all'); setFilterDateFrom(''); setFilterDateTo(''); setSearchQuery(''); }}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>

        {!invoiceList || invoiceList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No invoices found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceList.map((invoice) => {
                const isOverdue = invoice.status === 'overdue';
                const balance = parseFloat(invoice.balance || invoice.total || '0');
                return (
                  <TableRow key={invoice.id} className={isOverdue ? 'bg-red-500/5 hover:bg-red-500/10' : ''}>
                    <TableCell className="font-medium cursor-pointer text-blue-500 hover:text-blue-400 hover:underline" onClick={() => handlePreviewInvoice(invoice)}>
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{clients?.find(c => c.id === invoice.clientId)?.companyName || invoice.clientId}</TableCell>
                    <TableCell className="text-sm">{formatDate(invoice.periodFrom)} - {formatDate(invoice.periodTo)}</TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell className={isOverdue ? 'text-red-400 font-medium' : ''}>{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                    <TableCell className={balance > 0 ? 'font-bold text-red-400' : 'text-muted-foreground'}>
                      {balance > 0 ? formatCurrency(invoice.balance || invoice.total, invoice.currency) : '—'}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Select value={invoice.status} onValueChange={(value: 'pending' | 'paid' | 'overdue') => handleStatusChange(invoice.id, value)}>
                          <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedInvoice(invoice); setEditDialogOpen(true); }} title="Edit invoice">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(invoice)} title="Download PDF">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteInvoice(invoice.id, invoice.invoiceNumber)} title={invoice.status === 'pending' ? 'Delete invoice' : 'Only pending invoices can be deleted'} disabled={invoice.status !== 'pending' || deleteInvoiceMutation.isPending} className={invoice.status === 'pending' ? 'text-red-400 hover:text-red-500 hover:bg-red-500/10' : 'opacity-50'}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  const StatsCards = ({ invoiceList }: { invoiceList: any[] }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-card p-5 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
        <div className="flex justify-between items-start mb-3"><div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><FileText className="w-4 h-4" /></div></div>
        <p className="text-muted-foreground text-xs font-medium">Total Invoices</p>
        <h3 className="text-2xl font-bold mt-1">{invoiceList.length}</h3>
      </div>
      <div className="bg-card p-5 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
        <div className="flex justify-between items-start mb-3"><div className="p-2 bg-green-500/10 rounded-lg text-green-500"><CheckCircle className="w-4 h-4" /></div></div>
        <p className="text-muted-foreground text-xs font-medium">Paid</p>
        <h3 className="text-2xl font-bold mt-1 text-green-400">{invoiceList.filter(i => i.status === 'paid').length}</h3>
      </div>
      <div className="bg-card p-5 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
        <div className="flex justify-between items-start mb-3"><div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500"><Clock className="w-4 h-4" /></div></div>
        <p className="text-muted-foreground text-xs font-medium">Pending</p>
        <h3 className="text-2xl font-bold mt-1 text-yellow-400">{invoiceList.filter(i => i.status === 'pending').length}</h3>
      </div>
      <div className="bg-card p-5 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
        <div className="flex justify-between items-start mb-3"><div className="p-2 bg-red-500/10 rounded-lg text-red-500"><AlertCircle className="w-4 h-4" /></div></div>
        <p className="text-muted-foreground text-xs font-medium">Overdue Balance</p>
        <h3 className="text-xl font-bold mt-1 text-red-400">
          AED {invoiceList.filter(i => i.status === 'overdue').reduce((sum, i) => sum + parseFloat(i.balance || i.total || '0'), 0).toFixed(2)}
        </h3>
      </div>
    </div>
  );

  // ─── Generate dialog (reusable for dom/intl) ──────────────────────────────

  const GenerateDialog = ({
    open, onOpenChange, isIntl,
    client, setClient, pStart, setPStart, pEnd, setPEnd,
    shipments, isLoadingShipments,
    selectedIds, onToggle, onSelectAll, selectAllChecked,
    previewTotal, showPreview, setShowPreview,
    onGenerate, isPending,
  }: {
    open: boolean; onOpenChange: (v: boolean) => void; isIntl: boolean;
    client: number | null; setClient: (v: number) => void;
    pStart: string; setPStart: (v: string) => void;
    pEnd: string; setPEnd: (v: string) => void;
    shipments: any[] | undefined; isLoadingShipments: boolean;
    selectedIds: number[]; onToggle: (id: number) => void;
    onSelectAll: (c: boolean) => void; selectAllChecked: boolean;
    previewTotal: number; showPreview: boolean; setShowPreview: (v: boolean) => void;
    onGenerate: () => void; isPending: boolean;
  }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className={isIntl ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}>
          {isIntl ? <Globe className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
          Generate {isIntl ? 'International ' : ''}Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
        <div className={`w-full h-1 bg-gradient-to-r ${isIntl ? 'from-purple-600 to-indigo-600' : 'from-blue-600 to-indigo-600'}`} />
        <div className="p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isIntl ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                {isIntl ? <Globe className={`w-6 h-6 ${isIntl ? 'text-purple-400' : 'text-blue-400'}`} /> : <FileText className="w-6 h-6 text-blue-400" />}
              </div>
              Generate {isIntl ? 'International ' : ''}Invoice
            </DialogTitle>
            <DialogDescription>
              {isIntl
                ? 'Create an invoice for international shipments in a date range'
                : 'Create an invoice for a client based on shipments in a date range'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={client?.toString()} onValueChange={(v) => setClient(parseInt(v))}>
                <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent className="glass-strong">
                  {clients?.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="bg-white/5 border-white/10" />
              </div>
            </div>

            {/* Billable Shipments List */}
            {client && pStart && pEnd && (
              <div className="space-y-2 border border-white/10 rounded-xl p-4 bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <Label>Billable Shipments ({selectedIds.length})</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox id={`select-all-${isIntl ? 'intl' : 'dom'}`} checked={selectAllChecked} onCheckedChange={(c) => onSelectAll(c as boolean)} />
                    <label htmlFor={`select-all-${isIntl ? 'intl' : 'dom'}`} className="text-xs text-muted-foreground cursor-pointer">Select All</label>
                  </div>
                </div>

                {isLoadingShipments ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">Loading shipments...</div>
                ) : !shipments || shipments.length === 0 ? (
                  <div className="text-center py-4 text-sm text-red-400">
                    No {isIntl ? 'international ' : ''}delivered shipments found for this period.
                  </div>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {shipments.map((shipment: any) => (
                      <div key={shipment.id} className="flex items-start space-x-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <Checkbox id={`shipment-${shipment.id}`} checked={selectedIds.includes(shipment.id)} onCheckedChange={() => onToggle(shipment.id)} />
                        <div className="grid gap-1.5 leading-none">
                          <label htmlFor={`shipment-${shipment.id}`} className="text-sm font-medium leading-none cursor-pointer">{shipment.waybillNumber}</label>
                          <p className="text-xs text-muted-foreground">
                            {new Date(shipment.lastStatusUpdate).toLocaleDateString()} - {shipment.weight}kg - {shipment.serviceType}
                            {isIntl && shipment.destinationCountry ? ` - ${shipment.destinationCountry}` : ''}
                          </p>
                        </div>
                        <div className="ml-auto text-xs font-mono font-medium">
                          AED {shipment.calculatedRate !== undefined ? Number(shipment.calculatedRate).toFixed(2) : '---'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preview Step */}
            {showPreview ? (
              <div className="space-y-4 border-t border-white/10 pt-4">
                <h4 className="font-semibold text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-400" />
                  Invoice Preview
                </h4>
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-medium">{clients?.find((c: any) => c.id === client)?.companyName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Period:</span>
                    <span>{pStart} to {pEnd}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipments:</span>
                    <span>{selectedIds.length} items</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>AED {previewTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxes:</span>
                    <span>AED 0.00</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2">
                    <span>Total:</span>
                    <span className="text-primary">AED {previewTotal.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPreview(false)}>Back</Button>
                  <Button onClick={onGenerate} className="flex-1 bg-green-600 hover:bg-green-700" disabled={isPending}>
                    {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</> : 'Confirm & Generate Invoice'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => {
                  if (!client || !pStart || !pEnd) { toast.error('Please select client and period'); return; }
                  if (selectedIds.length === 0) { toast.error('Please select at least one shipment'); return; }
                  setShowPreview(true);
                }}
                className={`w-full ${isIntl ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                disabled={!client || !pStart || !pEnd || selectedIds.length === 0}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Invoice
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) return <div className="text-center py-8">Loading invoices...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Billing & Invoices</h2>
        <p className="text-muted-foreground">Manage client invoices and payments</p>
      </div>

      <Tabs defaultValue="domestic" className="space-y-6">
        <TabsList className="bg-muted/40 border border-border/50">
          <TabsTrigger value="domestic" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Domestic Invoices
            {domInvoices.length > 0 && <span className="ml-1 bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded-full">{domInvoices.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="international" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            International Invoices
            {intlInvoices.length > 0 && <span className="ml-1 bg-purple-500/20 text-purple-400 text-xs px-1.5 py-0.5 rounded-full">{intlInvoices.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Domestic Tab ── */}
        <TabsContent value="domestic" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">UAE domestic shipments invoicing (DOM, SDD, BULLET)</p>
            <GenerateDialog
              open={generateDialogOpen} onOpenChange={setGenerateDialogOpen} isIntl={false}
              client={selectedClient} setClient={setSelectedClient}
              pStart={periodStart} setPStart={setPeriodStart}
              pEnd={periodEnd} setPEnd={setPeriodEnd}
              shipments={billableShipments} isLoadingShipments={isLoadingBillable}
              selectedIds={selectedShipmentIds} onToggle={toggleShipmentSelection}
              onSelectAll={handleSelectAll} selectAllChecked={selectAll}
              previewTotal={domPreviewTotal} showPreview={showPreviewStep} setShowPreview={setShowPreviewStep}
              onGenerate={() => {
                if (!selectedClient || !periodStart || !periodEnd) { toast.error('Please fill all fields'); return; }
                generateInvoice.mutate({ clientId: selectedClient, periodStart, periodEnd, shipmentIds: selectedShipmentIds });
              }}
              isPending={generateInvoice.isPending}
            />
          </div>
          <StatsCards invoiceList={domInvoices} />
          <InvoiceTable invoiceList={domInvoices} exportFilename={`domestic_invoices_${new Date().toISOString().slice(0, 10)}.csv`} />
        </TabsContent>

        {/* ── International Tab ── */}
        <TabsContent value="international" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">International shipments invoicing (PRIME, GCC, PREMIUM) — uses international rate engine</p>
            <GenerateDialog
              open={intlGenerateDialogOpen} onOpenChange={setIntlGenerateDialogOpen} isIntl={true}
              client={intlSelectedClient} setClient={setIntlSelectedClient}
              pStart={intlPeriodStart} setPStart={setIntlPeriodStart}
              pEnd={intlPeriodEnd} setPEnd={setIntlPeriodEnd}
              shipments={intlBillableShipments} isLoadingShipments={isLoadingIntlBillable}
              selectedIds={intlSelectedShipmentIds} onToggle={toggleIntlShipmentSelection}
              onSelectAll={handleIntlSelectAll} selectAllChecked={intlSelectAll}
              previewTotal={intlPreviewTotal} showPreview={intlShowPreviewStep} setShowPreview={setIntlShowPreviewStep}
              onGenerate={() => {
                if (!intlSelectedClient || !intlPeriodStart || !intlPeriodEnd) { toast.error('Please fill all fields'); return; }
                generateIntlInvoice.mutate({ clientId: intlSelectedClient, periodStart: intlPeriodStart, periodEnd: intlPeriodEnd, shipmentIds: intlSelectedShipmentIds });
              }}
              isPending={generateIntlInvoice.isPending}
            />
          </div>
          <StatsCards invoiceList={intlInvoices} />
          <InvoiceTable invoiceList={intlInvoices} exportFilename={`international_invoices_${new Date().toISOString().slice(0, 10)}.csv`} />
        </TabsContent>
      </Tabs>

      {/* Edit Invoice Dialog */}
      {selectedInvoice && (
        <EditInvoiceDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          invoice={selectedInvoice}
          onSuccess={() => { refetch(); setSelectedInvoice(null); }}
        />
      )}

      {/* Invoice Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="glass-strong !w-[90vw] !max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
          <div className="w-full h-1 bg-gradient-to-r from-green-600 to-emerald-600" />
          <div className="p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20"><Eye className="w-6 h-6 text-green-400" /></div>
                Invoice Preview
              </DialogTitle>
              <DialogDescription>{previewInvoice?.invoiceNumber || 'Loading...'}</DialogDescription>
            </DialogHeader>

            {previewLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : previewInvoice ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div>
                    <h3 className="font-bold text-lg">{previewInvoice.clientName}</h3>
                    <p className="text-sm text-muted-foreground">{previewInvoice.billingAddress}</p>
                    <p className="text-sm text-muted-foreground">{previewInvoice.billingEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm"><span className="text-muted-foreground">Invoice #:</span> <strong>{previewInvoice.invoiceNumber}</strong></p>
                    <p className="text-sm"><span className="text-muted-foreground">Issue Date:</span> {formatDate(previewInvoice.issueDate)}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Due Date:</span> {formatDate(previewInvoice.dueDate)}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Period:</span> {formatDate(previewInvoice.periodFrom)} - {formatDate(previewInvoice.periodTo)}</p>
                    <div className="mt-2">{getStatusBadge(previewInvoice.status)}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewInvoice.items?.map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice, previewInvoice.currency)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total, previewInvoice.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(previewInvoice.subtotal, previewInvoice.currency)}</span>
                  </div>
                  {previewInvoice.taxes && parseFloat(previewInvoice.taxes) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Taxes</span>
                      <span>{formatCurrency(previewInvoice.taxes, previewInvoice.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(previewInvoice.total, previewInvoice.currency)}</span>
                  </div>
                  {previewInvoice.amountPaid && parseFloat(previewInvoice.amountPaid) > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount Paid</span>
                        <span className="text-green-500">{formatCurrency(previewInvoice.amountPaid, previewInvoice.currency)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Balance Due</span>
                        <span className="text-orange-500">{formatCurrency(previewInvoice.balance || '0', previewInvoice.currency)}</span>
                      </div>
                    </>
                  )}
                </div>

                {previewInvoice.isAdjusted && previewInvoice.adjustmentNotes && (
                  <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
                    <p className="text-sm font-medium text-yellow-500">Adjustment Notes:</p>
                    <p className="text-sm text-muted-foreground">{previewInvoice.adjustmentNotes}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                  <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Close</Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => { handleDownloadPDF(previewInvoice); setPreviewDialogOpen(false); }}>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No invoice data available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
