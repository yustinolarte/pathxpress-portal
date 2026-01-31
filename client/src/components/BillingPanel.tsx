import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileText, Download, DollarSign, Calendar, CheckCircle, Clock, AlertCircle, Edit, Eye, Loader2, Trash2 } from 'lucide-react';
import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';
import EditInvoiceDialog from '@/components/EditInvoiceDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';

export default function BillingPanel() {
  const { token } = usePortalAuth();
  const utils = trpc.useUtils();
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [showPreviewStep, setShowPreviewStep] = useState(false);

  // Filter states
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Get all invoices
  const { data: allInvoices, isLoading, refetch } = trpc.portal.billing.getAllInvoices.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Filter invoices based on selected filters
  const invoices = useMemo(() => {
    if (!allInvoices) return [];

    return allInvoices.filter(invoice => {
      // Filter by client
      if (filterClientId !== 'all' && invoice.clientId.toString() !== filterClientId) {
        return false;
      }

      // Filter by date range
      if (filterDateFrom) {
        const invoiceDate = new Date(invoice.issueDate);
        const fromDate = new Date(filterDateFrom);
        if (invoiceDate < fromDate) return false;
      }

      if (filterDateTo) {
        const invoiceDate = new Date(invoice.issueDate);
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999); // Include the entire day
        if (invoiceDate > toDate) return false;
      }

      return true;
    });
  }, [allInvoices, filterClientId, filterDateFrom, filterDateTo]);

  // Get all clients for the dropdown
  const { data: clients } = trpc.portal.admin.getClients.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Generate invoice mutation
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
    onError: (error) => {
      toast.error(error.message || 'Failed to generate invoice');
    },
  });

  // Get billable shipments
  const { data: billableShipments, isLoading: isLoadingBillable } = trpc.portal.billing.getBillableShipments.useQuery(
    {
      token: token || '',
      clientId: selectedClient || 0,
      periodStart,
      periodEnd
    },
    { enabled: !!token && !!selectedClient && !!periodStart && !!periodEnd && generateDialogOpen }
  );

  useEffect(() => {
    if (billableShipments) {
      setSelectedShipmentIds(billableShipments.map((s: any) => s.id));
      setSelectAll(true);
    } else {
      setSelectedShipmentIds([]);
    }
  }, [billableShipments]);

  const toggleShipmentSelection = (id: number) => {
    setSelectedShipmentIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked && billableShipments) {
      setSelectedShipmentIds(billableShipments.map((s: any) => s.id));
    } else {
      setSelectedShipmentIds([]);
    }
  };

  // Update invoice status mutation
  const updateStatus = trpc.portal.billing.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      toast.success('Invoice status updated');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Delete invoice mutation (only pending)
  const deleteInvoiceMutation = trpc.portal.billing.deleteInvoice.useMutation({
    onSuccess: () => {
      toast.success('Invoice deleted successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete invoice');
    },
  });

  const handleDeleteInvoice = (invoiceId: number, invoiceNumber: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete invoice ${invoiceNumber}?\n\nThis will allow the shipments to be billed again.`)) {
      return;
    }
    deleteInvoiceMutation.mutate({ token, invoiceId });
  };

  // Download invoice PDF handler
  const handleDownloadPDF = async (invoice: any) => {
    try {
      if (!token) return;

      // Fetch invoice details
      const response = await fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { token, invoiceId: invoice.id } })));
      const result = await response.json();

      if (!result.result?.data?.json) {
        toast.error('Failed to load invoice details');
        return;
      }

      const details = result.result.data.json;

      // Get client info
      const client = clients?.find((c: any) => c.id === invoice.clientId);

      // Prepare invoice data for PDF
      const invoiceData = {
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
        items: details.items.map((item: any) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.total,
        })),
      };

      generateInvoicePDF(invoiceData);
      toast.success('Invoice PDF downloaded');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  // Calculate preview totals
  const previewTotal = useMemo(() => {
    if (!billableShipments) return 0;
    return billableShipments
      .filter((s: any) => selectedShipmentIds.includes(s.id))
      .reduce((sum: number, s: any) => sum + (s.calculatedRate || 0), 0);
  }, [billableShipments, selectedShipmentIds]);

  const handleShowPreview = () => {
    if (!selectedClient || !periodStart || !periodEnd) {
      toast.error('Please select client and period');
      return;
    }
    if (selectedShipmentIds.length === 0) {
      toast.error('Please select at least one shipment');
      return;
    }
    setShowPreviewStep(true);
  };

  const handleConfirmGenerate = () => {
    if (!token || !selectedClient || !periodStart || !periodEnd) {
      toast.error('Please fill all fields');
      return;
    }

    generateInvoice.mutate({
      token,
      clientId: selectedClient,
      periodStart,
      periodEnd,
      shipmentIds: selectedShipmentIds
    });
  };

  const handleBackToSelection = () => {
    setShowPreviewStep(false);
  };

  const handleStatusChange = (invoiceId: number, status: 'pending' | 'paid' | 'overdue') => {
    if (!token) return;
    updateStatus.mutate({ token, invoiceId, status });
  };

  const handlePreviewInvoice = async (invoice: any) => {
    setPreviewLoading(true);
    setPreviewDialogOpen(true);
    try {
      const response = await fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { token, invoiceId: invoice.id } })));
      const result = await response.json();

      if (!result.result?.data?.json) {
        toast.error('Failed to load invoice details');
        setPreviewDialogOpen(false);
        return;
      }

      const details = result.result.data.json;
      const client = clients?.find((c: any) => c.id === invoice.clientId);

      setPreviewInvoice({
        ...details.invoice,
        clientName: client?.companyName || `Client #${invoice.clientId}`,
        billingAddress: client?.billingAddress || '',
        billingEmail: client?.billingEmail || '',
        items: details.items,
      });
    } catch (error) {
      console.error('Error loading invoice:', error);
      toast.error('Failed to load invoice details');
      setPreviewDialogOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Overdue</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount: string, currency: string = 'AED') => {
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  const handleExportToExcel = () => {
    if (!invoices || invoices.length === 0) {
      toast.error('No invoices to export');
      return;
    }

    // CSV Header
    const headers = [
      'Invoice Number',
      'Client',
      'Period From',
      'Period To',
      'Issue Date',
      'Due Date',
      'Total Amount',
      'Currency',
      'Status',
      'Adjustment Notes'
    ];

    // CSV Rows
    const rows = invoices.map(inv => {
      const clientName = clients?.find(c => c.id === inv.clientId)?.companyName || `Client #${inv.clientId}`;

      // Escape fields that might contain commas
      const escape = (str: string | null | undefined) => {
        if (!str) return '';
        return `"${str.toString().replace(/"/g, '""')}"`;
      };

      return [
        escape(inv.invoiceNumber),
        escape(clientName),
        escape(formatDate(inv.periodFrom)),
        escape(formatDate(inv.periodTo)),
        escape(formatDate(inv.issueDate)),
        escape(formatDate(inv.dueDate)),
        inv.total,
        inv.currency,
        inv.status,
        escape(inv.adjustmentNotes)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `invoices_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading invoices...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Billing & Invoices</h2>
          <p className="text-muted-foreground">Manage client invoices and payments</p>
        </div>

        <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <FileText className="w-4 h-4 mr-2" />
              Generate Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New Invoice</DialogTitle>
              <DialogDescription>
                Create an invoice for a client based on shipments in a date range
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={selectedClient?.toString()} onValueChange={(v) => setSelectedClient(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client: any) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Period Start</Label>
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Period End</Label>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>


              {/* Billable Shipments List */}
              {selectedClient && periodStart && periodEnd && (
                <div className="space-y-2 border rounded-md p-3 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Billable Shipments ({selectedShipmentIds.length})</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="select-all"
                        checked={selectAll}
                        onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      />
                      <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                        Select All
                      </label>
                    </div>
                  </div>

                  {isLoadingBillable ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">Loading shipments...</div>
                  ) : !billableShipments || billableShipments.length === 0 ? (
                    <div className="text-center py-4 text-sm text-red-400">
                      No delivered shipments found for this period.
                    </div>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto space-y-2">
                      {billableShipments.map((shipment: any) => (
                        <div key={shipment.id} className="flex items-start space-x-2 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            id={`shipment-${shipment.id}`}
                            checked={selectedShipmentIds.includes(shipment.id)}
                            onCheckedChange={() => toggleShipmentSelection(shipment.id)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={`shipment-${shipment.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {shipment.waybillNumber}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {new Date(shipment.createdAt).toLocaleDateString()} - {shipment.weight}kg - {shipment.serviceType}
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
              {showPreviewStep ? (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Invoice Preview
                  </h4>

                  <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Client:</span>
                      <span className="font-medium">{clients?.find(c => c.id === selectedClient)?.companyName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Period:</span>
                      <span>{periodStart} to {periodEnd}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipments:</span>
                      <span>{selectedShipmentIds.length} items</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>AED {previewTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Taxes:</span>
                      <span>AED 0.00</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span className="text-primary">AED {previewTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleBackToSelection}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleConfirmGenerate}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={generateInvoice.isPending}
                    >
                      {generateInvoice.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
                      ) : (
                        'Confirm & Generate Invoice'
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleShowPreview}
                  className="w-full"
                  disabled={!selectedClient || !periodStart || !periodEnd || selectedShipmentIds.length === 0}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Invoice
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoices?.length || 0}</div>
          </CardContent>
        </Card>

        <Card className="glass-strong border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {invoices?.filter(i => i.status === 'paid').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-strong border-yellow-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {invoices?.filter(i => i.status === 'pending').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>All Invoices</CardTitle>
            <CardDescription>View and manage all client invoices</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="filterClient" className="text-sm font-medium mb-2 block">
                Filter by Client
              </Label>
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger id="filterClient">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="filterDateFrom" className="text-sm font-medium mb-2 block">
                From Date
              </Label>
              <Input
                id="filterDateFrom"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="filterDateTo" className="text-sm font-medium mb-2 block">
                To Date
              </Label>
              <Input
                id="filterDateTo"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>

            {(filterClientId !== 'all' || filterDateFrom || filterDateTo) && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilterClientId('all');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>

          {!invoices || invoices.length === 0 ? (
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
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell
                      className="font-medium cursor-pointer text-blue-500 hover:text-blue-400 hover:underline"
                      onClick={() => handlePreviewInvoice(invoice)}
                    >
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      {clients?.find(c => c.id === invoice.clientId)?.companyName || invoice.clientId}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(invoice.periodFrom)} - {formatDate(invoice.periodTo)}
                    </TableCell>
                    <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Select
                          value={invoice.status}
                          onValueChange={(value: 'pending' | 'paid' | 'overdue') => handleStatusChange(invoice.id, value)}
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setEditDialogOpen(true);
                          }}
                          title="Edit invoice"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(invoice)}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteInvoice(invoice.id, invoice.invoiceNumber)}
                          title={invoice.status === 'pending' ? 'Delete invoice' : 'Only pending invoices can be deleted'}
                          disabled={invoice.status !== 'pending' || deleteInvoiceMutation.isPending}
                          className={invoice.status === 'pending' ? 'text-red-400 hover:text-red-500 hover:bg-red-500/10' : 'opacity-50'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Invoice Dialog */}
      {
        selectedInvoice && (
          <EditInvoiceDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            invoice={selectedInvoice}
            token={token || ''}
            onSuccess={() => {
              refetch();
              setSelectedInvoice(null);
            }}
          />
        )
      }

      {/* Invoice Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Invoice Preview
            </DialogTitle>
            <DialogDescription>
              {previewInvoice?.invoiceNumber || 'Loading...'}
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : previewInvoice ? (
            <div className="space-y-6">
              {/* Invoice Header */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
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

              {/* Invoice Items */}
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

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
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

              {/* Adjustment Notes */}
              {previewInvoice.isAdjusted && previewInvoice.adjustmentNotes && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                  <p className="text-sm font-medium text-yellow-500">Adjustment Notes:</p>
                  <p className="text-sm text-muted-foreground">{previewInvoice.adjustmentNotes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  handleDownloadPDF(previewInvoice);
                  setPreviewDialogOpen(false);
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No invoice data available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}
