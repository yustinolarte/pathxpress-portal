import { useState, useMemo, useEffect, Fragment } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
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
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import RemittanceDetailsDialog from './RemittanceDetailsDialog';

const CODRECORDS_PAGE_SIZE = 50;
const REMITTANCES_PAGE_SIZE = 25;

export default function CODPanel() {
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createAllConfirmOpen, setCreateAllConfirmOpen] = useState(false);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  const [expandedReadyClientId, setExpandedReadyClientId] = useState<number | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRemittanceId, setSelectedRemittanceId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [selectedCODRecords, setSelectedCODRecords] = useState<number[]>([]);
  const [preselectAllOnLoad, setPreselectAllOnLoad] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [reportMonth, setReportMonth] = useState<string>('all'); // 'all' or 'YYYY-MM' format
  const [codPage, setCodPage] = useState(0);
  const [remittancePage, setRemittancePage] = useState(0);

  const handleFilterClientChange = (value: string) => {
    setFilterClientId(value);
    setCodPage(0);
    setRemittancePage(0);
  };

  // Get COD summary (SQL-aggregated global totals — not affected by pagination)
  const { data: codSummary } = trpc.portal.cod.getCODSummary.useQuery();

  // Full (capped) COD record set — used only for "Collected Today" and the
  // month-filtered PDF exports below, which need to scan across records
  // rather than a single page of them.
  const { data: allCODRecords } = trpc.portal.cod.getAllCODRecords.useQuery();

  // Paginated COD records — this is what actually renders in the "All COD
  // Records" table, so it can reach records past the 500-row cap above.
  const {
    data: codRecordsPagedData,
    isLoading: codLoading,
    refetch: refetchCODPaged,
  } = trpc.portal.cod.getCODRecordsPaged.useQuery({
    page: codPage,
    pageSize: CODRECORDS_PAGE_SIZE,
    clientId: filterClientId === 'all' ? undefined : parseInt(filterClientId),
  });
  const codRecordsRows = codRecordsPagedData?.rows ?? [];
  const codRecordsTotal = codRecordsPagedData?.total ?? 0;
  const codPageCount = Math.max(1, Math.ceil(codRecordsTotal / CODRECORDS_PAGE_SIZE));

  // Paginated remittances — replaces the old unbounded fetch of the whole table.
  const {
    data: remittancesPagedData,
    isLoading: remittancesLoading,
    refetch: refetchRemittancesPaged,
  } = trpc.portal.cod.getRemittancesPaged.useQuery({
    page: remittancePage,
    pageSize: REMITTANCES_PAGE_SIZE,
    clientId: filterClientId === 'all' ? undefined : parseInt(filterClientId),
  });
  const remittancesRows = remittancesPagedData?.rows ?? [];
  const remittancesTotal = remittancesPagedData?.total ?? 0;
  const remittancePageCount = Math.max(1, Math.ceil(remittancesTotal / REMITTANCES_PAGE_SIZE));

  // Get clients for dropdown
  const { data: clients } = trpc.portal.admin.getClients.useQuery();

  // Per-client totals already past the last weekly cutoff (Friday 18:00 Dubai) —
  // the automated "Ready to Remit" list that replaces manual checkbox selection.
  const { data: readyToRemit, isLoading: readyLoading, refetch: refetchReady } = trpc.portal.cod.getReadyToRemit.useQuery();

  // Per-client totals collected after the cutoff — read-only, building towards next week.
  const { data: accumulating, refetch: refetchAccumulating } = trpc.portal.cod.getAccumulating.useQuery();

  // Drill-down: which shipments make up one client's ready-to-remit total (expandable row)
  const { data: expandedRecords } = trpc.portal.cod.getReadyToRemitRecords.useQuery(
    { clientId: expandedReadyClientId || 0 },
    { enabled: !!expandedReadyClientId }
  );

  // Eligible (cutoff-bound) COD for the manual/override "Create Remittance" dialog
  const { data: eligibleCOD, refetch: refetchEligible } = trpc.portal.cod.getReadyToRemitRecords.useQuery(
    { clientId: selectedClient || 0 },
    { enabled: !!selectedClient }
  );

  // When opened from a "Ready to Remit" row, pre-check every eligible shipment
  // once it loads — the admin reviews the pre-filled list and can uncheck one
  // instead of building the selection from scratch.
  useEffect(() => {
    if (preselectAllOnLoad && eligibleCOD) {
      setSelectedCODRecords(eligibleCOD.map(r => r.id));
      setPreselectAllOnLoad(false);
    }
  }, [preselectAllOnLoad, eligibleCOD]);

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

  // Pending settlement (collected but not remitted) — SQL-aggregated, accurate
  // regardless of the 500-row cap on allCODRecords.
  const totalPendingSettlement = parseFloat(codSummary?.collected || '0');

  // Calculate next payout date (display only — every Friday; the authoritative
  // cutoff instant, 18:00 Dubai time, is computed server-side in getLastWeeklyCutoff)
  const getNextCutoffDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    return nextFriday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Helper function to filter records by month
  const filterByMonth = (records: any[], dateField: 'collectedDate' | 'createdAt') => {
    if (reportMonth === 'all') return records;

    const [year, month] = reportMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return records.filter(record => {
      const date = record[dateField] ? new Date(record[dateField]) : null;
      if (!date) return false;
      return date >= startDate && date <= endDate;
    });
  };

  // Generate month options only for months that have data
  const monthOptions = useMemo(() => {
    if (!allCODRecords || allCODRecords.length === 0) return [];

    const monthsWithData = new Set<string>();

    allCODRecords.forEach(record => {
      const dateToUse = record.collectedDate || record.createdAt;
      if (dateToUse) {
        const date = new Date(dateToUse);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthsWithData.add(value);
      }
    });

    // Convert to array and sort in descending order (newest first)
    return Array.from(monthsWithData)
      .sort((a, b) => b.localeCompare(a))
      .map(value => {
        const [year, month] = value.split('-').map(Number);
        const date = new Date(year, month - 1);
        const label = date.toLocaleDateString('en-US', { month: 'long' }); // Only month, no year
        return { value, label };
      });
  }, [allCODRecords]);

  // Totals by currency for the "Create All" confirmation dialog
  const readyTotalsByCurrency = useMemo(() => {
    if (!readyToRemit) return [] as { currency: string; total: number }[];
    const map = new Map<string, number>();
    readyToRemit.forEach(c => {
      map.set(c.currency, (map.get(c.currency) || 0) + parseFloat(c.netAmount));
    });
    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [readyToRemit]);

  // Download Pending Settlement PDF (only collected, not yet remitted)
  const handleDownloadSettlementPDF = async () => {
    try {
      const { generateCODReportPDF, downloadPDF } = await import('@/lib/reportUtils');

      let settlementRecords = allCODRecords?.filter(record => record.status === 'collected') || [];

      // Apply month filter
      settlementRecords = filterByMonth(settlementRecords, 'collectedDate');

      if (settlementRecords.length === 0) {
        toast.error('No pending settlements found for the selected period');
        return;
      }

      // Map nested properties for the report generator
      const reportData = settlementRecords.map(record => ({
        ...record,
        waybillNumber: record.order?.waybillNumber || '',
        customerName: record.order?.customerName || '',
        city: record.order?.city || ''
      }));

      const monthLabel = reportMonth === 'all' ? 'All Time' : monthOptions.find((m: { value: string; label: string }) => m.value === reportMonth)?.label || reportMonth;
      const doc = generateCODReportPDF(reportData, `Pending Settlement - ${monthLabel}`);
      downloadPDF(doc, `Pending_Settlement_${reportMonth === 'all' ? 'All' : reportMonth}.pdf`);
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
      let allRecords = allCODRecords?.filter(record =>
        record.status === 'collected' || record.status === 'remitted'
      ) || [];

      // Apply month filter
      allRecords = filterByMonth(allRecords, 'collectedDate');

      if (allRecords.length === 0) {
        toast.error('No COD records found for the selected period');
        return;
      }

      // Map nested properties for the report generator
      const reportData = allRecords.map(record => ({
        ...record,
        waybillNumber: record.order?.waybillNumber || '',
        customerName: record.order?.customerName || '',
        city: record.order?.city || ''
      }));

      const monthLabel = reportMonth === 'all' ? 'All Time' : monthOptions.find((m: { value: string; label: string }) => m.value === reportMonth)?.label || reportMonth;
      const doc = generateCODReportPDF(reportData, `All COD Records - ${monthLabel}`);
      downloadPDF(doc, `All_COD_Report_${reportMonth === 'all' ? 'All' : reportMonth}.pdf`);
      toast.success('All COD PDF downloaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate PDF');
    }
  };

  const refetchEverything = () => {
    refetchCODPaged();
    refetchRemittancesPaged();
    refetchReady();
    refetchAccumulating();
    if (selectedClient) refetchEligible();
    utils.portal.cod.getAllCODRecords.invalidate();
    utils.portal.cod.getCODSummary.invalidate();
  };

  // Create remittance mutation — used both by the manual dialog (with an
  // explicit codRecordIds override) and by the one-click "Ready to Remit" flow
  // (clientId only, server resolves everything past cutoff for that client).
  const createRemittanceMutation = trpc.portal.cod.createRemittance.useMutation({
    onSuccess: (data) => {
      toast.success(`Remittance ${data.remittanceNumber} created successfully`);
      setCreateDialogOpen(false);
      setSelectedClient(null);
      setSelectedCODRecords([]);
      setPreselectAllOnLoad(false);
      setPaymentMethod('');
      setPaymentReference('');
      setNotes('');
      refetchEverything();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create remittance');
    },
  });

  // Update remittance status mutation
  const updateStatusMutation = trpc.portal.cod.updateRemittanceStatus.useMutation({
    onSuccess: () => {
      toast.success('Remittance status updated');
      refetchRemittancesPaged();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Update COD record status mutation
  const updateCODStatusMutation = trpc.portal.cod.updateCODStatus.useMutation({
    onSuccess: () => {
      toast.success('COD status updated');
      refetchCODPaged();
      utils.portal.cod.getAllCODRecords.invalidate();
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
      clientId: selectedClient,
      codRecordIds: selectedCODRecords,
      paymentMethod: paymentMethod || undefined,
      paymentReference: paymentReference || undefined,
      notes: notes || undefined,
    });
  };

  // From a "Ready to Remit" row: open the same dialog used for manual/override
  // remittances, pre-filled with this client and every eligible shipment
  // already checked — reviewable and editable before confirming, in case one
  // needs to be excluded (a dispute, a miscollected COD, etc.).
  const handleReviewRemittance = (clientId: number) => {
    setSelectedClient(clientId);
    setSelectedCODRecords([]);
    setPreselectAllOnLoad(true);
    setCreateDialogOpen(true);
  };

  const handleCreateAll = async () => {
    if (!readyToRemit || readyToRemit.length === 0) return;
    setIsCreatingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const c of readyToRemit) {
      try {
        await createRemittanceMutation.mutateAsync({ clientId: c.clientId });
        successCount++;
      } catch (_) {
        failCount++;
      }
    }

    setIsCreatingAll(false);
    setCreateAllConfirmOpen(false);
    if (failCount === 0) {
      toast.success(`Created ${successCount} remittance${successCount !== 1 ? 's' : ''}`);
    } else {
      toast.error(`Created ${successCount} remittance${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
    }
    refetchEverything();
  };

  const handleStatusChange = (remittanceId: number, status: 'pending' | 'processed' | 'completed') => {
    updateStatusMutation.mutate({
      remittanceId,
      status,
    });
  };

  const handleCODStatusChange = (codRecordId: number, status: 'pending_collection' | 'collected' | 'remitted' | 'disputed') => {
    updateCODStatusMutation.mutate({
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
    const variants: Record<string, { className: string; label: string }> = {
      pending_collection: { className: 'badge2 b-amber', label: 'Pending Collection' },
      collected: { className: 'badge2 b-blue', label: 'Collected' },
      remitted: { className: 'badge2 b-green', label: 'Remitted' },
      disputed: { className: 'badge2 b-red', label: 'Disputed' },
      cancelled: { className: 'badge2 b-gray', label: 'Cancelled' },
      pending: { className: 'badge2 b-amber', label: 'Pending' },
      processed: { className: 'badge2 b-blue', label: 'Processed' },
      completed: { className: 'badge2 b-green', label: 'Completed' },
    };

    const config = variants[status] || variants.pending;

    return <span className={config.className}>{config.label}</span>;
  };

  // Cash vs card: collectedMethod once collected; before that show what the shipper allows
  const getMethodBadge = (record: any) => {
    if (record.collectedMethod === 'card') {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="badge2 b-blue">Card</span>
          {record.paymentReference && <span className="font-mono text-[10px] text-muted-foreground">{record.paymentReference}</span>}
        </div>
      );
    }
    if (record.collectedMethod === 'cash') return <span className="badge2 b-gray">Cash</span>;
    const allowed = record.allowedMethods || 'cash';
    if (allowed === 'card') return <span className="badge2 b-blue">Card only</span>;
    if (allowed === 'any') return <span className="badge2 b-gray">Cash / Card</span>;
    return <span className="badge2 b-gray">Cash</span>;
  };

  const totalSelected = eligibleCOD
    ? selectedCODRecords.reduce((sum, id) => {
      const record = eligibleCOD.find(r => r.id === id);
      return sum + (record ? parseFloat(record.codAmount) : 0);
    }, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Client Filter */}
      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            COD Management Filter
          </CardTitle>
          <CardDescription>Filter COD records by client</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="filterClient">Select Client</Label>
              <Select value={filterClientId} onValueChange={handleFilterClientChange}>
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
                onClick={() => handleFilterClientChange('all')}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced COD Summary */}
      <Card className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-secondary border border-border">
              <Wallet className="h-5 w-5 text-foreground" />
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
            <div className="kpi">
              <div className="kt">
                <span className="lab">Collected Today</span>
                <span className="ic"><BadgeCheck className="h-[18px] w-[18px]" style={{ color: 'var(--st-green)' }} /></span>
              </div>
              <div className="val" style={{ fontSize: 26, color: 'var(--st-green)' }}>
                AED {totalCollectedToday.toFixed(2)}
              </div>
              <div className="sub">
                <Calendar className="h-3 w-3 opacity-50" />
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {/* Total Pending Settlement */}
            <div className="kpi">
              <div className="kt">
                <span className="lab">Pending Settlement</span>
                <span className="ic"><Wallet className="h-[18px] w-[18px]" style={{ color: 'var(--st-amber)' }} /></span>
              </div>
              <div className="val" style={{ fontSize: 26, color: 'var(--st-amber)' }}>
                AED {totalPendingSettlement.toFixed(2)}
              </div>
              <div className="sub">
                <Clock className="h-3 w-3 opacity-50" />
                Ready for payout
              </div>
            </div>

            {/* Ready to Remit (real cutoff-based data, replaces the old static "Next Payout" placeholder) */}
            <div className="kpi accent">
              <div className="kt">
                <span className="lab">Ready to Remit</span>
                <span className="ic"><Calendar className="h-[18px] w-[18px]" /></span>
              </div>
              <div className="val" style={{ fontSize: 24 }}>
                {readyToRemit?.length || 0} client{(readyToRemit?.length || 0) !== 1 ? 's' : ''}
              </div>
              <div className="sub">
                <TrendingUp className="h-3 w-3 opacity-50" />
                Next cutoff: {getNextCutoffDate()}
              </div>
            </div>

            {/* Download Settlement PDF */}
            <div className="kpi flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="lab">Settlement Report</span>
                  <span className="ic"><Download className="h-[18px] w-[18px]" /></span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Filter and export COD records
                </div>
              </div>

              {/* Month Filter */}
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground mb-1 block">Filter by Month</Label>
                <Select value={reportMonth} onValueChange={setReportMonth}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    {monthOptions.map((option: { value: string; label: string }) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 mt-3">
                <Button
                  onClick={handleDownloadSettlementPDF}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Download className="mr-2 h-4 w-4 opacity-70" />
                  Pending Settlements
                </Button>
                <Button
                  onClick={handleDownloadAllCODPDF}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Download className="mr-2 h-4 w-4 opacity-70" />
                  All COD Records
                </Button>
              </div>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="statline mt-6 pt-6 border-t border-border/50" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="s">
              <div className="l">Total Pending</div>
              <div className="v">AED {codSummary?.pending || '0'}</div>
            </div>
            <div className="s">
              <div className="l">Total Remitted</div>
              <div className="v green">AED {codSummary?.remitted || '0'}</div>
            </div>
            <div className="s">
              <div className="l">All Time Total</div>
              <div className="v">AED {codSummary?.total || '0'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ready to Remit — automated cutoff-based grouping, replaces manual per-shipment selection */}
      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5" style={{ color: 'var(--st-green)' }} />
              Ready to Remit
            </CardTitle>
            <CardDescription>Grouped by the weekly cutoff — every Friday 18:00 (Dubai time). Review the total, then confirm.</CardDescription>
          </div>
          {readyToRemit && readyToRemit.length > 0 && (
            <Button onClick={() => setCreateAllConfirmOpen(true)} disabled={isCreatingAll || createRemittanceMutation.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              Create All ({readyToRemit.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {readyLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !readyToRemit || readyToRemit.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nothing ready to remit yet — check back after the next Friday cutoff.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Shipments</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Oldest Collection</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyToRemit.map((c) => (
                  <Fragment key={`${c.clientId}-${c.currency}`}>
                    <TableRow>
                      <TableCell className="font-medium">{c.companyName}</TableCell>
                      <TableCell>{c.count}</TableCell>
                      <TableCell className="money">{formatCurrency(c.grossAmount, c.currency)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">
                        {parseFloat(c.feeAmount) > 0 ? `− ${formatCurrency(c.feeAmount, c.currency)}` : '—'}
                      </TableCell>
                      <TableCell className="money" style={{ color: 'var(--st-green)' }}>{formatCurrency(c.netAmount, c.currency)}</TableCell>
                      <TableCell>{formatDate(c.oldestCollectedDate)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedReadyClientId(expandedReadyClientId === c.clientId ? null : c.clientId)}
                          >
                            {expandedReadyClientId === c.clientId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleReviewRemittance(c.clientId)}
                            disabled={isCreatingAll}
                          >
                            Review &amp; Create
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedReadyClientId === c.clientId && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-secondary/40 p-0">
                          <div className="p-4">
                            {!expandedRecords || expandedRecords.length === 0 ? (
                              <div className="text-sm text-muted-foreground py-2">Loading shipments...</div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Waybill</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Collected Date</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {expandedRecords.map((record: any) => (
                                    <TableRow key={record.id}>
                                      <TableCell>{record.order.waybillNumber}</TableCell>
                                      <TableCell>{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                                      <TableCell>{getMethodBadge(record)}</TableCell>
                                      <TableCell>{formatDate(record.collectedDate)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create All confirmation */}
      <Dialog open={createAllConfirmOpen} onOpenChange={setCreateAllConfirmOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create {readyToRemit?.length || 0} remittances?</DialogTitle>
            <DialogDescription>
              This creates one remittance per client below and moves all of it to "remitted". Review before confirming.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-[240px] overflow-y-auto border border-border rounded-xl p-3 bg-white/5">
            {readyToRemit?.map(c => (
              <div key={`${c.clientId}-${c.currency}`} className="flex justify-between text-sm py-1">
                <span>{c.companyName}</span>
                <span className="money">{formatCurrency(c.netAmount, c.currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center p-3 bg-secondary border border-border rounded-xl text-sm">
            <span className="font-medium">Total</span>
            <div className="flex flex-col items-end">
              {readyTotalsByCurrency.map(t => (
                <span key={t.currency} className="money">{t.currency} {t.total.toFixed(2)}</span>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateAllConfirmOpen(false)} disabled={isCreatingAll}>
              Cancel
            </Button>
            <Button onClick={handleCreateAll} disabled={isCreatingAll}>
              {isCreatingAll ? 'Creating...' : 'Confirm & Create All'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Accumulating for next cutoff — read-only */}
      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Accumulating for Next Cutoff
          </CardTitle>
          <CardDescription>Collected after the last Friday 18:00 cutoff — will be ready to remit after the next one.</CardDescription>
        </CardHeader>
        <CardContent>
          {!accumulating || accumulating.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Nothing accumulating right now</div>
          ) : (
            <div className="space-y-1">
              {accumulating.map(c => (
                <div key={`${c.clientId}-${c.currency}`} className="flex justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                  <span>{c.companyName}</span>
                  <span className="text-muted-foreground">{c.count} shipment{c.count !== 1 ? 's' : ''}</span>
                  <span className="money">{formatCurrency(c.grossAmount, c.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remittances Section (manual/override path) */}
      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>COD Remittances</CardTitle>
            <CardDescription>All remittance batches. Use "Ready to Remit" above for the normal weekly flow — this manual form is for overrides.</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) setPreselectAllOnLoad(false); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Manual Remittance
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
              <div className="w-full h-1 bg-primary" />
              <div className="p-6">
                <DialogHeader className="mb-6">
                  <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Wallet className="w-6 h-6 text-primary" />
                    </div>
                    Create COD Remittance
                  </DialogTitle>
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
                      setPreselectAllOnLoad(false);
                    }}>
                      <SelectTrigger id="client" className="bg-white/5 border-border">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {clients?.map((client: any) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedClient && eligibleCOD && eligibleCOD.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <Label>Select Shipments ({selectedCODRecords.length} selected)</Label>
                        <div className="border border-border rounded-xl max-h-[300px] overflow-y-auto bg-white/5">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[50px]">Select</TableHead>
                                <TableHead>Waybill</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Collected Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {eligibleCOD.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedCODRecords.includes(record.id)}
                                      onCheckedChange={() => toggleCODSelection(record.id)}
                                    />
                                  </TableCell>
                                  <TableCell>{record.order.waybillNumber}</TableCell>
                                  <TableCell>{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                                  <TableCell>{getMethodBadge(record)}</TableCell>
                                  <TableCell>{formatDate(record.collectedDate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {selectedCODRecords.length > 0 && (
                          <div className="flex justify-between items-center p-3 bg-secondary border border-border rounded-xl">
                            <span className="font-medium">Total Amount:</span>
                            <span className="money text-lg text-primary">AED {totalSelected.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="paymentMethod">Payment Method</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger id="paymentMethod" className="bg-white/5 border-border">
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
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
                            className="bg-white/5 border-border"
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
                          className="bg-white/5 border-border resize-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setPreselectAllOnLoad(false); }}>
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

                  {selectedClient && eligibleCOD && eligibleCOD.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No COD past the weekly cutoff for this client
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {remittancesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading remittances...</div>
          ) : remittancesRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No remittances created yet
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Remittance #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Shipments</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Net to Client</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remittancesRows.map((remittance) => (
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
                      <TableCell className="money">{formatCurrency((remittance as any).grossAmount || remittance.totalAmount, remittance.currency)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">
                        {(remittance as any).feeAmount && parseFloat((remittance as any).feeAmount) > 0
                          ? `− ${formatCurrency((remittance as any).feeAmount, remittance.currency)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="money" style={{ color: 'var(--st-green)' }}>{formatCurrency(remittance.totalAmount, remittance.currency)}</TableCell>
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

              {remittancesTotal > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {remittancePage * REMITTANCES_PAGE_SIZE + 1}–{remittancePage * REMITTANCES_PAGE_SIZE + remittancesRows.length} of {remittancesTotal}
                  </p>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (remittancePage > 0) setRemittancePage(remittancePage - 1); }}
                          className={remittancePage === 0 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-3 text-sm text-muted-foreground">Page {remittancePage + 1} of {remittancePageCount}</span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (remittancePage + 1 < remittancePageCount) setRemittancePage(remittancePage + 1); }}
                          className={remittancePage + 1 >= remittancePageCount ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
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
      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle>All COD Records</CardTitle>
          <CardDescription>Complete history of cash on delivery transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {codLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading COD records...</div>
          ) : codRecordsRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No COD records found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waybill #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Collected Date</TableHead>
                    <TableHead>Remitted Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codRecordsRows.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.order.waybillNumber}</TableCell>
                      <TableCell>{record.client?.companyName || 'N/A'}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(record.codAmount, record.codCurrency)}</TableCell>
                      <TableCell>{getMethodBadge(record)}</TableCell>
                      <TableCell>{(record as any).collectedByDriver || <span className="text-muted-foreground">—</span>}</TableCell>
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
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {codRecordsTotal > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {codPage * CODRECORDS_PAGE_SIZE + 1}–{codPage * CODRECORDS_PAGE_SIZE + codRecordsRows.length} of {codRecordsTotal}
                  </p>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (codPage > 0) setCodPage(codPage - 1); }}
                          className={codPage === 0 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-3 text-sm text-muted-foreground">Page {codPage + 1} of {codPageCount}</span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (codPage + 1 < codPageCount) setCodPage(codPage + 1); }}
                          className={codPage + 1 >= codPageCount ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
