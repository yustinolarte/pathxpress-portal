/**
 * AdminInternationalShipping — Admin panel for managing international shipping.
 * Sub-tabs: Orders, Rate Calculator, Rate Management, Quote Requests
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Globe,
    Calculator,
    Settings,
    FileText,
    Package,
    Scale,
    Ruler,
    Star,
    AlertCircle,
    Loader2,
    Save,
    Plane,
    Truck,
    Box,
    Info,
    Search,
    Edit3,
    MapPin,
    Download,
    Plus,
    Trash2
} from 'lucide-react';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';
import { generateQuotationPDF } from '@/lib/generateQuotationPDF';
import AdminCreateIntlOrderDialog from './AdminCreateIntlOrderDialog';

// ─── Inline Rate Calculator (reused from customer side) ─────────────────────

function AdminRateCalculator() {
    const { data: countries } = trpc.portal.internationalRates.countries.useQuery();

    const [originCountry, setOriginCountry] = useState('United Arab Emirates');
    const [destinationCountry, setDestinationCountry] = useState('');
    const [realWeightKg, setRealWeightKg] = useState('');
    const [length, setLength] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [quoteResult, setQuoteResult] = useState<any>(null);
    const [countrySearch, setCountrySearch] = useState('');

    const quoteMutation = trpc.portal.internationalRates.quote.useMutation({
        onSuccess: (data) => setQuoteResult(data),
    });

    const handleQuote = () => {
        if (!destinationCountry || !realWeightKg || !length || !width || !height) return;
        quoteMutation.mutate({
            originCountry,
            destinationCountry,
            realWeightKg: parseFloat(realWeightKg),
            dimensionsCm: { length: parseFloat(length), width: parseFloat(width), height: parseFloat(height) },
        });
    };

    const filteredCountries = countries?.filter((c: string) => c.toLowerCase().includes(countrySearch.toLowerCase())) || [];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-strong border-blue-500/20">
                <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-400" /> Test Calculator</CardTitle>
                    <CardDescription>Test international rates as admin (no discount applied)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm">Origin</Label>
                        <Input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">Destination</Label>
                        <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                            <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select destination" /></SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                <div className="p-2 sticky top-0 bg-popover z-10 relative border-b border-border">
                                    <Input placeholder="Search..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="h-8" />
                                </div>
                                {filteredCountries.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label className="text-sm">Client Name</Label>
                            <Input placeholder="e.g. Noor and Grace" value={clientName} onChange={(e) => setClientName(e.target.value)} className="bg-background/50" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">Client Phone</Label>
                            <Input placeholder="+971 XX XXX XXXX" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="bg-background/50" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label className="text-sm">Weight (kg)</Label>
                            <Input type="number" step="0.1" placeholder="e.g. 1.5" value={realWeightKg} onChange={(e) => setRealWeightKg(e.target.value)} className="bg-background/50" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">Quantity (packages)</Label>
                            <Input type="number" min="1" placeholder="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-background/50" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">Dimensions (cm)</Label>
                        <div className="grid grid-cols-3 gap-2">
                            <Input type="number" placeholder="L" value={length} onChange={(e) => setLength(e.target.value)} className="bg-background/50" />
                            <Input type="number" placeholder="W" value={width} onChange={(e) => setWidth(e.target.value)} className="bg-background/50" />
                            <Input type="number" placeholder="H" value={height} onChange={(e) => setHeight(e.target.value)} className="bg-background/50" />
                        </div>
                    </div>
                    <Button onClick={handleQuote} disabled={quoteMutation.isPending || !destinationCountry || !realWeightKg} className="w-full">
                        {quoteMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating...</> : <><Calculator className="mr-2 h-4 w-4" /> Calculate</>}
                    </Button>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {quoteMutation.error && (
                    <Card className="glass-strong border-red-500/20">
                        <CardContent className="py-4 flex items-center gap-3 text-red-400">
                            <AlertCircle className="w-5 h-5" /> {quoteMutation.error.message}
                        </CardContent>
                    </Card>
                )}
                {quoteResult?.options?.map((opt: any) => (
                    <Card key={opt.serviceKey} className={`glass-strong transition-all ${opt.isRecommended ? 'ring-1 ring-primary/50 border-primary/30' : 'border-white/10'}`}>
                        {opt.isRecommended && (
                            <div className="bg-primary/10 px-4 py-1 flex items-center gap-2">
                                <Star className="w-3 h-3 text-primary fill-primary" /> <span className="text-xs font-semibold text-primary">Recommended</span>
                            </div>
                        )}
                        <CardContent className={`${opt.isRecommended ? 'pt-3' : 'pt-5'} pb-4`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold">{opt.displayName}</h3>
                                    <Badge variant="outline" className="text-xs mt-1">{opt.bracketUsed.value} {opt.bracketUsed.unit}</Badge>
                                </div>
                                <p className="text-2xl font-bold">{opt.total.toFixed(2)} <span className="text-sm text-muted-foreground">{opt.currency}</span></p>
                            </div>
                            <div className="mt-2 space-y-0.5">
                                {opt.notes.map((n: string, i: number) => <p key={i} className="text-xs text-muted-foreground">• {n}</p>)}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {quoteResult?.options?.length > 0 && (
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => generateQuotationPDF({
                            originCountry,
                            destinationCountry,
                            realWeightKg: parseFloat(realWeightKg),
                            dimensions: { length: parseFloat(length), width: parseFloat(width), height: parseFloat(height) },
                            options: quoteResult.options,
                            clientName: clientName || undefined,
                            clientPhone: clientPhone || undefined,
                            quantity: parseInt(quantity) || 1,
                        })}
                    >
                        <Download className="mr-2 h-4 w-4" /> Download Quote PDF
                    </Button>
                )}
                {quoteResult?.options?.length === 0 && (
                    <Card className="glass-strong border-amber-500/20">
                        <CardContent className="py-6 text-center">
                            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                            <p className="font-semibold">No services available</p>
                            {quoteResult.reasons.map((r: string, i: number) => <p key={i} className="text-xs text-muted-foreground mt-1">• {r}</p>)}
                        </CardContent>
                    </Card>
                )}
                {!quoteResult && !quoteMutation.error && (
                    <Card className="glass-strong border-dashed border-white/10">
                        <CardContent className="py-12 text-center">
                            <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-muted-foreground">Results will appear here</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

// ─── Rate Management Table ──────────────────────────────────────────────────

function RateManagement() {
    const [rateType, setRateType] = useState<'prime' | 'gcc' | 'premium'>('gcc');
    const [editingRate, setEditingRate] = useState<{ id: number; price: string } | null>(null);
    const [filterSearch, setFilterSearch] = useState('');

    const { data: rates, isLoading, refetch } = trpc.portal.internationalRates.getAll.useQuery(
        { rateType }
    );

    const updateMutation = trpc.portal.internationalRates.updateRate.useMutation({
        onSuccess: () => {
            setEditingRate(null);
            refetch();
        },
    });

    const handleSave = () => {
        if (!editingRate) return;
        updateMutation.mutate({ rateId: editingRate.id, price: editingRate.price });
    };

    const filteredRates = rates?.filter((r: any) => {
        const search = filterSearch.toLowerCase();
        if (!search) return true;
        return (r.country?.toLowerCase().includes(search)) ||
            (r.zone?.toLowerCase().includes(search)) ||
            (r.serviceKey?.toLowerCase().includes(search)) ||
            (r.weightBracket?.includes(search));
    }) || [];

    // Group rates for display
    const groupKey = (r: any) => r.country || r.zone || 'Unknown';
    const grouped = filteredRates.reduce((acc: Record<string, any[]>, r: any) => {
        const key = groupKey(r);
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Select value={rateType} onValueChange={(v: any) => setRateType(v)}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gcc">GCC Rates</SelectItem>
                        <SelectItem value="prime">PRIME E-Packets</SelectItem>
                        <SelectItem value="premium">Premium Zones</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex-1 max-w-sm">
                    <Input placeholder="Search by country, zone, or weight..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="bg-background/50" />
                </div>
                <Badge variant="outline">{filteredRates.length} rates</Badge>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                    {Object.entries(grouped).map(([group, items]) => (
                        <Card key={group} className="glass-strong border-white/10">
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-primary" /> {group}
                                    <Badge variant="outline" className="text-xs ml-auto">{(items as any[]).length} brackets</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-3">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[80px]">Weight</TableHead>
                                                {rateType === 'prime' && <TableHead>Service</TableHead>}
                                                <TableHead className="w-[120px]">Price (AED)</TableHead>
                                                <TableHead className="w-[80px]">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(items as any[]).sort((a, b) => parseFloat(a.weightBracket) - parseFloat(b.weightBracket) || (a.serviceKey || '').localeCompare(b.serviceKey || '')).map((rate: any) => (
                                                <TableRow key={rate.id}>
                                                    <TableCell className="font-mono text-sm">{rate.weightBracket} kg</TableCell>
                                                    {rateType === 'prime' && <TableCell><Badge variant="outline" className="text-xs">{rate.serviceKey}</Badge></TableCell>}
                                                    <TableCell>
                                                        {editingRate?.id === rate.id ? (
                                                            <Input
                                                                value={editingRate!.price}
                                                                onChange={(e) => setEditingRate({ id: rate.id, price: e.target.value })}
                                                                className="h-8 w-24 bg-background/50"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span className="font-mono">{parseFloat(rate.price).toFixed(2)}</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {editingRate?.id === rate.id ? (
                                                            <Button size="sm" variant="ghost" onClick={handleSave} disabled={updateMutation.isPending}>
                                                                <Save className="w-3.5 h-3.5" />
                                                            </Button>
                                                        ) : (
                                                            <Button size="sm" variant="ghost" onClick={() => setEditingRate({ id: rate.id, price: rate.price })}>
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Quote Requests Table ───────────────────────────────────────────────────

function QuoteRequestsTable() {
    return (
        <Card className="glass-strong border-white/10">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> International Quote Requests</CardTitle>
                <CardDescription>Track incoming international shipping inquiries</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-center py-12">
                    <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">Coming Soon</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">International quote request tracking will be available here</p>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Admin International Orders Table ───────────────────────────────────────

function AdminIntlOrdersTable() {
    const [filterSearch, setFilterSearch] = useState('');
    const [newShipmentOpen, setNewShipmentOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const { data: orders, isLoading, refetch } = trpc.portal.admin.getIntlOrders.useQuery();

    const { data: clients } = trpc.portal.admin.getClients.useQuery();

    const { data: countries } = trpc.portal.internationalRates.countries.useQuery();

    const deleteMutation = trpc.portal.admin.deleteOrder.useMutation({
        onSuccess: () => {
            setDeletingId(null);
            refetch();
        },
        onError: () => {
            setDeletingId(null);
        },
    });

    const handleDelete = (orderId: number, waybillNumber: string) => {
        if (!window.confirm(`Delete order ${waybillNumber}? This cannot be undone.`)) return;
        setDeletingId(orderId);
        deleteMutation.mutate({ orderId });
    };

    const filteredOrders = orders?.filter((order: any) => {
        const search = filterSearch.toLowerCase();
        if (!search) return true;
        return (
            (order.waybillNumber?.toLowerCase().includes(search)) ||
            (order.customerName?.toLowerCase().includes(search)) ||
            (order.destinationCountry?.toLowerCase().includes(search)) ||
            (order.serviceType?.toLowerCase().includes(search))
        );
    }) || [];

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending_pickup: 'bg-yellow-500',
            in_transit: 'bg-blue-500',
            out_for_delivery: 'bg-purple-500',
            delivered: 'bg-green-500',
            failed_delivery: 'bg-red-500',
            returned: 'bg-gray-500',
        };
        return colors[status] || 'bg-gray-400';
    };

    const getStatusLabel = (status: string) => status.replace(/_/g, ' ').toUpperCase();

    return (
        <>
        <Card className="glass-strong border-green-500/20">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Package className="w-5 h-5 text-green-400" /> International Orders
                    </CardTitle>
                    <CardDescription>View all cross-border shipments</CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Input
                        placeholder="Search waybill, customer, country..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        className="w-full sm:w-[250px] bg-background/50 h-9"
                    />
                    <Button size="sm" onClick={() => setNewShipmentOpen(true)}>
                        <Plus className="mr-1 h-4 w-4" /> New Shipment
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : filteredOrders.length > 0 ? (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Waybill</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Destination</TableHead>
                                    <TableHead>Weight</TableHead>
                                    <TableHead>Service</TableHead>
                                    <TableHead>Customs Value</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.map((order: any) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-mono font-medium">{order.waybillNumber}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{order.customerName}</span>
                                                <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{order.destinationCountry}</span>
                                                <span className="text-xs text-muted-foreground">{order.city}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{order.weight} kg</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                                                {order.serviceType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {order.customsValue ? (
                                                <div className="flex items-center gap-1 font-mono text-xs">
                                                    <span className="text-muted-foreground">{order.customsCurrency}</span>
                                                    <span>{order.customsValue}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={getStatusColor(order.status)}>
                                                {getStatusLabel(order.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => generateWaybillPDF(order as any)}
                                                    title="Download Waybill"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(order.id, order.waybillNumber)}
                                                    disabled={deletingId === order.id}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    title="Delete Order"
                                                >
                                                    {deletingId === order.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4" />
                                                    }
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-12 flex flex-col items-center justify-center">
                        <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No International Shipments Found</h3>
                        <p className="text-muted-foreground max-w-sm">
                            There are currently no international orders matching your search.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
        <AdminCreateIntlOrderDialog
            open={newShipmentOpen}
            onOpenChange={setNewShipmentOpen}
            clients={clients}
            countries={countries || []}
            onSuccess={() => { setNewShipmentOpen(false); refetch(); }}
        />
        </>
    );
}

// ─── Main Admin International Panel ─────────────────────────────────────────

export default function AdminInternationalShipping() {
    const [subTab, setSubTab] = useState('orders');

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold">International Shipping</h2>
                    <p className="text-sm text-muted-foreground">Manage orders, rates, test calculator, and view requests</p>
                </div>
            </div>

            <Tabs value={subTab} onValueChange={setSubTab}>
                <TabsList className="bg-background/50">
                    <TabsTrigger value="orders" className="gap-2"><Package className="w-4 h-4" /> Orders</TabsTrigger>
                    <TabsTrigger value="calculator" className="gap-2"><Calculator className="w-4 h-4" /> Rate Calculator</TabsTrigger>
                    <TabsTrigger value="rates" className="gap-2"><Settings className="w-4 h-4" /> Rate Management</TabsTrigger>
                    <TabsTrigger value="requests" className="gap-2"><FileText className="w-4 h-4" /> Quote Requests</TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="mt-4">
                    <AdminIntlOrdersTable />
                </TabsContent>

                <TabsContent value="calculator" className="mt-4">
                    <AdminRateCalculator />
                </TabsContent>

                <TabsContent value="rates" className="mt-4">
                    <RateManagement />
                </TabsContent>

                <TabsContent value="requests" className="mt-4">
                    <QuoteRequestsTable />
                </TabsContent>
            </Tabs>
        </div>
    );
}
