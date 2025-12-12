import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  FileText,
  Plus,
  Wallet,
  BadgeCheck,
  Calendar,
  Download,
  Filter
} from 'lucide-react';

import RemittanceDetailsDialog from './RemittanceDetailsDialog';

export default function CODPanel() {
  const { token } = usePortalAuth();
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRemittanceId, setSelectedRemittanceId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [selectedCODRecords, setSelectedCODRecords] = useState<number[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>('all');

  // Get COD summary
  const { data: codSummary } = trpc.portal.cod.getCODSummary.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get all COD records
  const { data: allCODRecords, isLoading: codLoading, refetch: refetchCOD } = trpc.portal.cod.getAllCODRecords.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Filter COD records by client
  const codRecords = allCODRecords?.filter(record =>
    filterClientId === 'all' || record.order.clientId.toString() === filterClientId
  );

  // Get all remittances
  const { data: remittances, isLoading: remittancesLoading, refetch: refetchRemittances } = trpc.portal.cod.getAllRemittances.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get clients for dropdown
  const { data: clients } = trpc.portal.admin.getClients.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Get pending COD for selected client
  const { data: pendingCOD, refetch: refetchPending } = trpc.portal.cod.getPendingCODByClient.useQuery(
    { token: token || '', clientId: selectedClient || 0 },
    { enabled: !!token && !!selectedClient }
  );

  // Filter to ensure only collected COD are shown
  const filteredPendingCOD = pendingCOD?.filter(record => record.status === 'collected');



  // Calculate today's collected amount
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalCollectedToday = allCODRecords
    ?.filter(record => {
      if (!record.collectedDate) return false;
      const collectedDate = new Date(record.collectedDate);
      collectedDate.setHours(0, 0, 0, 0);
      return collectedDate.getTime() === today.getTime() && record.status === 'collected';
    })
    .reduce((sum, record) => sum + parseFloat(record.codAmount), 0) || 0;

  // Calculate pending settlement (collected but not remitted)
  const totalPendingSettlement = allCODRecords
    ?.filter(record => record.status === 'collected')
    .reduce((sum, record) => sum + parseFloat(record.codAmount), 0) || 0;

  // Calculate next payout date (example: every Friday)
  const getNextPayoutDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    return nextFriday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Download Pending Settlement PDF (only collected, not yet remitted)
  const handleDownloadSettlementPDF = async () => {
    try {
      const { generateCODReportPDF, downloadPDF } = await import('@/lib/reportUtils');

      const settlementRecords = allCODRecords?.filter(record => record.status === 'collected') || [];

      if (settlementRecords.length === 0) {
        toast.error('No pending settlements to export');
        return;
      }

      // Map nested properties for the report generator
      const reportData = settlementRecords.map(record => ({
        ...record,
        waybillNumber: record.order?.waybillNumber || '',
        customerName: record.order?.customerName || '',
        city: record.order?.city || ''
      }));

      const doc = generateCODReportPDF(reportData, 'Pending Settlement');
      downloadPDF(doc, `Pending_Settlement_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Pending Settlement PDF downloaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate PDF');
    }
  };

  // Download All COD Records PDF (including remitted)
  const handleDownloadAllCODPDF = async () => {
    try {
      const { generateCODReportPDF, downloadPDF } = await import('@/lib/reportUtils');

      // Include both collected and remitted records
      const allRecords = allCODRecords?.filter(record =>
        record.status === 'collected' || record.status === 'remitted'
      ) || [];

      if (allRecords.length === 0) {
        toast.error('No COD records to export');
        return;
      }

      // Map nested properties for the report generator
      const reportData = allRecords.map(record => ({
        ...record,
        waybillNumber: record.order?.waybillNumber || '',
        customerName: record.order?.customerName || '',
        city: record.order?.city || ''
      }));

      const doc = generateCODReportPDF(reportData, 'All COD Records (Collected + Remitted)');
      downloadPDF(doc, `All_COD_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('All COD PDF downloaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate PDF');
    }
  };

  // Create remittance mutation
  const createRemittanceMutation = trpc.portal.cod.createRemittance.useMutation({
    onSuccess: (data) => {
      toast.success(`Remittance ${data.remittanceNumber} created successfully`);
      setCreateDialogOpen(false);
      setSelectedClient(null);
      setSelectedCODRecords([]);
      setPaymentMethod('');
      setPaymentReference('');
      setNotes('');
      refetchCOD();
      refetchRemittances();
      refetchPending();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create remittance');
    },
  });

  // Update remittance status mutation
  const updateStatusMutation = trpc.portal.cod.updateRemittanceStatus.useMutation({
    onSuccess: () => {
      toast.success('Remittance status updated');
      refetchRemittances();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Update COD record status mutation
  const updateCODStatusMutation = trpc.portal.cod.updateCODStatus.useMutation({
    onSuccess: () => {
      toast.success('COD status updated');
      refetchCOD();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update COD status');
    },
  });

  const handleCreateRemittance = () => {
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }

    if (selectedCODRecords.length === 0) {
      toast.error('Please select at least one COD record');
      return;
    }

    createRemittanceMutation.mutate({
      token: token || '',
      clientId: selectedClient,
      codRecordIds: selectedCODRecords,
      paymentMethod: paymentMethod || undefined,
      paymentReference: paymentReference || undefined,
      notes: notes || undefined,
    });
  };

  const handleStatusChange = (remittanceId: number, status: 'pending' | 'processed' | 'completed') => {
    updateStatusMutation.mutate({
      token: token || '',
      remittanceId,
      status,
    });
  };

  const handleCODStatusChange = (codRecordId: number, status: 'pending_collection' | 'collected' | 'remitted' | 'disputed') => {
    updateCODStatusMutation.mutate({
      token: token || '',
      codRecordId,
      status,
    });
  };

  const toggleCODSelection = (codRecordId: number) => {
    setSelectedCODRecords(prev =>
      prev.includes(codRecordId)
        ? prev.filter(id => id !== codRecordId)
        : [...prev, codRecordId]
    );
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
      disputed: { variant: 'destructive', icon: Clock },
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

  const totalSelected = pendingCOD
    ? selectedCODRecords.reduce((sum, id) => {
      const record = pendingCOD.find(r => r.id === id);
      return sum + (record ? parseFloat(record.codAmount) : 0);
    }, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Client Filter */}
      <Card className="glass-strong border-purple-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-400" />
            COD Management Filter
          </CardTitle>
          <CardDescription>Filter COD records by client</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="filterClient">Select Client</Label>
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger id="filterClient">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients?.map((client: any) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filterClientId !== 'all' && (
              <Button
                variant="outline"
                onClick={() => setFilterClientId('all')}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced COD Summary */}
      <Card className="glass-strong border-blue-500/20 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-500/5 to-purple-500/5">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <Wallet className="h-5 w-5 text-blue-400/70" />
            </div>
            COD Summary
          </CardTitle>
          <CardDescription>
            {filterClientId === 'all'
              ? 'Overview of all COD transactions'
              : `COD data for ${clients?.find((c: any) => c.id.toString() === filterClientId)?.companyName}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Collected Today */}
            <div className="group relative p-5 rounded-xl bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border border-green-500/20 hover:border-green-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-1">
              <div className="absolute top-3 right-3 p-2 rounded-lg bg-green-500/5 group-hover:bg-green-500/10 transition-colors">
                <BadgeCheck className="h-5 w-5 text-green-400/60" />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Collected Today</span>
                <div className="text-3xl font-bold text-green-400 tracking-tight">
                  AED {totalCollectedToday.toFixed(2)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 opacity-50" />
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Total Pending Settlement */}
            <div className="group relative p-5 rounded-xl bg-gradient-to-br from-yellow-500/10 via-yellow-500/5 to-transparent border border-yellow-500/20 hover:border-yellow-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/10 hover:-translate-y-1">
              <div className="absolute top-3 right-3 p-2 rounded-lg bg-yellow-500/5 group-hover:bg-yellow-500/10 transition-colors">
                <Wallet className="h-5 w-5 text-yellow-400/60" />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Pending Settlement</span>
                <div className="text-3xl font-bold text-yellow-400 tracking-tight">
                  AED {totalPendingSettlement.toFixed(2)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 opacity-50" />
                  Ready for payout
                </div>
              </div>
            </div>

            {/* Next Payout Date */}
            <div className="group relative p-5 rounded-xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
              <div className="absolute top-3 right-3 p-2 rounded-lg bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors">
                <Calendar className="h-5 w-5 text-blue-400/60" />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Next Payout</span>
                <div className="text-2xl font-bold text-blue-400 tracking-tight">
                  {getNextPayoutDate()}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 opacity-50" />
                  Weekly schedule
                </div>
              </div>
            </div>

            {/* Download Settlement PDF */}
            <div className="group relative p-5 rounded-xl bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Settlement Report</span>
                  <div className="p-2 rounded-lg bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors">
                    <Download className="h-5 w-5 text-purple-400/60" />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Export pending settlements
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <Button
                  onClick={handleDownloadSettlementPDF}
                  variant="outline"
                  size="sm"
                  className="w-full border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all"
                  disabled={totalPendingSettlement === 0}
                >
                  <Download className="mr-2 h-4 w-4 opacity-70" />
                  Pending Settlements
                </Button>
                <Button
                  onClick={handleDownloadAllCODPDF}
                  variant="outline"
                  size="sm"
                  className="w-full border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                >
                  <Download className="mr-2 h-4 w-4 opacity-70" />
                  All COD Records
                </Button>
              </div>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-border/50">
            <div className="text-center p-4 rounded-lg bg-gradient-to-br from-slate-500/5 to-transparent hover:from-slate-500/10 transition-all">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-slate-400/50" />
                <div className="text-sm font-medium text-muted-foreground">Total Pending</div>
              </div>
              <div className="text-2xl font-bold">AED {codSummary?.pending || '0'}</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-gradient-to-br from-green-500/5 to-transparent hover:from-green-500/10 transition-all">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BadgeCheck className="h-4 w-4 text-green-400/50" />
                <div className="text-sm font-medium text-muted-foreground">Total Remitted</div>
              </div>
              <div className="text-2xl font-bold text-green-400">AED {codSummary?.remitted || '0'}</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-gradient-to-br from-blue-500/5 to-transparent hover:from-blue-500/10 transition-all">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-blue-400/50" />
                <div className="text-sm font-medium text-muted-foreground">All Time Total</div>
              </div>
              <div className="text-2xl font-bold text-blue-400">AED {codSummary?.total || '0'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remittances Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>COD Remittances</CardTitle>
            <CardDescription>Manage batch payments to clients</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Remittance
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create COD Remittance</DialogTitle>
                <DialogDescription>
                  Select collected COD shipments to create a remittance payment to the client
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client</Label>
                  <Select value={selectedClient?.toString() || ''} onValueChange={(value) => {
                    setSelectedClient(parseInt(value));
                    setSelectedCODRecords([]);
                  }}>
                    <SelectTrigger id="client">
                      <SelectValue placeholder="Select a client" />
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

                {selectedClient && filteredPendingCOD && filteredPendingCOD.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label>Select Shipments ({selectedCODRecords.length} selected)</Label>
                      <div className="border rounded-md max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">Select</TableHead>
                              <TableHead>Waybill</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Collected Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredPendingCOD.map((record) => (
                              <TableRow key={record.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedCODRecords.includes(record.id)}
                                    onCheckedChange={() => toggleCODSelection(record.id)}
                                  />
                                </TableCell>
                                <TableCell>{record.order.waybillNumber}</TableCell>
                                <TableCell>{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                                <TableCell>{formatDate(record.collectedDate)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {selectedCODRecords.length > 0 && (
                        <div className="flex justify-between items-center p-3 bg-muted rounded-md">
                          <span className="font-medium">Total Amount:</span>
                          <span className="text-lg font-bold">AED {totalSelected.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="paymentMethod">Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger id="paymentMethod">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="paymentReference">Payment Reference (Optional)</Label>
                        <Input
                          id="paymentReference"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Transaction ID, cheque number, etc."
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this remittance..."
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateRemittance}
                        disabled={selectedCODRecords.length === 0 || createRemittanceMutation.isPending}
                      >
                        {createRemittanceMutation.isPending ? 'Creating...' : 'Create Remittance'}
                      </Button>
                    </div>
                  </>
                )}

                {selectedClient && filteredPendingCOD && filteredPendingCOD.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending COD collections for this client
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {remittancesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading remittances...</div>
          ) : !remittances || remittances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No remittances created yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remittance #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Shipments</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remittances.map((remittance) => (
                  <TableRow key={remittance.id}>
                    <TableCell
                      className="font-medium text-primary cursor-pointer hover:underline"
                      onClick={() => {
                        setSelectedRemittanceId(remittance.id);
                        setDetailsDialogOpen(true);
                      }}
                    >
                      {remittance.remittanceNumber}
                    </TableCell>
                    <TableCell>{remittance.client?.companyName || 'N/A'}</TableCell>
                    <TableCell>{remittance.shipmentCount}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(remittance.totalAmount, remittance.currency)}</TableCell>
                    <TableCell>{remittance.paymentMethod || 'N/A'}</TableCell>
                    <TableCell>{formatDate(remittance.createdAt)}</TableCell>
                    <TableCell>{getStatusBadge(remittance.status)}</TableCell>
                    <TableCell>
                      <Select
                        value={remittance.status}
                        onValueChange={(value: 'pending' | 'processed' | 'completed') =>
                          handleStatusChange(remittance.id, value)
                        }
                      >
                        <SelectTrigger className="w-[130px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="processed">Processed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RemittanceDetailsDialog
        isOpen={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        remittanceId={selectedRemittanceId}
        isAdmin={true}
      />

      {/* All COD Records */}
      <Card>
        <CardHeader>
          <CardTitle>All COD Records</CardTitle>
          <CardDescription>Complete history of cash on delivery transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {codLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading COD records...</div>
          ) : !codRecords || codRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No COD records found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waybill #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Collected Date</TableHead>
                  <TableHead>Remitted Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.order.waybillNumber}</TableCell>
                    <TableCell>{record.client?.companyName || 'N/A'}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                    <TableCell>{formatDate(record.collectedDate)}</TableCell>
                    <TableCell>{formatDate(record.remittedToClientDate)}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell>
                      <Select
                        value={record.status}
                        onValueChange={(value: 'pending_collection' | 'collected' | 'remitted' | 'disputed') =>
                          handleCODStatusChange(record.id, value)
                        }
                      >
                        <SelectTrigger className="w-[160px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending_collection">Pending Collection</SelectItem>
                          <SelectItem value="collected">Collected</SelectItem>
                          <SelectItem value="remitted">Remitted</SelectItem>
                          <SelectItem value="disputed">Disputed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
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
