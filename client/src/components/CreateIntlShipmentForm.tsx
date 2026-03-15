import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
    LayoutDashboard, Package, Save, Globe, Calculator, Plus, Loader2,
    ArrowRight, ArrowLeft, CheckCircle2, Star, Plane, Truck, Box, Edit3, Info,
    Check, ChevronsUpDown
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Types ────────────────────────────────────────────────────────────── */

interface QuoteOption {
    serviceKey: string;
    displayName: string;
    currency: string;
    total: number;
    totalAfterDiscount?: number;
    discountPercent?: number;
    bracketUsed: { unit: string; value: number };
    breakdown: Record<string, number>;
    calc: { realKg: number; volKg: number; billableKg: number };
    notes: string[];
    isRecommended?: boolean;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function CreateIntlShipmentForm({ token, onSuccess, clientId }: { token: string; onSuccess: () => void; clientId?: number }) {
    // Phase (1 = quotation, 2 = details)
    const [phase, setPhase] = useState<1 | 2>(1);

    const [formData, setFormData] = useState({
        shipperName: '',
        shipperAddress: '',
        shipperCity: '',
        shipperCountry: 'UAE',
        shipperPhone: '',
        customerName: '',
        customerPhone: '',
        address: '',
        city: '',
        destinationCountry: '',
        pieces: 1,
        weight: '',
        length: '',
        width: '',
        height: '',
        serviceType: '',
        specialInstructions: '',
        customsValue: '',
        customsCurrency: 'USD',
        customsDescription: '',
        hsCode: '',
        codRequired: 0,
        codAmount: '',
        codCurrency: 'USD',
        fitOnDelivery: 0
    });

    const [showSaveShipperDialog, setShowSaveShipperDialog] = useState(false);
    const [shipperNickname, setShipperNickname] = useState('');
    const [quotes, setQuotes] = useState<QuoteOption[]>([]);
    const [isQuoting, setIsQuoting] = useState(false);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [openCountry, setOpenCountry] = useState(false);

    // Fetch saved shippers
    const { data: savedShippers = [], refetch: refetchShippers } = trpc.portal.customer.getSavedShippers.useQuery(
        { token },
        { enabled: !!token }
    );

    // Fetch destination countries
    const { data: countries = [] } = trpc.portal.internationalRates.countries.useQuery(
        { token },
        { enabled: !!token }
    );

    // Mutations
    const createShipperMutation = trpc.portal.customer.createSavedShipper.useMutation({
        onSuccess: () => {
            toast.success('Shipper information saved!');
            setShowSaveShipperDialog(false);
            setShipperNickname('');
            refetchShippers();
        },
        onError: (err) => toast.error(err.message || 'Failed to save shipper')
    });

    const deleteShipperMutation = trpc.portal.customer.deleteSavedShipper.useMutation({
        onSuccess: () => {
            toast.success('Shipper deleted');
            refetchShippers();
        }
    });

    const calculateQuoteMutation = trpc.portal.internationalRates.quote.useMutation({
        onSuccess: (data) => {
            setQuotes(data.options.filter((q: any) => q.total > 0));
            setIsQuoting(false);
            setHasCalculated(true);
        },
        onError: () => {
            setQuotes([]);
            setIsQuoting(false);
            setHasCalculated(true);
        }
    });

    const createMutation = trpc.portal.customer.createShipment.useMutation({
        onSuccess: () => {
            toast.success('International shipment created successfully!');
            onSuccess();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create shipment');
        },
    });

    // Clear quotes when relevant fields change to ensure rates are fresh
    useEffect(() => {
        setQuotes([]);
        setIsQuoting(false);
        setHasCalculated(false);
    }, [formData.weight, formData.length, formData.width, formData.height, formData.destinationCountry, formData.shipperCountry]);

    const handleCalculateQuote = () => {
        const weightVal = parseFloat(formData.weight);
        if (isNaN(weightVal) || weightVal <= 0) {
            toast.error('Please enter a valid weight');
            return;
        }
        if (!formData.destinationCountry) {
            toast.error('Please select a destination country');
            return;
        }

        const lengthVal = parseFloat(formData.length);
        const widthVal = parseFloat(formData.width);
        const heightVal = parseFloat(formData.height);

        setIsQuoting(true);
        calculateQuoteMutation.mutate({
            token,
            originCountry: formData.shipperCountry,
            destinationCountry: formData.destinationCountry,
            realWeightKg: weightVal,
            dimensionsCm: {
                length: !isNaN(lengthVal) && lengthVal > 0 ? lengthVal : 10,
                width: !isNaN(widthVal) && widthVal > 0 ? widthVal : 10,
                height: !isNaN(heightVal) && heightVal > 0 ? heightVal : 10,
            }
        });
    };

    // Handle Submit
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const weightVal = parseFloat(formData.weight);
        if (isNaN(weightVal) || weightVal <= 0) {
            toast.error('Please enter a valid weight greater than 0');
            return;
        }
        if (!formData.serviceType) {
            toast.error('Please select an international shipping service');
            return;
        }

        createMutation.mutate({
            token,
            shipment: {
                ...formData,
                weight: weightVal,
                length: parseFloat(formData.length) || 0,
                width: parseFloat(formData.width) || 0,
                height: parseFloat(formData.height) || 0,
            }
        });
    };

