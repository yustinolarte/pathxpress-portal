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
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';

interface ReturnsExchangesPanelProps {
    codAllowed?: boolean;
}

export default function ReturnsExchangesPanel({ codAllowed = false }: ReturnsExchangesPanelProps) {
    const [searchWaybill, setSearchWaybill] = useState('');
    const [foundOrder, setFoundOrder] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createType, setCreateType] = useState<'return' | 'exchange'>('return');
    const [manualDialogOpen, setManualDialogOpen] = useState(false);
    const [pickedLocationExchange, setPickedLocationExchange] = useState<PickedLocation | null>(null);
    const [pickedLocationManual, setPickedLocationManual] = useState<PickedLocation | null>(null);

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
        customerPhonePrefix: '+971',
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
        pickupPhonePrefix: '+971',
        pickupPhone: '',
        pickupAddress: '',
        pickupCity: '',
        pickupCountry: 'UAE',
        // Delivery (where it goes)
        deliveryName: '',
        deliveryPhonePrefix: '+971',
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
        exchangeCustomerPhonePrefix: '+971',
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
    const { data: returnsExchanges, isLoading, refetch } = trpc.portal.customer.getMyReturnsExchanges.useQuery();

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
            setPickedLocationExchange(null);
            setExchangeForm({
                customerName: '',
                customerPhonePrefix: '+971',
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
            setPickedLocationManual(null);
            setManualForm({
                type: 'return',
                pickupName: '',
                pickupPhonePrefix: '+971',
                pickupPhone: '',
                pickupAddress: '',
                pickupCity: '',
                pickupCountry: 'UAE',
                deliveryName: '',
                deliveryPhonePrefix: '+971',
                deliveryPhone: '',
                deliveryAddress: '',
                deliveryCity: '',
                deliveryCountry: 'UAE',
                pieces: 1,
                weight: '',
                serviceType: 'DOM',
                specialInstructions: '',
                exchangeCustomerName: '',
                exchangeCustomerPhonePrefix: '+971',
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
        searchOrderMutation.mutate({ waybillNumber: searchWaybill.trim() });
    };

    const handleCreateReturn = () => {
        if (!foundOrder) return;
        createReturnMutation.mutate({
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
            orderId: foundOrder.id,
            newShipment: {
                ...exchangeForm,
                customerPhone: `${exchangeForm.customerPhonePrefix} ${exchangeForm.customerPhone}`,
                weight: parseFloat(exchangeForm.weight) || 0.5,
                codRequired: exchangeForm.codRequired,
                codAmount: exchangeForm.codRequired ? exchangeForm.codAmount : undefined,
                codCurrency: exchangeForm.codCurrency,
                // @ts-ignore
                latitude: pickedLocationExchange?.latitude,
                // @ts-ignore
                longitude: pickedLocationExchange?.longitude,
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
        createManualMutation.mutate({
            ...manualForm,
            pickupPhone: `${manualForm.pickupPhonePrefix} ${manualForm.pickupPhone}`,
            deliveryPhone: `${manualForm.deliveryPhonePrefix} ${manualForm.deliveryPhone}`,
            weight: parseFloat(manualForm.weight) || 0.5,
            exchangeWeight: parseFloat(manualForm.exchangeWeight) || 0.5,
            exchangeCodRequired: manualForm.exchangeCodRequired,
            exchangeCodAmount: manualForm.exchangeCodRequired ? manualForm.exchangeCodAmount : undefined,
            exchangeCodCurrency: manualForm.exchangeCodCurrency,
            // @ts-ignore
            exchangeCustomerPhone: `${manualForm.exchangeCustomerPhonePrefix} ${manualForm.exchangeCustomerPhone}`,
            // @ts-ignore
            latitude: pickedLocationManual?.latitude,
            // @ts-ignore
            longitude: pickedLocationManual?.longitude,
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
            returned_to_sender: 'bg-rose-600',
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
                <DialogContent className="bg-background text-foreground !w-[98vw] !max-w-[1300px] p-0 gap-0 border-border max-h-[90vh] overflow-y-auto antialiased font-sans rounded-2xl shadow-xl">
                    <div className="p-6 md:p-8">
                        <DialogHeader className="mb-8 border-b border-border pb-4">
                            <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                                {createType === 'return' ? (
                                    <><span className="material-symbols-outlined text-primary text-3xl">keyboard_return</span> Create Return</>
                                ) : (
                                    <><span className="material-symbols-outlined text-primary text-3xl">swap_horiz</span> Create Exchange</>
                                )}
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground text-base mt-2">
                                {createType === 'return'
                                    ? 'The package will be picked up from the consignee and returned to the original shipper.'
                                    : 'The package will be returned AND a new shipment will be sent to the customer.'}
                            </DialogDescription>
                        </DialogHeader>

                        {foundOrder && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Column: Summaries & Forms */}
                                <div className="space-y-6">
                                    {/* Return Summary */}
                                    <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">assignment_return</span>
                                            <h2 className="font-bold">Return Path</h2>
                                        </div>
                                        <div className="p-6 space-y-4">
                                            <div>
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Pickup From (Customer)</p>
                                                <p className="font-bold text-foreground">{foundOrder.customerName}</p>
                                                <p className="text-sm text-muted-foreground">{foundOrder.city}, {foundOrder.destinationCountry}</p>
                                            </div>
                                            <div className="h-px w-full bg-border"></div>
                                            <div>
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Deliver To (Shipper)</p>
                                                <p className="font-bold text-foreground">{foundOrder.shipperName}</p>
                                                <p className="text-sm text-muted-foreground">{foundOrder.shipperCity}, {foundOrder.shipperCountry}</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Exchange New Shipment Form */}
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
                                                        <Input
                                                            value={exchangeForm.customerName}
                                                            onChange={(e) => setExchangeForm({ ...exchangeForm, customerName: e.target.value })}
                                                            placeholder="Name"
                                                            className="bg-background border-border"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Phone</Label>
                                                        <div className="flex">
                                                            <select className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none" value={exchangeForm.customerPhonePrefix} onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhonePrefix: e.target.value })}>
                                                                <option value="+971">🇦🇪 +971</option>
                                                                <option value="+966">🇸🇦 +966</option>
                                                                <option value="+965">🇰🇼 +965</option>
                                                                <option value="+973">🇧🇭 +973</option>
                                                                <option value="+968">🇴🇲 +968</option>
                                                                <option value="+974">🇶🇦 +974</option>
                                                            </select>
                                                            <Input
                                                                value={exchangeForm.customerPhone}
                                                                onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhone: e.target.value })}
                                                                placeholder="Phone"
                                                                className="bg-background border-border rounded-l-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Address</Label>
                                                    <Textarea
                                                        value={exchangeForm.address}
                                                        onChange={(e) => setExchangeForm({ ...exchangeForm, address: e.target.value })}
                                                        placeholder="Delivery address"
                                                        rows={2}
                                                        className="bg-background border-border"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-bold text-muted-foreground uppercase">City</Label>
                                                        <select
                                                            value={exchangeForm.city}
                                                            onChange={(e) => setExchangeForm({ ...exchangeForm, city: e.target.value })}
                                                            className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary"
                                                        >
                                                            <option value="">Select City</option>
                                                            {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-bold text-muted-foreground uppercase">Weight (kg)</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.1"
                                                            min="0.1"
                                                            value={exchangeForm.weight}
                                                            onChange={(e) => setExchangeForm({ ...exchangeForm, weight: e.target.value })}
                                                            className="bg-background border-border"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Location Picker for Exchange */}
                                                <div className="pt-2 border-t border-border mt-4">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase block mb-3">Delivery Map Location (optional)</Label>
                                                    <LocationPicker onLocationPicked={setPickedLocationExchange} />
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                </div>

                                {/* Right Column: COD & Actions */}
                                <div className="space-y-6">
                                    {codAllowed && createType === 'exchange' && (
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
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={exchangeForm.codAmount}
                                                                onChange={(e) => setExchangeForm({ ...exchangeForm, codAmount: e.target.value })}
                                                                placeholder="0.00"
                                                                className="bg-background border-border pl-12 h-12 text-lg font-bold"
                                                            />
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">AED</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    <section className="bg-slate-900 text-white rounded-xl shadow-xl p-6 relative overflow-hidden">
                                        <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                                            <span className="material-symbols-outlined text-blue-400">info</span>
                                            Important
                                        </h2>
                                        <p className="text-sm text-slate-300 relative z-10 leading-relaxed">
                                            Please verify all details before confirming. Return shipping fees will be deducted from your prepaid balance according to your agreed rate card.
                                        </p>
                                        <div className="mt-8 flex flex-col gap-3 relative z-10">
                                            <button type="button" onClick={() => setCreateDialogOpen(false)} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all">
                                                Cancel
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={createType === 'return' ? handleCreateReturn : handleCreateExchange}
                                                disabled={createReturnMutation.isPending || createExchangeMutation.isPending} 
                                                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined">rocket_launch</span>
                                                {(createReturnMutation.isPending || createExchangeMutation.isPending) ? 'Processing...' : 'Confirm Request'}
                                            </button>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manual Return/Exchange Dialog (without existing waybill) */}
            <Dialog open={manualDialogOpen} onOpenChange={(open) => { setManualDialogOpen(open); if (!open) setPickedLocationManual(null); }}>
                <DialogContent className="bg-background text-foreground !w-[98vw] !max-w-[1400px] p-0 gap-0 border-border max-h-[90vh] overflow-y-auto antialiased font-sans rounded-2xl shadow-xl">
                    <div className="p-6 md:p-8">
                        <DialogHeader className="mb-8 border-b border-border pb-4">
                            <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary text-3xl">add_box</span>
                                Create Return/Exchange manually
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground text-base mt-2">
                                For packages that don't have an existing waybill in our system.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            {/* Left Column: Pickup & Delivery Forms */}
                            <div className="xl:col-span-2 space-y-8">
                                <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-center justify-between">
                                    <div>
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Operation Type</Label>
                                        <div className="flex gap-4">
                                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.type === 'return' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                                <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={manualForm.type === 'return'} onChange={() => setManualForm({...manualForm, type: 'return'})} />
                                                <div className="ml-3 font-bold text-sm">Return Only</div>
                                            </label>
                                            <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.type === 'exchange' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                                <input className="text-primary focus:ring-primary w-4 h-4" type="radio" checked={manualForm.type === 'exchange'} onChange={() => setManualForm({...manualForm, type: 'exchange'})} />
                                                <div className="ml-3 font-bold text-sm">Exchange</div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Pickup Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>outbox</span>
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
                                                        <option value="+971">🇦🇪 +971</option>
                                                        <option value="+966">🇸🇦 +966</option>
                                                        <option value="+965">🇰🇼 +965</option>
                                                        <option value="+973">🇧🇭 +973</option>
                                                        <option value="+968">🇴🇲 +968</option>
                                                        <option value="+974">🇶🇦 +974</option>
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
                                                <select
                                                    value={manualForm.pickupCity}
                                                    onChange={(e) => setManualForm({ ...manualForm, pickupCity: e.target.value })}
                                                    className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary"
                                                >
                                                    <option value="">Select City</option>
                                                    {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Delivery Details */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>move_to_inbox</span>
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
                                                        <option value="+971">🇦🇪 +971</option>
                                                        <option value="+966">🇸🇦 +966</option>
                                                        <option value="+965">🇰🇼 +965</option>
                                                        <option value="+973">🇧🇭 +973</option>
                                                        <option value="+968">🇴🇲 +968</option>
                                                        <option value="+974">🇶🇦 +974</option>
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
                                                <select
                                                    value={manualForm.deliveryCity}
                                                    onChange={(e) => setManualForm({ ...manualForm, deliveryCity: e.target.value })}
                                                    className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary"
                                                >
                                                    <option value="">Select City</option>
                                                    {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                                
                                <div className="pt-4 border-t border-border mt-4">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Pickup Map Location (optional)</Label>
                                    <p className="text-xs text-muted-foreground mb-3">Pin the exact pickup address on the map to help the driver locate it.</p>
                                    <LocationPicker onLocationPicked={setPickedLocationManual} />
                                </div>
                            </div>

                            {/* Right Column: Package Details & Exchange Form */}
                            <div className="space-y-8">
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>inventory</span>
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
                                            <select
                                                value={manualForm.serviceType}
                                                onChange={(e) => setManualForm({ ...manualForm, serviceType: e.target.value })}
                                                className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary"
                                            >
                                                <option value="DOM">Domestic</option>
                                                <option value="SDD">Same Day</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Instructions</Label>
                                            <Textarea value={manualForm.specialInstructions} onChange={(e) => setManualForm({ ...manualForm, specialInstructions: e.target.value })} placeholder="Any special instructions..." rows={2} className="bg-background border-border" />
                                        </div>
                                    </div>
                                </section>

                                {manualForm.type === 'exchange' && (
                                    <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                        <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-500">local_shipping</span>
                                            <h2 className="font-bold text-amber-600 dark:text-amber-500">New Item Shipment (To Customer)</h2>
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
                                                            <option value="+971">🇦🇪 +971</option>
                                                            <option value="+966">🇸🇦 +966</option>
                                                            <option value="+965">🇰🇼 +965</option>
                                                            <option value="+973">🇧🇭 +973</option>
                                                            <option value="+968">🇴🇲 +968</option>
                                                            <option value="+974">🇶🇦 +974</option>
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
                                                    <select
                                                        value={manualForm.exchangeCity}
                                                        onChange={(e) => setManualForm({ ...manualForm, exchangeCity: e.target.value })}
                                                        className="w-full rounded-lg border-input bg-background px-3 h-10 text-sm border focus:ring-2 focus:ring-primary focus:border-primary"
                                                    >
                                                        <option value="">Select City</option>
                                                        {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
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

                                            {codAllowed && (
                                                <div className="pt-4 mt-4 border-t border-border">
                                                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${manualForm.exchangeCodRequired === 1 ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:bg-muted'}`}>
                                                        <input className="text-amber-500 focus:ring-amber-500 w-4 h-4" type="checkbox" checked={manualForm.exchangeCodRequired === 1} onChange={(e) => setManualForm({ ...manualForm, exchangeCodRequired: e.target.checked ? 1 : 0 })} />
                                                        <div className="ml-3">
                                                            <div className="font-bold text-sm">Require COD on New Item</div>
                                                            <div className="text-[11px] text-muted-foreground">Collect payment for exchange processing</div>
                                                        </div>
                                                    </label>
                                                    {manualForm.exchangeCodRequired === 1 && (
                                                        <div className="mt-3 animate-in fade-in">
                                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Amount to Collect</Label>
                                                            <div className="flex gap-2">
                                                                <select
                                                                    value={manualForm.exchangeCodCurrency}
                                                                    onChange={(e) => setManualForm({ ...manualForm, exchangeCodCurrency: e.target.value })}
                                                                    className="px-2 rounded-l-md border border-r-0 border-input bg-muted text-foreground text-sm font-bold focus:outline-none"
                                                                >
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

                                <section className="bg-slate-900 text-white rounded-xl shadow-xl p-6 relative overflow-hidden">
                                    <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                                        <span className="material-symbols-outlined text-blue-400">check_circle</span>
                                        Confirm
                                    </h2>
                                    <div className="mt-8 flex flex-col gap-3 relative z-10">
                                        <button type="button" onClick={() => setManualDialogOpen(false)} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all">
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
                                <Label htmlFor="edit-cod-toggle" className="cursor-pointer text-foreground">Enable COD</Label>
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
                                            className="bg-white/5 border-white/10 font-mono"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Currency</Label>
                                        <Select
                                            value={editCodForm.codCurrency}
                                            onValueChange={(value) => setEditCodForm({ ...editCodForm, codCurrency: value })}
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
