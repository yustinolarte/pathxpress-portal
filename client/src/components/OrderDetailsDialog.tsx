
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, MapPin, Phone, User, Package, Calendar, Truck, AlertCircle } from 'lucide-react';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { trpc } from '@/lib/trpc';
import { Separator } from '@/components/ui/separator';

interface OrderDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: any; // Using any for simplicity, but should be typed ideally
    clients?: any[]; // For resolving client name
}

export default function OrderDetailsDialog({ open, onOpenChange, order, clients }: OrderDetailsDialogProps) {
    // Fetch tracking events just like in ShipmentHistoryDialog
    const { data: events, isLoading: eventsLoading } = trpc.portal.tracking.getEvents.useQuery(
        { shipmentId: order?.id },
        { enabled: !!order?.id && open }
    );

    if (!order) return null;

    const clientName = clients?.find(c => c.id === order.clientId)?.companyName || 'Unknown Client';
    const statusColors: Record<string, string> = {
        pending_pickup: 'bg-yellow-500/80 hover:bg-yellow-500',
        picked_up: 'bg-blue-500/80 hover:bg-blue-500',
        in_transit: 'bg-indigo-500/80 hover:bg-indigo-500',
        out_for_delivery: 'bg-purple-500/80 hover:bg-purple-500',
        delivered: 'bg-green-500/80 hover:bg-green-500',
        failed_delivery: 'bg-red-500/80 hover:bg-red-500',
        returned: 'bg-gray-500/80 hover:bg-gray-500',
        exchange: 'bg-amber-500/80 hover:bg-amber-500',
        canceled: 'bg-slate-500/80 hover:bg-slate-500',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
                    <div>
                        <DialogTitle className="text-xl flex items-center gap-3">
                            Order {order.waybillNumber}
                            <Badge className={`${statusColors[order.status] || 'bg-gray-500'} border-none text-white capitalize shadow-sm text-sm font-normal`}>
                                {order.status.replace(/_/g, ' ')}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            Created on {new Date(order.createdAt).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </DialogDescription>
                    </div>
                    <Button onClick={() => generateWaybillPDF(order)} className="gap-2 bg-primary hover:bg-primary/90">
                        <Download className="w-4 h-4" />
                        Download Waybill
                    </Button>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                    {/* Sender & Recipient Info */}
                    <div className="space-y-6">
                        {/* Client / Sender */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <Truck className="w-4 h-4" /> Sender
                            </h3>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                                <p className="font-semibold text-lg">{clientName}</p>
                                {/* Assuming standardized sender address or client details if available */}
                                <p className="text-sm text-muted-foreground mt-1">Merchant Account</p>
                            </div>
                        </div>

                        {/* Recipient */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4" /> Consignee
                            </h3>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-2">
                                <div className="flex justify-between items-start">
                                    <p className="font-semibold text-lg">{order.customerName}</p>
                                    <a href={`tel:${order.customerPhone}`} className="text-sm bg-background px-2 py-1 rounded border hover:bg-accent flex items-center gap-1">
                                        <Phone className="w-3 h-3" /> {order.customerPhone}
                                    </a>
                                </div>
                                <div className="space-y-1 pt-2 border-t border-border/30 mt-2">
                                    <div className="flex items-start gap-2 text-sm">
                                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                                        <span>
                                            {order.address} <br />
                                            <span className="font-medium">{order.city}, {order.destinationCountry}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Shipment Details */}
                    <div className="space-y-6">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Package className="w-4 h-4" /> Shipment Details
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 text-center">
                                <p className="text-xs text-muted-foreground uppercase">Service</p>
                                <p className="font-bold text-lg">{order.serviceType}</p>
                            </div>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 text-center">
                                <p className="text-xs text-muted-foreground uppercase">Pieces</p>
                                <p className="font-bold text-lg">{order.pieces}</p>
                            </div>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 text-center">
                                <p className="text-xs text-muted-foreground uppercase">Weight</p>
                                <p className="font-bold text-lg">{order.weight} kg</p>
                            </div>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 text-center">
                                <p className="text-xs text-muted-foreground uppercase">COD Amount</p>
                                <p className={`font-bold text-lg ${order.codRequired ? 'text-orange-500' : 'text-gray-400'}`}>
                                    {order.codRequired ? `${order.codAmount} ${order.codCurrency}` : 'N/A'}
                                </p>
                            </div>
                        </div>

                        {order.isReturn === 1 && (
                            <div className="bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-xl flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-cyan-500" />
                                <div>
                                    <p className="font-medium text-cyan-700 dark:text-cyan-400">Return Shipment</p>
                                    <p className="text-xs text-cyan-600/80 dark:text-cyan-400/80">This is a return order.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <Separator className="my-6" />

                {/* Tracking Timeline */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Calendar className="w-5 h-5" /> Tracking History
                    </h3>

                    {eventsLoading ? (
                        <div className="py-8 text-center text-muted-foreground">Loading history...</div>
                    ) : events && events.length > 0 ? (
                        <div className="relative border-l border-primary/20 ml-3 space-y-8 py-4 px-2">
                            {events.map((event, index) => (
                                <div key={index} className="ml-6 relative">
                                    <span className={`absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-2 ${index === 0 ? 'bg-primary border-primary ring-4 ring-primary/20' : 'bg-background border-muted-foreground'}`} />
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                        <div>
                                            <h4 className="font-semibold text-base flex items-center gap-2">
                                                {event.statusLabel}
                                                {index === 0 && <Badge variant="default" className="text-[10px] h-5 px-1.5">LATEST</Badge>}
                                            </h4>
                                            <p className="text-sm text-muted-foreground mt-1">{event.description || 'No description provided'}</p>
                                            {event.location && (
                                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5">
                                                    📍 {event.location}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground text-right whitespace-nowrap bg-muted/30 px-2 py-1 rounded">
                                            {new Date(event.eventDatetime).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai' })}
                                            <br />
                                            <span className="font-mono">{new Date(event.eventDatetime).toLocaleTimeString('en-AE', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 bg-muted/20 rounded-xl border border-dashed text-center text-muted-foreground">
                            No tracking events found
                        </div>
                    )}
                </div>

            </DialogContent>
        </Dialog>
    );
}
