import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Loader2, Package, User, MapPin, Phone, FileText, Truck, Building2, Edit3, DollarSign } from 'lucide-react';
import { LocationPicker, type PickedLocation, type ParsedAddress } from '@/components/LocationPicker';

const EMIRATE_MAP: Record<string, string> = {
    dubai: 'Dubai',
    'abu dhabi': 'Abu Dhabi',
    'abū ẓaby': 'Abu Dhabi',
    sharjah: 'Sharjah',
    'ash shāriqah': 'Sharjah',
    ajman: 'Ajman',
    "'ajmān": 'Ajman',
    'ras al-khaimah': 'RAK',
    "raʾs al-khaymah": 'RAK',
    'ras al khaimah': 'RAK',
    fujairah: 'Fujairah',
    'umm al-quwain': 'UAQ',
    'umm al quwain': 'UAQ',
};

function matchEmirate(raw?: string): string | undefined {
    if (!raw) return undefined;
    return EMIRATE_MAP[raw.toLowerCase()] ?? undefined;
}

interface Client {
    id: number;
    companyName: string;
    contactName: string;
    phone: string;
    billingAddress: string;
    city: string;
    country: string;
    codAllowed: number;
    fodAllowed: number;
    bulletAllowed: number;
}

interface AdminCreateOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[] | undefined;
    onSuccess: () => void;
}

