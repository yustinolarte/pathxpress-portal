
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, MapPin, Phone, User, Package, Calendar, Truck, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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
            <DialogContent className="glass-strong w-[90vw] max-w-[1200px] max-h-[95vh] overflow-y-auto p-0 gap-0 border-white/10">
                {/* Decorative Top Line */}
                <div className="w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-red-600" />

                <div className="p-6 space-y-8">
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" /> Waybill Number
                            </p>
                            <h2 className="text-4xl font-mono font-bold tracking-tight text-white">
                                {order.waybillNumber}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Created on {new Date(order.createdAt).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className={`px-4 py-2 rounded-full border ${order.status === 'delivered' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                                order.status === 'cancelled' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                    'bg-blue-500/10 border-blue-500/20 text-blue-500'
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                                <Truck className="w-4 h-4" />
                                <span className="text-xs uppercase font-bold">Service</span>
                            </div>
                            <p className="text-2xl font-semibold">{order.serviceType}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                                <Package className="w-4 h-4" />
                                <span className="text-xs uppercase font-bold">Pieces</span>
                            </div>
                            <p className="text-2xl font-semibold">{order.pieces}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                                <Scale className="w-4 h-4" />
                                <span className="text-xs uppercase font-bold">Weight</span>
                            </div>
                            <p className="text-2xl font-semibold">{order.weight} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                            <div className="flex items-center gap-2 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                                <CreditCard className="w-4 h-4" />
                                <span className="text-xs uppercase font-bold">COD Amount</span>
                            </div>
                            <p className="text-2xl font-semibold">
                                {order.codRequired ? `${order.codAmount} ${order.codCurrency || 'AED'}` : 'N/A'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Addresses Column */}
                        <div className="space-y-6 lg:col-span-2">
                            <div className="grid md:grid-cols-2 gap-6 p-6 rounded-2xl bg-white/5 border border-white/10">
                                {/* Sender */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-4">
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
                                        </div>
                                        <span className="text-sm font-bold uppercase tracking-wider">Pickup From</span>
                                    </div>
                                    <div className="pl-10 space-y-1">
                                        <p className="text-lg font-semibold text-white">{clientName}</p>
                                        <p className="text-muted-foreground leading-relaxed">Merchant Account</p>
                                        {clients?.find(c => c.id === order.clientId)?.notes && (
                                            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                <p className="text-xs text-amber-500 font-medium flex items-center gap-1.5">
                                                    <AlertCircle className="w-3 h-3" /> Note: {clients.find(c => c.id === order.clientId)?.notes}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Receiver */}
                                <div className="space-y-3 relative">
                                    <div className="absolute left-[-12px] top-10 bottom-10 w-[1px] bg-white/10 hidden md:block" />
                                    <div className="flex items-center gap-2 text-primary mb-4">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                            <MapPin className="w-4 h-4 text-primary" />
                                        </div>
                                        <span className="text-sm font-bold uppercase tracking-wider">Deliver To</span>
                                    </div>
                                    <div className="pl-10 space-y-1">
                                        <p className="text-lg font-semibold text-white">{order.customerName}</p>
                                        <p className="text-lg text-white/90 leading-relaxed font-medium">{order.address}</p>
                                        <p className="text-muted-foreground">{order.city}, {order.destinationCountry}</p>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Badge variant="secondary" className="font-mono bg-white/10 hover:bg-white/20">{order.customerPhone}</Badge>
                                            <a href={`tel:${order.customerPhone}`} className="text-xs text-primary hover:underline">Call now</a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timeline Column */}
                        <div className="lg:col-span-1">
                            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 h-full">
                                <h3 className="text-lg font-bold flex items-center gap-2 mb-6 text-white">
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
                                                <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-[#0f1115] transition-transform group-hover:scale-110 ${index === 0 ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {index === 0 ? <Truck className="w-4 h-4 text-primary-foreground" /> : <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />}
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-start">
                                                        <p className={`font-bold ${index === 0 ? 'text-primary' : 'text-white/80'}`}>{event.statusLabel}</p>
                                                        <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
                                                            {new Date(event.eventDatetime).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground pb-1">
                                                        {new Date(event.eventDatetime).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                                                    </p>
                                                    {event.description && <p className="text-sm text-muted-foreground leading-snug">{event.description}</p>}

                                                    {/* Embedded POD Image */}
                                                    {event.podFileUrl && (
                                                        <div className="mt-3 animate-fade-in">
                                                            <div className="relative group/image overflow-hidden rounded-lg border border-white/10 max-w-[200px]">
                                                                <img
                                                                    src={event.podFileUrl}
                                                                    alt="POD"
                                                                    className="w-full h-auto object-cover transition-transform duration-500 group-hover/image:scale-105 cursor-zoom-in"
                                                                    onClick={() => window.open(event.podFileUrl, '_blank')}
                                                                />
                                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                                    <span className="text-xs text-white font-medium">View Full</span>
                                                                </div>
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
