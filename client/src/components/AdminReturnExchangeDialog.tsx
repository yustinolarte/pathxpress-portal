import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RotateCcw, ArrowLeftRight, Search, X } from 'lucide-react';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';
import { DOMESTIC_SERVICE_TYPES, DEFAULT_PREFERRED_SLOTS, isPreferredTimeService, isSameDayPreferredService, todayStr, tomorrowStr } from '@/const';

interface AdminClient {
    id: number;
    companyName: string;
    codAllowed?: number;
}

const UAE_CITIES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'];

const PHONE_PREFIXES = ['+971', '+966', '+965', '+973', '+968', '+974'];

function splitPhone(phone: string): { prefix: string; number: string } {
    const match = (phone || '').match(/^(\+\d+)\s*(.*)$/);
    if (match) return { prefix: match[1], number: match[2] };
    return { prefix: '+971', number: phone || '' };
}

interface AdminReturnExchangeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When set, creates a return/exchange for this existing order (client + waybill already known). */
    order?: any;
    /** Needed for manual creation, where the admin picks the client first. */
    clients?: AdminClient[];
    onSuccess: () => void;
}

const emptyManualForm = {
    clientId: '',
    type: 'return' as 'return' | 'exchange',
    pickupName: '', pickupPhonePrefix: '+971', pickupPhone: '',
    pickupAddress: '', pickupCity: '', pickupCountry: 'UAE',
    deliveryName: '', deliveryPhonePrefix: '+971', deliveryPhone: '',
    deliveryAddress: '', deliveryCity: '', deliveryCountry: 'UAE',
    pieces: 1, weight: '', serviceType: 'DOM', specialInstructions: '',
    preferredDate: '', preferredTime: '',
    exchangeCustomerName: '', exchangeCustomerPhonePrefix: '+971', exchangeCustomerPhone: '',
    exchangeAddress: '', exchangeCity: '', exchangePieces: 1, exchangeWeight: '',
    exchangeCodRequired: 0, exchangeCodAmount: '', exchangeCodCurrency: 'AED',
};

