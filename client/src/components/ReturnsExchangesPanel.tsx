import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Search, Plus, RotateCcw, ArrowLeftRight, Package, Download, DollarSign } from 'lucide-react';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';

interface ReturnsExchangesPanelProps {
    token: string;
    codAllowed?: boolean;
}

export default function ReturnsExchangesPanel({ token, codAllowed = false }: ReturnsExchangesPanelProps) {
    const [searchWaybill, setSearchWaybill] = useState('');
    const [foundOrder, setFoundOrder] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createType, setCreateType] = useState<'return' | 'exchange'>('return');
    const [manualDialogOpen, setManualDialogOpen] = useState(false);

    // Edit COD state
    const [editCodDialogOpen, setEditCodDialogOpen] = useState(false);
    const [editCodOrder, setEditCodOrder] = useState<any>(null);
    const [editCodForm, setEditCodForm] = useState({
        codRequired: 0,
        codAmount: '',
        codCurrency: 'AED',
    });

    // Form for new exchange shipment
    const [exchangeForm, setExchangeForm] = useState({
        customerName: '',
        customerPhone: '',
        address: '',
        city: '',
        destinationCountry: 'UAE',
        pieces: 1,
        weight: '',
        serviceType: 'DOM',
        specialInstructions: '',
        codRequired: 0,
        codAmount: '',
        codCurrency: 'AED',
    });

    // Form for manual return/exchange (no existing waybill)
    const [manualForm, setManualForm] = useState({
        type: 'return' as 'return' | 'exchange',
        // Pickup (where the package is)
        pickupName: '',
        pickupPhone: '',
        pickupAddress: '',
        pickupCity: '',
        pickupCountry: 'UAE',
        // Delivery (where it goes)
        deliveryName: '',
        deliveryPhone: '',
        deliveryAddress: '',
        deliveryCity: '',
        deliveryCountry: 'UAE',
        // Package
        pieces: 1,
        weight: '',
        serviceType: 'DOM',
        specialInstructions: '',
        // For exchange - new shipment details
        exchangeCustomerName: '',
        exchangeCustomerPhone: '',
        exchangeAddress: '',
        exchangeCity: '',
        exchangePieces: 1,
        exchangeWeight: '',
        exchangeCodRequired: 0,
        exchangeCodAmount: '',
        exchangeCodCurrency: 'AED',
    });

    // Fetch returns/exchanges for this client
    const { data: returnsExchanges, isLoading, refetch } = trpc.portal.customer.getMyReturnsExchanges.useQuery(
        { token },
        { enabled: !!token }
    );

    // Search order mutation
    const searchOrderMutation = trpc.portal.customer.searchOrderForReturn.useMutation({
        onSuccess: (data) => {
            setFoundOrder(data);
            setIsSearching(false);
        },
        onError: (error) => {
            toast.error(error.message);
            setFoundOrder(null);
            setIsSearching(false);
        },
    });

    // Create return mutation
    const createReturnMutation = trpc.portal.customer.createReturnRequest.useMutation({
        onSuccess: (data) => {
            toast.success(data.message || 'Return created successfully!');
            setCreateDialogOpen(false);
            setFoundOrder(null);
            setSearchWaybill('');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    // Create exchange mutation
    const createExchangeMutation = trpc.portal.customer.createExchangeRequest.useMutation({
        onSuccess: (data) => {
            toast.success(data.message || 'Exchange created successfully!');
            setCreateDialogOpen(false);
            setFoundOrder(null);
            setSearchWaybill('');
            setExchangeForm({
                customerName: '',
                customerPhone: '',
                address: '',
                city: '',
                destinationCountry: 'UAE',
                pieces: 1,
                weight: '',
                serviceType: 'DOM',
                specialInstructions: '',
                codRequired: 0,
                codAmount: '',
                codCurrency: 'AED',
            });
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    // Create manual return/exchange mutation
    const createManualMutation = trpc.portal.customer.createManualReturnExchange.useMutation({
        onSuccess: (data) => {
            toast.success(data.message || 'Created successfully!');
            setManualDialogOpen(false);
            setManualForm({
                type: 'return',
                pickupName: '',
                pickupPhone: '',
                pickupAddress: '',
                pickupCity: '',
                pickupCountry: 'UAE',
                deliveryName: '',
                deliveryPhone: '',
                deliveryAddress: '',
                deliveryCity: '',
                deliveryCountry: 'UAE',
                pieces: 1,
                weight: '',
                serviceType: 'DOM',
                specialInstructions: '',
                exchangeCustomerName: '',
                exchangeCustomerPhone: '',
                exchangeAddress: '',
                exchangeCity: '',
                exchangePieces: 1,
                exchangeWeight: '',
                exchangeCodRequired: 0,
                exchangeCodAmount: '',
                exchangeCodCurrency: 'AED',
            });
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    // Update exchange COD mutation
    const updateCodMutation = trpc.portal.customer.updateExchangeCod.useMutation({
        onSuccess: (data) => {
            toast.success(data.message || 'COD updated successfully');
            setEditCodDialogOpen(false);
            setEditCodOrder(null);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const handleEditCod = (order: any) => {
        setEditCodOrder(order);
        setEditCodForm({
            codRequired: order.codRequired || 0,
            codAmount: order.codAmount || '',
            codCurrency: order.codCurrency || 'AED',
        });
        setEditCodDialogOpen(true);
    };

    const handleSaveCod = () => {
        if (!editCodOrder) return;
        if (editCodForm.codRequired && !editCodForm.codAmount) {
            toast.error('Please enter a COD amount');
            return;
        }
        updateCodMutation.mutate({
            token,
            orderId: editCodOrder.id,
            codRequired: editCodForm.codRequired,
            codAmount: editCodForm.codRequired ? editCodForm.codAmount : undefined,
            codCurrency: editCodForm.codCurrency,
        });
    };

    const handleSearch = () => {
        if (!searchWaybill.trim()) {
            toast.error('Please enter a waybill number');
            return;
        }
        setIsSearching(true);
        searchOrderMutation.mutate({ token, waybillNumber: searchWaybill.trim() });
    };

    const handleCreateReturn = () => {
        if (!foundOrder) return;
        createReturnMutation.mutate({
            token,
            orderId: foundOrder.id,
        });
    };

    const handleCreateExchange = () => {
        if (!foundOrder) return;
        if (!exchangeForm.customerName || !exchangeForm.customerPhone || !exchangeForm.address || !exchangeForm.city) {
            toast.error('Please fill in all required fields for the new shipment');
            return;
        }
        createExchangeMutation.mutate({
            token,
            orderId: foundOrder.id,
            newShipment: {
                ...exchangeForm,
                weight: parseFloat(exchangeForm.weight) || 0.5,
                codRequired: exchangeForm.codRequired,
                codAmount: exchangeForm.codRequired ? exchangeForm.codAmount : undefined,
                codCurrency: exchangeForm.codCurrency,
            },
        });
    };

    const handleCreateManual = () => {
        if (!manualForm.pickupName || !manualForm.pickupPhone || !manualForm.pickupAddress || !manualForm.pickupCity) {
            toast.error('Please fill in pickup details');
            return;
        }
        if (!manualForm.deliveryName || !manualForm.deliveryPhone || !manualForm.deliveryAddress || !manualForm.deliveryCity) {
            toast.error('Please fill in delivery details');
            return;
        }
        createManualMutation.mutate({
            token,
            ...manualForm,
            weight: parseFloat(manualForm.weight) || 0.5,
            exchangeWeight: parseFloat(manualForm.exchangeWeight) || 0.5,
            exchangeCodRequired: manualForm.exchangeCodRequired,
            exchangeCodAmount: manualForm.exchangeCodRequired ? manualForm.exchangeCodAmount : undefined,
            exchangeCodCurrency: manualForm.exchangeCodCurrency,
        });
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending_pickup: 'bg-yellow-500',
            picked_up: 'bg-blue-500',
            in_transit: 'bg-indigo-500',
            out_for_delivery: 'bg-purple-500',
            delivered: 'bg-green-500',
            failed_delivery: 'bg-red-500',
            returned: 'bg-gray-500',
            canceled: 'bg-slate-500',
        };
        return colors[status] || 'bg-gray-400';
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-black tracking-tight text-foreground">Returns & Exchanges</h2>
                    <p className="text-muted-foreground">Efficiently manage your reverse logistics and customer claims.</p>
                </div>
                <Button onClick={() => setManualDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-6 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                    <span className="material-symbols-outlined font-normal">add_box</span>
                    New Without Waybill
                </Button>
            </div>

            {/* Search Section */}
            <section className="bg-card rounded-2xl shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden hover:shadow-2xl hover:border-primary/20 transition-all duration-300">
                <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined">add_box</span>
                        </div>
                        <h2 className="text-xl font-bold">Create from Existing Order</h2>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-end max-w-2xl">
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-semibold text-foreground mb-2" htmlFor="waybill">
                                Waybill Number
                            </label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">barcode_scanner</span>
                                <input
                                    id="waybill"
                                    placeholder="Enter waybill number to start a return"
                                    value={searchWaybill}
                                    onChange={(e) => setSearchWaybill(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="w-full pl-12 pr-4 h-14 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                                />
                            </div>
                        </div>
                        <Button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-14 px-8 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group"
                        >
                            {isSearching ? (
                                <span className="material-symbols-outlined animate-spin">refresh</span>
                            ) : (
                                <span className="material-symbols-outlined group-hover:scale-110 transition-transform">search</span>
                            )}
                            <span className="text-lg">{isSearching ? 'Searching...' : 'Find Order'}</span>
                        </Button>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground font-medium">
                        Enter the original tracking ID or waybill number associated with the shipment you wish to return or exchange.
                    </p>

                    {/* Found Order */}
                    {foundOrder && (
                        <div className="mt-8 p-6 bg-muted/30 rounded-xl border border-border">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h4 className="font-bold text-lg">{foundOrder.waybillNumber}</h4>
                                    <Badge className={`${getStatusColor(foundOrder.status)} border-none text-white mt-1 shadow-sm`}>
                                        {foundOrder.status.replace(/_/g, ' ').toUpperCase()}
                                    </Badge>
                                </div>
                                <div className="text-right text-sm text-muted-foreground font-medium bg-background px-3 py-1 rounded-full border border-border">
                                    {new Date(foundOrder.createdAt).toLocaleDateString()}
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6 text-sm mb-6 bg-background rounded-lg p-4 border border-border">
                                <div>
                                    <p className="text-muted-foreground mb-1 text-xs font-bold uppercase tracking-wider">From (Shipper)</p>
                                    <p className="font-semibold text-foreground">{foundOrder.shipperName}</p>
                                    <p className="text-muted-foreground">{foundOrder.shipperCity}, {foundOrder.shipperCountry}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1 text-xs font-bold uppercase tracking-wider">To (Consignee)</p>
                                    <p className="font-semibold text-foreground">{foundOrder.customerName}</p>
                                    <p className="text-muted-foreground">{foundOrder.city}, {foundOrder.destinationCountry}</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={() => {
                                        setCreateType('return');
                                        setCreateDialogOpen(true);
                                    }}
                                    className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl h-12 px-6 flex-1 shadow-sm"
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Create Return
                                </Button>
                                <Button
                                    onClick={() => {
                                        setCreateType('exchange');
                                        setCreateDialogOpen(true);
                                    }}
                                    variant="outline"
                                    className="border-amber-500/50 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 rounded-xl h-12 px-6 flex-1 bg-background"
                                >
                                    <ArrowLeftRight className="mr-2 h-4 w-4" />
                                    Create Exchange
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Returns/Exchanges List */}
            <section className="bg-card rounded-2xl shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden min-h-[400px]">
                <div className="p-6 border-b border-primary/5 flex justify-between items-center bg-primary/5">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">swap_horiz</span>
                        Your Returns & Exchanges
                    </h3>
                </div>

                <div>
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <RotateCcw className="h-8 w-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground font-medium">Loading history...</p>
                        </div>
                    ) : returnsExchanges && returnsExchanges.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-primary/5 hover:bg-primary/5 border-b border-primary/10">
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Waybill</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Type</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Original</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">From → To</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Status</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Date</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase">Source</TableHead>
                                    <TableHead className="font-bold text-foreground tracking-wide text-xs uppercase text-right min-w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {returnsExchanges.map((order: any) => (
                                    <TableRow key={order.id} className="cursor-pointer hover:bg-white/5 border-b border-primary/10 transition-colors group">
                                        <TableCell>
                                            <span className="font-mono font-medium text-foreground">{order.waybillNumber}</span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                order.orderType === 'return'
                                                    ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-semibold'
                                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold'
                                            }>
                                                {order.orderType === 'return' ? (
                                                    <><span className="material-symbols-outlined text-[14px] mr-1">keyboard_return</span> Return</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-[14px] mr-1">swap_horiz</span> Exchange</>
                                                )}
                                            </Badge>
                                            {order.orderType === 'exchange' && order.exchangeWaybill && (
                                                <div className="mt-2">
                                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-200/50 cursor-pointer shadow-sm transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(order.exchangeWaybill);
                                                            toast.success(`Copied ${order.exchangeWaybill} to clipboard`);
                                                        }}
                                                    >
                                                        <span className="material-symbols-outlined text-[10px] mr-0.5">link</span>
                                                        {order.exchangeWaybill}
                                                    </Badge>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {order.originalWaybill || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span className="font-medium text-foreground">{order.shipperCity}</span>
                                                <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
                                                <span className="font-medium text-foreground">{order.city}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`${getStatusColor(order.status)} border-none text-white shadow-sm`}>
                                                {order.status.replace(/_/g, ' ').toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground font-medium text-sm">
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            {order.source === 'shopify' ? (
                                                <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 text-[10px] h-5 px-1.5 font-bold shadow-sm">
                                                    <span className="material-symbols-outlined text-[12px] mr-0.5">storefront</span> Shopify
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30 text-[10px] h-5 px-1.5 font-bold shadow-sm">
                                                    <span className="material-symbols-outlined text-[12px] mr-0.5">person</span> Manual
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {codAllowed && order.orderType === 'exchange' && order.status === 'pending_pickup' && !order.isReturn && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(e) => { e.stopPropagation(); handleEditCod(order); }}
                                                        title={order.codRequired ? 'Edit COD' : 'Add COD'}
                                                        className="h-8 w-8 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-500/10"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">payments</span>
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => { e.stopPropagation(); generateWaybillPDF(order); }}
                                                    title="Download Waybill"
                                                    className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-primary/10"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">download</span>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-16 py-24 bg-background/30 rounded-xl border border-dashed border-primary/20 m-6">
                            <div className="w-24 h-24 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mb-6">
                                <span className="material-symbols-outlined text-primary/40 text-6xl">inventory_2</span>
                            </div>
                            <h4 className="text-2xl font-black text-foreground mb-2">No returns or exchanges yet</h4>
                            <p className="text-muted-foreground max-w-sm mx-auto mb-8 font-medium">
                                When you create a return or an exchange request, they will appear here so you can track their status.
                            </p>
                            <div className="flex gap-3">
                                <Button variant="outline" className="border-primary/20 hover:bg-primary/5 text-foreground font-bold h-12 px-6 rounded-xl">
                                    <span className="material-symbols-outlined mr-2 text-primary">download</span> Download Guide
                                </Button>
                                <Button variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 font-bold h-12 px-6 rounded-xl border-none">
                                    <span className="material-symbols-outlined mr-2">support_agent</span> Contact Support
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <span className="material-symbols-outlined text-2xl">pending_actions</span>
                        </div>
                        <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase bg-background px-2 py-1 rounded-md border border-border">Pending</span>
                    </div>
                    <p className="text-4xl font-black mb-1">{returnsExchanges?.filter((r: any) => r.status.includes('pending')).length || 0}</p>
                    <p className="text-sm text-muted-foreground font-medium">Pending Approvals</p>
                </div>

                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                            <span className="material-symbols-outlined text-2xl">local_shipping</span>
                        </div>
                        <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase bg-background px-2 py-1 rounded-md border border-border">In Transit</span>
                    </div>
                    <p className="text-4xl font-black mb-1 relative">{returnsExchanges?.filter((r: any) => r.status.includes('transit') || r.status.includes('delivery') || r.status.includes('picked_up')).length || 0}</p>
                    <p className="text-sm text-muted-foreground font-medium relative">Active Shipments</p>
                </div>

                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute w-24 h-24 bg-green-500/10 rounded-full blur-2xl -bottom-6 -right-6"></div>
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <span className="material-symbols-outlined text-2xl">verified</span>
                        </div>
                        <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase bg-background px-2 py-1 rounded-md border border-border">Completed</span>
                    </div>
                    <p className="text-4xl font-black mb-1 relative">{returnsExchanges?.filter((r: any) => r.status === 'delivered' || r.status === 'returned').length || 0}</p>
                    <p className="text-sm text-muted-foreground font-medium relative">Processed Returns</p>
                </div>
            </div>

            {/* Create Return/Exchange Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="glass-strong !w-[95vw] !max-w-[800px] p-0 gap-0 border-white/10 max-h-[90vh] overflow-y-auto">
                    <div className={`w-full h-1.5 ${createType === 'return' ? 'bg-gradient-to-r from-cyan-600 to-blue-600' : 'bg-gradient-to-r from-amber-600 to-orange-600'}`} />
                    <div className="p-6">
                        <DialogHeader className="mb-5">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                {createType === 'return' ? (
                                    <><RotateCcw className="w-6 h-6 text-cyan-500" /> Create Return</>
                                ) : (
                                    <><ArrowLeftRight className="w-6 h-6 text-amber-500" /> Create Exchange</>
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {createType === 'return'
                                    ? 'The package will be returned from the consignee to the original shipper.'
                                    : 'The package will be returned AND a new shipment will be sent to the customer.'}
                            </DialogDescription>
                        </DialogHeader>

                        {foundOrder && (
                            <div className="space-y-4">
                                {/* Return Summary */}
                                <div className="p-4 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                    <p className="text-sm font-medium text-cyan-400 mb-2">Return Shipment:</p>
                                    <div className="text-sm space-y-1">
                                        <p><Package className="inline h-4 w-4 mr-1 text-cyan-500" /> From: <strong className="text-white">{foundOrder.customerName}</strong> ({foundOrder.city})</p>
                                        <p><Package className="inline h-4 w-4 mr-1 text-cyan-500" /> To: <strong className="text-white">{foundOrder.shipperName}</strong> ({foundOrder.shipperCity})</p>
                                    </div>
                                </div>

                                {/* Exchange New Shipment Form */}
                                {createType === 'exchange' && (
                                    <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                        <p className="text-sm font-medium text-amber-400 mb-3">New Shipment (to customer):</p>
                                        <div className="grid gap-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="text-xs">Customer Name *</Label>
                                                    <Input
                                                        value={exchangeForm.customerName}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, customerName: e.target.value })}
                                                        placeholder="Customer name"
                                                        className="bg-white/5 border-white/10"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Phone *</Label>
                                                    <Input
                                                        value={exchangeForm.customerPhone}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhone: e.target.value })}
                                                        placeholder="Phone"
                                                        className="bg-white/5 border-white/10"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs">Address *</Label>
                                                <Textarea
                                                    value={exchangeForm.address}
                                                    onChange={(e) => setExchangeForm({ ...exchangeForm, address: e.target.value })}
                                                    placeholder="Delivery address"
                                                    rows={2}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="text-xs">City *</Label>
                                                    <Input
                                                        value={exchangeForm.city}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, city: e.target.value })}
                                                        placeholder="City"
                                                        className="bg-white/5 border-white/10"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Weight (kg)</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={exchangeForm.weight}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, weight: e.target.value })}
                                                        className="bg-white/5 border-white/10 text-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* COD Section - only for clients with COD enabled */}
                                        {codAllowed && (
                                            <div className="mt-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input
                                                        type="checkbox"
                                                        id="exchange-cod"
                                                        checked={exchangeForm.codRequired === 1}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, codRequired: e.target.checked ? 1 : 0 })}
                                                        className="rounded bg-white/5 border-white/10"
                                                    />
                                                    <Label htmlFor="exchange-cod" className="text-xs font-medium text-green-400 cursor-pointer">💰 Cash on Delivery (COD)</Label>
                                                </div>
                                                {exchangeForm.codRequired === 1 && (
                                                    <div className="grid grid-cols-2 gap-2 mt-3 p-3 bg-white/5 rounded-lg">
                                                        <div>
                                                            <Label className="text-xs">Amount *</Label>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={exchangeForm.codAmount}
                                                                onChange={(e) => setExchangeForm({ ...exchangeForm, codAmount: e.target.value })}
                                                                placeholder="0.00"
                                                                className="bg-white/5 border-white/10 font-mono"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Currency</Label>
                                                            <Select
                                                                value={exchangeForm.codCurrency}
                                                                onValueChange={(value) => setExchangeForm({ ...exchangeForm, codCurrency: value })}
                                                            >
                                                                <SelectTrigger className="bg-white/5 border-white/10">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="AED">AED</SelectItem>
                                                                    <SelectItem value="USD">USD</SelectItem>
                                                                    <SelectItem value="EUR">EUR</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <DialogFooter className="mt-6 border-t border-white/10 pt-4">
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
                                Cancel
                            </Button>
                            <Button
                                onClick={createType === 'return' ? handleCreateReturn : handleCreateExchange}
                                disabled={createReturnMutation.isPending || createExchangeMutation.isPending}
                                className={createType === 'return' ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-amber-500 hover:bg-amber-600'}
                            >
                                {(createReturnMutation.isPending || createExchangeMutation.isPending) ? 'Creating...' :
                                    createType === 'return' ? 'Create Return' : 'Create Exchange'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manual Return/Exchange Dialog (without existing waybill) */}
            <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
                <DialogContent className="glass-strong !w-[95vw] !max-w-[1000px] p-0 gap-0 border-white/10 max-h-[90vh] overflow-y-auto">
                    <div className="w-full h-1.5 bg-gradient-to-r from-primary to-blue-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-5">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                <Plus className="h-6 w-6 text-primary" />
                                Create New Return/Exchange
                            </DialogTitle>
                            <DialogDescription>
                                For packages that don't have an existing waybill in our system (e.g., shipped with another company)
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Type Selection */}
                            <div className="w-1/2">
                                <Label>Type</Label>
                                <Select
                                    value={manualForm.type}
                                    onValueChange={(value: 'return' | 'exchange') => setManualForm({ ...manualForm, type: value })}
                                >
                                    <SelectTrigger className="bg-white/5 border-white/10 mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="return">Return (pickup and return to sender)</SelectItem>
                                        <SelectItem value="exchange">Exchange (pickup + send new item)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Pickup Details */}
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h4 className="font-medium mb-3 flex items-center gap-2">
                                        <Package className="h-4 w-4 text-cyan-500" />
                                        Pickup Location (where the package is)
                                    </h4>
                                    <div className="grid gap-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Name *</Label>
                                                <Input
                                                    value={manualForm.pickupName}
                                                    onChange={(e) => setManualForm({ ...manualForm, pickupName: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Phone *</Label>
                                                <Input
                                                    value={manualForm.pickupPhone}
                                                    onChange={(e) => setManualForm({ ...manualForm, pickupPhone: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Address *</Label>
                                            <Textarea
                                                value={manualForm.pickupAddress}
                                                onChange={(e) => setManualForm({ ...manualForm, pickupAddress: e.target.value })}
                                                rows={2}
                                                className="bg-white/5 border-white/10"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">City *</Label>
                                                <Input
                                                    value={manualForm.pickupCity}
                                                    onChange={(e) => setManualForm({ ...manualForm, pickupCity: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Country</Label>
                                                <Input
                                                    value={manualForm.pickupCountry}
                                                    onChange={(e) => setManualForm({ ...manualForm, pickupCountry: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Delivery Details */}
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h4 className="font-medium mb-3 flex items-center gap-2">
                                        <Package className="h-4 w-4 text-green-500" />
                                        Delivery Location (where it goes)
                                    </h4>
                                    <div className="grid gap-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Name *</Label>
                                                <Input
                                                    value={manualForm.deliveryName}
                                                    onChange={(e) => setManualForm({ ...manualForm, deliveryName: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Phone *</Label>
                                                <Input
                                                    value={manualForm.deliveryPhone}
                                                    onChange={(e) => setManualForm({ ...manualForm, deliveryPhone: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Address *</Label>
                                            <Textarea
                                                value={manualForm.deliveryAddress}
                                                onChange={(e) => setManualForm({ ...manualForm, deliveryAddress: e.target.value })}
                                                rows={2}
                                                className="bg-white/5 border-white/10"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">City *</Label>
                                                <Input
                                                    value={manualForm.deliveryCity}
                                                    onChange={(e) => setManualForm({ ...manualForm, deliveryCity: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Country</Label>
                                                <Input
                                                    value={manualForm.deliveryCountry}
                                                    onChange={(e) => setManualForm({ ...manualForm, deliveryCountry: e.target.value })}
                                                    className="bg-white/5 border-white/10 h-9"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Package Details */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-xs">Pieces</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={manualForm.pieces}
                                        onChange={(e) => setManualForm({ ...manualForm, pieces: parseInt(e.target.value) || 1 })}
                                        className="bg-white/5 border-white/10 h-9"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Weight (kg)</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={manualForm.weight}
                                        onChange={(e) => setManualForm({ ...manualForm, weight: e.target.value })}
                                        className="bg-white/5 border-white/10 h-9"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Service</Label>
                                    <Select
                                        value={manualForm.serviceType}
                                        onValueChange={(value) => setManualForm({ ...manualForm, serviceType: value })}
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10 h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="DOM">Domestic</SelectItem>
                                            <SelectItem value="SDD">Same Day</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Exchange: New Shipment Details */}
                            {manualForm.type === 'exchange' && (
                                <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                    <h4 className="font-medium mb-3 flex items-center gap-2 text-amber-400">
                                        <ArrowLeftRight className="h-4 w-4" />
                                        New Shipment (exchange item to customer)
                                    </h4>
                                    <div className="grid gap-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Customer Name *</Label>
                                                <Input
                                                    value={manualForm.exchangeCustomerName}
                                                    onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerName: e.target.value })}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Phone *</Label>
                                                <Input
                                                    value={manualForm.exchangeCustomerPhone}
                                                    onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerPhone: e.target.value })}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Address *</Label>
                                            <Textarea
                                                value={manualForm.exchangeAddress}
                                                onChange={(e) => setManualForm({ ...manualForm, exchangeAddress: e.target.value })}
                                                rows={2}
                                                className="bg-white/5 border-white/10"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <Label className="text-xs">City *</Label>
                                                <Input
                                                    value={manualForm.exchangeCity}
                                                    onChange={(e) => setManualForm({ ...manualForm, exchangeCity: e.target.value })}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Pieces</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={manualForm.exchangePieces}
                                                    onChange={(e) => setManualForm({ ...manualForm, exchangePieces: parseInt(e.target.value) || 1 })}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Weight (kg)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    min="0.1"
                                                    value={manualForm.exchangeWeight}
                                                    onChange={(e) => setManualForm({ ...manualForm, exchangeWeight: e.target.value })}
                                                    className="bg-white/5 border-white/10"
                                                />
                                            </div>
                                        </div>

                                        {/* COD Section - only for clients with COD enabled */}
                                        {codAllowed && (
                                            <div className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input
                                                        type="checkbox"
                                                        id="manual-exchange-cod"
                                                        checked={manualForm.exchangeCodRequired === 1}
                                                        onChange={(e) => setManualForm({ ...manualForm, exchangeCodRequired: e.target.checked ? 1 : 0 })}
                                                        className="rounded bg-white/5 border-white/10"
                                                    />
                                                    <Label htmlFor="manual-exchange-cod" className="text-xs font-medium text-green-400 cursor-pointer">💰 Cash on Delivery (COD)</Label>
                                                </div>
                                                {manualForm.exchangeCodRequired === 1 && (
                                                    <div className="grid grid-cols-2 gap-2 mt-3 p-3 bg-white/5 rounded-lg">
                                                        <div>
                                                            <Label className="text-xs">Amount *</Label>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={manualForm.exchangeCodAmount}
                                                                onChange={(e) => setManualForm({ ...manualForm, exchangeCodAmount: e.target.value })}
                                                                placeholder="0.00"
                                                                className="bg-white/5 border-white/10 font-mono"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs">Currency</Label>
                                                            <Select
                                                                value={manualForm.exchangeCodCurrency}
                                                                onValueChange={(value) => setManualForm({ ...manualForm, exchangeCodCurrency: value })}
                                                            >
                                                                <SelectTrigger className="bg-white/5 border-white/10">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="AED">AED</SelectItem>
                                                                    <SelectItem value="USD">USD</SelectItem>
                                                                    <SelectItem value="EUR">EUR</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <Label className="text-xs">Special Instructions</Label>
                                <Textarea
                                    value={manualForm.specialInstructions}
                                    onChange={(e) => setManualForm({ ...manualForm, specialInstructions: e.target.value })}
                                    placeholder="Any special instructions..."
                                    rows={2}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                        </div>

                        <DialogFooter className="mt-6 border-t border-white/10 pt-4">
                            <Button variant="outline" onClick={() => setManualDialogOpen(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateManual}
                                disabled={createManualMutation.isPending}
                                className={manualForm.type === 'return' ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-amber-500 hover:bg-amber-600'}
                            >
                                {createManualMutation.isPending ? 'Creating...' :
                                    manualForm.type === 'return' ? 'Create Return' : 'Create Exchange'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit COD Dialog */}
            <Dialog open={editCodDialogOpen} onOpenChange={setEditCodDialogOpen}>
                <DialogContent className="glass-strong !w-[95vw] !max-w-[500px] p-0 gap-0 border-white/10 max-h-[90vh] overflow-y-auto">
                    <div className="w-full h-1.5 bg-gradient-to-r from-green-500 to-emerald-600" />
                    <div className="p-6">
                        <DialogHeader className="mb-5">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                <DollarSign className="h-6 w-6 text-green-500" />
                                {editCodOrder?.codRequired ? 'Edit COD' : 'Add COD'}
                            </DialogTitle>
                            <DialogDescription>
                                {editCodOrder?.waybillNumber} — Only editable while pending pickup
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="edit-cod-toggle"
                                    checked={editCodForm.codRequired === 1}
                                    onChange={(e) => setEditCodForm({ ...editCodForm, codRequired: e.target.checked ? 1 : 0 })}
                                    className="rounded bg-white/5 border-white/10"
                                />
                                <Label htmlFor="edit-cod-toggle" className="cursor-pointer text-white">Enable COD</Label>
                            </div>

                            {editCodForm.codRequired === 1 && (
                                <div className="grid grid-cols-2 gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
                                    <div>
                                        <Label className="text-xs">Amount *</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editCodForm.codAmount}
                                            onChange={(e) => setEditCodForm({ ...editCodForm, codAmount: e.target.value })}
                                            placeholder="0.00"
                                            className="bg-white/5 border-white/10 font-mono text-white"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Currency</Label>
                                        <Select
                                            value={editCodForm.codCurrency}
                                            onValueChange={(value) => setEditCodForm({ ...editCodForm, codCurrency: value })}
                                        >
                                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AED">AED</SelectItem>
                                                <SelectItem value="USD">USD</SelectItem>
                                                <SelectItem value="EUR">EUR</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="mt-6 border-t border-white/10 pt-4">
                            <Button variant="outline" onClick={() => setEditCodDialogOpen(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSaveCod}
                                disabled={updateCodMutation.isPending}
                                className="bg-green-500 hover:bg-green-600"
                            >
                                {updateCodMutation.isPending ? 'Saving...' : 'Save COD'}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
