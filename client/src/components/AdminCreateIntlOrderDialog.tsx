import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import {
    Loader2, Globe, Package, MapPin, Phone, User, Ruler, FileText, Building2
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
    token: string;
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
    token,
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
            token,
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong !w-[90vw] !max-w-[1100px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
                <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />

                <div className="p-6 space-y-6">
                    <DialogHeader className="p-0">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Globe className="h-6 w-6 text-blue-400" />
                            New International Shipment
                        </DialogTitle>
                        <DialogDescription>
                            Create an international order on behalf of a client.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Client Selection */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-base font-semibold">
                                <User className="h-5 w-5 text-primary" />
                                Select Client *
                            </Label>
                            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                <SelectTrigger className="w-full h-12 text-base">
                                    <SelectValue placeholder="Choose a client..." />
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
                            <>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Shipper (read-only from client) */}
                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                                        <h4 className="font-semibold mb-4 flex items-center gap-2 text-blue-400">
                                            <Building2 className="h-5 w-5" />
                                            Shipper (From Client)
                                        </h4>
                                        <div className="space-y-3">
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Company Name</Label>
                                                <Input value={selectedClient.companyName} disabled className="bg-muted/50 mt-1" />
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Address</Label>
                                                <Input value={selectedClient.billingAddress || '-'} disabled className="bg-muted/50 mt-1" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">City</Label>
                                                    <Input value={selectedClient.city || '-'} disabled className="bg-muted/50 mt-1" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Country</Label>
                                                    <Input value={selectedClient.country || 'UAE'} disabled className="bg-muted/50 mt-1" />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Phone</Label>
                                                <Input value={selectedClient.phone || '-'} disabled className="bg-muted/50 mt-1" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Consignee */}
                                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5">
                                        <h4 className="font-semibold mb-4 flex items-center gap-2 text-purple-400">
                                            <MapPin className="h-5 w-5" />
                                            Consignee (Delivery To)
                                        </h4>
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="text-xs">Customer Name *</Label>
                                                    <Input
                                                        value={formData.customerName}
                                                        onChange={e => set('customerName', e.target.value)}
                                                        placeholder="Full name"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs flex items-center gap-1">
                                                        <Phone className="h-3 w-3" /> Phone *
                                                    </Label>
                                                    <Input
                                                        value={formData.customerPhone}
                                                        onChange={e => set('customerPhone', e.target.value)}
                                                        placeholder="+1..."
                                                        className="mt-1"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs">Address *</Label>
                                                <Textarea
                                                    value={formData.address}
                                                    onChange={e => set('address', e.target.value)}
                                                    placeholder="Full delivery address"
                                                    rows={2}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="text-xs">City *</Label>
                                                    <Input
                                                        value={formData.city}
                                                        onChange={e => set('city', e.target.value)}
                                                        placeholder="City"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Postal Code</Label>
                                                    <Input
                                                        value={formData.postalCode}
                                                        onChange={e => set('postalCode', e.target.value)}
                                                        placeholder="ZIP / Postal"
                                                        className="mt-1"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs">Destination Country *</Label>
                                                <Select value={formData.destinationCountry} onValueChange={v => set('destinationCountry', v)}>
                                                    <SelectTrigger className="mt-1">
                                                        <SelectValue placeholder="Select country" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[300px]">
                                                        <div className="p-2 sticky top-0 bg-popover">
                                                            <Input
                                                                placeholder="Search..."
                                                                value={countrySearch}
                                                                onChange={e => setCountrySearch(e.target.value)}
                                                                className="h-8"
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
                                </div>

                                {/* Shipment Details */}
                                <div className="border border-border/50 rounded-xl p-5">
                                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                                        <Package className="h-5 w-5 text-primary" />
                                        Shipment Details
                                    </h4>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">Service Type *</Label>
                                            <Select value={formData.serviceType} onValueChange={v => set('serviceType', v)}>
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {SERVICE_TYPES.map(s => (
                                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Weight (kg) *</Label>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                min="0.1"
                                                value={formData.weight}
                                                onChange={e => set('weight', e.target.value)}
                                                placeholder="e.g. 1.5"
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Pieces</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={formData.pieces}
                                                onChange={e => set('pieces', parseInt(e.target.value) || 1)}
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <Label className="text-xs flex items-center gap-1">
                                            <Ruler className="h-3 w-3" /> Dimensions (cm)
                                        </Label>
                                        <div className="grid grid-cols-3 gap-2 mt-1 max-w-[300px]">
                                            <Input type="number" placeholder="L" value={formData.length} onChange={e => set('length', e.target.value)} />
                                            <Input type="number" placeholder="W" value={formData.width} onChange={e => set('width', e.target.value)} />
                                            <Input type="number" placeholder="H" value={formData.height} onChange={e => set('height', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <Label className="text-xs">Special Instructions</Label>
                                        <Textarea
                                            value={formData.specialInstructions}
                                            onChange={e => set('specialInstructions', e.target.value)}
                                            placeholder="Any delivery instructions..."
                                            rows={2}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>

                                {/* Customs Declaration */}
                                <Card className="border border-amber-500/20 bg-amber-500/5">
                                    <CardHeader className="py-3 px-5">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                                            <FileText className="h-4 w-4" /> Customs Declaration
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-5 pb-5">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <Label className="text-xs">Declared Value</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={formData.customsValue}
                                                        onChange={e => set('customsValue', e.target.value)}
                                                        placeholder="e.g. 100"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div className="w-[100px]">
                                                    <Label className="text-xs">Currency</Label>
                                                    <Select value={formData.customsCurrency} onValueChange={v => set('customsCurrency', v)}>
                                                        <SelectTrigger className="mt-1">
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
                                            <div>
                                                <Label className="text-xs">HS Code</Label>
                                                <Input
                                                    value={formData.hsCode}
                                                    onChange={e => set('hsCode', e.target.value)}
                                                    placeholder="e.g. 6110.20"
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div className="lg:col-span-2">
                                                <Label className="text-xs">Goods Description</Label>
                                                <Textarea
                                                    value={formData.customsDescription}
                                                    onChange={e => set('customsDescription', e.target.value)}
                                                    placeholder="Describe the contents of the shipment..."
                                                    rows={2}
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>

                    <DialogFooter className="gap-2 pt-4 border-t border-border/50">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!selectedClientId || createOrderMutation.isPending}
                            className="min-w-[160px]"
                        >
                            {createOrderMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Shipment'
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
