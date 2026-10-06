import { Fragment, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle, ChevronDown, ChevronUp, FileClock, Loader2, RefreshCw, Trash2, X, Zap } from 'lucide-react';

const money = (value: string | number, currency = 'AED') => `${currency} ${Number(value || 0).toFixed(2)}`;

const dubaiDate = (value: string | Date | null | undefined, withTime = false) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: withTime ? 'short' : undefined,
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

type ApproveState = { draft: any; reference: string; notes: string };

/**
 * Remittances the weekly automation drafted (cash weekly, card bi-weekly).
 * Approving one = confirming the bank transfer went out: it gets its REM number,
 * the COD becomes remitted, netted invoices get paid, and the client is notified.
 */
export default function CODDraftRemittances() {
  const utils = trpc.useUtils();
  const { data: drafts, isLoading } = trpc.portal.cod.getDraftRemittances.useQuery();
  const { data: status } = trpc.portal.billing.getAutomationStatus.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [approve, setApprove] = useState<ApproveState | null>(null);

  const refresh = () => {
    utils.portal.cod.getDraftRemittances.invalidate();
    utils.portal.billing.getAutomationStatus.invalidate();
    utils.portal.cod.getReadyToRemit.invalidate();
    utils.portal.cod.getAccumulating.invalidate();
    utils.portal.cod.getRemittancesPaged.invalidate();
    utils.portal.cod.getCODRecordsPaged.invalidate();
    utils.portal.cod.getCODSummary.invalidate();
    utils.portal.billing.getInvoicesPaged.invalidate();
    utils.portal.billing.getDraftInvoices.invalidate();
  };
  const onError = (error: any) => toast.error(error.message || 'Something went wrong');

  const approveMutation = trpc.portal.cod.approveDraftRemittance.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.remittanceNumber} approved — ${money(result.payout)} recorded as transferred`);
      setApprove(null);
      refresh();
    },
    onError,
  });
  const discardMutation = trpc.portal.cod.discardDraftRemittance.useMutation({
    onSuccess: () => { toast.success('Draft discarded — its shipments are back in Ready to Remit'); refresh(); },
    onError,
  });
  const rebuildMutation = trpc.portal.cod.rebuildDraftRemittance.useMutation({
    onSuccess: () => { toast.success('Draft rebuilt'); refresh(); },
    onError,
  });
  const removeItemMutation = trpc.portal.cod.removeDraftRemittanceItem.useMutation({
    onSuccess: () => { toast.success('Shipment removed — it will come back in the next batch'); refresh(); },
    onError,
  });
  const removeOffsetMutation = trpc.portal.cod.removeDraftRemittanceOffset.useMutation({
    onSuccess: () => { toast.success('Invoice no longer deducted'); refresh(); },
    onError,
  });
  const runNowMutation = trpc.portal.billing.runAutomationNow.useMutation({
    onSuccess: (summary) => {
      const invoiceCount = summary.invoices.filter((i: any) => i.success).length;
      toast.success(`Done — ${invoiceCount} invoice draft(s), ${summary.remittances.length} remittance draft(s) created or updated`);
      if (summary.errors.length > 0) toast.error(summary.errors.join(' · '));
      refresh();
    },
    onError,
  });

  const busy = discardMutation.isPending || rebuildMutation.isPending || removeItemMutation.isPending || removeOffsetMutation.isPending;
  const totalToTransfer = (drafts ?? []).reduce((sum, d) => sum + parseFloat(d.payoutAmount || '0'), 0);

  const handleDiscard = (draft: any) => {
    if (!confirm(`Discard the ${draft.kind} draft for ${draft.companyName}? Its shipments go back to Ready to Remit.`)) return;
    discardMutation.mutate({ remittanceId: draft.id });
  };

  const handleRunNow = () => {
    if (!confirm('Run the weekly automation now? It only creates drafts that are missing — nothing is sent to clients.')) return;
    runNowMutation.mutate();
  };

  const confirmApprove = () => {
    if (!approve) return;
    if (!approve.reference.trim()) {
      toast.error('Enter the bank transfer reference');
      return;
    }
    approveMutation.mutate({
      remittanceId: approve.draft.id,
      paymentReference: approve.reference.trim(),
      paymentMethod: 'bank_transfer',
      notes: approve.notes.trim() || undefined,
    });
  };

  return (
    <Card className="bg-card rounded-2xl border border-border shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="h-5 w-5" style={{ color: 'var(--st-blue)' }} />
            Remittance Drafts
            {drafts && drafts.length > 0 && <span className="badge2 b-blue">{drafts.length} to approve</span>}
          </CardTitle>
          <CardDescription>
            Built automatically every Friday 19:00 (Dubai), after the 18:00 cutoff — cash weekly, card every other week. Clients don't see a draft until you approve it with the transfer reference.
          </CardDescription>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Button variant="outline" size="sm" onClick={handleRunNow} disabled={runNowMutation.isPending}>
            {runNowMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Run now
          </Button>
          {status && (
            <span className="text-xs text-muted-foreground">
              {status.schedulerEnabled ? `Next run ${dubaiDate(status.nextRunAt, true)}` : 'Scheduler off in this environment'}
              {' · '}next card cutoff {dubaiDate(status.nextCardCutoff)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !drafts || drafts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No drafts waiting for approval.
            {status?.lastRun && <> Last run {dubaiDate(status.lastRun.ranAt, true)}.</>}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Up to cutoff</TableHead>
                  <TableHead>Shipments</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Invoices deducted</TableHead>
                  <TableHead>To transfer</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => {
                  const isOpen = expandedId === draft.id;
                  const offset = parseFloat(draft.offsetAmount || '0');
                  return (
                    <Fragment key={draft.id}>
                      <TableRow>
                        <TableCell className="font-medium">{draft.companyName}</TableCell>
                        <TableCell>
                          {draft.kind === 'card'
                            ? <span className="badge2 b-blue">Card · bi-weekly</span>
                            : <span className="badge2 b-gray">Cash · weekly</span>}
                        </TableCell>
                        <TableCell className="text-sm">{dubaiDate(draft.periodCutoff, true)}</TableCell>
                        <TableCell>{draft.shipmentCount}</TableCell>
                        <TableCell className="money">{money(draft.grossAmount, draft.currency)}</TableCell>
                        <TableCell className="text-muted-foreground font-mono">
                          {parseFloat(draft.feeAmount) > 0 ? `− ${money(draft.feeAmount, draft.currency)}` : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono">
                          {offset > 0 ? `− ${money(offset, draft.currency)}` : '—'}
                        </TableCell>
                        <TableCell className="money" style={{ color: 'var(--st-green)' }}>{money(draft.payoutAmount, draft.currency)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setExpandedId(isOpen ? null : draft.id)} title="Show shipments">
                              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" onClick={() => setApprove({ draft, reference: '', notes: '' })} disabled={busy}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => rebuildMutation.mutate({ remittanceId: draft.id })} disabled={busy} title="Rebuild — picks up late collections and invoices sent since">
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDiscard(draft)} disabled={busy} title="Discard draft" className="text-primary hover:text-primary hover:bg-primary/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-secondary/40 p-0">
                            <div className="p-4 space-y-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Waybill</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Fee</TableHead>
                                    <TableHead>Collected</TableHead>
                                    <TableHead></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {draft.items.map((item: any) => (
                                    <TableRow key={item.codRecordId}>
                                      <TableCell className="wb">{item.waybillNumber}</TableCell>
                                      <TableCell>{item.customerName}</TableCell>
                                      <TableCell className="money">{money(item.amount, item.currency)}</TableCell>
                                      <TableCell>
                                        {item.collectedMethod === 'card'
                                          ? <span className="badge2 b-blue" title={item.paymentReference || undefined}>Card</span>
                                          : <span className="badge2 b-gray">Cash</span>}
                                      </TableCell>
                                      <TableCell className="font-mono text-muted-foreground">{item.feeAmount && parseFloat(item.feeAmount) > 0 ? money(item.feeAmount, item.currency) : '—'}</TableCell>
                                      <TableCell className="text-sm">{dubaiDate(item.collectedDate, true)}</TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title="Remove from this draft (stays collected, comes back next batch)"
                                          disabled={busy}
                                          onClick={() => removeItemMutation.mutate({ remittanceId: draft.id, codRecordId: item.codRecordId })}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>

                              {draft.offsets.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">Invoices deducted from this payout</p>
                                  {draft.offsets.map((o: any) => (
                                    <div key={o.invoiceId} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                                      <span className="wb">{o.invoiceNumber}</span>
                                      <span className="text-muted-foreground">{dubaiDate(o.issueDate)}</span>
                                      <span className="money">− {money(o.amount, draft.currency)}</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        title="Don't deduct this invoice"
                                        disabled={busy}
                                        onClick={() => removeOffsetMutation.mutate({ remittanceId: draft.id, invoiceId: o.invoiceId })}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-3 text-sm">
              <span className="text-muted-foreground mr-2">Total to transfer</span>
              <span className="money">{money(totalToTransfer)}</span>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!approve} onOpenChange={(open) => { if (!open) setApprove(null); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Approve remittance</DialogTitle>
            <DialogDescription>
              {approve?.draft.companyName} · {approve?.draft.kind === 'card' ? 'Card (bi-weekly)' : 'Cash (weekly)'} · {approve?.draft.shipmentCount} shipment(s)
            </DialogDescription>
          </DialogHeader>
          {approve && (
            <div className="space-y-4">
              <div className="statline" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="s">
                  <div className="l">Net COD</div>
                  <div className="v">{money(approve.draft.totalAmount, approve.draft.currency)}</div>
                </div>
                <div className="s">
                  <div className="l">Invoices deducted</div>
                  <div className="v">{money(approve.draft.offsetAmount || 0, approve.draft.currency)}</div>
                </div>
                <div className="s">
                  <div className="l">Transfer</div>
                  <div className="v green">{money(approve.draft.payoutAmount, approve.draft.currency)}</div>
                </div>
              </div>
              {approve.draft.offsets.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {approve.draft.offsets.map((o: any) => o.invoiceNumber).join(', ')} will be marked paid with this remittance's number.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="approveReference">Bank transfer reference *</Label>
                <Input
                  id="approveReference"
                  value={approve.reference}
                  onChange={(e) => setApprove({ ...approve, reference: e.target.value })}
                  placeholder="e.g. DOM2026101012345678"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approveNotes">Notes for the client (optional)</Label>
                <Textarea
                  id="approveNotes"
                  value={approve.notes}
                  onChange={(e) => setApprove({ ...approve, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Approving gives it a REM number, marks the COD as remitted and notifies the client. Only do it once the transfer has been sent.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setApprove(null)} disabled={approveMutation.isPending}>Cancel</Button>
                <Button onClick={confirmApprove} disabled={approveMutation.isPending}>
                  {approveMutation.isPending ? 'Approving...' : 'Transfer sent — approve'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
