import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Globe, Package, MapPin, FileText, Loader2, Scale, Hash, User, Phone, Ruler, Plane } from 'lucide-react';

interface EditIntlOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  countries: string[];
  onSuccess: () => void;
}

const SERVICE_TYPES = [
  { value: 'PRIME_EXPRESS', label: 'PRIME Express' },
  { value: 'PRIME_TRACKED', label: 'PRIME Tracked' },
  { value: 'PRIME_REGISTERED_POD', label: 'PRIME Registered POD' },
  { value: 'GCC', label: 'GCC' },
  { value: 'PREMIUM_EXPORT', label: 'Premium Export' },
];

const CURRENCIES = ['USD', 'AED', 'EUR', 'GBP', 'SAR'];

const buildFormData = (order: any) => ({
  serviceType: order?.serviceType || 'PRIME_EXPRESS',
  weight: order?.weight || '',
  pieces: order?.pieces || 1,
  length: order?.length || '',
  width: order?.width || '',
  height: order?.height || '',
  customerName: order?.customerName || '',
  customerPhone: order?.customerPhone || '',
  address: order?.address || '',
  city: order?.city || '',
  postalCode: order?.postalCode || '',
  destinationCountry: order?.destinationCountry || '',
  customsValue: order?.customsValue || '',
  customsCurrency: order?.customsCurrency || 'USD',
  customsDescription: order?.customsDescription || '',
  hsCode: order?.hsCode || '',
  specialInstructions: order?.specialInstructions || '',
});

export default function EditIntlOrderDialog({ open, onOpenChange, order, countries, onSuccess }: EditIntlOrderDialogProps) {
  const [formData, setFormData] = useState(buildFormData(order));
  const [originalData, setOriginalData] = useState<typeof formData | null>(null);
  const [countrySearch, setCountrySearch] = useState('');

  useEffect(() => {
    if (order && open) {
      const data = buildFormData(order);
      setFormData(data);
      setOriginalData(data);
      setCountrySearch('');
    }
  }, [order, open]);

  const updateOrderMutation = trpc.portal.admin.updateOrder.useMutation({
    onSuccess: () => { toast.success('Order updated successfully'); onSuccess(); onOpenChange(false); },
    onError: (error) => { toast.error(error.message || 'Failed to update order'); },
  });

  const handleSubmit = async () => {
    if (!order || !originalData) return;
    const updates: Record<string, any> = {};
    (Object.keys(formData) as (keyof typeof formData)[]).forEach((key) => {
      if (formData[key] !== originalData[key]) updates[key] = formData[key];
    });

    if (Object.keys(updates).length === 0) { toast.info('No changes detected'); return; }
    await updateOrderMutation.mutateAsync({ orderId: order.id, updates });
  };

  const hasChanges = originalData && JSON.stringify(formData) !== JSON.stringify(originalData);
  if (!order) return null;

  const filteredCountries = countries.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border !w-[95vw] !max-w-[1200px] max-h-[95vh] overflow-y-auto p-0 gap-0"
      >
        <div className="w-full h-1.5 bg-primary" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <Globe className="w-6 h-6 text-primary" />
                Edit International Order
                <span className="font-mono text-muted-foreground">{order.waybillNumber}</span>
              </DialogTitle>
              <span className={`badge2 ${order.status === 'delivered' ? 'b-green' : order.status === 'returned_to_sender' || order.status === 'customs_held' ? 'b-red' : 'b-blue'} uppercase`}>
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-5">
            {/* COL 1: Shipment */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-white/5 border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-[var(--st-blue)]" /> Service
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Service Type</Label>
                    <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                      <SelectTrigger className="bg-white/5 border-border h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_TYPES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Ruler className="w-3 h-3" /> Dimensions (cm)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" placeholder="L" value={formData.length} onChange={(e) => setFormData({ ...formData, length: e.target.value })} className="bg-white/5 border-border h-10" />
                      <Input type="number" placeholder="W" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} className="bg-white/5 border-border h-10" />
                      <Input type="number" placeholder="H" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} className="bg-white/5 border-border h-10" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Special Instructions
                </h3>
                <Textarea value={formData.specialInstructions} onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })} rows={5} placeholder="Instructions for handling/delivery..." className="bg-white/5 border-border resize-none" />
              </div>
            </div>

            {/* COL 2: Consignee */}
            <div className="p-4 rounded-lg bg-white/5 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--st-green)]" /> Consignee (Delivery To)
              </h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><User className="w-3 h-3" /> Customer Name</Label>
                  <Input value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} className="bg-white/5 border-border h-10" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</Label>
                  <Input value={formData.customerPhone} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} className="bg-white/5 border-border h-10" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery Address</Label>
                  <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={3} className="bg-white/5 border-border resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">City</Label>
                    <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="bg-white/5 border-border h-10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Postal Code</Label>
                    <Input value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} className="bg-white/5 border-border h-10" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Destination Country</Label>
                  <Select value={formData.destinationCountry} onValueChange={(val) => setFormData({ ...formData, destinationCountry: val })}>
                    <SelectTrigger className="bg-white/5 border-border h-10"><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <div className="p-2 sticky top-0 bg-popover z-10 relative border-b border-border">
                        <Input placeholder="Search..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="h-8" />
                      </div>
                      {filteredCountries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* COL 3: Customs */}
            <div className="p-4 rounded-lg bg-white/5 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--st-amber)]" /> Customs Declaration
              </h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Declared Value</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" step="0.01" min="0" value={formData.customsValue} onChange={(e) => setFormData({ ...formData, customsValue: e.target.value })} placeholder="0.00" className="bg-white/5 border-border h-10 font-mono" />
                    <Select value={formData.customsCurrency} onValueChange={(val) => setFormData({ ...formData, customsCurrency: val })}>
                      <SelectTrigger className="bg-white/5 border-border h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">HS Code</Label>
                  <Input value={formData.hsCode} onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })} placeholder="e.g. 6110.20" className="bg-white/5 border-border h-10" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Goods Description</Label>
                  <Textarea value={formData.customsDescription} onChange={(e) => setFormData({ ...formData, customsDescription: e.target.value })} rows={5} placeholder="Describe the contents of the shipment..." className="bg-white/5 border-border resize-none" />
                </div>
              </div>
            </div>
          </div>

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
