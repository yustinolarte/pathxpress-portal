import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle, Package, MapPin, User, Phone, Truck, Calendar, FileText, Download } from 'lucide-react';
import RemittanceDetailsDialog from './RemittanceDetailsDialog';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export default function CustomerCODPanel() {
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRemittanceId, setSelectedRemittanceId] = useState<number | null>(null);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<string | null>(null);

  // COD shipments filters
  const [codStatusFilter, setCodStatusFilter] = useState('all');
  const [codDateFrom, setCodDateFrom] = useState('');
  const [codDateTo, setCodDateTo] = useState('');

  const { data: codSummary } = trpc.portal.cod.getMyCODSummary.useQuery();

  const { data: codRecords, isLoading: codLoading } = trpc.portal.cod.getMyCODRecords.useQuery();

  const { data: remittances, isLoading: remittancesLoading } = trpc.portal.cod.getMyRemittances.useQuery();

  const { data: shipmentDetails, isLoading: shipmentLoading } = trpc.portal.customer.getShipmentDetails.useQuery(
    { waybillNumber: selectedWaybill || '' },
    { enabled: !!selectedWaybill && shipmentDialogOpen }
  );

  const filteredCodRecords = useMemo(() => {
    if (!codRecords) return [];
    return codRecords.filter(record => {
      if (codStatusFilter !== 'all' && record.status !== codStatusFilter) return false;
      if (codDateFrom) {
        const d = record.collectedDate ? new Date(record.collectedDate) : null;
        if (!d || d < new Date(codDateFrom)) return false;
      }
      if (codDateTo) {
        const d = record.collectedDate ? new Date(record.collectedDate) : null;
        if (!d || d > new Date(codDateTo + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [codRecords, codStatusFilter, codDateFrom, codDateTo]);

  const handleExportRemittancesExcel = () => {
    if (!remittances || remittances.length === 0) {
      toast.error('No remittances to export');
      return;
    }
    const data = remittances.map(r => ({
      'Remittance #': r.remittanceNumber,
      'Shipments': r.shipmentCount,
      'Gross Amount': parseFloat(r.grossAmount).toFixed(2),
      'Commission': parseFloat(r.feeAmount).toFixed(2),
      'Net Amount': parseFloat(r.totalAmount).toFixed(2),
      'Currency': r.currency,
      'Payment Method': r.paymentMethod || 'N/A',
      'Created Date': formatDate(r.createdAt),
      'Completed Date': formatDate(r.processedDate),
      'Status': r.status.toUpperCase(),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Remittances');
    const wscols = Object.keys(data[0] || {}).map(() => ({ wch: 16 }));
    worksheet['!cols'] = wscols;
    XLSX.writeFile(workbook, `COD_Remittances_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Remittances exported to Excel');
  };

  const handleViewShipment = (waybillNumber: string) => {
    setSelectedWaybill(waybillNumber);
    setShipmentDialogOpen(true);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  const formatCurrency = (amount: string, currency: string) => {
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; icon: any; label: string }> = {
      pending_collection: { className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', icon: Clock, label: 'Pending Collection' },
      collected: { className: 'bg-blue-500/20 text-blue-500 border-blue-500/30', icon: TrendingUp, label: 'Collected' },
      remitted: { className: 'bg-green-500/20 text-green-500 border-green-500/30', icon: CheckCircle, label: 'Remitted' },
      disputed: { className: 'bg-red-500/20 text-red-500 border-red-500/30', icon: AlertCircle, label: 'Disputed' },
      cancelled: { className: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: AlertCircle, label: 'Cancelled' },
      pending: { className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', icon: Clock, label: 'Pending' },
      processed: { className: 'bg-blue-500/20 text-blue-500 border-blue-500/30', icon: TrendingUp, label: 'Processed' },
      completed: { className: 'bg-green-500/20 text-green-500 border-green-500/30', icon: CheckCircle, label: 'Completed' },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`flex items-center gap-1 w-fit ${config.className}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-foreground">Cash on Delivery</h2>
          <p className="text-muted-foreground mt-1">Manage your COD shipments and remittances</p>
        </div>
      </div>

      {/* COD Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4 text-muted-foreground">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending</span>
            <span className="material-symbols-outlined shrink-0 text-xl">schedule</span>
          </div>
          <div className="text-3xl font-black text-foreground">AED {codSummary?.pending || '0'}</div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">Awaiting delivery</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-blue-500/20 shadow-sm">
          <div className="flex items-center justify-between mb-4 text-blue-500">
            <span className="text-sm font-semibold uppercase tracking-wider">Collected</span>
            <span className="material-symbols-outlined shrink-0 text-xl">trending_up</span>
          </div>
          <div className="text-3xl font-black text-blue-600 dark:text-blue-400">AED {codSummary?.collected || '0'}</div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">Awaiting remittance</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-green-500/20 shadow-sm">
          <div className="flex items-center justify-between mb-4 text-green-500">
            <span className="text-sm font-semibold uppercase tracking-wider">Remitted</span>
            <span className="material-symbols-outlined shrink-0 text-xl">task_alt</span>
          </div>
          <div className="text-3xl font-black text-green-600 dark:text-green-400">AED {codSummary?.remitted || '0'}</div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">Paid to you</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4 text-muted-foreground">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total COD</span>
            <span className="material-symbols-outlined shrink-0 text-xl">payments</span>
          </div>
          <div className="text-3xl font-black text-foreground">AED {codSummary?.total || '0'}</div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">All time</p>
        </div>
      </div>

      {/* COD Explanation */}
      <div className="bg-primary/5 rounded-xl border border-primary/20 p-6 flex items-start gap-4">
        <span className="material-symbols-outlined text-primary text-3xl shrink-0 mt-1">lightbulb</span>
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-primary">About Cash on Delivery (COD)</h3>
          <div className="text-sm text-foreground/80 space-y-2">
            <p><strong>COD Service:</strong> When you use our COD service, we collect payment from your customers on your behalf when we deliver their orders.</p>
            <p><strong>Collection Process:</strong> Once the payment is collected from the customer, it moves to "Collected" status. We hold these funds securely until remittance.</p>
            <p><strong>Remittance:</strong> We periodically create remittances to transfer the collected COD amounts back to you. You'll receive payment via your preferred method (bank transfer, cheque, etc.).</p>
            <p><strong>Tracking:</strong> You can track all your COD shipments and remittances below. Each remittance includes a detailed breakdown of all included shipments.</p>
          </div>
        </div>
      </div>

      {/* My Remittances */}
      <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/10">
          <div>
            <h3 className="text-lg font-bold text-foreground">My Remittances</h3>
            <p className="text-sm text-muted-foreground">Payments received from PATHXPRESS for collected COD amounts</p>
          </div>
          <Button
            className="bg-background hover:bg-muted text-foreground border border-border h-10 px-4 rounded-xl shadow-sm"
            onClick={handleExportRemittancesExcel}
          >
            <Download className="mr-2 h-4 w-4 text-muted-foreground" /> Export Excel
          </Button>
        </div>

        <div className="p-0">
          {remittancesLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <span className="material-symbols-outlined text-primary animate-spin text-4xl mb-4">refresh</span>
              Loading remittances...
            </div>
          ) : !remittances || remittances.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-muted-foreground opacity-50 text-4xl">receipt_long</span>
              </div>
              <h4 className="text-lg font-bold mb-2">No remittances yet</h4>
              <p className="text-muted-foreground text-sm max-w-sm">COD amounts will be remitted periodically.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold text-muted-foreground">Remittance #</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Shipments</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Gross</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Commission</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Net to You</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Method</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Created</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Completed</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remittances.map((remittance) => (
                  <TableRow
                    key={remittance.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedRemittanceId(remittance.id);
                      setDetailsDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-bold text-primary hover:underline">{remittance.remittanceNumber}</TableCell>
                    <TableCell><span className="font-medium bg-muted py-1 px-2 rounded-md">{remittance.shipmentCount}</span></TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{formatCurrency(remittance.grossAmount, remittance.currency)}</TableCell>
                    <TableCell className="text-sm text-red-500 font-medium">
                      {parseFloat(remittance.feeAmount) > 0
                        ? `- ${formatCurrency(remittance.feeAmount, remittance.currency)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-black text-green-600 dark:text-green-400">{formatCurrency(remittance.totalAmount, remittance.currency)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{remittance.paymentMethod || 'N/A'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{formatDate(remittance.createdAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{formatDate(remittance.processedDate)}</TableCell>
                    <TableCell>{getStatusBadge(remittance.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* My COD Shipments */}
      <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/10">
          <div>
            <h3 className="text-lg font-bold text-foreground">My COD Shipments</h3>
            <p className="text-sm text-muted-foreground">All shipments with cash on delivery service</p>
          </div>
        </div>

        {/* COD Shipments Filters */}
        <div className="px-6 pt-5 pb-2 flex flex-wrap items-end gap-4">
          <div className="w-[180px]">
            <Label className="text-xs font-bold uppercase text-muted-foreground mb-2 block tracking-wider">Status</Label>
            <Select value={codStatusFilter} onValueChange={setCodStatusFilter}>
              <SelectTrigger className="w-full bg-muted/40 border-none rounded-xl h-11 focus:ring-2 focus:ring-primary/20">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending_collection">Pending Collection</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
                <SelectItem value="remitted">Remitted</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[160px]">
            <Label className="text-xs font-bold uppercase text-muted-foreground mb-2 block tracking-wider">Collected From</Label>
            <Input
              type="date"
              value={codDateFrom}
              onChange={e => setCodDateFrom(e.target.value)}
              className="bg-muted/40 border-none rounded-xl h-11 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="w-[160px]">
            <Label className="text-xs font-bold uppercase text-muted-foreground mb-2 block tracking-wider">Collected To</Label>
            <Input
              type="date"
              value={codDateTo}
              onChange={e => setCodDateTo(e.target.value)}
              className="bg-muted/40 border-none rounded-xl h-11 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {(codStatusFilter !== 'all' || codDateFrom || codDateTo) && (
            <Button
              variant="ghost"
              className="h-11 px-3 text-muted-foreground hover:text-foreground"
              onClick={() => { setCodStatusFilter('all'); setCodDateFrom(''); setCodDateTo(''); }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="p-0 pt-2">
          {codLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <span className="material-symbols-outlined text-primary animate-spin text-4xl mb-4">refresh</span>
              Loading COD shipments...
            </div>
          ) : !filteredCodRecords || filteredCodRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-muted-foreground opacity-50 text-4xl">package</span>
              </div>
              <h4 className="text-lg font-bold mb-2">No COD shipments found</h4>
              <p className="text-muted-foreground text-sm max-w-sm">
                No shipments match the current filter.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold text-muted-foreground">Waybill #</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Customer</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Amount</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Collected Date</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Remitted Date</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodRecords.map((record) => (
                  <TableRow key={record.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <button
                        onClick={() => handleViewShipment(record.order.waybillNumber)}
                        className="font-bold font-mono text-primary hover:underline cursor-pointer"
                      >
                        {record.order.waybillNumber}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{record.order.customerName}</TableCell>
                    <TableCell className="font-black text-foreground">{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{formatDate(record.collectedDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-medium">{formatDate(record.remittedToClientDate)}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* Remittance Details Dialog */}
      <RemittanceDetailsDialog
        isOpen={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        remittanceId={selectedRemittanceId}
      />

      {/* Shipment Details Dialog */}
      <Dialog open={shipmentDialogOpen} onOpenChange={setShipmentDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Shipment Details
            </DialogTitle>
            <DialogDescription>
              {selectedWaybill && `Waybill: ${selectedWaybill}`}
            </DialogDescription>
          </DialogHeader>

          {shipmentLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading shipment details...</div>
          ) : shipmentDetails ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-lg font-semibold capitalize">{shipmentDetails.order.status.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Service Type</p>
                  <p className="font-semibold">{shipmentDetails.order.serviceType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weight</p>
                  <p className="font-semibold">{shipmentDetails.order.weight} kg</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-blue-500" />
                    Shipper Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span>{shipmentDetails.order.shipperName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span>{shipmentDetails.order.shipperPhone}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                      <span>{shipmentDetails.order.shipperAddress}, {shipmentDetails.order.shipperCity}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    Receiver Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span>{shipmentDetails.order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span>{shipmentDetails.order.customerPhone}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                      <span>{shipmentDetails.order.address}, {shipmentDetails.order.city}</span>
                    </div>
                  </div>
                </div>
              </div>

              {shipmentDetails.order.codRequired === 1 && (
                <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    Cash on Delivery
                  </h4>
                  <p className="text-2xl font-bold text-green-600">
                    {shipmentDetails.order.codCurrency} {shipmentDetails.order.codAmount}
                  </p>
                </div>
              )}

              {shipmentDetails.trackingEvents && shipmentDetails.trackingEvents.length > 0 && (
                <div className="p-4 rounded-lg border">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Tracking History
                  </h4>
                  <div className="space-y-3">
                    {shipmentDetails.trackingEvents.map((event: any, index: number) => (
                      <div key={event.id} className="flex gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${index === 0 ? 'bg-primary' : 'bg-muted-foreground'}`} />
                        <div>
                          <p className={`font-medium ${index === 0 ? 'text-primary' : ''}`}>{event.statusLabel}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(event.eventDatetime)} • {event.location || 'N/A'}
                          </p>
                          {event.description && (
                            <p className="text-sm text-muted-foreground">{event.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {shipmentDetails.order.specialInstructions && (
                <div className="p-4 rounded-lg border bg-yellow-500/5 border-yellow-500/30">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-yellow-600" />
                    Special Instructions
                  </h4>
                  <p className="text-sm">{shipmentDetails.order.specialInstructions}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Shipment not found</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
