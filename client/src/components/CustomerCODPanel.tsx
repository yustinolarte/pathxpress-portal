import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function CustomerCODPanel() {
  const { token } = usePortalAuth();

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
                  <TableRow key={remittance.id}>
                    <TableCell className="font-medium">{remittance.remittanceNumber}</TableCell>
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
                    <TableCell className="font-medium">{record.order.waybillNumber}</TableCell>
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
    </div>
  );
}
