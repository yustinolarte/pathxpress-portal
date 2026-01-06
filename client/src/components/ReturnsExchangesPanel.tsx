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
import { Search, Plus, RotateCcw, ArrowLeftRight, Package, Download } from 'lucide-react';
import { generateWaybillPDF } from '@/lib/generateWaybillPDF';

interface ReturnsExchangesPanelProps {
    token: string;
}

export default function ReturnsExchangesPanel({ token }: ReturnsExchangesPanelProps) {
    const [searchWaybill, setSearchWaybill] = useState('');
    const [foundOrder, setFoundOrder] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createType, setCreateType] = useState<'return' | 'exchange'>('return');
    const [manualDialogOpen, setManualDialogOpen] = useState(false);

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
            });
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Returns & Exchanges</h2>
                    <p className="text-muted-foreground">Create return or exchange shipments</p>
                </div>
                <Button onClick={() => setManualDialogOpen(true)} variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    New Without Waybill
                </Button>
            </div>

            {/* Search Section */}
            <Card className="glass-strong border-cyan-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5 text-cyan-500" />
                        Create from Existing Order
                    </CardTitle>
                    <CardDescription>
                        Search by waybill number to create a return or exchange
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Input
                            placeholder="Enter waybill number (e.g., PX202500123)"
                            value={searchWaybill}
                            onChange={(e) => setSearchWaybill(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="flex-1"
                        />
                        <Button onClick={handleSearch} disabled={isSearching}>
                            <Search className="mr-2 h-4 w-4" />
                            {isSearching ? 'Searching...' : 'Search'}
                        </Button>
                    </div>

                    {/* Found Order */}
                    {foundOrder && (
                        <div className="mt-6 p-4 bg-muted/30 rounded-lg border">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="font-semibold text-lg">{foundOrder.waybillNumber}</h4>
                                    <Badge className={`${getStatusColor(foundOrder.status)} border-none text-white mt-1`}>
                                        {foundOrder.status.replace(/_/g, ' ').toUpperCase()}
                                    </Badge>
                                </div>
                                <div className="text-right text-sm text-muted-foreground">
                                    {new Date(foundOrder.createdAt).toLocaleDateString()}
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">From (Shipper):</p>
                                    <p className="font-medium">{foundOrder.shipperName}</p>
                                    <p>{foundOrder.shipperCity}, {foundOrder.shipperCountry}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">To (Consignee):</p>
                                    <p className="font-medium">{foundOrder.customerName}</p>
                                    <p>{foundOrder.city}, {foundOrder.destinationCountry}</p>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <Button
                                    onClick={() => {
                                        setCreateType('return');
                                        setCreateDialogOpen(true);
                                    }}
                                    className="bg-cyan-500 hover:bg-cyan-600"
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
                                    className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                                >
                                    <ArrowLeftRight className="mr-2 h-4 w-4" />
                                    Create Exchange
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Returns/Exchanges List */}
            <Card className="glass-strong border-blue-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RotateCcw className="h-5 w-5 text-blue-500" />
                        Your Returns & Exchanges
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-center py-8 text-muted-foreground">Loading...</p>
                    ) : returnsExchanges && returnsExchanges.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Waybill</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Original</TableHead>
                                    <TableHead>From → To</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {returnsExchanges.map((order: any) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-mono font-medium">{order.waybillNumber}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                order.orderType === 'return'
                                                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                            }>
                                                {order.orderType === 'return' ? (
                                                    <><RotateCcw className="h-3 w-3 mr-1" /> Return</>
                                                ) : (
                                                    <><ArrowLeftRight className="h-3 w-3 mr-1" /> Exchange</>
                                                )}
                                            </Badge>
                                            {order.orderType === 'exchange' && order.exchangeWaybill && (
                                                <div className="mt-1">
                                                    <Badge variant="secondary" className="text-[10px] h-5 px-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-200 cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // Logic to open/find that order would go here. 
                                                            // Since we don't have global navigation to a specific tracking ID from here easily,
                                                            // we will just display it clearly for now or copy to clipboard?
                                                            // Ideally this should link to the tracking/shipment details.
                                                            navigator.clipboard.writeText(order.exchangeWaybill);
                                                            toast.success(`Copied ${order.exchangeWaybill} to clipboard`);
                                                        }}
                                                    >
                                                        ↔ {order.exchangeWaybill}
                                                    </Badge>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {order.originalWaybill || '-'}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {order.shipperCity} → {order.city}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`${getStatusColor(order.status)} border-none text-white`}>
                                                {order.status.replace(/_/g, ' ').toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => generateWaybillPDF(order)}
                                                title="Download Waybill"
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-12">
                            <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">No returns or exchanges yet</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Return/Exchange Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {createType === 'return' ? (
                                <><RotateCcw className="h-5 w-5 text-cyan-500" /> Create Return</>
                            ) : (
                                <><ArrowLeftRight className="h-5 w-5 text-amber-500" /> Create Exchange</>
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
                                    <p><Package className="inline h-4 w-4 mr-1" /> From: <strong>{foundOrder.customerName}</strong> ({foundOrder.city})</p>
                                    <p><Package className="inline h-4 w-4 mr-1" /> To: <strong>{foundOrder.shipperName}</strong> ({foundOrder.shipperCity})</p>
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
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Phone *</Label>
                                                <Input
                                                    value={exchangeForm.customerPhone}
                                                    onChange={(e) => setExchangeForm({ ...exchangeForm, customerPhone: e.target.value })}
                                                    placeholder="Phone"
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
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">City *</Label>
                                                <Input
                                                    value={exchangeForm.city}
                                                    onChange={(e) => setExchangeForm({ ...exchangeForm, city: e.target.value })}
                                                    placeholder="City"
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
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
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
                </DialogContent>
            </Dialog>

            {/* Manual Return/Exchange Dialog (without existing waybill) */}
            <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Create New Return/Exchange
                        </DialogTitle>
                        <DialogDescription>
                            For packages that don't have an existing waybill in our system (e.g., shipped with another company)
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Type Selection */}
                        <div>
                            <Label>Type</Label>
                            <Select
                                value={manualForm.type}
                                onValueChange={(value: 'return' | 'exchange') => setManualForm({ ...manualForm, type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="return">Return (pickup and return to sender)</SelectItem>
                                    <SelectItem value="exchange">Exchange (pickup + send new item)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Pickup Details */}
                        <div className="p-4 bg-muted/30 rounded-lg border">
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
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Phone *</Label>
                                        <Input
                                            value={manualForm.pickupPhone}
                                            onChange={(e) => setManualForm({ ...manualForm, pickupPhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs">Address *</Label>
                                    <Textarea
                                        value={manualForm.pickupAddress}
                                        onChange={(e) => setManualForm({ ...manualForm, pickupAddress: e.target.value })}
                                        rows={2}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs">City *</Label>
                                        <Input
                                            value={manualForm.pickupCity}
                                            onChange={(e) => setManualForm({ ...manualForm, pickupCity: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Country</Label>
                                        <Input
                                            value={manualForm.pickupCountry}
                                            onChange={(e) => setManualForm({ ...manualForm, pickupCountry: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Delivery Details */}
                        <div className="p-4 bg-muted/30 rounded-lg border">
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
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Phone *</Label>
                                        <Input
                                            value={manualForm.deliveryPhone}
                                            onChange={(e) => setManualForm({ ...manualForm, deliveryPhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs">Address *</Label>
                                    <Textarea
                                        value={manualForm.deliveryAddress}
                                        onChange={(e) => setManualForm({ ...manualForm, deliveryAddress: e.target.value })}
                                        rows={2}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs">City *</Label>
                                        <Input
                                            value={manualForm.deliveryCity}
                                            onChange={(e) => setManualForm({ ...manualForm, deliveryCity: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Country</Label>
                                        <Input
                                            value={manualForm.deliveryCountry}
                                            onChange={(e) => setManualForm({ ...manualForm, deliveryCountry: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Package Details */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label className="text-xs">Pieces</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={manualForm.pieces}
                                    onChange={(e) => setManualForm({ ...manualForm, pieces: parseInt(e.target.value) || 1 })}
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
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Service</Label>
                                <Select
                                    value={manualForm.serviceType}
                                    onValueChange={(value) => setManualForm({ ...manualForm, serviceType: value })}
                                >
                                    <SelectTrigger>
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
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Phone *</Label>
                                            <Input
                                                value={manualForm.exchangeCustomerPhone}
                                                onChange={(e) => setManualForm({ ...manualForm, exchangeCustomerPhone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs">Address *</Label>
                                        <Textarea
                                            value={manualForm.exchangeAddress}
                                            onChange={(e) => setManualForm({ ...manualForm, exchangeAddress: e.target.value })}
                                            rows={2}
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <Label className="text-xs">City *</Label>
                                            <Input
                                                value={manualForm.exchangeCity}
                                                onChange={(e) => setManualForm({ ...manualForm, exchangeCity: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Pieces</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={manualForm.exchangePieces}
                                                onChange={(e) => setManualForm({ ...manualForm, exchangePieces: parseInt(e.target.value) || 1 })}
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
                                            />
                                        </div>
                                    </div>
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
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setManualDialogOpen(false)}>
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
                </DialogContent>
            </Dialog>
        </div>
    );
}
