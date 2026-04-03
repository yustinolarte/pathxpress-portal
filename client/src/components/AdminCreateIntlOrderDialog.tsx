import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import {
    Loader2, Globe, User, Ruler, FileText, Building2, MapPin, Phone
} from 'lucide-react';

interface Client {
    id: number;
    companyName: string;
    contactName: string;
    phone: string;
    billingAddress: string;
    city: string;
    country: string;
}

interface AdminCreateIntlOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[] | undefined;
    countries: string[];
    onSuccess: () => void;
}

const SERVICE_TYPES = [
    { value: 'PRIME_EXPRESS', label: 'PRIME Express', description: 'Fast international air express' },
    { value: 'PRIME_TRACKED', label: 'PRIME Tracked', description: 'Tracked economy air service' },
    { value: 'PRIME_REGISTERED_POD', label: 'PRIME Registered POD', description: 'Registered with proof of delivery' },
    { value: 'GCC', label: 'GCC', description: 'Gulf Cooperation Council region' },
    { value: 'PREMIUM_EXPORT', label: 'Premium Export', description: 'Premium door-to-door export' },
];

const CURRENCIES = ['USD', 'AED', 'EUR', 'GBP', 'SAR'];

const defaultForm = {
    customerName: '',
    customerPhone: '',
    address: '',
    city: '',
    postalCode: '',
    destinationCountry: '',
    pieces: 1,
    weight: '',
    length: '',
    width: '',
    height: '',
    serviceType: 'PRIME_EXPRESS',
    specialInstructions: '',
    customsValue: '',
    customsCurrency: 'USD',
    customsDescription: '',
    hsCode: '',
};

