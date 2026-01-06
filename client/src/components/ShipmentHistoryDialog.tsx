import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';

interface ShipmentHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shipmentId: number;
}

export default function ShipmentHistoryDialog({ open, onOpenChange, shipmentId }: ShipmentHistoryDialogProps) {
    const { data: events, isLoading } = trpc.portal.tracking.getEvents.useQuery(
        { shipmentId },
        { enabled: !!shipmentId && open }
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Shipment Tracking History</DialogTitle>
                    <DialogDescription>
                        Detailed timeline of events for this shipment
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading history...</div>
                ) : events && events.length > 0 ? (
                    <div className="relative border-l border-primary/20 ml-3 space-y-6 py-4">
                        {events.map((event, index) => (
                            <div key={index} className="ml-6 relative">
                                <span className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 ${index === 0 ? 'bg-primary border-primary' : 'bg-background border-muted-foreground'}`} />
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                    <div>
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {event.statusLabel}
                                            {index === 0 && <Badge variant="default" className="text-[10px] h-5 px-1.5">LATEST</Badge>}
                                        </h4>
                                        <p className="text-sm text-muted-foreground mt-0.5">{event.description || 'No description provided'}</p>
                                        {event.location && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                📍 {event.location}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                                        {new Date(event.eventDatetime).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai' })}
                                        <br />
                                        {new Date(event.eventDatetime).toLocaleTimeString('en-AE', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">No tracking events found</div>
                )}
            </DialogContent>
        </Dialog>
    );
}