    const handleSaveShipper = () => {
        if (!shipperNickname.trim()) return toast.error('Please enter a nickname');
        createShipperMutation.mutate({
            token, nickname: shipperNickname, shipperName: formData.shipperName,
            shipperAddress: formData.shipperAddress, shipperCity: formData.shipperCity,
            shipperCountry: formData.shipperCountry, shipperPhone: formData.shipperPhone,
        });
    };

    const selectedQuote = quotes.find(q => q.serviceKey === formData.serviceType);

    const canContinue = !!formData.destinationCountry && !!formData.weight && !!formData.serviceType;

    const getServiceIcon = (key: string) => {
        if (key.startsWith('PRIME_')) return <Plane className="w-5 h-5" />;
        if (key === 'GCC') return <Truck className="w-5 h-5" />;
        return <Box className="w-5 h-5" />;
    };

    const getServiceCardColors = (key: string, selected: boolean) => {
        const base = selected ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : 'hover:border-white/30';
        if (key.startsWith('PRIME_')) return `border-blue-500/30 ${base}`;
        if (key === 'GCC') return `border-emerald-500/30 ${base}`;
        return `border-purple-500/30 ${base}`;
    };

    const getServiceIconBg = (key: string) => {
        if (key.startsWith('PRIME_')) return 'bg-blue-500/10 text-blue-400';
        if (key === 'GCC') return 'bg-emerald-500/10 text-emerald-400';
        return 'bg-purple-500/10 text-purple-400';
    };

    /* ─── Stepper ─────────────────────────────────────────────────────────── */

    const Stepper = () => (
        <div className="flex items-center gap-2 mb-6">
            {/* Step 1 */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${phase === 1
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-md shadow-primary/5'
                : 'bg-primary/5 text-primary/70 border border-primary/10'
                }`}>
                {phase > 1 ? <CheckCircle2 className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
                <span>1. Quotation</span>
            </div>

            <ArrowRight className="w-4 h-4 text-muted-foreground/50" />

            {/* Step 2 */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${phase === 2
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-md shadow-primary/5'
                : 'bg-card/50 text-muted-foreground border border-border'
                }`}>
                <Package className="w-5 h-5" />
                <span>2. Shipment Details</span>
            </div>
        </div>
    );

    /* ─── Phase 1: Quotation ──────────────────────────────────────────────── */