export default function AdminCreateIntlOrderDialog({
    open,
    onOpenChange,
    clients,
    countries,
    onSuccess,
}: AdminCreateIntlOrderDialogProps) {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [countrySearch, setCountrySearch] = useState('');
    const [formData, setFormData] = useState(defaultForm);

    useEffect(() => {
        if (selectedClientId && clients) {
            setSelectedClient(clients.find(c => c.id.toString() === selectedClientId) || null);
        } else {
            setSelectedClient(null);
        }
    }, [selectedClientId, clients]);

    useEffect(() => {
        if (!open) {
            setSelectedClientId('');
            setSelectedClient(null);
            setCountrySearch('');
            setFormData(defaultForm);
        }
    }, [open]);

    const createOrderMutation = trpc.portal.admin.adminCreateOrder.useMutation({
        onSuccess: (order) => {
            toast.success(`Shipment ${order.waybillNumber} created successfully`);
            generateWaybillPDF(order as any);
            onSuccess();
        },
        onError: (error) => {
            toast.error(`Failed to create shipment: ${error.message}`);
        },
    });

    const handleSubmit = () => {
        if (!selectedClientId) { toast.error('Please select a client'); return; }
        if (!formData.customerName || !formData.customerPhone || !formData.address || !formData.city) {
            toast.error('Please fill in all required consignee fields');
            return;
        }
        if (!formData.destinationCountry) { toast.error('Please select a destination country'); return; }
        if (!formData.weight || parseFloat(formData.weight) <= 0) {
            toast.error('Please enter a valid weight');
            return;
        }

        createOrderMutation.mutate({
            clientId: parseInt(selectedClientId),
            shipment: {
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
                address: formData.address,
                city: formData.city,
                postalCode: formData.postalCode || undefined,
                destinationCountry: formData.destinationCountry,
                pieces: formData.pieces,
                weight: parseFloat(formData.weight),
                length: formData.length ? parseFloat(formData.length) : undefined,
                width: formData.width ? parseFloat(formData.width) : undefined,
                height: formData.height ? parseFloat(formData.height) : undefined,
                serviceType: formData.serviceType,
                specialInstructions: formData.specialInstructions || undefined,
                codRequired: 0,
                codCurrency: 'AED',
                fitOnDelivery: 0,
                customsValue: formData.customsValue || undefined,
                customsCurrency: formData.customsCurrency || undefined,
                customsDescription: formData.customsDescription || undefined,
                hsCode: formData.hsCode || undefined,
            },
        });
    };

    const set = (key: keyof typeof defaultForm, value: string | number) =>
        setFormData(prev => ({ ...prev, [key]: value }));

    const filteredCountries = countries.filter(c =>
        c.toLowerCase().includes(countrySearch.toLowerCase())
    );

    const selectedService = SERVICE_TYPES.find(s => s.value === formData.serviceType);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong !w-[95vw] !max-w-[1400px] max-h-[95vh] overflow-y-auto p-0 gap-0 border-white/10 bg-background text-foreground antialiased font-sans">
                {/* Decorative Top Line */}
                <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />

                <div className="p-6 md:p-8 space-y-6">
                    <DialogHeader className="p-0 mb-4">
                        <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
                            <Globe className="h-6 w-6 text-blue-400" />
                            New International Shipment
                        </DialogTitle>
                        <DialogDescription>
                            Create an international order on behalf of a client.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Client Selection Bar */}
                    <div className="bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col md:flex-row gap-6 items-center">
                        <div className="w-full md:w-1/3">
                            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                <User className="h-4 w-4 text-primary" />
                                Select Client *
                            </label>
                            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                <SelectTrigger className="w-full h-12 text-base rounded-lg border-input bg-background focus:ring-primary">
                                    <SelectValue placeholder="Search or choose a client..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {clients?.map(client => (
                                        <SelectItem key={client.id} value={client.id.toString()}>
                                            {client.companyName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedClient && (
                            <div className="flex gap-4 items-center pl-0 md:pl-6 border-0 md:border-l border-border mt-0 md:mt-6">
                                <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                                    <Globe className="w-3 h-3" /> International
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">{selectedClient.city || 'UAE'}</span>
                            </div>
                        )}
                    </div>

                    {selectedClient && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Left Column: Shipper + Consignee */}
                            <div className="xl:col-span-2 space-y-8">

                                {/* Shipper Section */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>outbox</span>
                                        <h2 className="font-bold">Shipper (From Client)</h2>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Company Name</label>
                                                <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.companyName} readOnly />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone</label>
                                                <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.phone || '-'} readOnly />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</label>
                                                <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.billingAddress || '-'} readOnly />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</label>
                                                <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.city || '-'} readOnly />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Country</label>
                                                <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={selectedClient.country || 'UAE'} readOnly />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Consignee Section */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-400" style={{ fontVariationSettings: "'FILL' 1" }}>move_to_inbox</span>
                                        <h2 className="font-bold">Consignee (Delivery To)</h2>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Name *</label>
                                                <input
                                                    required
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.customerName}
                                                    onChange={e => set('customerName', e.target.value)}
                                                    placeholder="Full name"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                    <Phone className="w-3 h-3" /> Phone *
                                                </label>
                                                <input
                                                    required
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.customerPhone}
                                                    onChange={e => set('customerPhone', e.target.value)}
                                                    placeholder="+1 XXX XXX XXXX"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Address *</label>
                                                <textarea
                                                    required
                                                    rows={2}
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                                                    value={formData.address}
                                                    onChange={e => set('address', e.target.value)}
                                                    placeholder="Full delivery address"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City *</label>
                                                <input
                                                    required
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.city}
                                                    onChange={e => set('city', e.target.value)}
                                                    placeholder="City"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Postal Code</label>
                                                <input
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.postalCode}
                                                    onChange={e => set('postalCode', e.target.value)}
                                                    placeholder="ZIP / Postal"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> Destination Country *
                                                </label>
                                                <Select value={formData.destinationCountry} onValueChange={v => set('destinationCountry', v)}>
                                                    <SelectTrigger className="w-full rounded-lg border-input bg-background focus:ring-primary">
                                                        <SelectValue placeholder="Select destination country" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[300px]">
                                                        <div className="p-2 sticky top-0 bg-popover z-10 relative border-b border-border">
                                                            <input
                                                                placeholder="Search country..."
                                                                value={countrySearch}
                                                                onChange={e => setCountrySearch(e.target.value)}
                                                                onKeyDown={e => e.stopPropagation()}
                                                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                            />
                                                        </div>
                                                        {filteredCountries.map(c => (
                                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Customs Declaration Section */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                                        <h2 className="font-bold">Customs Declaration</h2>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Declared Value</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                        value={formData.customsValue}
                                                        onChange={e => set('customsValue', e.target.value)}
                                                        placeholder="e.g. 100"
                                                    />
                                                    <Select value={formData.customsCurrency} onValueChange={v => set('customsCurrency', v)}>
                                                        <SelectTrigger className="w-[90px] border-input bg-background focus:ring-primary">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {CURRENCIES.map(c => (
                                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">HS Code</label>
                                                <input
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.hsCode}
                                                    onChange={e => set('hsCode', e.target.value)}
                                                    placeholder="e.g. 6110.20"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Goods Description</label>
                                                <textarea
                                                    rows={2}
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                                                    value={formData.customsDescription}
                                                    onChange={e => set('customsDescription', e.target.value)}
                                                    placeholder="Describe the contents of the shipment..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Right Column: Service + Shipment Details + Action */}
                            <div className="xl:col-span-1 space-y-6">

                                {/* Service Selection */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>flight_takeoff</span>
                                        <h2 className="font-bold">Service Type</h2>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        {SERVICE_TYPES.map(s => (
                                            <label key={s.value} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === s.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                <input
                                                    type="radio"
                                                    name="serviceType"
                                                    className="text-primary focus:ring-primary w-4 h-4 rounded-full"
                                                    checked={formData.serviceType === s.value}
                                                    onChange={() => set('serviceType', s.value)}
                                                />
                                                <div className="ml-3">
                                                    <div className="font-bold text-sm">{s.label}</div>
                                                    <div className="text-[11px] text-muted-foreground">{s.description}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </section>

                                {/* Shipment Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>inventory</span>
                                        <h2 className="font-bold">Shipment Details</h2>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weight (kg) *</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0.1"
                                                    required
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.weight}
                                                    onChange={e => set('weight', e.target.value)}
                                                    placeholder="e.g. 1.5"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pieces</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                                    value={formData.pieces}
                                                    onChange={e => set('pieces', parseInt(e.target.value) || 1)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <Ruler className="w-3 h-3" /> Dimensions (cm)
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <input type="number" placeholder="L" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary" value={formData.length} onChange={e => set('length', e.target.value)} />
                                                <input type="number" placeholder="W" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary" value={formData.width} onChange={e => set('width', e.target.value)} />
                                                <input type="number" placeholder="H" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary" value={formData.height} onChange={e => set('height', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> Special Instructions
                                            </label>
                                            <textarea
                                                rows={2}
                                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                                                value={formData.specialInstructions}
                                                onChange={e => set('specialInstructions', e.target.value)}
                                                placeholder="Any delivery instructions..."
                                            />
                                        </div>
                                    </div>
                                </section>

                                {/* Summary & Action */}
                                <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Service</span>
                                            <span className="font-semibold">{selectedService?.label || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Destination</span>
                                            <span className="font-semibold">{formData.destinationCountry || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Weight</span>
                                            <span className="font-semibold">{formData.weight ? `${formData.weight} kg` : '—'}</span>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-border space-y-2">
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={!selectedClientId || createOrderMutation.isPending}
                                            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {createOrderMutation.isPending ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                            ) : (
                                                <><Globe className="w-4 h-4" /> Create International Shipment</>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onOpenChange(false)}
                                            className="w-full py-3 bg-muted text-muted-foreground rounded-xl font-bold text-sm hover:bg-muted/80 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
