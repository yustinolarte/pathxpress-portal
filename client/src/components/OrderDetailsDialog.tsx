
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, MapPin, Phone, User, Package, Calendar, Truck, AlertCircle, CheckCircle2, Clock, Scale, CreditCard, Loader2, FileText } from 'lucide-react';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { trpc } from '@/lib/trpc';
import { Separator } from '@/components/ui/separator';
import { getPodPhotoUrls } from '@shared/podPhotos';

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border !w-[90vw] !max-w-[1200px] max-h-[95vh] overflow-y-auto p-0 gap-0 ">
                <div className="w-full h-1 bg-primary" />

                <div className="p-6 space-y-8">
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border pb-5">
                        <div>
                            <p className="eyebrow">Shipment Details</p>
                            <h2 className="font-mono text-[32px] font-bold tracking-tight leading-none mt-3 text-foreground">
                                {order.waybillNumber}
                            </h2>
                            <p className="font-mono text-[11px] text-muted-foreground mt-2">
                                {new Date(order.createdAt).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* FOD Badge */}
                            {order.fitOnDelivery === 1 && (
                                <div className="px-4 py-2 rounded-full bg-[var(--st-blue-bg)] border border-transparent text-[var(--st-blue)] flex items-center gap-2">
                                    <Package className="w-4 h-4" />
                                    <span className="font-display font-bold uppercase tracking-wide text-sm">FOD</span>
                                </div>
                            )}

                            <div className={`px-4 py-2 rounded-full border border-transparent ${order.status === 'delivered' ? 'bg-[var(--st-green-bg)] text-[var(--st-green)]' :
                                order.status === 'cancelled' ? 'bg-primary/10 text-primary' :
                                    'bg-[var(--st-blue-bg)] text-[var(--st-blue)]'
                                } flex items-center gap-2`}>
                                {order.status === 'delivered' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                <span className="font-bold uppercase tracking-wide">{order.status.replace(/_/g, ' ')}</span>
                            </div>

                            <Button onClick={() => generateWaybillPDF(order)} variant="outline" className="gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary">
                                <Download className="w-4 h-4" /> Waybill
                            </Button>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
                        <div className="p-4 bg-card">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Service</p>
                            <p className="font-display text-[22px] font-bold leading-none tracking-tight">{order.serviceType}</p>
                        </div>
                        <div className="p-4 bg-card">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Pieces</p>
                            <p className="font-display text-[22px] font-bold leading-none tracking-tight">{order.pieces}</p>
                        </div>
                        <div className="p-4 bg-card">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Weight</p>
                            <p className="font-display text-[22px] font-bold leading-none tracking-tight">{order.weight} <span className="text-[13px] font-normal text-muted-foreground">kg</span></p>
                        </div>
                        <div className="p-4 bg-card">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">COD Amount</p>
                            <p className="font-display text-[22px] font-bold leading-none tracking-tight">
                                {order.codRequired ? `${order.codAmount} ${order.codCurrency || 'AED'}` : '—'}
                            </p>
                            {!!order.codRequired && (
                                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1.5">
                                    {order.codPaymentMethod === 'card' ? 'Card only (Tap to Pay)'
                                        : order.codPaymentMethod === 'any' ? 'Cash or Card'
                                            : 'Cash'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Addresses Column */}
                        <div className="space-y-6 lg:col-span-2">
                            <div className="grid md:grid-cols-2 gap-6 p-6 rounded-lg bg-muted/20 border border-border">
                                {/* Sender */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pickup From</span>
                                    </div>
                                    <div className="pl-10 space-y-3">
                                        <div>
                                            <p className="text-lg font-semibold text-foreground">{order.shipperName}</p>
                                            <p className="text-foreground/90 leading-relaxed">{order.shipperAddress}</p>
                                            <p className="text-muted-foreground">{order.shipperCity}, {order.shipperCountry}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge variant="secondary" className="font-mono bg-white/10 hover:bg-white/20">{order.shipperPhone}</Badge>
                                                <a href={`tel:${order.shipperPhone}`} className="text-xs text-primary hover:underline">Call now</a>
                                            </div>
                                        </div>

                                        {/* Merchant Account Badge */}
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <User className="w-3 h-3" />
                                            <span>Merchant: {clientName}</span>
                                        </div>

                                        {/* Special Instructions (Client) */}
                                        {order.specialInstructions && (
                                            <div className="p-3 bg-[var(--st-blue-bg)] border border-[var(--st-blue)]/25 rounded-lg">
                                                <p className="text-xs text-[var(--st-blue)] font-medium flex items-center gap-1.5 mb-1">
                                                    <FileText className="w-3 h-3" /> Special Instructions
                                                </p>
                                                <p className="text-sm text-foreground/90">{order.specialInstructions}</p>
                                            </div>
                                        )}

                                        {/* Merchant/Internal Note (Nosotros) */}
                                        {clients?.find(c => c.id === order.clientId)?.notes && (
                                            <div className="p-3 bg-[var(--st-amber-bg)] border border-[var(--st-amber)]/25 rounded-lg">
                                                <p className="text-xs text-[var(--st-amber)] font-medium flex items-center gap-1.5 mb-1">
                                                    <AlertCircle className="w-3 h-3" /> Account Note
                                                </p>
                                                <p className="text-sm text-foreground/90">{clients.find(c => c.id === order.clientId)?.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Receiver */}
                                <div className="space-y-3 relative">
                                    <div className="absolute left-[-12px] top-10 bottom-10 w-[1px] bg-white/10 hidden md:block" />
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Deliver To</span>
                                    </div>
                                    <div className="pl-10 space-y-1">
                                        <p className="text-lg font-semibold text-foreground">{order.customerName}</p>
                                        <p className="text-lg text-foreground/90 leading-relaxed font-medium">{order.address}</p>
                                        <p className="text-muted-foreground">{order.city}, {order.destinationCountry}</p>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="secondary" className="font-mono bg-white/10 hover:bg-white/20">{order.customerPhone}</Badge>
                                            <a href={`tel:${order.customerPhone}`} className="text-xs text-primary hover:underline">Call now</a>
                                        </div>

                                        {/* Preferred delivery schedule (PREFERRED_TIME service) */}
                                        {(order.serviceType === 'PREFERRED_TIME' || order.serviceType === 'PREFERRED_TIME_SDD') && (order.preferredDeliveryDate || order.preferredDeliveryTime) && (
                                            <div className="mt-3 p-3 bg-[var(--st-amber-bg)] border border-[var(--st-amber)]/25 rounded-lg">
                                                <p className="text-xs text-[var(--st-amber)] font-medium flex items-center gap-1.5 mb-2">
                                                    <Clock className="w-3 h-3" /> Preferred Delivery
                                                </p>
                                                <div className="flex flex-col gap-1 text-sm">
                                                    {order.preferredDeliveryDate && (
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="text-muted-foreground">Date</span>
                                                            <span className="font-semibold text-foreground/90">{order.preferredDeliveryDate}</span>
                                                        </div>
                                                    )}
                                                    {order.preferredDeliveryTime && (
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="text-muted-foreground">Window</span>
                                                            <span className="font-semibold text-foreground/90 font-mono">{order.preferredDeliveryTime}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timeline Column */}
                        <div className="lg:col-span-1">
                            <div className="rounded-2xl bg-muted/30 border border-border p-6 h-full">
                                <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-foreground">
                                    <Calendar className="w-5 h-5 text-primary" /> Tracking History
                                </h3>

                                {eventsLoading ? (
                                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                                ) : events && events.length > 0 ? (
                                    <div className="relative space-y-0">
                                        {/* Line */}
                                        <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />

                                        {events.map((event, index) => (
                                            <div key={index} className="relative pl-12 pb-8 last:pb-0 group">
                                                {/* Dot */}
                                                <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-background transition-transform group-hover:scale-110 ${index === 0 ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {index === 0 ? <Truck className="w-4 h-4 text-primary-foreground" /> : <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />}
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-start">
                                                        <p className={`font-bold ${index === 0 ? 'text-primary' : 'text-foreground/80'}`}>{event.statusLabel}</p>
                                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {new Date(event.eventDatetime).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground pb-1">
                                                        {new Date(event.eventDatetime).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                                                    </p>
                                                    {event.description && <p className="text-sm text-muted-foreground leading-snug">{event.description}</p>}

                                                    {/* Embedded POD Image */}
                                                    {getPodPhotoUrls(event).length > 0 && (
                                                        <div className="mt-3 animate-fade-in">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[420px]">
                                                                {getPodPhotoUrls(event).map((photoUrl, photoIndex) => (
                                                                    <div key={photoUrl} className="relative group/image overflow-hidden rounded-lg border border-border">
                                                                        <img
                                                                            src={photoUrl}
                                                                            alt={`POD ${photoIndex + 1}`}
                                                                            className="w-full h-auto object-cover transition-transform duration-500 group-hover/image:scale-105 cursor-zoom-in"
                                                                            onClick={() => window.open(photoUrl, '_blank')}
                                                                        />
                                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                                            <span className="text-xs text-white font-medium">View Full</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-4">No events yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

