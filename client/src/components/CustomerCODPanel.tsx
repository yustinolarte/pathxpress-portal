import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle, Package, MapPin, User, Phone, Truck, Calendar, FileText } from 'lucide-react';
import RemittanceDetailsDialog from './RemittanceDetailsDialog';

export default function CustomerCODPanel() {
  const { token } = usePortalAuth();
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRemittanceId, setSelectedRemittanceId] = useState<number | null>(null);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [selectedWaybill, setSelectedWaybill] = useState<string | null>(null);

  // Get COD summary
  const { data: codSummary } = trpc.portal.cod.getMyCODSummary.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get my COD records
  const { data: codRecords, isLoading: codLoading } = trpc.portal.cod.getMyCODRecords.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get my remittances
  const { data: remittances, isLoading: remittancesLoading } = trpc.portal.cod.getMyRemittances.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get shipment details by waybill
  const { data: shipmentDetails, isLoading: shipmentLoading } = trpc.portal.customer.getShipmentDetails.useQuery(
    { token: token || '', waybillNumber: selectedWaybill || '' },
    { enabled: !!token && !!selectedWaybill && shipmentDialogOpen }
  );

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
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
      pending_collection: { variant: 'outline', icon: Clock },
      collected: { variant: 'default', icon: TrendingUp },
      remitted: { variant: 'secondary', icon: CheckCircle },
      disputed: { variant: 'destructive', icon: AlertCircle },
      pending: { variant: 'outline', icon: Clock },
      processed: { variant: 'default', icon: TrendingUp },
      completed: { variant: 'secondary', icon: CheckCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* COD Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Collection</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">AED {codSummary?.pending || '0'}</div>
            <p className="text-xs text-muted-foreground">Awaiting delivery</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">AED {codSummary?.collected || '0'}</div>
            <p className="text-xs text-muted-foreground">Awaiting remittance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remitted</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">AED {codSummary?.remitted || '0'}</div>
            <p className="text-xs text-muted-foreground">Paid to you</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total COD</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">AED {codSummary?.total || '0'}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* COD Explanation */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">About Cash on Delivery (COD)</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 dark:text-blue-200 space-y-2">
          <p>
            <strong>COD Service:</strong> When you use our COD service, we collect payment from your customers on your behalf when we deliver their orders.
          </p>
          <p>
            <strong>Collection Process:</strong> Once the payment is collected from the customer, it moves to "Collected" status. We hold these funds securely until remittance.
          </p>
          <p>
            <strong>Remittance:</strong> We periodically create remittances to transfer the collected COD amounts back to you. You'll receive payment via your preferred method (bank transfer, cheque, etc.).
          </p>
          <p>
            <strong>Tracking:</strong> You can track all your COD shipments and remittances below. Each remittance includes a detailed breakdown of all included shipments.
          </p>
        </CardContent>
      </Card>

      {/* My Remittances */}
      <Card>
        <CardHeader>
          <CardTitle>My Remittances</CardTitle>
          <CardDescription>Payments received from PATHXPRESS for collected COD amounts</CardDescription>
        </CardHeader>
        <CardContent>
          {remittancesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading remittances...</div>
          ) : !remittances || remittances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No remittances yet. COD amounts will be remitted periodically.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remittance #</TableHead>
                  <TableHead>Shipments</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Processed Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remittances.map((remittance) => (
                  <TableRow
                    key={remittance.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedRemittanceId(remittance.id);
                      setDetailsDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-medium text-primary hover:underline">{remittance.remittanceNumber}</TableCell>
                    <TableCell>{remittance.shipmentCount}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(remittance.totalAmount, remittance.currency)}</TableCell>
                    <TableCell>{remittance.paymentMethod || 'N/A'}</TableCell>
                    <TableCell>{formatDate(remittance.createdAt)}</TableCell>
                    <TableCell>{formatDate(remittance.processedDate)}</TableCell>
                    <TableCell>{getStatusBadge(remittance.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* My COD Shipments */}
      <Card>
        <CardHeader>
          <CardTitle>My COD Shipments</CardTitle>
          <CardDescription>All shipments with cash on delivery service</CardDescription>
        </CardHeader>
        <CardContent>
          {codLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading COD shipments...</div>
          ) : !codRecords || codRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No COD shipments found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waybill #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Collected Date</TableHead>
                  <TableHead>Remitted Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => handleViewShipment(record.order.waybillNumber)}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        {record.order.waybillNumber}
                      </button>
                    </TableCell>
                    <TableCell>{record.order.customerName}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                    <TableCell>{formatDate(record.collectedDate)}</TableCell>
                    <TableCell>{formatDate(record.remittedToClientDate)}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
              {/* Shipment Status */}
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

              {/* Shipper Info */}
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

                {/* Receiver Info */}
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

              {/* COD Info */}
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

              {/* Tracking Events */}
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

              {/* Special Instructions */}
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
