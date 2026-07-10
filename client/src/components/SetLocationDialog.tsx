/**
 * SetLocationDialog — quick "Ubicar" pin dialog for orders without (or with
 * wrong) coordinates. Wraps LocationPicker; saving marks the location 'exact'.
 */
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';
import { toast } from 'sonner';
import { Loader2, MapPin, MessageCircle } from 'lucide-react';

export interface SetLocationOrder {
    id: number;
    waybillNumber?: string | null;
    customerName?: string | null;
    address?: string | null;
    city?: string | null;
    emirate?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    locationAccuracy?: string | null;
}

interface SetLocationDialogProps {
    order: SetLocationOrder | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a successful save so the caller can refetch. */
    onSaved?: () => void;
}

export default function SetLocationDialog({ order, open, onOpenChange, onSaved }: SetLocationDialogProps) {
    const [picked, setPicked] = useState<PickedLocation | null>(null);

    // Reset the pin state whenever a different order is opened.
    useEffect(() => { setPicked(null); }, [order?.id, open]);

    const { data: geoCaps } = trpc.portal.drivers.getGeoCapabilities.useQuery(undefined, {
        enabled: open,
        staleTime: 5 * 60 * 1000,
    });

    const setLocationMutation = trpc.portal.drivers.setOrderLocation.useMutation({
        onSuccess: () => {
            toast.success('Ubicación guardada');
            onSaved?.();
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message || 'No se pudo guardar la ubicación'),
    });

    const requestBotMutation = trpc.portal.drivers.requestLocationViaBot.useMutation({
        onSuccess: (res) => {
            if (res.sent) toast.success('Solicitud de ubicación enviada por WhatsApp');
            else toast.error('Bot de ubicación no configurado');
        },
        onError: (e) => toast.error(e.message || 'No se pudo contactar al bot'),
    });

    if (!order) return null;

    const initialLocation = order.latitude && order.longitude
        ? { lat: parseFloat(order.latitude), lng: parseFloat(order.longitude) }
        : undefined;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-lg"
                onInteractOutside={(e) => {
                    // El dropdown de Google Places (.pac-container) vive fuera del
                    // diálogo — sin esto, elegir una sugerencia cierra el diálogo.
                    if ((e.target as HTMLElement)?.closest?.('.pac-container')) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        Ubicar pedido {order.waybillNumber || `#${order.id}`}
                    </DialogTitle>
                    <DialogDescription>
                        Busca la dirección o coloca el pin en el mapa. La ubicación guardada se marca como exacta.
                    </DialogDescription>
                </DialogHeader>

                {/* Written address as context for placing the pin */}
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <p className="font-medium">{order.customerName}</p>
                    <p className="text-muted-foreground">
                        {[order.address, order.city, order.emirate].filter(Boolean).join(', ')}
                    </p>
                </div>

                <LocationPicker
                    onLocationPicked={setPicked}
                    initialLocation={initialLocation}
                />

                <DialogFooter className="gap-2 sm:gap-0">
                    {geoCaps?.locationBot && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={requestBotMutation.isPending}
                            onClick={() => requestBotMutation.mutate({ orderId: order.id })}
                            title="Pide al cliente su ubicación por WhatsApp"
                        >
                            {requestBotMutation.isPending
                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                : <MessageCircle className="w-3.5 h-3.5 mr-1.5" />}
                            Pedir por WhatsApp
                        </Button>
                    )}
                    <Button
                        type="button"
                        disabled={!picked || setLocationMutation.isPending}
                        onClick={() => picked && setLocationMutation.mutate({
                            orderId: order.id,
                            latitude: picked.latitude,
                            longitude: picked.longitude,
                        })}
                    >
                        {setLocationMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Guardar ubicación
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
