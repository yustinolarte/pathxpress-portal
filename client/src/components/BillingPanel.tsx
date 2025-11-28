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
import { FileText, Download, DollarSign, Calendar, CheckCircle, Clock, AlertCircle, Edit } from 'lucide-react';
import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';
import EditInvoiceDialog from '@/components/EditInvoiceDialog';

export default function BillingPanel() {
  const { token } = usePortalAuth();
  const utils = trpc.useUtils();
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  
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
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate invoice');
    },
  });

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

  const handleGenerateInvoice = () => {
    if (!token || !selectedClient || !periodStart || !periodEnd) {
      toast.error('Please fill all fields');
      return;
    }

    generateInvoice.mutate({
      token,
      clientId: selectedClient,
      periodStart,
      periodEnd,
    });
  };

  const handleStatusChange = (invoiceId: number, status: 'pending' | 'paid' | 'overdue') => {
    if (!token) return;
    updateStatus.mutate({ token, invoiceId, status });
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

              <Button 
                onClick={handleGenerateInvoice} 
                className="w-full"
                disabled={generateInvoice.isPending}
              >
                {generateInvoice.isPending ? 'Generating...' : 'Generate Invoice'}
              </Button>
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
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
          <CardDescription>View and manage all client invoices</CardDescription>
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
                  <TableHead>Client ID</TableHead>
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
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.clientId}</TableCell>
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
      {selectedInvoice && (
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
      )}
    </div>
  );
}
