import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, CheckCircle, Clock, AlertCircle, Eye } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';

export default function CustomerInvoices() {
  const { token } = usePortalAuth();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

      // Prepare invoice data for PDF
      const invoiceData = {
        id: details.invoice.id,
        invoiceNumber: details.invoice.invoiceNumber,
        clientName: 'Customer',
        billingAddress: null,
        billingEmail: null,
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
        adjustmentNotes: details.invoice.adjustmentNotes || null,
        isAdjusted: details.invoice.isAdjusted === 1,
        lastAdjustedAt: details.invoice.lastAdjustedAt ? new Date(details.invoice.lastAdjustedAt) : null,
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

  // Get customer's invoices
  const { data: invoices, isLoading } = trpc.portal.billing.getMyInvoices.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (filterStatus === 'all') return invoices;
    return invoices.filter(inv => inv.status === filterStatus);
  }, [invoices, filterStatus]);

  const handleExportExcel = () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      toast.error('No invoices to export');
      return;
    }

    const data = filteredInvoices.map(inv => ({
      'Invoice #': inv.invoiceNumber,
      'Period Start': new Date(inv.periodFrom).toLocaleDateString(),
      'Period End': new Date(inv.periodTo).toLocaleDateString(),
      'Issue Date': new Date(inv.issueDate).toLocaleDateString(),
      'Due Date': new Date(inv.dueDate).toLocaleDateString(),
      'Amount': parseFloat(inv.total).toFixed(2),
      'Currency': inv.currency,
      'Status': inv.status.toUpperCase(),
      'Adjusted': inv.isAdjusted === 1 ? 'Yes' : 'No'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');

    // Auto-size columns
    const wscols = Object.keys(data[0] || {}).map(() => ({ wch: 15 }));
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Invoices exported to Excel');
  };

  // Get invoice details when selected
  const { data: invoiceDetails } = trpc.portal.billing.getInvoiceDetails.useQuery(
    { token: token || '', invoiceId: selectedInvoiceId || 0 },
    { enabled: !!token && !!selectedInvoiceId }
  );

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-foreground">My Invoices</h2>
          <p className="text-muted-foreground mt-1">View and download your invoices</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-xl p-6 border border-border hover:border-blue-500/50 transition-colors shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground mb-2">Total Invoices</p>
          <div className="text-3xl font-black text-foreground">{invoices?.length || 0}</div>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border hover:border-green-500/50 transition-colors shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground mb-2">Paid</p>
          <div className="text-3xl font-black text-green-600 dark:text-green-400">
            {invoices?.filter(i => i.status === 'paid').length || 0}
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border hover:border-red-500/50 transition-colors shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground mb-2">Outstanding</p>
          <div className="text-3xl font-black text-red-600 dark:text-red-400">
            {formatCurrency(
              invoices
                ?.filter(i => i.status !== 'paid')
                .reduce((sum, i) => sum + parseFloat(i.total), 0)
                .toString() || '0'
            )}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/10">
          <div>
            <h3 className="text-lg font-bold text-foreground">Invoice History</h3>
            <p className="text-sm text-muted-foreground">All your invoices and payment records</p>
          </div>
          <Button className="bg-background hover:bg-muted text-foreground border border-border h-10 px-4 rounded-xl shadow-sm" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4 text-muted-foreground" /> Export Excel
          </Button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-[240px]">
              <Label className="text-xs font-bold uppercase text-muted-foreground mb-2 block tracking-wider">Filter Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full bg-muted/40 border-none rounded-xl h-11 focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!filteredInvoices || filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <FileText className="w-10 h-10 text-muted-foreground opacity-50" />
              </div>
              <h4 className="text-lg font-bold mb-2">No invoices found</h4>
              <p className="text-muted-foreground text-sm max-w-sm">
                You don't have any invoices matching the current filter.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold text-muted-foreground">Invoice #</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Period</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Issue Date</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Due Date</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Amount</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{invoice.invoiceNumber}</span>
                        {invoice.isAdjusted === 1 && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold shadow-sm">
                            Adjusted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(invoice.periodFrom)} - {formatDate(invoice.periodTo)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell className="text-sm font-medium">{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="font-black text-foreground">{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg"
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
        </div>
      </section>

      {/* Invoice Details Dialog */}
      <Dialog open={!!selectedInvoiceId} onOpenChange={() => setSelectedInvoiceId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>

          {invoiceDetails && (
            <div className="space-y-6">
              {/* Invoice Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold">{invoiceDetails.invoice.invoiceNumber}</h3>
                  <p className="text-muted-foreground">
                    Period: {formatDate(invoiceDetails.invoice.periodFrom)} - {formatDate(invoiceDetails.invoice.periodTo)}
                  </p>
                </div>
                {getStatusBadge(invoiceDetails.invoice.status)}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Issue Date</p>
                  <p className="font-medium">{formatDate(invoiceDetails.invoice.issueDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(invoiceDetails.invoice.dueDate)}</p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h4 className="font-semibold mb-2">Line Items</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceDetails.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(item.unitPrice, invoiceDetails.invoice.currency)}</TableCell>
                        <TableCell>{formatCurrency(item.total, invoiceDetails.invoice.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Adjustment Notice */}
              {invoiceDetails.invoice.isAdjusted === 1 && invoiceDetails.invoice.adjustmentNotes && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-orange-900 mb-1">Invoice Adjustment Notice</h4>
                      <p className="text-sm text-orange-800">{invoiceDetails.invoice.adjustmentNotes}</p>
                      {invoiceDetails.invoice.lastAdjustedAt && (
                        <p className="text-xs text-orange-600 mt-2">
                          Adjusted on {formatDate(invoiceDetails.invoice.lastAdjustedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoiceDetails.invoice.subtotal, invoiceDetails.invoice.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span className="font-medium">{formatCurrency(invoiceDetails.invoice.taxes || '0', invoiceDetails.invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(invoiceDetails.invoice.total, invoiceDetails.invoice.currency)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => invoiceDetails && handleDownloadPDF(invoiceDetails.invoice)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
