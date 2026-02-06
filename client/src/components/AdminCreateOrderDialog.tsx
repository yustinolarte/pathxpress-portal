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
import { Loader2, Package, User, MapPin, Phone, FileText, Truck } from 'lucide-react';

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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        Create Order
                    </DialogTitle>
                    <DialogDescription>
                        Create a new order on behalf of a client
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Client Selection */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Select Client *
                        </Label>
                        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                            <SelectTrigger>
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
                        {selectedClient && (
                            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg mt-2">
                                <p><strong>Shipper:</strong> {selectedClient.companyName}</p>
                                <p><strong>Address:</strong> {selectedClient.billingAddress}, {selectedClient.city}, {selectedClient.country}</p>
                                <p><strong>Phone:</strong> {selectedClient.phone}</p>
                                <div className="flex gap-4 mt-2">
                                    <span className={`text-xs px-2 py-0.5 rounded ${selectedClient.codAllowed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        COD: {selectedClient.codAllowed ? 'Allowed' : 'Not Allowed'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${selectedClient.fodAllowed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        FOD: {selectedClient.fodAllowed ? 'Allowed' : 'Not Allowed'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedClient && (
                        <>
                            {/* Consignee Section */}
                            <div className="border-t border-border/50 pt-4">
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    Consignee Details
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Customer Name *</Label>
                                        <Input
                                            value={formData.customerName}
                                            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                            placeholder="Full name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1">
                                            <Phone className="h-3 w-3" /> Phone *
                                        </Label>
                                        <Input
                                            value={formData.customerPhone}
                                            onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                                            placeholder="+971..."
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <Label>Address *</Label>
                                        <Textarea
                                            value={formData.address}
                                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            placeholder="Full delivery address"
                                            rows={2}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>City *</Label>
                                        <Input
                                            value={formData.city}
                                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                            placeholder="Dubai"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Emirate</Label>
                                        <Select value={formData.emirate} onValueChange={(val) => setFormData({ ...formData, emirate: val })}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select emirate" />
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

                            {/* Shipment Details */}
                            <div className="border-t border-border/50 pt-4">
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <Truck className="h-4 w-4 text-primary" />
                                    Shipment Details
                                </h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Service Type *</Label>
                                        <Select value={formData.serviceType} onValueChange={(val) => setFormData({ ...formData, serviceType: val })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="DOM">Domestic Express</SelectItem>
                                                <SelectItem value="SDD">Same Day Delivery</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Weight (kg) *</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={formData.weight}
                                            onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0.5 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Pieces</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={formData.pieces}
                                            onChange={(e) => setFormData({ ...formData, pieces: parseInt(e.target.value) || 1 })}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 space-y-2">
                                    <Label className="flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Reference Number (Optional)
                                    </Label>
                                    <Input
                                        value={formData.orderNumber}
                                        onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                                        placeholder="Client's internal order number"
                                    />
                                </div>
                                <div className="mt-4 space-y-2">
                                    <Label>Special Instructions</Label>
                                    <Textarea
                                        value={formData.specialInstructions}
                                        onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                                        placeholder="Any delivery instructions..."
                                        rows={2}
                                    />
                                </div>
                            </div>

                            {/* COD & FOD Options */}
                            <div className="border-t border-border/50 pt-4">
                                <h4 className="font-medium mb-3">Options</h4>
                                <div className="space-y-4">
                                    {/* COD */}
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="cod"
                                            checked={formData.codRequired}
                                            onCheckedChange={(checked) => setFormData({ ...formData, codRequired: !!checked })}
                                            disabled={!selectedClient?.codAllowed}
                                        />
                                        <div className="flex-1">
                                            <label htmlFor="cod" className="text-sm font-medium cursor-pointer">
                                                Cash on Delivery (COD)
                                            </label>
                                            {!selectedClient?.codAllowed && (
                                                <p className="text-xs text-muted-foreground">COD not enabled for this client</p>
                                            )}
                                            {formData.codRequired && selectedClient?.codAllowed && (
                                                <div className="mt-2">
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
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="fod"
                                            checked={formData.fitOnDelivery}
                                            onCheckedChange={(checked) => setFormData({ ...formData, fitOnDelivery: !!checked })}
                                            disabled={!selectedClient?.fodAllowed}
                                        />
                                        <div>
                                            <label htmlFor="fod" className="text-sm font-medium cursor-pointer">
                                                Fit on Delivery (FOD)
                                            </label>
                                            {!selectedClient?.fodAllowed && (
                                                <p className="text-xs text-muted-foreground">FOD not enabled for this client</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!selectedClientId || createOrderMutation.isPending}
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
