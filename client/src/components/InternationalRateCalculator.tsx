/**
 * InternationalRateCalculator — Customer-facing international rate calculator.
 * Permission-gated: shows "contact support" message if intlAllowed is disabled.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Globe,
    Package,
    Scale,
    Ruler,
    Calculator,
    Star,
    AlertCircle,
    Loader2,
    Mail,
    Phone,
    ArrowRight,
    Info,
    Plane,
    Truck,
    Box,
} from 'lucide-react';

interface ServiceOption {
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

interface QuoteResult {
    inputs: any;
    calc: {
        realKg: number;
        volKg: number;
        billableKg: number;
        billableKgRounded05: number;
        primeGramsBracket: number;
    };
    options: ServiceOption[];
    reasons: string[];
}

export default function InternationalRateCalculator() {
    const { token } = usePortalAuth();

    // Client settings to check permission
    const { data: clientSettings, isLoading: settingsLoading } = trpc.portal.customer.getMyAccount.useQuery(
        { token: token || '' },
        { enabled: !!token }
    );

    // Country list
    const { data: countries } = trpc.portal.internationalRates.countries.useQuery(
        { token: token || '' },
        { enabled: !!token && clientSettings?.intlAllowed === 1 }
    );

    // Form state
    const [originCountry, setOriginCountry] = useState('United Arab Emirates');
    const [destinationCountry, setDestinationCountry] = useState('');
    const [realWeightKg, setRealWeightKg] = useState('');
    const [length, setLength] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
    const [countrySearch, setCountrySearch] = useState('');

    // Quote mutation
    const quoteMutation = trpc.portal.internationalRates.quote.useMutation({
        onSuccess: (data) => setQuoteResult(data as QuoteResult),
    });

    const handleQuote = () => {
        if (!destinationCountry || !realWeightKg || !length || !width || !height) return;
        quoteMutation.mutate({
            token: token || '',
            originCountry,
            destinationCountry,
            realWeightKg: parseFloat(realWeightKg),
            dimensionsCm: {
                length: parseFloat(length),
                width: parseFloat(width),
                height: parseFloat(height),
            },
        });
    };

    const filteredCountries = countries?.filter((c: string) =>
        c.toLowerCase().includes(countrySearch.toLowerCase())
    ) || [];

    const getServiceIcon = (key: string) => {
        if (key.startsWith('PRIME_')) return <Plane className="w-5 h-5" />;
        if (key === 'GCC') return <Truck className="w-5 h-5" />;
        return <Box className="w-5 h-5" />;
    };

    const getServiceColor = (key: string) => {
        if (key.startsWith('PRIME_')) return 'border-blue-500/30 hover:border-blue-400/50';
        if (key === 'GCC') return 'border-emerald-500/30 hover:border-emerald-400/50';
        return 'border-purple-500/30 hover:border-purple-400/50';
    };

    const getServiceBadgeColor = (key: string) => {
        if (key.startsWith('PRIME_')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (key === 'GCC') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    };

    // Loading state
    if (settingsLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // Permission gate
    if (!clientSettings || clientSettings.intlAllowed !== 1) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <Card className="glass-strong border-amber-500/20 overflow-hidden">
                    <div className="w-full h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                    <CardHeader className="text-center pb-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                            <Globe className="w-8 h-8 text-amber-400" />
                        </div>
                        <CardTitle className="text-2xl">International Shipping</CardTitle>
                        <CardDescription className="text-base mt-2">
                            International shipping is not currently enabled for your account.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center space-y-6 pb-8">
                        <p className="text-muted-foreground">
                            Contact our team to activate international shipping services and start sending packages worldwide.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button variant="outline" className="gap-2" onClick={() => window.location.href = 'mailto:support@pathxpress.ae'}>
                                <Mail className="w-4 h-4" /> support@pathxpress.net
                            </Button>
                            <Button variant="outline" className="gap-2" onClick={() => window.location.href = 'tel:+97142345678'}>
                                <Phone className="w-4 h-4" /> +971 52 280 3433
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Full Calculator UI
    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-1 mb-8">
                <h2 className="text-3xl font-black tracking-tight text-foreground">International Calculator</h2>
                <p className="text-muted-foreground text-lg max-w-2xl">Calculate shipping rates to 200+ countries worldwide and compare our global services.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                {/* Form Panel */}
                <Card className="lg:col-span-2 glass-strong border-blue-500/20 overflow-hidden">
                    <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Calculator className="w-5 h-5 text-blue-400" /> Shipment Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Origin */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-blue-400" /> Origin Country
                            </Label>
                            <Input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} className="bg-background/50" />
                        </div>

                        {/* Destination */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-indigo-400" /> Destination Country
                            </Label>
                            <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Select destination" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <div className="p-2 sticky top-0 bg-popover">
                                        <Input
                                            placeholder="Search country..."
                                            value={countrySearch}
                                            onChange={(e) => setCountrySearch(e.target.value)}
                                            className="h-8"
                                        />
                                    </div>
                                    {filteredCountries.map((c: string) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Weight */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Scale className="w-3.5 h-3.5 text-green-400" /> Real Weight (kg)
                            </Label>
                            <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                placeholder="e.g. 1.5"
                                value={realWeightKg}
                                onChange={(e) => setRealWeightKg(e.target.value)}
                                className="bg-background/50"
                            />
                        </div>

                        {/* Dimensions */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2">
                                <Ruler className="w-3.5 h-3.5 text-purple-400" /> Dimensions (cm)
                            </Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Input type="number" step="0.1" min="0.1" placeholder="L" value={length} onChange={(e) => setLength(e.target.value)} className="bg-background/50" />
                                <Input type="number" step="0.1" min="0.1" placeholder="W" value={width} onChange={(e) => setWidth(e.target.value)} className="bg-background/50" />
                                <Input type="number" step="0.1" min="0.1" placeholder="H" value={height} onChange={(e) => setHeight(e.target.value)} className="bg-background/50" />
                            </div>
                            <p className="text-xs text-muted-foreground">Length × Width × Height in centimeters</p>
                        </div>

                        <div className="pt-4">
                            <Button
                                onClick={handleQuote}
                                disabled={quoteMutation.isPending || !destinationCountry || !realWeightKg || !length || !width || !height}
                                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 text-lg group"
                            >
                                {quoteMutation.isPending ? (
                                    <span className="material-symbols-outlined animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined group-hover:scale-110 transition-transform">calculate</span>
                                )}
                                {quoteMutation.isPending ? 'Calculating...' : 'Calculate Exact Rate'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Results Panel */}
                <div className="lg:col-span-3 space-y-4">
                    {quoteMutation.error && (
                        <Card className="glass-strong border-red-500/20">
                            <CardContent className="py-4 flex items-center gap-3 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>{quoteMutation.error.message}</p>
                            </CardContent>
                        </Card>
                    )}

                    {quoteResult && (
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-500">
                            {/* Calculation Summary */}
                            <Card className="glass-strong border-blue-500/20">
                                <CardContent className="py-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Info className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-medium">Weight Calculation</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div className="p-3 rounded-lg bg-white/5">
                                            <p className="text-xs text-muted-foreground">Real Weight</p>
                                            <p className="text-lg font-bold">{quoteResult.calc.realKg.toFixed(2)} kg</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-white/5">
                                            <p className="text-xs text-muted-foreground">Volumetric</p>
                                            <p className="text-lg font-bold">{quoteResult.calc.volKg.toFixed(2)} kg</p>
                                        </div>
                                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                                            <p className="text-xs text-primary">Billable Weight</p>
                                            <p className="text-lg font-bold text-primary">{quoteResult.calc.billableKgRounded05.toFixed(1)} kg</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Service Options */}
                            {quoteResult.options.length > 0 ? (
                                quoteResult.options.map((opt) => (
                                    <Card
                                        key={opt.serviceKey}
                                        className={`glass-strong ${getServiceColor(opt.serviceKey)} transition-all duration-300 overflow-hidden ${opt.isRecommended ? 'ring-1 ring-primary/50' : ''}`}
                                    >
                                        {opt.isRecommended && (
                                            <div className="w-full bg-gradient-to-r from-primary/20 to-indigo-500/20 px-4 py-1.5 flex items-center gap-2">
                                                <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                                                <span className="text-xs font-semibold text-primary">Recommended</span>
                                            </div>
                                        )}
                                        <CardContent className={`${opt.isRecommended ? 'pt-4' : 'pt-6'} pb-5`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${opt.serviceKey.startsWith('PRIME_') ? 'bg-blue-500/10 text-blue-400' :
                                                        opt.serviceKey === 'GCC' ? 'bg-emerald-500/10 text-emerald-400' :
                                                            'bg-purple-500/10 text-purple-400'
                                                        }`}>
                                                        {getServiceIcon(opt.serviceKey)}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-base">{opt.displayName}</h3>
                                                        <Badge variant="outline" className={`text-xs mt-1 ${getServiceBadgeColor(opt.serviceKey)}`}>
                                                            {opt.bracketUsed.value} {opt.bracketUsed.unit}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {opt.totalAfterDiscount ? (
                                                        <>
                                                            <p className="text-sm text-muted-foreground line-through">{opt.total.toFixed(2)} {opt.currency}</p>
                                                            <p className="text-2xl font-bold text-primary">{opt.totalAfterDiscount.toFixed(2)} <span className="text-sm">{opt.currency}</span></p>
                                                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                                                -{opt.discountPercent}% discount
                                                            </Badge>
                                                        </>
                                                    ) : (
                                                        <p className="text-2xl font-bold">{opt.total.toFixed(2)} <span className="text-sm text-muted-foreground">{opt.currency}</span></p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Breakdown */}
                                            {Object.keys(opt.breakdown).length > 1 && (
                                                <div className="mt-3 p-2.5 rounded-lg bg-white/5 text-xs space-y-1">
                                                    {Object.entries(opt.breakdown).map(([k, v]) => (
                                                        <div key={k} className="flex justify-between text-muted-foreground">
                                                            <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                                                            <span>{(v as number).toFixed(2)} AED</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Notes */}
                                            <div className="mt-3 space-y-1">
                                                {opt.notes.map((note, i) => (
                                                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                        <span className="text-muted-foreground/50 mt-px">•</span>
                                                        {note}
                                                    </p>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <Card className="glass-strong border-amber-500/20">
                                    <CardContent className="py-8 text-center">
                                        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                                        <h3 className="text-lg font-semibold mb-2">No Services Available</h3>
                                        <p className="text-muted-foreground text-sm mb-4">No international shipping services are available for this route and specifications.</p>
                                        {quoteResult.reasons.length > 0 && (
                                            <div className="text-left max-w-md mx-auto space-y-1">
                                                {quoteResult.reasons.map((r, i) => (
                                                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                        <Info className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" /> {r}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Empty state */}
                    {!quoteResult && !quoteMutation.error && (
                        <Card className="glass-strong border-dashed border-white/10">
                            <CardContent className="py-16 text-center">
                                <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-muted-foreground">Ready to Calculate</h3>
                                <p className="text-sm text-muted-foreground/70 mt-1">
                                    Fill in the shipment details on the left and click "Get Quote"
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
