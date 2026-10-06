import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Send, Zap } from 'lucide-react';

const dubaiDate = (value: string | Date | null | undefined, withTime = true) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/**
 * Weekly automation strip for the Billing page: invoice drafts waiting for
 * review, when the next Friday run is, and a one-shot "send all" once they've
 * been checked. Per-invoice send/edit stays in the table below.
 */
export default function BillingAutomationBanner() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.portal.billing.getAutomationStatus.useQuery();
  const { data: drafts } = trpc.portal.billing.getDraftInvoices.useQuery();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = () => {
    utils.portal.billing.getAutomationStatus.invalidate();
    utils.portal.billing.getDraftInvoices.invalidate();
    utils.portal.billing.getInvoicesPaged.invalidate();
    utils.portal.billing.getInvoiceStats.invalidate();
    utils.portal.cod.getDraftRemittances.invalidate();
  };

  const sendAll = trpc.portal.billing.sendInvoicesToClient.useMutation({
    onSuccess: (r) => { toast.success(`${r.sent} invoice(s) sent to clients`); setConfirmOpen(false); refresh(); },
    onError: (e) => toast.error(e.message || 'Failed to send invoices'),
  });
  const runNow = trpc.portal.billing.runAutomationNow.useMutation({
    onSuccess: (s) => {
      toast.success(`Done — ${s.invoices.filter((i: any) => i.success).length} invoice draft(s), ${s.remittances.length} remittance draft(s)`);
      if (s.errors.length > 0) toast.error(s.errors.join(' · '));
      refresh();
    },
    onError: (e) => toast.error(e.message || 'Automation failed'),
  });

  const draftCount = drafts?.length ?? 0;
  const draftTotal = (drafts ?? []).reduce((sum, d) => sum + parseFloat(d.total || '0'), 0);
  const lastRun = status?.lastRun;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3">
        <CalendarClock className="h-5 w-5 mt-0.5" style={{ color: 'var(--st-blue)' }} />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            Weekly drafts
            {draftCount > 0
              ? <span className="badge2 b-blue ml-2">{draftCount} invoice{draftCount !== 1 ? 's' : ''} to review · AED {draftTotal.toFixed(2)}</span>
              : <span className="text-muted-foreground font-normal"> — nothing waiting for review</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {status?.schedulerEnabled
              ? <>Invoices and COD remittances are drafted every Friday 19:00 (Dubai), right after the 18:00 cutoff. Next run {dubaiDate(status.nextRunAt)}.</>
              : <>Automatic run is off in this environment — use Run now.</>}
            {lastRun && <> Last run {dubaiDate(lastRun.ranAt)}: {lastRun.invoices.filter(i => i.success).length} invoice(s), {lastRun.remittances.length} remittance(s){lastRun.errors.length > 0 ? `, ${lastRun.errors.length} error(s)` : ''}.</>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending} title="Creates only what's missing — nothing is sent to clients">
          {runNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          Run now
        </Button>
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={draftCount === 0}>
          <Send className="w-4 h-4 mr-2" />
          Send all drafts{draftCount > 0 ? ` (${draftCount})` : ''}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Send {draftCount} invoice{draftCount !== 1 ? 's' : ''} to clients?</DialogTitle>
            <DialogDescription>
              Each becomes visible in the client's portal and the client is notified. Only do this after reviewing them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-[280px] overflow-y-auto border border-border rounded-xl p-3">
            {drafts?.map(d => (
              <div key={d.id} className="flex justify-between gap-3 text-sm py-1">
                <span className="wb">{d.invoiceNumber}</span>
                <span className="flex-1 truncate">{d.companyName}</span>
                <span className="money">{d.currency} {parseFloat(d.total).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sendAll.isPending}>Cancel</Button>
            <Button onClick={() => sendAll.mutate({ invoiceIds: (drafts ?? []).map(d => d.id) })} disabled={sendAll.isPending || draftCount === 0}>
              {sendAll.isPending ? 'Sending...' : 'Send all'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