export default function AdminReturnExchangeDialog({ open, onOpenChange, order, clients, onSuccess }: AdminReturnExchangeDialogProps) {
    const mode: 'fromOrder' | 'manual' = order ? 'fromOrder' : 'manual';

    const [createType, setCreateType] = useState<'return' | 'exchange'>('return');
    const [exchangeForm, setExchangeForm] = useState({
        customerName: '', customerPhonePrefix: '+971', customerPhone: '',
        address: '', city: '', destinationCountry: 'UAE',
        pieces: 1, weight: '', serviceType: 'DOM', specialInstructions: '',
        codRequired: 0, codAmount: '', codCurrency: 'AED',
    });
    const [pickedLocationExchange, setPickedLocationExchange] = useState<PickedLocation | null>(null);
    const [exchangeLocationError, setExchangeLocationError] = useState(false);

    const [manualForm, setManualForm] = useState(emptyManualForm);
    const [pickedLocationManual, setPickedLocationManual] = useState<PickedLocation | null>(null);
    const [manualLocationError, setManualLocationError] = useState(false);

    const [waybillQuery, setWaybillQuery] = useState('');
    const [waybillResults, setWaybillResults] = useState<any[]>([]);
    const [waybillSearching, setWaybillSearching] = useState(false);
    const [waybillDropdownOpen, setWaybillDropdownOpen] = useState(false);
    const [loadedSourceOrder, setLoadedSourceOrder] = useState<any | null>(null);

    const utils = trpc.useUtils();

    useEffect(() => {
        if (!open) return;
        setCreateType('return');
        setExchangeForm({
            customerName: '', customerPhonePrefix: '+971', customerPhone: '',
            address: '', city: '', destinationCountry: 'UAE',
            pieces: 1, weight: '', serviceType: 'DOM', specialInstructions: '',
            codRequired: 0, codAmount: '', codCurrency: 'AED',
        });
        setPickedLocationExchange(null);
        setExchangeLocationError(false);
        setManualForm(emptyManualForm);
        setPickedLocationManual(null);
        setManualLocationError(false);
        setWaybillQuery('');
        setWaybillResults([]);
        setWaybillDropdownOpen(false);
        setLoadedSourceOrder(null);
    }, [open, order?.id]);

    // Live search for an existing waybill so its details can be loaded into the manual form.
    useEffect(() => {
        if (mode !== 'manual' || !open) return;
        const term = waybillQuery.trim();
        if (term.length < 2 || (loadedSourceOrder && term === loadedSourceOrder.waybillNumber)) {
            setWaybillResults([]);
            return;
        }
        setWaybillSearching(true);
        const handle = setTimeout(() => {
            utils.portal.admin.searchOrders.fetch({ term, standardOnly: true })
                .then((results: any[]) => setWaybillResults(results.filter((o) => !o.isReturn)))
                .catch(() => setWaybillResults([]))
                .finally(() => setWaybillSearching(false));
        }, 300);
        return () => clearTimeout(handle);
    }, [waybillQuery, mode, open]);

    function handleLoadSourceOrder(o: any) {
        const pickupPhone = splitPhone(o.customerPhone);
        const deliveryPhone = splitPhone(o.shipperPhone);
        setManualForm(prev => ({
            ...prev,
            clientId: o.clientId.toString(),
            pickupName: o.customerName || '',
            pickupPhonePrefix: pickupPhone.prefix,
            pickupPhone: pickupPhone.number,
            pickupAddress: o.address || '',
            pickupCity: o.city || '',
            pickupCountry: o.destinationCountry || 'UAE',
            deliveryName: o.shipperName || '',
            deliveryPhonePrefix: deliveryPhone.prefix,
            deliveryPhone: deliveryPhone.number,
            deliveryAddress: o.shipperAddress || '',
            deliveryCity: o.shipperCity || '',
            deliveryCountry: o.shipperCountry || 'UAE',
            pieces: o.pieces || 1,
            weight: o.weight != null ? String(o.weight) : prev.weight,
            serviceType: DOMESTIC_SERVICE_TYPES.some(s => s.code === o.serviceType) ? o.serviceType : prev.serviceType,
        }));
        setLoadedSourceOrder(o);
        setWaybillQuery(o.waybillNumber);
        setWaybillResults([]);
        setWaybillDropdownOpen(false);
        toast.success(`Loaded details from ${o.waybillNumber}`);
    }

    function handleClearSourceOrder() {
        setLoadedSourceOrder(null);
        setWaybillQuery('');
        setWaybillResults([]);
    }

    const selectedManualClient = clients?.find(c => c.id.toString() === manualForm.clientId);
    const codAllowedForOrder = clients?.find(c => c.id === order?.clientId)?.codAllowed === 1;

    const createReturnMutation = trpc.portal.admin.adminCreateReturnRequest.useMutation({
        onSuccess: (data) => { toast.success(data.message || 'Return created'); onOpenChange(false); onSuccess(); },
        onError: (error) => toast.error(error.message),
    });
    const createExchangeMutation = trpc.portal.admin.adminCreateExchangeRequest.useMutation({
        onSuccess: (data) => { toast.success(data.message || 'Exchange created'); onOpenChange(false); onSuccess(); },
        onError: (error) => toast.error(error.message),
    });
    const createManualMutation = trpc.portal.admin.adminCreateManualReturnExchange.useMutation({
        onSuccess: (data) => { toast.success(data.message || 'Created successfully'); onOpenChange(false); onSuccess(); },
        onError: (error) => toast.error(error.message),
    });

    function handleCreateFromOrder() {
        if (!order) return;
        if (createType === 'return') {
            createReturnMutation.mutate({ clientId: order.clientId, orderId: order.id });
            return;
        }
        if (!exchangeForm.customerName || !exchangeForm.customerPhone || !exchangeForm.address || !exchangeForm.city) {
            toast.error('Please fill in all required fields for the new shipment');
            return;
        }
        if (!pickedLocationExchange) {
            setExchangeLocationError(true);
            toast.error('Please place a map pin to confirm the delivery location.');
            return;
        }
        setExchangeLocationError(false);
        createExchangeMutation.mutate({
            clientId: order.clientId,
            orderId: order.id,
            newShipment: {
                ...exchangeForm,
                customerPhone: `${exchangeForm.customerPhonePrefix} ${exchangeForm.customerPhone}`,
                weight: parseFloat(exchangeForm.weight) || 0.5,
                codRequired: exchangeForm.codRequired,
                codAmount: exchangeForm.codRequired ? exchangeForm.codAmount : undefined,
                codCurrency: exchangeForm.codCurrency,
                latitude: pickedLocationExchange?.latitude,
                longitude: pickedLocationExchange?.longitude,
            },
        });
    }

    function handleCreateManual() {
        if (!manualForm.clientId) {
            toast.error('Please select a client');
            return;
        }
        if (!manualForm.pickupName || !manualForm.pickupPhone || !manualForm.pickupAddress || !manualForm.pickupCity) {
            toast.error('Please fill in pickup details');
            return;
        }
        if (!manualForm.deliveryName || !manualForm.deliveryPhone || !manualForm.deliveryAddress || !manualForm.deliveryCity) {
            toast.error('Please fill in delivery details');
            return;
        }
        if (manualForm.type === 'exchange') {
            if (!manualForm.exchangeCustomerName || !manualForm.exchangeCustomerPhone) {
                toast.error('Please fill in the exchange recipient name and phone');
                return;
            }
            if (!manualForm.exchangeAddress || !manualForm.exchangeCity) {
                toast.error('Please fill in the exchange shipment address and city');
                return;
            }
            if (manualForm.exchangeCodRequired && !manualForm.exchangeCodAmount) {
                toast.error('Please enter the COD amount for the exchange shipment');
                return;
            }
        }
        if (isPreferredTimeService(manualForm.serviceType) && (!manualForm.preferredDate || !manualForm.preferredTime)) {
            toast.error('Please select a preferred delivery date and time window');
            return;
        }
        if (!pickedLocationManual) {
            setManualLocationError(true);
            toast.error('Please place a map pin to confirm the pickup location.');
            return;
        }
        setManualLocationError(false);
        const isPreferred = isPreferredTimeService(manualForm.serviceType);
        createManualMutation.mutate({
            clientId: parseInt(manualForm.clientId),
            type: manualForm.type,
            sourceOrderId: loadedSourceOrder?.id,
            pickupName: manualForm.pickupName,
            pickupPhone: `${manualForm.pickupPhonePrefix} ${manualForm.pickupPhone}`,
            pickupAddress: manualForm.pickupAddress,
            pickupCity: manualForm.pickupCity,
            pickupCountry: manualForm.pickupCountry,
            deliveryName: manualForm.deliveryName,
            deliveryPhone: `${manualForm.deliveryPhonePrefix} ${manualForm.deliveryPhone}`,
            deliveryAddress: manualForm.deliveryAddress,
            deliveryCity: manualForm.deliveryCity,
            deliveryCountry: manualForm.deliveryCountry,
            pieces: manualForm.pieces,
            weight: parseFloat(manualForm.weight) || 0.5,
            serviceType: manualForm.serviceType,
            specialInstructions: manualForm.specialInstructions || undefined,
            preferredDeliveryDate: isPreferred ? manualForm.preferredDate : undefined,
            preferredDeliveryTime: isPreferred ? manualForm.preferredTime : undefined,
            exchangeCustomerName: manualForm.exchangeCustomerName || undefined,
            exchangeCustomerPhone: manualForm.exchangeCustomerPhone ? `${manualForm.exchangeCustomerPhonePrefix} ${manualForm.exchangeCustomerPhone}` : undefined,
            exchangeAddress: manualForm.exchangeAddress || undefined,
            exchangeCity: manualForm.exchangeCity || undefined,
            exchangePieces: manualForm.exchangePieces,
            exchangeWeight: parseFloat(manualForm.exchangeWeight) || 0.5,
            exchangeCodRequired: manualForm.exchangeCodRequired,
            exchangeCodAmount: manualForm.exchangeCodRequired ? manualForm.exchangeCodAmount : undefined,
            exchangeCodCurrency: manualForm.exchangeCodCurrency,
            latitude: pickedLocationManual?.latitude,
            longitude: pickedLocationManual?.longitude,
        });
    }

    const interactOutsideGuard = (e: Event) => {
        // El dropdown de Google Places (.pac-container) vive fuera del
        // diálogo — sin esto, elegir una sugerencia cierra el diálogo.
        if ((e.target as HTMLElement)?.closest?.('.pac-container')) {
            e.preventDefault();
        }
    };

    if (mode === 'fromOrder' && order) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="bg-background text-foreground !w-[98vw] !max-w-[1300px] p-0 gap-0 border-border max-h-[90vh] overflow-y-auto antialiased font-sans rounded-2xl shadow-xl"
                    onInteractOutside={interactOutsideGuard}
                >
                    <div className="p-6 md:p-8">
                        <DialogHeader className="mb-8 border-b border-border pb-4">
                            <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary text-3xl">
                                    {createType === 'return' ? 'keyboard_return' : 'swap_horiz'}
                                </span>
                                Create Return/Exchange (Admin) — {order.waybillNumber}
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground text-base mt-2">
                                On behalf of the client. The package will be picked up from the consignee and returned to the original shipper{createType === 'exchange' ? ', and a new shipment will be sent to the customer.' : '.'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex gap-4 mb-8">
                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors flex-1 ${createType === 'return' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={createType === 'return'} onChange={() => setCreateType('return')} />
                                <div className="ml-3 font-bold text-sm flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Return Only</div>
                            </label>
                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors flex-1 ${createType === 'exchange' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={createType === 'exchange'} onChange={() => setCreateType('exchange')} />
                                <div className="ml-3 font-bold text-sm flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Exchange</div>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">assignment_return</span>
                                        <h2 className="font-bold">Return Path</h2>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div>
                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Pickup From (Customer)</p>
                                            <p className="font-bold text-foreground">{order.customerName}</p>
                                            <p className="text-sm text-muted-foreground">{order.city}, {order.destinationCountry}</p>
                                        </div>
                                        <div className="h-px w-full bg-border"></div>
                                        <div>
                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Deliver To (Shipper)</p>
                                            <p className="font-bold text-foreground">{order.shipperName}</p>
                                            <p className="text-sm text-muted-foreground">{order.shipperCity}, {order.shipperCountry}</p>
                                        </div>
                                    </div>
                                </section>

                                {createType === 'exchange' && (
                                    <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">local_shipping</span>
                                            <h2 className="font-bold">New Shipment Details</h2>
                                        </div>
                                        <div className="p-6 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Customer Name</Label>
                                                    <Input value={exchangeForm.customerName} onChange={(e) => setExchangeForm({ ...exchangeForm, customerName: e.target.value })} placeholder="Name" className="bg-background border-border" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Phone</Label>
                                                    <div className="flex">
                                                        <select className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={exchangeForm.customerPhonePrefix} onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhonePrefix: e.target.value })}>
                                                            {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                                                        </select>
                                                        <Input value={exchangeForm.customerPhone} onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhone: e.target.value })} placeholder="Phone" className="bg-background border-border rounded-l-none" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Address</Label>
                                                <Textarea value={exchangeForm.address} onChange={(e) => setExchangeForm({ ...exchangeForm, address: e.target.value })} placeholder="Delivery address" rows={2} className="bg-background border-border" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">City</Label>
                                                    <select value={exchangeForm.city} onChange={(e) => setExchangeForm({ ...exchangeForm, city: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                                        <option value="">Select City</option>
                                                        {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Weight (kg)</Label>
                                                    <Input type="number" step="0.1" min="0.1" value={exchangeForm.weight} onChange={(e) => setExchangeForm({ ...exchangeForm, weight: e.target.value })} className="bg-background border-border" />
                                                </div>
                                            </div>

                                            <div className={`pt-2 border-t mt-4 ${exchangeLocationError ? 'border-destructive' : 'border-border'}`}>
                                                <Label className="text-xs font-bold text-muted-foreground uppercase block mb-3">Delivery Map Location <span className="text-destructive ml-0.5">*</span></Label>
                                                <LocationPicker onLocationPicked={(loc) => { setPickedLocationExchange(loc); if (loc) setExchangeLocationError(false); }} />
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </div>

                            <div className="space-y-6">
                                {codAllowedForOrder && createType === 'exchange' && (
                                    <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">payments</span>
                                            <h2 className="font-bold">Payment Setup</h2>
                                        </div>
                                        <div className="p-6 space-y-4">
                                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${exchangeForm.codRequired === 1 ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                <input className="text-primary focus:ring-primary w-4 h-4" type="checkbox" checked={exchangeForm.codRequired === 1} onChange={(e) => setExchangeForm({ ...exchangeForm, codRequired: e.target.checked ? 1 : 0 })} />
                                                <div className="ml-3">
                                                    <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                                                    <div className="text-[11px] text-muted-foreground">Collect payment from the receiver</div>
                                                </div>
                                            </label>
                                            {exchangeForm.codRequired === 1 && (
                                                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Amount to Collect</Label>
                                                    <div className="relative">
                                                        <Input type="number" step="0.01" min="0" value={exchangeForm.codAmount} onChange={(e) => setExchangeForm({ ...exchangeForm, codAmount: e.target.value })} placeholder="0.00" className="bg-background border-border pl-12 h-12 text-lg font-bold" />
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">AED</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                )}

                                <section className="band rounded-xl shadow-xl p-6 relative overflow-hidden">
                                    <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                                        <span className="material-symbols-outlined text-primary">info</span>
                                        Important
                                    </h2>
                                    <p className="text-sm opacity-70 relative z-10 leading-relaxed">
                                        Verify all details before confirming. This action is taken on behalf of the client and will be billed per their rate card.
                                    </p>
                                    <div className="mt-8 flex flex-col gap-3 relative z-10">
                                        <button type="button" onClick={() => onOpenChange(false)} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all">
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCreateFromOrder}
                                            disabled={createReturnMutation.isPending || createExchangeMutation.isPending}
                                            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined">rocket_launch</span>
                                            {(createReturnMutation.isPending || createExchangeMutation.isPending) ? 'Processing...' : 'Confirm'}
                                        </button>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Manual mode — admin picks the client first, no existing waybill needed.
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="bg-background text-foreground !w-[98vw] !max-w-[1400px] p-0 gap-0 border-border max-h-[90vh] overflow-y-auto antialiased font-sans rounded-2xl shadow-xl"
                onInteractOutside={interactOutsideGuard}
            >
                <div className="p-6 md:p-8">
                    <DialogHeader className="mb-8 border-b border-border pb-4">
                        <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-3xl">add_box</span>
                            New Return/Exchange (Admin)
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-base mt-2">
                            For packages that don't have an existing waybill in the system. Select the client first, or load an existing waybill below to autofill its details.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mb-8 bg-card border border-border rounded-xl p-4">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Load From Existing Waybill (optional)</Label>
                        {loadedSourceOrder ? (
                            <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary rounded-lg px-4 py-2.5">
                                <div className="flex items-center gap-2 text-sm">
                                    <Search className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-bold">{loadedSourceOrder.waybillNumber}</span>
                                    <span className="text-muted-foreground">— {loadedSourceOrder.customerName}</span>
                                </div>
                                <button type="button" onClick={handleClearSourceOrder} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                    <Input
                                        value={waybillQuery}
                                        onChange={(e) => { setWaybillQuery(e.target.value); setWaybillDropdownOpen(true); }}
                                        onFocus={() => setWaybillDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setWaybillDropdownOpen(false), 150)}
                                        placeholder="Search by waybill number, customer name or phone..."
                                        className="bg-background border-border pl-9"
                                    />
                                </div>
                                {waybillDropdownOpen && waybillQuery.trim().length >= 2 && (
                                    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                                        {waybillSearching ? (
                                            <div className="px-4 py-3 text-sm text-muted-foreground">Searching...</div>
                                        ) : waybillResults.length > 0 ? (
                                            waybillResults.map((o) => (
                                                <button
                                                    key={o.id}
                                                    type="button"
                                                    onClick={() => handleLoadSourceOrder(o)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-b-0"
                                                >
                                                    <div className="font-bold text-sm">{o.waybillNumber}</div>
                                                    <div className="text-xs text-muted-foreground">{o.customerName} · {o.city} · {o.status}</div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-3 text-sm text-muted-foreground">No matching orders found.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        <div className="xl:col-span-2 space-y-8">
                            <div className="bg-primary/5 border border-border p-4 rounded-xl space-y-4">
                                <div>
                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Client *</Label>
                                    <Select value={manualForm.clientId} onValueChange={(v) => setManualForm({ ...manualForm, clientId: v })}>
                                        <SelectTrigger className="w-full h-11 bg-background border-input">
                                            <SelectValue placeholder="Select a client..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {clients?.map((client) => (
                                                <SelectItem key={client.id} value={client.id.toString()}>{client.companyName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Operation Type</Label>
                                    <div className="flex gap-4">
                                        <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.type === 'return' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                            <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={manualForm.type === 'return'} onChange={() => setManualForm({ ...manualForm, type: 'return' })} />
                                            <div className="ml-3 font-bold text-sm">Return Only</div>
                                        </label>
                                        <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.type === 'exchange' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                            <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={manualForm.type === 'exchange'} onChange={() => setManualForm({ ...manualForm, type: 'exchange' })} />
                                            <div className="ml-3 font-bold text-sm">Exchange</div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>outbox</span>
                                    <h2 className="font-bold">Pickup Details (From)</h2>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</Label>
                                            <Input value={manualForm.pickupName} onChange={(e) => setManualForm({ ...manualForm, pickupName: e.target.value })} className="bg-background border-border" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</Label>
                                            <div className="flex">
                                                <select className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={manualForm.pickupPhonePrefix} onChange={(e) => setManualForm({ ...manualForm, pickupPhonePrefix: e.target.value })}>
                                                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <Input value={manualForm.pickupPhone} onChange={(e) => setManualForm({ ...manualForm, pickupPhone: e.target.value })} className="bg-background border-border rounded-l-none" />
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</Label>
                                            <Textarea value={manualForm.pickupAddress} onChange={(e) => setManualForm({ ...manualForm, pickupAddress: e.target.value })} rows={2} className="bg-background border-border" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</Label>
                                            <select value={manualForm.pickupCity} onChange={(e) => setManualForm({ ...manualForm, pickupCity: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                                <option value="">Select City</option>
                                                {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="flex justify-end -mt-4">
                                <button
                                    type="button"
                                    onClick={() => setManualForm(prev => ({
                                        ...prev,
                                        exchangeCustomerName: prev.pickupName,
                                        exchangeCustomerPhonePrefix: prev.pickupPhonePrefix,
                                        exchangeCustomerPhone: prev.pickupPhone,
                                        exchangeAddress: prev.pickupAddress,
                                        exchangeCity: prev.pickupCity,
                                    }))}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>content_copy</span>
                                    Same as Pickup
                                </button>
                            </div>

                            <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>move_to_inbox</span>
                                    <h2 className="font-bold">Delivery Details (To)</h2>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</Label>
                                            <Input value={manualForm.deliveryName} onChange={(e) => setManualForm({ ...manualForm, deliveryName: e.target.value })} className="bg-background border-border" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</Label>
                                            <div className="flex">
                                                <select className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={manualForm.deliveryPhonePrefix} onChange={(e) => setManualForm({ ...manualForm, deliveryPhonePrefix: e.target.value })}>
                                                    {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <Input value={manualForm.deliveryPhone} onChange={(e) => setManualForm({ ...manualForm, deliveryPhone: e.target.value })} className="bg-background border-border rounded-l-none" />
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</Label>
                                            <Textarea value={manualForm.deliveryAddress} onChange={(e) => setManualForm({ ...manualForm, deliveryAddress: e.target.value })} rows={2} className="bg-background border-border" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</Label>
                                            <select value={manualForm.deliveryCity} onChange={(e) => setManualForm({ ...manualForm, deliveryCity: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                                <option value="">Select City</option>
                                                {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className={`pt-4 border-t mt-4 ${manualLocationError ? 'border-destructive' : 'border-border'}`}>
                                <Label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Pickup Map Location <span className="text-destructive ml-0.5">*</span></Label>
                                <p className="text-xs text-muted-foreground mb-3">Pin the exact pickup address on the map to help the driver locate it.</p>
                                <LocationPicker
                                    key={loadedSourceOrder?.id ?? 'manual-blank'}
                                    initialLocation={loadedSourceOrder?.latitude && loadedSourceOrder?.longitude ? { lat: parseFloat(loadedSourceOrder.latitude), lng: parseFloat(loadedSourceOrder.longitude) } : undefined}
                                    onLocationPicked={(loc) => { setPickedLocationManual(loc); if (loc) setManualLocationError(false); }}
                                />
                            </div>
                        </div>

                        <div className="space-y-8">
                            <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>inventory</span>
                                    <h2 className="font-bold">Package Information</h2>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pieces</Label>
                                            <Input type="number" min="1" value={manualForm.pieces} onChange={(e) => setManualForm({ ...manualForm, pieces: parseInt(e.target.value) || 1 })} className="bg-background border-border" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weight (kg)</Label>
                                            <Input type="number" step="0.1" min="0.1" value={manualForm.weight} onChange={(e) => setManualForm({ ...manualForm, weight: e.target.value })} className="bg-background border-border" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Service Type</Label>
                                        <select value={manualForm.serviceType} onChange={(e) => setManualForm({ ...manualForm, serviceType: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                            {DOMESTIC_SERVICE_TYPES.map((svc) => (
                                                <option key={svc.code} value={svc.code}>{svc.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {isPreferredTimeService(manualForm.serviceType) && (
                                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Delivery Date</Label>
                                                <Input
                                                    type="date"
                                                    min={isSameDayPreferredService(manualForm.serviceType) ? todayStr() : tomorrowStr()}
                                                    max={isSameDayPreferredService(manualForm.serviceType) ? todayStr() : undefined}
                                                    value={manualForm.preferredDate}
                                                    onChange={(e) => setManualForm({ ...manualForm, preferredDate: e.target.value })}
                                                    className="bg-background border-border"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Time Window</Label>
                                                <select value={manualForm.preferredTime} onChange={(e) => setManualForm({ ...manualForm, preferredTime: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                                    <option value="">Select time window</option>
                                                    {DEFAULT_PREFERRED_SLOTS.map((slot) => (
                                                        <option key={slot} value={slot}>{slot}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Instructions</Label>
                                        <Textarea value={manualForm.specialInstructions} onChange={(e) => setManualForm({ ...manualForm, specialInstructions: e.target.value })} placeholder="Any special instructions..." rows={2} className="bg-background border-border" />
                                    </div>
                                </div>
                            </section>

                            {manualForm.type === 'exchange' && (
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-[var(--st-amber-bg)] border-b border-[var(--st-amber)]/20 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[var(--st-amber)]">local_shipping</span>
                                        <h2 className="font-bold text-[var(--st-amber)]">New Item Shipment (To Customer)</h2>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Recipient Name *</Label>
                                                <Input value={manualForm.exchangeCustomerName} onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerName: e.target.value })} placeholder="Full name" className="bg-background border-border" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Phone *</Label>
                                                <div className="flex">
                                                    <select className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={manualForm.exchangeCustomerPhonePrefix} onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerPhonePrefix: e.target.value })}>
                                                        {PHONE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                    <Input value={manualForm.exchangeCustomerPhone} onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerPhone: e.target.value })} placeholder="Phone" className="bg-background border-border rounded-l-none" />
                                                </div>
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Delivery Address *</Label>
                                                <Textarea value={manualForm.exchangeAddress} onChange={(e) => setManualForm({ ...manualForm, exchangeAddress: e.target.value })} rows={2} className="bg-background border-border" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">City *</Label>
                                                <select value={manualForm.exchangeCity} onChange={(e) => setManualForm({ ...manualForm, exchangeCity: e.target.value })} className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary">
                                                    <option value="">Select City</option>
                                                    {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Weight (kg)</Label>
                                                <Input type="number" step="0.1" min="0.1" value={manualForm.exchangeWeight} onChange={(e) => setManualForm({ ...manualForm, exchangeWeight: e.target.value })} className="bg-background border-border" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase">Pieces</Label>
                                                <Input type="number" min="1" value={manualForm.exchangePieces} onChange={(e) => setManualForm({ ...manualForm, exchangePieces: parseInt(e.target.value) || 1 })} className="bg-background border-border" />
                                            </div>
                                        </div>

                                        {selectedManualClient?.codAllowed === 1 && (
                                            <div className="pt-4 mt-4 border-t border-border">
                                                <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.exchangeCodRequired === 1 ? 'border-[var(--st-amber)] bg-[var(--st-amber-bg)]' : 'border-border hover:bg-muted'}`}>
                                                    <input className="accent-[var(--st-amber)] w-4 h-4" type="checkbox" checked={manualForm.exchangeCodRequired === 1} onChange={(e) => setManualForm({ ...manualForm, exchangeCodRequired: e.target.checked ? 1 : 0 })} />
                                                    <div className="ml-3">
                                                        <div className="font-bold text-sm">Require COD on New Item</div>
                                                        <div className="text-[11px] text-muted-foreground">Collect payment for exchange processing</div>
                                                    </div>
                                                </label>
                                                {manualForm.exchangeCodRequired === 1 && (
                                                    <div className="mt-3 animate-in fade-in">
                                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Amount to Collect</Label>
                                                        <div className="flex gap-2">
                                                            <select value={manualForm.exchangeCodCurrency} onChange={(e) => setManualForm({ ...manualForm, exchangeCodCurrency: e.target.value })} className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-bold focus:outline-none">
                                                                <option value="AED">AED</option>
                                                                <option value="USD">USD</option>
                                                                <option value="EUR">EUR</option>
                                                            </select>
                                                            <Input type="number" step="0.01" value={manualForm.exchangeCodAmount} onChange={(e) => setManualForm({ ...manualForm, exchangeCodAmount: e.target.value })} placeholder="0.00" className="h-12 text-lg font-bold rounded-l-none" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            <section className="band rounded-xl shadow-xl p-6 relative overflow-hidden">
                                <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                                    <span className="material-symbols-outlined text-primary">check_circle</span>
                                    Confirm
                                </h2>
                                <div className="mt-8 flex flex-col gap-3 relative z-10">
                                    <button type="button" onClick={() => onOpenChange(false)} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all">
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateManual}
                                        disabled={createManualMutation.isPending}
                                        className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">rocket_launch</span>
                                        {createManualMutation.isPending ? 'Processing...' : (manualForm.type === 'return' ? 'Process Return' : 'Process Exchange')}
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