    const Phase1 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Destination Country */}
                <div className="p-5 rounded-2xl bg-card border border-primary/10 shadow-xl shadow-primary/5 space-y-4 transition-all hover:border-primary/20">
                    <div className="border-b border-border pb-3">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Globe className="h-5 w-5 text-primary" /> Destination
                        </h3>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">Country *</Label>
                        <Popover open={openCountry} onOpenChange={setOpenCountry}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCountry}
                                    className="w-full justify-between bg-background border-primary/10 h-11 px-4 text-sm font-medium text-left shadow-sm hover:bg-primary/5 transition-colors"
                                >
                                    {formData.destinationCountry || <span className="text-muted-foreground">Select Country</span>}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0 border border-primary/10 glass-strong rounded-xl shadow-2xl" align="start">
                                <Command className="bg-transparent">
                                    <CommandInput placeholder="Search country..." className="h-10 text-sm" />
                                    <CommandList className="max-h-[300px]">
                                        <CommandEmpty>No country found.</CommandEmpty>
                                        <CommandGroup>
                                            {countries.map((c: string) => (
                                                <CommandItem
                                                    key={c}
                                                    value={c}
                                                    onSelect={() => {
                                                        setFormData(f => ({ ...f, destinationCountry: c, serviceType: '' }));
                                                        setOpenCountry(false);
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <Check className={`mr-2 h-4 w-4 ${formData.destinationCountry === c ? "text-primary opacity-100" : "opacity-0"}`} />
                                                    {c}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Package Details */}
                <div className="p-5 rounded-2xl bg-card border border-primary/10 shadow-xl shadow-primary/5 space-y-4 transition-all hover:border-primary/20">
                    <div className="border-b border-border pb-3">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" /> Package Details
                        </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weight (kg) *</Label>
                            <Input type="number" step="0.1" value={formData.weight} onChange={e => setFormData(f => ({ ...f, weight: e.target.value }))} className="bg-background border-primary/10 h-11 font-medium shadow-sm focus:ring-primary/20" placeholder="e.g. 1.5" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pieces *</Label>
                            <Input type="number" min="1" value={formData.pieces} onChange={e => setFormData(f => ({ ...f, pieces: parseInt(e.target.value) || 1 }))} className="bg-background border-primary/10 h-11 font-medium shadow-sm focus:ring-primary/20" />
                        </div>
                        <div className="col-span-2 grid grid-cols-3 gap-4">
                            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">L (cm)</Label><Input type="number" value={formData.length} onChange={e => setFormData(f => ({ ...f, length: e.target.value }))} placeholder="Opt" className="bg-background border-primary/10 h-11 font-medium shadow-sm focus:ring-primary/20" /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">W (cm)</Label><Input type="number" value={formData.width} onChange={e => setFormData(f => ({ ...f, width: e.target.value }))} placeholder="Opt" className="bg-background border-primary/10 h-11 font-medium shadow-sm focus:ring-primary/20" /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">H (cm)</Label><Input type="number" value={formData.height} onChange={e => setFormData(f => ({ ...f, height: e.target.value }))} placeholder="Opt" className="bg-background border-primary/10 h-11 font-medium shadow-sm focus:ring-primary/20" /></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <Button
                    type="button"
                    onClick={handleCalculateQuote}
                    disabled={!formData.destinationCountry || !formData.weight || isQuoting}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 h-11 px-8 rounded-xl transition-all"
                >
                    {isQuoting ? (
                        <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Calculating...</>
                    ) : (
                        <><Calculator className="w-5 h-5 mr-3" /> Calculate Rates</>
                    )}
                </Button>
            </div>

            {/* Service Selection — Cards */}
            <div className="space-y-4 pt-4">
                <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                    <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" /> Available Services
                </h3>

                {isQuoting ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Calculating rates...</span>
                    </div>
                ) : !hasCalculated ? (
                    <div className="text-center py-12 border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5">
                        <Info className="w-10 h-10 text-primary/50 mx-auto mb-4" />
                        <p className="text-base font-medium text-muted-foreground">Enter destination and weight, then click "Calculate Rates" to see available services</p>
                    </div>
                ) : quotes.length === 0 ? (
                    <div className="text-center py-8 border border-destructive/20 rounded-2xl bg-destructive/5">
                        <p className="text-sm font-bold text-destructive">No international services available for this destination.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {quotes.map((q) => {
                            const isSelected = formData.serviceType === q.serviceKey;
                            return (
                                <div
                                    key={q.serviceKey}
                                    onClick={() => setFormData(f => ({ ...f, serviceType: q.serviceKey }))}
                                    className={`relative p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${getServiceCardColors(q.serviceKey, isSelected)} bg-card hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5`}
                                >
                                    {/* Recommended badge */}
                                    {q.isRecommended && (
                                        <div className="absolute -top-2.5 left-3">
                                            <Badge className="bg-primary/90 text-white border-none text-[10px] px-2 py-0.5 shadow-md">
                                                <Star className="w-3 h-3 mr-1 fill-white" /> Recommended
                                            </Badge>
                                        </div>
                                    )}

                                    {/* Selected check */}
                                    {isSelected && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle2 className="w-5 h-5 text-primary" />
                                        </div>
                                    )}

                                    <div className="flex items-start gap-3 mt-1">
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${getServiceIconBg(q.serviceKey)}`}>
                                            {getServiceIcon(q.serviceKey)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-sm text-foreground truncate">{q.displayName}</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {q.bracketUsed.value} {q.bracketUsed.unit}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-white/10">
                                        {q.totalAfterDiscount ? (
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-lg font-bold text-primary">{q.totalAfterDiscount.toFixed(2)}</span>
                                                <span className="text-xs text-muted-foreground line-through">{q.total.toFixed(2)}</span>
                                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] ml-auto">-{q.discountPercent}%</Badge>
                                            </div>
                                        ) : (
                                            <span className="text-lg font-bold text-foreground">{q.total.toFixed(2)}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground ml-1">{q.currency}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Continue Button */}
            <div className="flex justify-end gap-4 pt-6 mt-4 border-t border-primary/10">
                <Button type="button" variant="outline" onClick={onSuccess} className="h-12 shadow-sm font-bold text-muted-foreground hover:text-foreground">Cancel</Button>
                <Button
                    type="button"
                    disabled={!canContinue}
                    onClick={() => setPhase(2)}
                    className="bg-primary hover:bg-primary/90 gap-2 text-primary-foreground font-black min-w-[180px] h-12 shadow-xl shadow-primary/20"
                >
                    Continue to Details <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );

    /* ─── Phase 2: Ship Details ───────────────────────────────────────────── */

    const Phase2 = () => (
        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Summary Card */}
            {selectedQuote && (
                <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shadow-lg shadow-primary/5">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${getServiceIconBg(selectedQuote.serviceKey)} shadow-inner`}>
                            {getServiceIcon(selectedQuote.serviceKey)}
                        </div>
                        <div>
                            <p className="font-bold text-foreground text-base tracking-tight">{selectedQuote.displayName}</p>
                            <p className="text-sm font-medium text-muted-foreground mt-0.5">
                                {formData.destinationCountry} · {formData.weight} kg · {formData.pieces} pc{formData.pieces > 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 border-t sm:border-t-0 border-primary/10 pt-3 sm:pt-0">
                        <div className="text-right">
                            <p className="text-2xl font-black text-primary font-mono tracking-tight shadow-sm">
                                {(selectedQuote.totalAfterDiscount ?? selectedQuote.total).toFixed(2)} <span className="text-sm font-semibold text-muted-foreground">{selectedQuote.currency}</span>
                            </p>
                            {selectedQuote.discountPercent && (
                                <p className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full inline-block mt-1">-{selectedQuote.discountPercent}% discount</p>
                            )}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setPhase(1)} className="gap-2 text-xs font-semibold hover:bg-primary/10 border-primary/20 text-primary">
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECTION 1: SHIPPER */}
                <div className="p-5 rounded-2xl bg-card border border-primary/10 shadow-xl shadow-primary/5 space-y-4 transition-all hover:border-primary/20">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <LayoutDashboard className="h-5 w-5 text-blue-500" /> Shipper Details
                        </h3>
                        {savedShippers.length > 0 && (
                            <Select onValueChange={(id) => {
                                const s = savedShippers.find((x: any) => x.id.toString() === id);
                                if (s) setFormData(f => ({ ...f, shipperName: s.shipperName, shipperAddress: s.shipperAddress, shipperCity: s.shipperCity, shipperCountry: s.shipperCountry, shipperPhone: s.shipperPhone }));
                            }}>
                                <SelectTrigger className="w-[140px] h-8 text-xs bg-background border-primary/10 font-medium hover:bg-primary/5"><SelectValue placeholder="📋 Load Saved" /></SelectTrigger>
                                <SelectContent className="border-primary/10 shadow-xl glass-strong">
                                    {savedShippers.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id.toString()}>{s.nickname}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company *</Label><Input value={formData.shipperName} onChange={e => setFormData(f => ({ ...f, shipperName: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone *</Label><Input value={formData.shipperPhone} onChange={e => setFormData(f => ({ ...f, shipperPhone: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City *</Label><Input value={formData.shipperCity} onChange={e => setFormData(f => ({ ...f, shipperCity: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" placeholder="Dubai / Abu Dhabi" /></div>
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Country *</Label><Input value={formData.shipperCountry} disabled className="bg-muted border-primary/10 h-11 opacity-70 font-medium" /></div>
                        <div className="col-span-2 space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address *</Label><Input value={formData.shipperAddress} onChange={e => setFormData(f => ({ ...f, shipperAddress: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-end mt-2">
                        <Dialog open={showSaveShipperDialog} onOpenChange={setShowSaveShipperDialog}>
                            <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="gap-2 font-bold shadow-sm hover:bg-primary/5 hover:text-primary"><Save className="h-4 w-4" /> Save Shipper</Button>
                            </DialogTrigger>
                            <DialogContent className="glass-strong border-primary/20 shadow-2xl rounded-2xl">
                                <DialogHeader><DialogTitle className="text-foreground font-black">Save Shipper</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2"><Label className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Nickname *</Label><Input value={shipperNickname} onChange={e => setShipperNickname(e.target.value)} className="bg-background border-primary/10 h-11 focus:ring-primary/20" /></div>
                                </div>
                                <div className="flex justify-end gap-3 mt-4">
                                    <Button type="button" variant="outline" onClick={() => setShowSaveShipperDialog(false)}>Cancel</Button>
                                    <Button type="button" className="bg-primary hover:bg-primary/90 font-bold px-6 shadow-lg shadow-primary/20" onClick={handleSaveShipper}>Save</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* SECTION 2: CONSIGNEE */}
                <div className="p-5 rounded-2xl bg-card border border-primary/10 shadow-xl shadow-primary/5 space-y-4 transition-all hover:border-primary/20">
                    <div className="border-b border-border pb-3">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Globe className="h-5 w-5 text-green-500" /> Consignee (International)
                        </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Name *</Label><Input value={formData.customerName} onChange={e => setFormData(f => ({ ...f, customerName: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone *</Label><Input value={formData.customerPhone} onChange={e => setFormData(f => ({ ...f, customerPhone: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Country *</Label>
                            <Input value={formData.destinationCountry} disabled className="bg-muted border-primary/10 h-11 opacity-70 font-medium" />
                        </div>
                        <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City/Region *</Label><Input value={formData.city} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                        <div className="col-span-2 space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Complete Address *</Label><Input value={formData.address} onChange={e => setFormData(f => ({ ...f, address: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>
                    </div>
                </div>
            </div>

            {/* SECTION 3: CUSTOMS */}
            <div className="p-5 rounded-2xl bg-card border border-primary/10 shadow-xl shadow-primary/5 space-y-4 transition-all hover:border-primary/20">
                <div className="border-b border-border pb-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-purple-500" /> Customs Declaration
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="md:col-span-2 space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goods Description *</Label><Input value={formData.customsDescription} onChange={e => setFormData(f => ({ ...f, customsDescription: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" placeholder="e.g. Cotton T-shirts, Electronics" /></div>

                    <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Declared Value *</Label><Input type="number" step="0.01" value={formData.customsValue} onChange={e => setFormData(f => ({ ...f, customsValue: e.target.value }))} required className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" /></div>

                    <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency *</Label>
                        <Select value={formData.customsCurrency} onValueChange={v => setFormData(f => ({ ...f, customsCurrency: v }))}>
                            <SelectTrigger className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent className="glass-strong border-primary/10 rounded-xl">
                                <SelectItem value="USD">USD ($)</SelectItem>
                                <SelectItem value="EUR">EUR (€)</SelectItem>
                                <SelectItem value="AED">AED</SelectItem>
                                <SelectItem value="GBP">GBP (£)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="md:col-span-2 space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">HS Code (Optional)</Label><Input value={formData.hsCode} onChange={e => setFormData(f => ({ ...f, hsCode: e.target.value }))} className="bg-background border-primary/10 h-11 focus:ring-primary/20 shadow-sm" placeholder="Harmonized System Code" /></div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-4 pt-6 border-t border-primary/10 mt-6">
                <Button type="button" variant="outline" onClick={() => setPhase(1)} className="gap-2 h-12 shadow-sm order-1 sm:order-none font-bold text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" /> Back to Quotation
                </Button>
                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={onSuccess} className="h-12 shadow-sm">Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || !formData.serviceType} className="bg-primary hover:bg-primary/90 gap-2 text-primary-foreground font-black px-8 h-12 shadow-xl shadow-primary/20">
                        {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Package className="w-5 h-5" />}
                        {createMutation.isPending ? 'Creating Waybill...' : 'Create International Shipment'}
                    </Button>
                </div>
            </div>
        </form>
    );

    /* ─── Render ──────────────────────────────────────────────────────────── */

    return (
        <div>
            {Stepper()}
            {phase === 1 ? Phase1() : Phase2()}
        </div>
    );
}
