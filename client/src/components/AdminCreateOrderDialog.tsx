import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Loader2, Package, User, MapPin, Phone, FileText, Truck, Building2 } from 'lucide-react';

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
}

interface AdminCreateOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[] | undefined;
    token: string;
    onSuccess: () => void;
}

export default function AdminCreateOrderDialog({
    open,
    onOpenChange,
    clients,
    token,
    onSuccess,
}: AdminCreateOrderDialogProps) {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        orderNumber: '',
        customerName: '',
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
            setFormData({
                orderNumber: '',
                customerName: '',
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

    const handleSubmit = () => {
        if (!selectedClientId) {
            toast.error('Please select a client');
            return;
        }
        if (!formData.customerName || !formData.customerPhone || !formData.address || !formData.city) {
            toast.error('Please fill in all required fields');
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

        createOrderMutation.mutate({
            token,
            clientId: parseInt(selectedClientId),
            shipment: {
                orderNumber: formData.orderNumber || undefined,
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
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
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto glass-strong">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Package className="h-6 w-6 text-primary" />
                        Create Order
                    </DialogTitle>
                    <DialogDescription>
                        Create a new order on behalf of a client. Select a client first, then fill in consignee details.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Client Selection - Full Width */}
                    <div className="space-y-3">
                        <Label className="flex items-center gap-2 text-base font-semibold">
                            <User className="h-5 w-5 text-primary" />
                            Select Client *
                        </Label>
                        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                            <SelectTrigger className="w-full h-12 text-base">
                                <SelectValue placeholder="Choose a client..." />
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
                        <>
                            {/* Two Column Layout: Shipper + Consignee */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Shipper Section (Read-only) */}
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
                                        <div className="flex gap-3 mt-3">
                                            <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${selectedClient.codAllowed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                COD: {selectedClient.codAllowed ? 'Allowed' : 'Not Allowed'}
                                            </span>
                                            <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${selectedClient.fodAllowed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                FOD: {selectedClient.fodAllowed ? 'Allowed' : 'Not Allowed'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Consignee Section */}
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
                                                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
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
                                                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                                                    placeholder="+971..."
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Address *</Label>
                                            <Textarea
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
                                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                                    placeholder="Dubai"
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Emirate</Label>
                                                <Select value={formData.emirate} onValueChange={(val) => setFormData({ ...formData, emirate: val })}>
                                                    <SelectTrigger className="mt-1">
                                                        <SelectValue placeholder="Select" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Dubai">Dubai</SelectItem>
                                                        <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
                                                        <SelectItem value="Sharjah">Sharjah</SelectItem>
                                                        <SelectItem value="Ajman">Ajman</SelectItem>
                                                        <SelectItem value="RAK">Ras Al Khaimah</SelectItem>
                                                        <SelectItem value="Fujairah">Fujairah</SelectItem>
                                                        <SelectItem value="UAQ">Umm Al Quwain</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Shipment Details - Full Width */}
                            <div className="border border-border/50 rounded-xl p-5">
                                <h4 className="font-semibold mb-4 flex items-center gap-2">
                                    <Truck className="h-5 w-5 text-primary" />
                                    Shipment Details
                                </h4>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <Label className="text-xs">Service Type *</Label>
                                        <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                                            <SelectTrigger className="mt-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="DOM">Domestic Express</SelectItem>
                                                <SelectItem value="SDD">Same Day Delivery</SelectItem>
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
                                            onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0.5 })}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Pieces</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={formData.pieces}
                                            onChange={(e) => setFormData({ ...formData, pieces: parseInt(e.target.value) || 1 })}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            <FileText className="h-3 w-3" /> Reference #
                                        </Label>
                                        <Input
                                            value={formData.orderNumber}
                                            onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                                            placeholder="Optional"
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <Label className="text-xs">Special Instructions</Label>
                                    <Textarea
                                        value={formData.specialInstructions}
                                        onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                                        placeholder="Any delivery instructions..."
                                        rows={2}
                                        className="mt-1"
                                    />
                                </div>
                            </div>

                            {/* COD & FOD Options - Full Width */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* COD */}
                                <div className={`flex items-start gap-4 p-4 rounded-xl border ${selectedClient?.codAllowed ? 'border-orange-500/30 bg-orange-500/5' : 'border-border/50 bg-muted/20 opacity-60'}`}>
                                    <Checkbox
                                        id="cod"
                                        checked={formData.codRequired}
                                        onCheckedChange={(checked) => setFormData({ ...formData, codRequired: !!checked })}
                                        disabled={!selectedClient?.codAllowed}
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <label htmlFor="cod" className="text-sm font-semibold cursor-pointer">
                                            Cash on Delivery (COD)
                                        </label>
                                        {!selectedClient?.codAllowed ? (
                                            <p className="text-xs text-muted-foreground mt-1">COD not enabled for this client</p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground mt-1">Driver collects payment on delivery</p>
                                        )}
                                        {formData.codRequired && selectedClient?.codAllowed && (
                                            <div className="mt-3">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    value={formData.codAmount}
                                                    onChange={(e) => setFormData({ ...formData, codAmount: e.target.value })}
                                                    placeholder="Amount in AED"
                                                    className="max-w-[200px]"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* FOD */}
                                <div className={`flex items-start gap-4 p-4 rounded-xl border ${selectedClient?.fodAllowed ? 'border-purple-500/30 bg-purple-500/5' : 'border-border/50 bg-muted/20 opacity-60'}`}>
                                    <Checkbox
                                        id="fod"
                                        checked={formData.fitOnDelivery}
                                        onCheckedChange={(checked) => setFormData({ ...formData, fitOnDelivery: !!checked })}
                                        disabled={!selectedClient?.fodAllowed}
                                        className="mt-1"
                                    />
                                    <div>
                                        <label htmlFor="fod" className="text-sm font-semibold cursor-pointer">
                                            Fit on Delivery (FOD)
                                        </label>
                                        {!selectedClient?.fodAllowed ? (
                                            <p className="text-xs text-muted-foreground mt-1">FOD not enabled for this client</p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground mt-1">Customer tries product before accepting</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!selectedClientId || createOrderMutation.isPending}
                        className="min-w-[140px]"
                    >
                        {createOrderMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Order'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
