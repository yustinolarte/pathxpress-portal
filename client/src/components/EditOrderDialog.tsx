import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Package, Truck, CreditCard, MapPin, FileText, AlertTriangle, Loader2, Scale, Hash, User, Phone, Building2, CalendarClock, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  onSuccess: () => void;
}

export default function EditOrderDialog({ open, onOpenChange, order, onSuccess }: EditOrderDialogProps) {
  const [formData, setFormData] = useState({
    serviceType: 'DOM', weight: '', pieces: 1, codRequired: 0, codAmount: '', codCurrency: 'AED',
    codPaymentMethod: 'cash' as 'cash' | 'card' | 'any',
    customerName: '', customerPhone: '', address: '', city: '', specialInstructions: '', fitOnDelivery: 0,
    preferredDeliveryDate: '', preferredDeliveryTime: '',
  });
  const [originalData, setOriginalData] = useState<typeof formData | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);

  useEffect(() => {
    if (order && open) {
      setShowMap(false);
      setPickedLocation(null);
      const data = {
        serviceType: order.serviceType || 'DOM', weight: order.weight || '', pieces: order.pieces || 1,
        codRequired: order.codRequired || 0, codAmount: order.codAmount || '', codCurrency: order.codCurrency || 'AED',
        codPaymentMethod: (order.codPaymentMethod || 'cash') as 'cash' | 'card' | 'any',
        customerName: order.customerName || '', customerPhone: order.customerPhone || '',
        address: order.address || '', city: order.city || '',
        specialInstructions: order.specialInstructions || '', fitOnDelivery: order.fitOnDelivery || 0,
        preferredDeliveryDate: order.preferredDeliveryDate || '', preferredDeliveryTime: order.preferredDeliveryTime || '',
      };
      setFormData(data);
      setOriginalData(data);
    }
  }, [order, open]);

  const updateOrderMutation = trpc.portal.admin.updateOrder.useMutation({
    onSuccess: () => { toast.success('Order updated successfully'); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(error.message || 'Failed to update order'); },
  });

  const handleSubmit = async () => {
    if (!order) return;
    const updates: Record<string, any> = {};
    if (formData.serviceType !== originalData?.serviceType) updates.serviceType = formData.serviceType;
    if (formData.weight !== originalData?.weight) updates.weight = formData.weight;
    if (formData.pieces !== originalData?.pieces) updates.pieces = formData.pieces;
    if (formData.codRequired !== originalData?.codRequired) updates.codRequired = formData.codRequired;
    if (formData.codAmount !== originalData?.codAmount) updates.codAmount = formData.codAmount;
    if (formData.codCurrency !== originalData?.codCurrency) updates.codCurrency = formData.codCurrency;
    if (formData.codPaymentMethod !== originalData?.codPaymentMethod) updates.codPaymentMethod = formData.codPaymentMethod;
    if (formData.customerName !== originalData?.customerName) updates.customerName = formData.customerName;
    if (formData.customerPhone !== originalData?.customerPhone) updates.customerPhone = formData.customerPhone;
    if (formData.address !== originalData?.address) updates.address = formData.address;
    if (formData.city !== originalData?.city) updates.city = formData.city;
    if (formData.specialInstructions !== originalData?.specialInstructions) updates.specialInstructions = formData.specialInstructions;
    if (formData.fitOnDelivery !== originalData?.fitOnDelivery) updates.fitOnDelivery = formData.fitOnDelivery;
    if (pickedLocation) {
      updates.latitude = pickedLocation.latitude;
      updates.longitude = pickedLocation.longitude;
    }

    const isPreferred = formData.serviceType === 'PREFERRED_TIME' || formData.serviceType === 'PREFERRED_TIME_SDD';
    if (isPreferred) {
      if (!formData.preferredDeliveryDate || !formData.preferredDeliveryTime) {
        toast.error('Please select a preferred delivery date and time');
        return;
      }
      if (formData.preferredDeliveryDate !== originalData?.preferredDeliveryDate) updates.preferredDeliveryDate = formData.preferredDeliveryDate;
      if (formData.preferredDeliveryTime !== originalData?.preferredDeliveryTime) updates.preferredDeliveryTime = formData.preferredDeliveryTime;
    } else if (originalData?.preferredDeliveryDate || originalData?.preferredDeliveryTime) {
      // Switched away from a preferred-time service: clear the schedule
      updates.preferredDeliveryDate = null;
      updates.preferredDeliveryTime = null;
    }

    if (Object.keys(updates).length === 0) { toast.info('No changes detected'); return; }
    await updateOrderMutation.mutateAsync({ orderId: order.id, updates });
  };

  const hasChanges = (originalData && JSON.stringify(formData) !== JSON.stringify(originalData)) || pickedLocation !== null;
  if (!order) return null;

  const accuracy: string = order.locationAccuracy
    ?? (order.latitude && order.longitude ? 'exact' : 'none');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border !w-[95vw] !max-w-[1200px] p-0 gap-0 "
        onInteractOutside={(e) => {
          // El dropdown de Google Places (.pac-container) vive fuera del
          // diálogo — sin esto, elegir una sugerencia cierra el diálogo.
          if ((e.target as HTMLElement)?.closest?.('.pac-container')) {
            e.preventDefault();
          }
        }}
      >
        <div className="w-full h-1.5 bg-primary" />
        <div className="p-6">
          {/* Header */}
          <DialogHeader className="mb-5">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <Package className="w-6 h-6 text-primary" />
                Edit Order
                <span className="font-mono text-muted-foreground">{order.waybillNumber}</span>
              </DialogTitle>
              <span className={`badge2 ${order.status === 'delivered' ? 'b-green' : order.status === 'cancelled' ? 'b-red' : 'b-blue'} uppercase`}>
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
          </DialogHeader>

          {/* 3 Column Layout */}
          <div className="grid grid-cols-3 gap-5">
            {/* COL 1: Shipment + COD */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[var(--st-blue)]" /> Shipment
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Service Type</Label>
                    <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                      <SelectTrigger className="bg-white/5 border-border h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOM">🚚 DOM (Next Day)</SelectItem>
                        <SelectItem value="SDD">⚡ SDD (Same Day)</SelectItem>
                        <SelectItem value="BULLET" className="text-red-500 font-medium">🚀 BULLET (4 Hours)</SelectItem>
                        <SelectItem value="EXPRESS_ZONE2">🌍 EXP2 (Express – Zone 2)</SelectItem>
                        <SelectItem value="PREFERRED_TIME">📅 PREF (Next Day Preferred Time)</SelectItem>
                        <SelectItem value="PREFERRED_TIME_SDD">🕒 PREF-SD (Same Day Preferred Time)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(formData.serviceType === 'PREFERRED_TIME' || formData.serviceType === 'PREFERRED_TIME_SDD') && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--st-amber-bg)] border border-[var(--st-amber)]/25">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Preferred Date</Label>
                        <Input type="date" value={formData.preferredDeliveryDate} onChange={(e) => setFormData({ ...formData, preferredDeliveryDate: e.target.value })} className="bg-white/5 border-border h-10" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Preferred Time</Label>
                        <Input type="time" value={formData.preferredDeliveryTime} onChange={(e) => setFormData({ ...formData, preferredDeliveryTime: e.target.value })} className="bg-white/5 border-border h-10" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Scale className="w-3 h-3" /> Weight (kg)</Label>
                      <Input type="number" step="0.1" min="0" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className="bg-white/5 border-border h-10" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Pieces</Label>
                      <Input type="number" min="1" value={formData.pieces} onChange={(e) => setFormData({ ...formData, pieces: parseInt(e.target.value) || 1 })} className="bg-white/5 border-border h-10" />
                    </div>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${formData.codRequired === 1 ? 'bg-[var(--st-amber-bg)] border-[var(--st-amber)]/25' : 'bg-white/5 border-border'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><CreditCard className="w-4 h-4 text-[var(--st-amber)]" /> Cash on Delivery</h3>
                  <Switch checked={formData.codRequired === 1} onCheckedChange={(checked) => setFormData({ ...formData, codRequired: checked ? 1 : 0 })} />
                </div>
                {formData.codRequired === 1 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Amount</Label>
                        <Input type="number" step="0.01" min="0" value={formData.codAmount} onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })} placeholder="0.00" className="bg-background border-border h-10 font-mono" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Currency</Label>
                        <Select value={formData.codCurrency} onValueChange={(val) => setFormData({ ...formData, codCurrency: val })}>
                          <SelectTrigger className="bg-background border-border h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AED">AED</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Payment Method</Label>
                      <Select value={formData.codPaymentMethod} onValueChange={(val: 'cash' | 'card' | 'any') => setFormData({ ...formData, codPaymentMethod: val })}>
                        <SelectTrigger className="bg-background border-border h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash only</SelectItem>
                          <SelectItem value="card">Card only (Tap to Pay)</SelectItem>
                          <SelectItem value="any">Cash or Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {originalData && formData.codRequired !== originalData.codRequired && (
                  <div className="flex items-center gap-2 mt-4 p-2.5 rounded bg-[var(--st-amber-bg)] border border-[var(--st-amber)]/25">
                    <AlertTriangle className="w-4 h-4 text-[var(--st-amber)]" />
                    <p className="text-xs text-[var(--st-amber)]">{formData.codRequired === 1 ? 'Will create COD record' : 'Will cancel COD record'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* COL 2: Delivery */}
            <div className="p-4 rounded-lg bg-white/5 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--st-green)]" /> Delivery Information
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><User className="w-3 h-3" /> Customer Name</Label>
                    <Input value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} className="bg-white/5 border-border h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</Label>
                    <Input value={formData.customerPhone} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} className="bg-white/5 border-border h-10" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery Address</Label>
                  <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={4} className="bg-white/5 border-border resize-none" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="bg-white/5 border-border h-10" />
                </div>

                {/* Ubicación en el mapa — corrige el pin del pedido */}
                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`badge2 ${accuracy === 'exact' ? 'b-green' : accuracy === 'approximate' ? 'b-amber' : 'b-red'}`}>
                      {accuracy === 'exact' ? 'Ubicación exacta' : accuracy === 'approximate' ? 'Ubicación aproximada' : 'Sin ubicación'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMap(v => !v)}
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {showMap ? <><ChevronUp className="w-3 h-3" /> Ocultar mapa</> : <><MapPin className="w-3 h-3" /> Corregir ubicación</>}
                    </button>
                  </div>
                  {showMap && (
                    <LocationPicker
                      onLocationPicked={setPickedLocation}
                      initialLocation={order.latitude && order.longitude
                        ? { lat: parseFloat(order.latitude), lng: parseFloat(order.longitude) }
                        : undefined}
                    />
                  )}
                  {pickedLocation && (
                    <p className="text-xs text-[var(--st-green)]">
                      Nuevo pin listo — se guardará como ubicación exacta al guardar cambios.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* COL 3: Special */}
            <div className="p-4 rounded-lg bg-white/5 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Special Options
              </h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Special Instructions</Label>
                  <Textarea value={formData.specialInstructions} onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })} rows={5} placeholder="Instructions for the driver..." className="bg-white/5 border-border resize-none" />
                </div>
                <div className={`p-4 rounded-lg border flex items-center justify-between ${formData.fitOnDelivery === 1 ? 'bg-[var(--st-blue-bg)] border-[var(--st-blue)]/25' : 'bg-white/5 border-border'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">👗</span>
                    <div>
                      <p className="text-sm font-medium">Fit on Delivery</p>
                      <p className="text-xs text-muted-foreground">Allow customer to try items</p>
                    </div>
                  </div>
                  <Switch checked={formData.fitOnDelivery === 1} onCheckedChange={(checked) => setFormData({ ...formData, fitOnDelivery: checked ? 1 : 0 })} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="mt-6 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!hasChanges || updateOrderMutation.isPending}>
              {updateOrderMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

