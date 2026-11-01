/**
 * Cash hand-overs received on the selected day, with Undo. A driver can hand
 * over several times a day; each row is what the office counted at that moment.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Undo2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dubaiTimeOfDay } from '@shared/dubaiTime';

const fmtAed = (v: string | number) => (typeof v === 'string' ? parseFloat(v) : v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashHandovers({ date, onChanged }: { date: string; onChanged: () => void }) {
    const { data, isLoading, refetch } = trpc.portal.drivers.getCashHandovers.useQuery({ date });
    const [voiding, setVoiding] = useState<{ id: number; label: string } | null>(null);
    const [reason, setReason] = useState('');

    const undo = trpc.portal.drivers.voidCashHandover.useMutation({
        onSuccess: () => { toast.success('Cash hand-over undone'); setVoiding(null); refetch(); onChanged(); },
        onError: (e) => toast.error(e.message),
    });

    if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
    if (!data || data.length === 0) return null;

    return (
        <div className="rounded-lg border border-border">
            <div className="px-4 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash received today</div>
            <ul className="divide-y divide-border">
                {data.map(h => (
                    <li key={h.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm ${h.voidedAt ? 'opacity-60' : ''}`}>
                        <span className="w-12 text-muted-foreground">{dubaiTimeOfDay(h.receivedAt)}</span>
                        <span className="font-medium min-w-[140px]">{h.driverName || 'Unknown driver'}</span>
                        <span className={`font-mono ${h.voidedAt ? 'line-through' : ''}`}>AED {fmtAed(h.amount)}</span>
                        <span className="text-xs text-muted-foreground">by {h.receivedBy}{h.note ? ` · ${h.note}` : ''}</span>
                        {h.voidedAt ? (
                            <span className="badge2 b-gray ml-auto" title={h.voidReason || undefined}>Undone by {h.voidedBy}</span>
                        ) : (
                            <Button
                                size="sm" variant="ghost" className="ml-auto gap-1 h-7 text-xs"
                                onClick={() => { setReason(''); setVoiding({ id: h.id, label: `AED ${fmtAed(h.amount)} from ${h.driverName}` }); }}
                            >
                                <Undo2 className="w-3 h-3" /> Undo
                            </Button>
                        )}
                    </li>
                ))}
            </ul>

            <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
                <DialogContent className="bg-card border-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Undo cash hand-over</DialogTitle>
                        <DialogDescription>{voiding?.label} goes back to "to remit". The record is kept, marked as undone.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label>Reason *</Label>
                        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Counted twice" rows={2} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setVoiding(null)}>Keep it</Button>
                        <Button disabled={reason.trim().length < 3 || undo.isPending} onClick={() => voiding && undo.mutate({ id: voiding.id, reason: reason.trim() })}>
                            {undo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Undo hand-over'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
