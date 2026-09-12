/**
 * WhatsApp Bot — admin section.
 *
 * Read-only state (bot liveness, per-order request status, conversation
 * history) comes from the bot_* tables via portal.whatsappBot.*; actions
 * (request / resend / pause / resume / send) are relayed to the bot service.
 * Uses the portal design language (.kpi / .badge2) like the other panels.
 */
import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
  MessageCircle, Wifi, WifiOff, Bot, Search, RefreshCw, Send, MapPin, Pause, Play, Eye, Loader2, AlertTriangle, RotateCcw,
} from 'lucide-react';

const PAGE_SIZE = 50;

type BotStatus = 'not_tracked' | 'queued' | 'waiting' | 'failed' | 'received' | 'reused' | 'expired' | 'paused';
type FilterKey = 'all' | BotStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'not_tracked', label: 'Not asked' },
  { key: 'queued', label: 'Sending' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'failed', label: 'Send failed' },
  { key: 'received', label: 'Received' },
  { key: 'reused', label: 'Reused' },
  { key: 'expired', label: 'Expired' },
  { key: 'paused', label: 'Paused' },
];

const BOT_STATUS_UI: Record<BotStatus, { label: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = {
  not_tracked: { label: 'Not asked', tone: 'gray' },
  queued: { label: 'Sending', tone: 'blue' },
  waiting: { label: 'Waiting', tone: 'amber' },
  failed: { label: 'Send failed', tone: 'red' },
  received: { label: 'Received', tone: 'green' },
  reused: { label: 'Reused', tone: 'green' },
  expired: { label: 'Expired', tone: 'gray' },
  paused: { label: 'Paused', tone: 'red' },
};

function badge(status: BotStatus) {
  const ui = BOT_STATUS_UI[status];
  return <span className={`badge2 b-${ui.tone}`}>{ui.label}</span>;
}

function isInternational(waybill: string) {
  return waybill.toUpperCase().startsWith('PXI');
}

function relative(date: Date | string | null | undefined, now: number): string {
  if (!date) return '';
  const ms = now - new Date(date).getTime();
  if (ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(date: Date | string | null | undefined): string {
  return date ? new Date(date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

interface Props {
  active: boolean;
}

export default function WhatsAppBotSection({ active }: Props) {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedWaybill, setSelectedWaybill] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [filter, debouncedSearch]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [active]);

  const status = trpc.portal.whatsappBot.getStatus.useQuery(undefined, { enabled: active, refetchInterval: 30_000 });
  const listInput = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, botStatus: filter === 'all' ? undefined : filter, search: debouncedSearch || undefined }),
    [page, filter, debouncedSearch],
  );
  const list = trpc.portal.whatsappBot.listOrders.useQuery(listInput, { enabled: active, refetchInterval: 30_000 });

  const invalidate = () => {
    utils.portal.whatsappBot.listOrders.invalidate();
    utils.portal.whatsappBot.getConversation.invalidate();
  };

  const requestLocation = trpc.portal.whatsappBot.requestLocation.useMutation({
    onSuccess: (res, vars) => {
      if (res.reused) toast.success(`${vars.waybillNumber}: reused a confirmed location, no message needed`);
      else if (res.skipped) toast.info(`${vars.waybillNumber}: skipped — ${res.reason ?? 'not eligible'}`);
      else if (res.success) toast.success(`${vars.waybillNumber}: location request queued`);
      else toast.error(`${vars.waybillNumber}: ${res.reason ?? 'could not request'}`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const setPaused = trpc.portal.whatsappBot.setPaused.useMutation({
    onSuccess: (_res, vars) => {
      toast.success(vars.paused ? `Bot paused for ${vars.waybillNumber} — you're in control of this chat` : `Bot resumed for ${vars.waybillNumber}`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const backfill = trpc.portal.whatsappBot.backfill.useMutation({
    onSuccess: (res) => {
      toast.success(`Backfill done: ${res.queued} of ${res.total} pending orders queued`);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const counts = list.data?.counts;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const botOnline = status.data?.online ?? false;
  const waConnected = status.data?.whatsappConnected ?? false;
  const actionsDisabled = !status.data?.configured || !botOnline;

  return (
    <div className="space-y-4">
      {status.data && !botOnline && (
        <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-[var(--primary)]" />
          <div>
            <div className="font-semibold">The bot service is offline</div>
            <div className="text-muted-foreground">
              {status.data.lastHeartbeatAt ? `Last seen ${relative(status.data.lastHeartbeatAt, now)} (${fmt(status.data.lastHeartbeatAt)}).` : 'It has never reported in.'}{' '}
              New orders are not being asked for a location until it's back. Actions below are disabled.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="kpi">
          <div className="kt">
            <span className="lab">Bot service</span>
            <span className="ic"><Bot className="w-[18px] h-[18px]" /></span>
          </div>
          <div className="val">{status.isLoading ? '…' : botOnline ? 'Online' : 'Offline'}</div>
          <div className="sub">{status.data?.version ? `v${status.data.version} · ` : ''}{status.data?.lastHeartbeatAt ? `heartbeat ${relative(status.data.lastHeartbeatAt, now)}` : 'no heartbeat yet'}</div>
        </div>
        <div className="kpi">
          <div className="kt">
            <span className="lab">WhatsApp</span>
            <span className="ic">{waConnected ? <Wifi className="w-[18px] h-[18px]" /> : <WifiOff className="w-[18px] h-[18px]" />}</span>
          </div>
          <div className="val">{status.isLoading ? '…' : waConnected ? 'Linked' : 'Not linked'}</div>
          <div className="sub">{waConnected && status.data?.connectedSince ? `connected ${relative(status.data.connectedSince, now)}` : botOnline ? 'reconnecting or needs QR scan' : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kt">
            <span className="lab">Waiting for reply</span>
            <span className="ic"><MessageCircle className="w-[18px] h-[18px]" /></span>
          </div>
          <div className="val">{counts ? counts.waiting + counts.queued : '…'}</div>
          <div className="sub">{counts ? `${counts.failed} failed to send · ${counts.not_tracked} not asked` : ''}</div>
        </div>
        <div className={`kpi ${counts && counts.failed > 0 ? 'accent' : ''}`}>
          <div className="kt">
            <span className="lab">Locations captured</span>
            <span className="ic"><MapPin className="w-[18px] h-[18px]" /></span>
          </div>
          <div className="val">{counts ? counts.received + counts.reused : '…'}</div>
          <div className="sub">{counts ? `${counts.received} from customers · ${counts.reused} reused` : ''}</div>
        </div>
      </div>

      <Card className="bg-card rounded-2xl border border-border shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Location requests</div>
              <CardTitle>Open orders</CardTitle>
              <CardDescription>Orders in pending pickup / picked up and whether the customer has been asked for their location pin.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { list.refetch(); status.refetch(); }} disabled={list.isFetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${list.isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button
                size="sm"
                disabled={actionsDisabled || backfill.isPending}
                onClick={() => {
                  if (window.confirm('Ask every open order that has no saved location to share its pin? Messages go out one at a time with the usual delays.')) backfill.mutate();
                }}
              >
                {backfill.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Request all not asked
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const n = f.key === 'all' ? counts?.all : counts?.[f.key];
              const activeChip = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${activeChip ? 'bg-foreground text-background border-foreground' : 'bg-secondary text-foreground border-border hover:bg-muted'}`}
                >
                  {f.label}{n !== undefined ? <span className={`ml-1.5 ${activeChip ? 'opacity-80' : 'text-muted-foreground'}`}>{n}</span> : null}
                </button>
              );
            })}
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Waybill, phone or name" className="pl-8" />
            </div>
          </div>

          {list.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No orders match this view.</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="[&>th]:px-1">
                      <TableHead>Waybill</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="min-w-[220px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.waybillNumber} className="[&>td]:px-1">
                        <TableCell className="wb font-medium">
                          <div className="flex items-center gap-2">
                            {r.waybillNumber}
                            {r.isReturn && <span title="Return — the shipper is asked" className="text-muted-foreground"><RotateCcw className="h-3.5 w-3.5" /></span>}
                          </div>
                          <div className="text-xs text-muted-foreground font-normal">{relative(r.createdAt, now)}</div>
                        </TableCell>
                        <TableCell className="font-display font-semibold">{r.storeName || 'Unknown'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{r.contactName}</span>
                            <span className="text-xs text-muted-foreground">{r.contactPhone}</span>
                          </div>
                        </TableCell>
                        <TableCell><span className="badge2 b-amber capitalize">{r.orderStatus.replace(/_/g, ' ')}</span></TableCell>
                        <TableCell>
                          <BotStatusCell row={r} now={now} />
                        </TableCell>
                        <TableCell>
                          <LocationCell accuracy={r.locationAccuracy} lat={r.latitude} lng={r.longitude} />
                        </TableCell>
                        <TableCell>
                          <RowActions
                            row={r}
                            disabled={actionsDisabled}
                            busy={requestLocation.isPending || setPaused.isPending}
                            onRequest={(force) => requestLocation.mutate({ waybillNumber: r.waybillNumber, force })}
                            onPause={(paused) => setPaused.mutate({ waybillNumber: r.waybillNumber, paused })}
                            onView={() => setSelectedWaybill(r.waybillNumber)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {rows.map((r) => (
                  <div key={r.waybillNumber} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="wb font-medium">{r.waybillNumber}</span>
                      <BotStatusCell row={r} now={now} />
                    </div>
                    <div className="text-sm">{r.contactName} <span className="text-muted-foreground">· {r.contactPhone}</span></div>
                    <div className="text-xs text-muted-foreground">{r.storeName || 'Unknown'} · {r.orderStatus.replace(/_/g, ' ')}</div>
                    <LocationCell accuracy={r.locationAccuracy} lat={r.latitude} lng={r.longitude} />
                    <RowActions
                      row={r}
                      disabled={actionsDisabled}
                      busy={requestLocation.isPending || setPaused.isPending}
                      onRequest={(force) => requestLocation.mutate({ waybillNumber: r.waybillNumber, force })}
                      onPause={(paused) => setPaused.mutate({ waybillNumber: r.waybillNumber, paused })}
                      onView={() => setSelectedWaybill(r.waybillNumber)}
                    />
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">{total} orders · page {page} of {totalPages}</span>
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedWaybill && (
        <ConversationDialog
          waybillNumber={selectedWaybill}
          row={rows.find((r) => r.waybillNumber === selectedWaybill) ?? null}
          disabled={actionsDisabled}
          now={now}
          onClose={() => setSelectedWaybill(null)}
          onRequest={(force) => requestLocation.mutate({ waybillNumber: selectedWaybill, force })}
          onPause={(paused) => setPaused.mutate({ waybillNumber: selectedWaybill, paused })}
        />
      )}
    </div>
  );
}

type Row = inferRouterOutputs<AppRouter>['portal']['whatsappBot']['listOrders']['rows'][number];

function BotStatusCell({ row, now }: { row: Row; now: number }) {
  if (isInternational(row.waybillNumber)) return <span className="badge2 b-gray">International</span>;
  const detail =
    row.botStatus === 'waiting' && row.sentAt ? `asked ${relative(row.sentAt, now)}`
    : row.botStatus === 'failed' ? `${row.sendAttempts} attempt${row.sendAttempts === 1 ? '' : 's'}`
    : row.botStatus === 'expired' ? (row.expiredReason?.startsWith('status:') ? 'order closed' : 'no reply in time')
    : row.botStatus === 'received' && row.botUpdatedAt ? relative(row.botUpdatedAt, now)
    : row.botStatus === 'queued' ? 'in send queue'
    : '';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {badge(row.botStatus)}
        {row.paused && <span className="badge2 b-red" title="Human takeover — the bot stays silent in this chat">Paused</span>}
      </div>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function LocationCell({ accuracy, lat, lng }: { accuracy: string; lat: string | null; lng: string | null }) {
  const tone = accuracy === 'exact' ? 'green' : accuracy === 'approximate' ? 'amber' : 'gray';
  return (
    <div className="flex items-center gap-2">
      <span className={`badge2 b-${tone} capitalize`}>{accuracy}</span>
      {lat && lng && (
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground">
          map
        </a>
      )}
    </div>
  );
}

function RowActions({
  row, disabled, busy, onRequest, onPause, onView,
}: {
  row: Row;
  disabled: boolean;
  busy: boolean;
  onRequest: (force: boolean) => void;
  onPause: (paused: boolean) => void;
  onView: () => void;
}) {
  const international = isInternational(row.waybillNumber);
  const asked = row.botStatus === 'waiting' || row.botStatus === 'queued' || row.botStatus === 'received' || row.botStatus === 'reused';
  return (
    <div className="flex flex-wrap gap-1.5">
      {!international && (
        <Button size="sm" variant={row.botStatus === 'failed' ? 'default' : 'outline'} disabled={disabled || busy} onClick={() => onRequest(asked || row.botStatus === 'failed' || row.botStatus === 'expired')} title={asked ? 'Send the location request again' : 'Ask the customer for their location pin'}>
          <Send className="h-3.5 w-3.5 mr-1" /> {asked ? 'Resend' : 'Request'}
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => onPause(!row.paused)} title={row.paused ? 'Let the bot reply again' : 'Take over: the bot stops replying in this chat (pins are still saved)'}>
        {row.paused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />} {row.paused ? 'Resume' : 'Pause'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onView} title="Conversation and manual message">
        <Eye className="h-3.5 w-3.5 mr-1" /> View
      </Button>
    </div>
  );
}

function ConversationDialog({
  waybillNumber, row, disabled, now, onClose, onRequest, onPause,
}: {
  waybillNumber: string;
  row: Row | null;
  disabled: boolean;
  now: number;
  onClose: () => void;
  onRequest: (force: boolean) => void;
  onPause: (paused: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const conversation = trpc.portal.whatsappBot.getConversation.useQuery({ waybillNumber }, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const send = trpc.portal.whatsappBot.sendMessage.useMutation({
    onSuccess: () => {
      toast.success('Message queued — it goes out after the usual humanized delay');
      setDraft('');
      setTimeout(() => utils.portal.whatsappBot.getConversation.invalidate({ waybillNumber }), 20_000);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const paused = conversation.data?.paused ?? row?.paused ?? false;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> {waybillNumber}
          </DialogTitle>
          <DialogDescription>
            {row ? <>{row.contactName} · {row.contactPhone} · {row.storeName || 'Unknown store'}</> : 'WhatsApp conversation'}
            {conversation.data?.tracked === false && ' · the bot has never messaged this number'}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <BotStatusCell row={row} now={now} />
            {row.requestedAt && <span>· requested {fmt(row.requestedAt)}</span>}
            {row.expiresAt && row.botStatus === 'waiting' && <span>· expires {fmt(row.expiresAt)}</span>}
            {row.lastError && row.botStatus === 'failed' && <span className="text-[var(--primary)]">· {row.lastError}</span>}
          </div>
        )}

        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
          {conversation.isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading conversation…</div>
          ) : (conversation.data?.messages.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No messages yet.</div>
          ) : (
            conversation.data!.messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.direction === 'system'
                    ? 'mx-auto max-w-full rounded-lg border border-dashed border-border px-3 py-1.5 text-xs italic text-muted-foreground'
                    : m.direction === 'out'
                      ? 'ml-auto max-w-[85%] rounded-lg bg-foreground text-background px-3 py-2 text-sm whitespace-pre-wrap'
                      : 'mr-auto max-w-[85%] rounded-lg bg-card border border-border px-3 py-2 text-sm whitespace-pre-wrap'
                }
              >
                <div>{m.text}</div>
                <div className={`mt-1 text-[10px] ${m.direction === 'out' ? 'text-background/70' : 'text-muted-foreground'}`}>
                  {m.direction === 'out' ? 'Bot' : m.direction === 'in' ? 'Customer' : 'System'} · {fmt(m.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message to the customer (sent from the bot's WhatsApp number)…"
            rows={3}
            maxLength={2000}
            disabled={disabled}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {paused ? 'Bot is paused in this chat — only your messages go out.' : 'Tip: pause the bot before taking over a conversation.'}
            </span>
            <Button size="sm" disabled={disabled || send.isPending || draft.trim().length === 0} onClick={() => send.mutate({ waybillNumber, message: draft.trim() })}>
              {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Send message
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {row && !isInternational(row.waybillNumber) && (
              <Button variant="outline" size="sm" disabled={disabled} onClick={() => onRequest(true)}>
                <Send className="h-3.5 w-3.5 mr-1" /> {row.botStatus === 'not_tracked' ? 'Request location' : 'Resend request'}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => onPause(!paused)}>
              {paused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />} {paused ? 'Resume bot' : 'Pause bot'}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
