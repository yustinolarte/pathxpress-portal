/**
 * Correct a stop the driver (or an admin) marked wrong — what used to need a
 * one-off script (scripts/fix-status-*). Runs the same server rules as the
 * driver app, with admin rights: the order status, COD and the customer's
 * tracking timeline are corrected together, and it's logged in the route
 * history. Refused when the COD involved is already in a remittance.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { validStatusesFor, type StopStatus } from '@shared/stopTransitions';
import { humanizeStatus } from './dispatchBadges';

const CORRECTION_REASONS = [
    'Driver tapped the wrong status',
    'Customer confirmed it was delivered',
    'Wrong package scanned',
    'Status recorded twice / out of order',
    'Other',
];

export interface CorrectableStop {
    id: number;
    type: string;
    status: string;
    waybillNumber: string;
    codRequired?: number | null;
}

export default function CorrectStopDialog({ stop, open, onOpenChange, onCorrected }: {
    stop: CorrectableStop | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCorrected: () => void;
}) {
    const leg = stop?.type === 'pickup' ? 'pickup' : 'delivery';
    const [status, setStatus] = useState<StopStatus | ''>('');
    const [reason, setReason] = useState('');
    const [otherReason, setOtherReason] = useState('');
    const [notes, setNotes] = useState('');
    const [codMethod, setCodMethod] = useState<'cash' | 'card'>('cash');

    useEffect(() => {
        if (open) { setStatus(''); setReason(''); setOtherReason(''); setNotes(''); setCodMethod('cash'); }
    }, [open, stop?.id]);

    const correct = trpc.portal.drivers.correctStop.useMutation({
        onSuccess: (res) => {
            toast.success(res.outcome === 'applied'
                ? `Stop corrected — ${stop?.waybillNumber} is now ${humanizeStatus(res.stopStatus)}`
                : 'Nothing changed: the stop already has that status');
            onOpenChange(false);
            onCorrected();
        },
        onError: (e) => toast.error(e.message),
    });

    if (!stop) return null;
    const options = validStatusesFor(leg).filter(s => s !== stop.status);
    const finalReason = reason === 'Other' ? otherReason.trim() : reason;
    const needsCodMethod = leg === 'delivery' && status === 'delivered' && !!stop.codRequired;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Correct stop status</DialogTitle>
                    <DialogDescription>
                        {stop.waybillNumber} · {leg === 'pickup' ? 'Pickup' : 'Delivery'} · currently <strong>{humanizeStatus(stop.status)}</strong>.
                        The order, its COD and the customer's tracking are corrected together.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>New status *</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as StopStatus)}>
                            <SelectTrigger><SelectValue placeholder="Choose the correct status" /></SelectTrigger>
                            <SelectContent>
                                {options.map(s => <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {(status === 'pending' || status === 'in_progress') && (
                            <p className="text-xs text-muted-foreground">Re-opening clears the POD photos and timestamps of this stop (they stay in the route history).</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Reason *</Label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger><SelectValue placeholder="Why is this being corrected?" /></SelectTrigger>
                            <SelectContent>
                                {CORRECTION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {reason === 'Other' && (
                            <Textarea value={otherReason} onChange={e => setOtherReason(e.target.value)} placeholder="Describe the reason" rows={2} />
                        )}
                    </div>

                    {needsCodMethod && (
                        <div className="space-y-1.5">
                            <Label>How was the COD paid?</Label>
                            <Select value={codMethod} onValueChange={(v) => setCodMethod(v as 'cash' | 'card')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash (driver holds it)</SelectItem>
                                    <SelectItem value="card">Card (Tap to Pay)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label>Note for the tracking timeline (optional)</Label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Shown to the customer instead of the default text" rows={2} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        disabled={!status || finalReason.length < 3 || correct.isPending}
                        onClick={() => status && correct.mutate({
                            stopId: stop.id,
                            status,
                            reason: finalReason,
                            notes: notes.trim() || undefined,
                            codMethod: needsCodMethod ? codMethod : undefined,
                        })}
                    >
                        {correct.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Correct status'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