export default function AdminCreateOrderDialog({
    open,
    onOpenChange,
    clients,
    onSuccess,
}: AdminCreateOrderDialogProps) {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [overrideShipper, setOverrideShipper] = useState(false);
    const [calculatedRate, setCalculatedRate] = useState<{ baseRate: number; additionalKgCharge: number; totalRate: number; chargeableWeight?: number } | null>(null);
    const [calculatedCODFee, setCalculatedCODFee] = useState<number>(0);

    // Form state
    const [formData, setFormData] = useState({
        orderNumber: '',
        customerName: '',
        customerPhonePrefix: '+971',
        customerPhone: '',
        address: '',
        city: '',
        emirate: '',
        destinationCountry: 'UAE',
        pieces: 1,
        weight: 0.5,
        serviceType: 'DOM',
        specialInstructions: '',
        codRequired: false,
        codAmount: '',
        fitOnDelivery: false,
    });

    // Location pin state
    const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
    const [locationError, setLocationError] = useState(false);
    const [emirateError, setEmirateError] = useState(false);
    const consigneeSearchRef = useRef<HTMLInputElement>(null);

    function handleAddressParsed(parsed: ParsedAddress) {
        setFormData(prev => ({
            ...prev,
            address: [parsed.streetNumber, parsed.street, parsed.area].filter(Boolean).join(', ') || prev.address,
            city: parsed.city ?? prev.city,
            emirate: matchEmirate(parsed.emirate) ?? prev.emirate,
        }));
    }

    // Shipper override state
    const [shipperData, setShipperData] = useState({
        shipperName: '',
        shipperAddress: '',
        shipperCity: '',
        shipperCountry: 'UAE',
        shipperPhonePrefix: '+971',
        shipperPhone: '',
    });

    // Update selected client when clientId changes
    useEffect(() => {
        if (selectedClientId && clients) {
            const client = clients.find(c => c.id.toString() === selectedClientId);
            setSelectedClient(client || null);
        } else {
            setSelectedClient(null);
        }
    }, [selectedClientId, clients]);

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setSelectedClientId('');
            setSelectedClient(null);
            setOverrideShipper(false);
            setCalculatedRate(null);
            setCalculatedCODFee(0);
            setFormData({
                orderNumber: '',
                customerName: '',
                customerPhonePrefix: '+971',
                customerPhone: '',
                address: '',
                city: '',
                emirate: '',
                destinationCountry: 'UAE',
                pieces: 1,
                weight: 0.5,
                serviceType: 'DOM',
                specialInstructions: '',
                codRequired: false,
                codAmount: '',
                fitOnDelivery: false,
            });
            setShipperData({
                shipperName: '',
                shipperAddress: '',
                shipperCity: '',
                shipperCountry: 'UAE',
                shipperPhonePrefix: '+971',
                shipperPhone: '',
            });
            setPickedLocation(null);
        }
    }, [open]);

    const createOrderMutation = trpc.portal.admin.adminCreateOrder.useMutation({
        onSuccess: (order) => {
            toast.success(`Order ${order.waybillNumber} created successfully`);
            onSuccess();
        },
        onError: (error) => {
            toast.error(`Failed to create order: ${error.message}`);
        },
    });

    const calculateRateMutation = trpc.portal.rates.calculate.useMutation({
        onSuccess: (data) => setCalculatedRate(data),
    });

    const calculateCODMutation = trpc.portal.rates.calculateCOD.useMutation({
        onSuccess: (data) => setCalculatedCODFee(data.fee),
    });

    // Auto-calculate rate when relevant fields change
    useEffect(() => {
        if (!selectedClientId || !formData.weight || formData.weight <= 0) {
            setCalculatedRate(null);
            return;
        }
        const serviceType = formData.serviceType as 'DOM' | 'SDD' | 'BULLET';
        if (serviceType === 'DOM' || serviceType === 'SDD' || serviceType === 'BULLET') {
            calculateRateMutation.mutate({
                clientId: parseInt(selectedClientId),
                serviceType,
                weight: formData.weight,
                emirate: formData.emirate || undefined,
            });
        }
    }, [selectedClientId, formData.weight, formData.serviceType, formData.emirate]);

    // Auto-calculate COD fee when COD amount changes
    useEffect(() => {
        if (formData.codRequired && formData.codAmount && selectedClientId) {
            const amount = parseFloat(formData.codAmount);
            if (!isNaN(amount) && amount > 0) {
                calculateCODMutation.mutate({
                    codAmount: amount,
                    clientId: parseInt(selectedClientId),
                });
            }
        } else {
            setCalculatedCODFee(0);
        }
    }, [formData.codRequired, formData.codAmount, selectedClientId]);

    const handleSubmit = () => {
        if (!selectedClientId) {
            toast.error('Please select a client');
            return;
        }
        if (!formData.customerName || !formData.customerPhone || !formData.address || !formData.city) {
            toast.error('Please fill in all required consignee fields');
            return;
        }
        if ((formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates' || formData.destinationCountry === '') && !formData.emirate) {
            setEmirateError(true);
            toast.error('Please select the destination emirate');
            return;
        }
        setEmirateError(false);
        if (overrideShipper && (!shipperData.shipperName || !shipperData.shipperAddress || !shipperData.shipperCity || !shipperData.shipperPhone)) {
            toast.error('Please fill in all shipper fields when using custom shipper');
            return;
        }
        if (formData.weight <= 0) {
            toast.error('Weight must be greater than 0');
            return;
        }
        if (formData.codRequired && (!formData.codAmount || parseFloat(formData.codAmount) <= 0)) {
            toast.error('Please enter a valid COD amount');
            return;
        }

        if (formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates') {
            if (!pickedLocation) {
                setLocationError(true);
                toast.error('Please place a map pin to confirm the delivery location.');
                return;
            }
        }
        setLocationError(false);

        createOrderMutation.mutate({
            clientId: parseInt(selectedClientId),
            shipment: {
                orderNumber: formData.orderNumber || undefined,
                customerName: formData.customerName,
                customerPhone: `${formData.customerPhonePrefix} ${formData.customerPhone}`,
                address: formData.address,
                city: formData.city,
                emirate: formData.emirate || undefined,
                destinationCountry: formData.destinationCountry,
                pieces: formData.pieces,
                weight: formData.weight,
                serviceType: formData.serviceType,
                specialInstructions: formData.specialInstructions || undefined,
                codRequired: formData.codRequired ? 1 : 0,
                codAmount: formData.codRequired ? formData.codAmount : undefined,
                codCurrency: 'AED',
                fitOnDelivery: formData.fitOnDelivery ? 1 : 0,
                latitude: pickedLocation?.latitude,
                longitude: pickedLocation?.longitude,
                // Shipper override fields
                shipperOverride: overrideShipper,
                shipperName: overrideShipper ? shipperData.shipperName : undefined,
                shipperAddress: overrideShipper ? shipperData.shipperAddress : undefined,
                shipperCity: overrideShipper ? shipperData.shipperCity : undefined,
                shipperCountry: overrideShipper ? shipperData.shipperCountry : undefined,
                shipperPhone: overrideShipper ? `${shipperData.shipperPhonePrefix} ${shipperData.shipperPhone}` : undefined,
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="glass-strong !w-[95vw] !max-w-[1400px] max-h-[95vh] overflow-y-auto p-0 gap-0 border-white/10 bg-background text-foreground antialiased font-sans"
                onInteractOutside={(e) => {
                    if ((e.target as HTMLElement)?.closest?.('.pac-container')) {
                        e.preventDefault();
                    }
                }}
            >
                {/* Decorative Top Line */}
                <div className="w-full h-1 bg-primary" />

                <div className="p-6 md:p-8 space-y-6">
                    <DialogHeader className="p-0 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <DialogTitle className="text-2xl font-extrabold tracking-tight">Create Order (Admin)</DialogTitle>
                            <DialogDescription>
                                Create a new order on behalf of a client. Select a client first, then fill in details.
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    {/* Client Selection - Full Width Top bar */}
                    <div className="bg-card rounded-xl shadow-sm border border-border p-6 mb-8 flex flex-col md:flex-row gap-6 items-center">
                        <div className="w-full md:w-1/3">
                            <Label className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                <User className="h-4 w-4 text-primary" />
                                Select Client *
                            </Label>
                            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                <SelectTrigger className="w-full h-12 text-base rounded-lg border-input bg-background focus:ring-primary">
                                    <SelectValue placeholder="Search or Choose a client..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {clients?.map((client) => (
                                        <SelectItem key={client.id} value={client.id.toString()}>
                                            {client.companyName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedClient && (
                            <div className="flex gap-4 items-center pl-6 border-l border-border mt-6 md:mt-0">
                                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${selectedClient.codAllowed ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border'}`}>
                                    COD: {selectedClient.codAllowed ? 'Allowed' : 'Not Allowed'}
                                </span>
                                <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${selectedClient.fodAllowed ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border'}`}>
                                    FOD: {selectedClient.fodAllowed ? 'Allowed' : 'Not Allowed'}
                                </span>
                                {selectedClient.bulletAllowed === 1 && (
                                    <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-red-500/20 text-red-500 border border-red-500/30 flex items-center gap-1">
                                        🚀 Bullet Allowed
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedClient && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            {/* Left Column: Sender & Receiver */}
                            <div className="xl:col-span-2 space-y-8">
                            
                                {/* Shipper Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>outbox</span>
                                            <h2 className="font-bold">Shipper Details</h2>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label htmlFor="overrideShipper" className="text-xs text-muted-foreground cursor-pointer font-bold uppercase tracking-wider">Custom Address</label>
                                            <Checkbox id="overrideShipper" checked={overrideShipper} onCheckedChange={(checked) => setOverrideShipper(!!checked)} />
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        {overrideShipper ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shipper Name *</label>
                                                    <input required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={shipperData.shipperName} onChange={e => setShipperData({...shipperData, shipperName: e.target.value})} placeholder="Company Name" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contact Number *</label>
                                                    <div className="flex">
                                                        <select className="px-2 rounded-l-lg border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={shipperData.shipperPhonePrefix} onChange={e => setShipperData({...shipperData, shipperPhonePrefix: e.target.value})}>
                                                            <option value="+971">🇦🇪 +971</option>
                                                            <option value="+966">🇸🇦 +966</option>
                                                            <option value="+965">🇰🇼 +965</option>
                                                            <option value="+973">🇧🇭 +973</option>
                                                            <option value="+968">🇴🇲 +968</option>
                                                            <option value="+974">🇶🇦 +974</option>
                                                        </select>
                                                        <input required className="w-full rounded-r-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={shipperData.shipperPhone} onChange={e => setShipperData({...shipperData, shipperPhone: e.target.value})} placeholder="5x xxx xxxx" />
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2 space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Address *</label>
                                                    <input required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={shipperData.shipperAddress} onChange={e => setShipperData({...shipperData, shipperAddress: e.target.value})} placeholder="Building, Street, Area" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City *</label>
                                                    <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={shipperData.shipperCity} onChange={e => setShipperData({...shipperData, shipperCity: e.target.value})}>
                                                        <option value="">Select City</option>
                                                        {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Company Name</label>
                                                    <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.companyName} />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone</label>
                                                    <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.phone || '-'} />
                                                </div>
                                                <div className="md:col-span-2 space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</label>
                                                    <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.billingAddress || '-'} />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</label>
                                                    <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.city || '-'} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Consignee Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>move_to_inbox</span>
                                        <h2 className="font-bold">Consignee (Receiver)</h2>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Name *</label>
                                                <input required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} placeholder="Full name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number *</label>
                                                <div className="flex">
                                                    <select className="px-2 rounded-l-lg border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={formData.customerPhonePrefix} onChange={e => setFormData({...formData, customerPhonePrefix: e.target.value})}>
                                                        <option value="+971">🇦🇪 +971</option>
                                                        <option value="+966">🇸🇦 +966</option>
                                                        <option value="+965">🇰🇼 +965</option>
                                                        <option value="+973">🇧🇭 +973</option>
                                                        <option value="+968">🇴🇲 +968</option>
                                                        <option value="+974">🇶🇦 +974</option>
                                                    </select>
                                                    <input required className="w-full rounded-r-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} placeholder="5x xxx xxxx" />
                                                </div>
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Search Address</label>
                                                <div className="relative">
                                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                                    <input
                                                        ref={consigneeSearchRef}
                                                        type="text"
                                                        placeholder="Type to search and auto-fill address, city and emirate..."
                                                        className="w-full rounded-lg border border-primary/50 bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/40"
                                                    />
                                                </div>
                                                <p className="text-[11px] text-muted-foreground/60">Select a suggestion to auto-fill the fields below</p>
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Address *</label>
                                                <textarea required rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 text-foreground placeholder:text-muted-foreground/40" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Building name, street, area..." />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City *</label>
                                                <input required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="City name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Emirate (For Rating) <span className="text-destructive">*</span></label>
                                                <select className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 ${emirateError ? 'border-destructive ring-1 ring-destructive' : 'border-input'}`} value={formData.emirate} onChange={e => { setFormData({...formData, emirate: e.target.value}); setEmirateError(false); }}>
                                                    <option value="">Select Emirate</option>
                                                    <option value="Dubai">Dubai</option>
                                                    <option value="Abu Dhabi">Abu Dhabi</option>
                                                    <option value="Sharjah">Sharjah</option>
                                                    <option value="Ajman">Ajman</option>
                                                    <option value="RAK">Ras Al Khaimah</option>
                                                    <option value="Fujairah">Fujairah</option>
                                                    <option value="UAQ">Umm Al Quwain</option>
                                                </select>
                                            </div>
                                        </div>

                                        {(formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates' || formData.destinationCountry === '') && (
                                            <div className={`mt-6 pt-6 border-t ${locationError ? 'border-destructive' : 'border-border'}`}>
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">Pin on Map <span className="text-destructive ml-0.5">*</span><span className="normal-case font-normal text-muted-foreground/60 ml-1">— use Search Address above or click the map</span></label>
                                                <LocationPicker
                                                    onLocationPicked={(loc) => { setPickedLocation(loc); if (loc) setLocationError(false); }}
                                                    onAddressParsed={handleAddressParsed}
                                                    searchInputRef={consigneeSearchRef}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Shipment Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>inventory</span>
                                        <h2 className="font-bold">Shipment Details</h2>
                                    </div>
                                    <div className="p-6 space-y-8">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="space-y-1 col-span-2 lg:col-span-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pieces</label>
                                                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" min="1" type="number" required value={formData.pieces} onChange={e => setFormData({...formData, pieces: parseInt(e.target.value)||1})} />
                                            </div>
                                            <div className="space-y-1 col-span-2 lg:col-span-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weight(kg)</label>
                                                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" step="0.1" type="number" required value={formData.weight} onChange={e => setFormData({...formData, weight: parseFloat(e.target.value)||0.5})} />
                                            </div>
                                            <div className="space-y-1 col-span-2 lg:col-span-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reference #</label>
                                                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" type="text" value={formData.orderNumber} onChange={e => setFormData({...formData, orderNumber: e.target.value})} placeholder="Optional Order Number" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Special Instructions</label>
                                            <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40" placeholder="Any delivery instructions..." rows={2} value={formData.specialInstructions} onChange={e => setFormData({...formData, specialInstructions: e.target.value})}></textarea>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Right Column: Summary & Payment */}
                            <div className="space-y-8">
                                
                                {/* Payment Configuration */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>payments</span>
                                        <h2 className="font-bold">Service & Add-ons</h2>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div className="space-y-4">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Service Type</label>
                                            <div className="space-y-3">
                                                <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'DOM' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="admin_service_type" type="radio" checked={formData.serviceType === 'DOM'} onChange={() => setFormData({...formData, serviceType: 'DOM'})} />
                                                    <div className="ml-3">
                                                        <div className="font-bold text-sm">Domestic Express</div>
                                                        <div className="text-[11px] text-muted-foreground">Standard Next Day</div>
                                                    </div>
                                                </label>
                                                <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'SDD' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="admin_service_type" type="radio" checked={formData.serviceType === 'SDD'} onChange={() => setFormData({...formData, serviceType: 'SDD'})} />
                                                    <div className="ml-3">
                                                        <div className="font-bold text-sm">Same Day (SDD)</div>
                                                        <div className="text-[11px] text-muted-foreground">Delivered today</div>
                                                    </div>
                                                </label>
                                                {selectedClient.bulletAllowed === 1 && (
                                                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'BULLET' ? 'border-red-500 bg-red-500/10' : 'border-border hover:bg-muted'}`}>
                                                        <input className="text-red-500 focus:ring-red-500 w-4 h-4 rounded-full border border-red-500 bg-transparent" name="admin_service_type" type="radio" checked={formData.serviceType === 'BULLET'} onChange={() => setFormData({...formData, serviceType: 'BULLET'})} />
                                                        <div className="ml-3">
                                                            <div className="font-bold text-sm text-red-500">🚀 Bullet Service</div>
                                                            <div className="text-[11px] text-muted-foreground">Premium 4-Hour Delivery</div>
                                                        </div>
                                                    </label>
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-border space-y-4">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Add-ons</label>
                                            
                                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.codRequired ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'} ${!selectedClient.codAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                <Checkbox checked={formData.codRequired} disabled={!selectedClient.codAllowed} onCheckedChange={(checked) => setFormData({...formData, codRequired: !!checked})} className="mr-3 bg-background border-primary" />
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                                                    <div className="text-[11px] text-muted-foreground">{!selectedClient.codAllowed ? 'Not allowed for client' : 'Collect cash from receiver'}</div>
                                                </div>
                                            </label>

                                            {formData.codRequired && (
                                                <div className="pl-8 -mt-2 animate-in fade-in slide-in-from-top-2">
                                                    <div className="relative">
                                                        <input className="w-full rounded-lg border border-input bg-background pl-12 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 h-10 font-bold" placeholder="0.00" type="number" step="0.01" required value={formData.codAmount} onChange={e => setFormData({...formData, codAmount: e.target.value})} />
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">AED</span>
                                                    </div>
                                                </div>
                                            )}

                                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.fitOnDelivery ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'} ${!selectedClient.fodAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                <Checkbox checked={formData.fitOnDelivery} disabled={!selectedClient.fodAllowed} onCheckedChange={(checked) => setFormData({...formData, fitOnDelivery: !!checked})} className="mr-3 bg-background border-primary" />
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm">Fit on Delivery (FOD)</div>
                                                    <div className="text-[11px] text-muted-foreground">{!selectedClient.fodAllowed ? 'Not allowed for client' : 'Allow try-on before accept'}</div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </section>

                                {/* Order Summary */}
                                <section className="bg-slate-900 text-white rounded-xl shadow-xl p-6 relative overflow-hidden">
                                    <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                                        <span className="material-symbols-outlined text-blue-400">receipt_long</span>
                                        Summary
                                    </h2>
                                    <div className="space-y-3 text-sm relative z-10">
                                        {calculatedRate ? (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="opacity-70">Base Shipping</span>
                                                    <span className="font-medium">{calculatedRate.baseRate.toFixed(2)} AED</span>
                                                </div>
                                                {calculatedRate.additionalKgCharge > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Overweight</span>
                                                        <span className="font-medium">{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                {calculatedCODFee > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">COD Handling</span>
                                                        <span className="font-medium">{calculatedCODFee.toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                {formData.fitOnDelivery && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Fit on Delivery</span>
                                                        <span className="font-medium text-purple-400">{((selectedClient as any)?.fodFee ? Number((selectedClient as any).fodFee) : 5.00).toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-end pt-4 border-t border-white/20">
                                                    <span className="text-lg font-bold">Total Payable</span>
                                                    <span className="text-2xl font-black text-blue-400">{(calculatedRate.totalRate + calculatedCODFee + (formData.fitOnDelivery ? ((selectedClient as any)?.fodFee ? Number((selectedClient as any).fodFee) : 5.00) : 0)).toFixed(2)} AED</span>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="opacity-70 text-center py-4 text-xs">Awaiting client / weight info to estimate costs.</p>
                                        )}
                                    </div>
                                    <div className="mt-8 flex flex-col gap-3 relative z-10">
                                        <button onClick={handleSubmit} disabled={!selectedClientId || createOrderMutation.isPending} className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2">
                                            {createOrderMutation.isPending ? (
                                                <><span className="animate-spin mr-2">⏳</span> Creating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined">rocket_launch</span> Confirm Order</>
                                            )}
                                        </button>
                                        <button onClick={() => onOpenChange(false)} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                </section>

                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
