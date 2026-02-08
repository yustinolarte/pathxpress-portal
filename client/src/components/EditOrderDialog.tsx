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
import { Package, Truck, CreditCard, MapPin, FileText, AlertTriangle, Loader2, Scale, Hash, User, Phone, Building2 } from 'lucide-react';

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  token: string;
  onSuccess: () => void;
}

export default function EditOrderDialog({ open, onOpenChange, order, token, onSuccess }: EditOrderDialogProps) {
  const [formData, setFormData] = useState({
    serviceType: 'DOM', weight: '', pieces: 1, codRequired: 0, codAmount: '', codCurrency: 'AED',
    customerName: '', customerPhone: '', address: '', city: '', specialInstructions: '', fitOnDelivery: 0,
  });
  const [originalData, setOriginalData] = useState<typeof formData | null>(null);

  useEffect(() => {
    if (order && open) {
      const data = {
        serviceType: order.serviceType || 'DOM', weight: order.weight || '', pieces: order.pieces || 1,
        codRequired: order.codRequired || 0, codAmount: order.codAmount || '', codCurrency: order.codCurrency || 'AED',
        customerName: order.customerName || '', customerPhone: order.customerPhone || '',
        address: order.address || '', city: order.city || '',
        specialInstructions: order.specialInstructions || '', fitOnDelivery: order.fitOnDelivery || 0,
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
    if (formData.customerName !== originalData?.customerName) updates.customerName = formData.customerName;
    if (formData.customerPhone !== originalData?.customerPhone) updates.customerPhone = formData.customerPhone;
    if (formData.address !== originalData?.address) updates.address = formData.address;
    if (formData.city !== originalData?.city) updates.city = formData.city;
    if (formData.specialInstructions !== originalData?.specialInstructions) updates.specialInstructions = formData.specialInstructions;
    if (formData.fitOnDelivery !== originalData?.fitOnDelivery) updates.fitOnDelivery = formData.fitOnDelivery;
    if (Object.keys(updates).length === 0) { toast.info('No changes detected'); return; }
    await updateOrderMutation.mutateAsync({ token, orderId: order.id, updates });
  };

  const hasChanges = originalData && JSON.stringify(formData) !== JSON.stringify(originalData);
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong !w-[95vw] !max-w-[1200px] p-0 gap-0 border-white/10">
        <div className="w-full h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
        <div className="p-6">
          {/* Header */}
          <DialogHeader className="mb-5">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <Package className="w-6 h-6 text-primary" />
                Edit Order
                <span className="font-mono text-muted-foreground">{order.waybillNumber}</span>
              </DialogTitle>
              <Badge className={`${order.status === 'delivered' ? 'bg-green-500/20 text-green-400' : order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'} text-sm uppercase px-3 py-1`} variant="outline">
                {order.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </DialogHeader>

          {/* 3 Column Layout */}
          <div className="grid grid-cols-3 gap-5">
            {/* COL 1: Shipment + COD */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-400" /> Shipment
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Service Type</Label>
                    <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOM">🚚 DOM (Next Day)</SelectItem>
                        <SelectItem value="SDD">⚡ SDD (Same Day)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Scale className="w-3 h-3" /> Weight (kg)</Label>
                      <Input type="number" step="0.1" min="0" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className="bg-white/5 border-white/10 h-10" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Pieces</Label>
                      <Input type="number" min="1" value={formData.pieces} onChange={(e) => setFormData({ ...formData, pieces: parseInt(e.target.value) || 1 })} className="bg-white/5 border-white/10 h-10" />
                    </div>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${formData.codRequired === 1 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-orange-400" /> Cash on Delivery</h3>
                  <Switch checked={formData.codRequired === 1} onCheckedChange={(checked) => setFormData({ ...formData, codRequired: checked ? 1 : 0 })} />
                </div>
                {formData.codRequired === 1 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Amount</Label>
                      <Input type="number" step="0.01" min="0" value={formData.codAmount} onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })} placeholder="0.00" className="bg-orange-500/5 border-orange-500/20 h-10" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Currency</Label>
                      <Select value={formData.codCurrency} onValueChange={(val) => setFormData({ ...formData, codCurrency: val })}>
                        <SelectTrigger className="bg-orange-500/5 border-orange-500/20 h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {originalData && formData.codRequired !== originalData.codRequired && (
                  <div className="flex items-center gap-2 mt-4 p-2.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <p className="text-xs text-yellow-400">{formData.codRequired === 1 ? 'Will create COD record' : 'Will cancel COD record'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* COL 2: Delivery */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-400" /> Delivery Information
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><User className="w-3 h-3" /> Customer Name</Label>
                    <Input value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} className="bg-white/5 border-white/10 h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</Label>
                    <Input value={formData.customerPhone} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} className="bg-white/5 border-white/10 h-10" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery Address</Label>
                  <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={4} className="bg-white/5 border-white/10 resize-none" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="bg-white/5 border-white/10 h-10" />
                </div>
              </div>
            </div>

            {/* COL 3: Special */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> Special Options
              </h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Special Instructions</Label>
                  <Textarea value={formData.specialInstructions} onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })} rows={5} placeholder="Instructions for the driver..." className="bg-white/5 border-white/10 resize-none" />
                </div>
                <div className={`p-4 rounded-lg border flex items-center justify-between ${formData.fitOnDelivery === 1 ? 'bg-purple-500/10 border-purple-500/20' : 'bg-white/5 border-white/10'}`}>
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
          <DialogFooter className="mt-6 pt-4 border-t border-white/10">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!hasChanges || updateOrderMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateOrderMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
