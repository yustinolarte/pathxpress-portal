import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Plus, Trash2, Package, Percent, DollarSign, Box, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface EditInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  token: string;
  onSuccess: () => void;
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  shipmentId: number | null;
}

interface NewItemForm {
  description: string;
  quantity: number;
  unitPrice: string;
}

const PRESET_ITEMS = [
  { label: 'Packaging Bags', icon: Package, defaultPrice: '2.00' },
  { label: 'Additional Handling', icon: Box, defaultPrice: '5.00' },
  { label: 'Insurance Fee', icon: DollarSign, defaultPrice: '10.00' },
  { label: 'Discount', icon: Percent, defaultPrice: '-0.00' },
];

export default function EditInvoiceDialog({ open, onOpenChange, invoice, token, onSuccess }: EditInvoiceDialogProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState<NewItemForm>({
    description: '',
    quantity: 1,
    unitPrice: '0.00',
  });

  const [formData, setFormData] = useState({
    amountPaid: '',
    status: 'pending' as 'pending' | 'paid' | 'overdue',
    notes: '',
    adjustmentNotes: '',
  });

  // Fetch invoice items when dialog opens
  useEffect(() => {
    if (open && invoice) {
      setIsLoadingItems(true);
      fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { token, invoiceId: invoice.id } })))
        .then(res => res.json())
        .then(result => {
          if (result.result?.data?.json?.items) {
            setItems(result.result.data.json.items);
          }
        })
        .catch(err => {
          console.error('Error loading invoice items:', err);
          toast.error('Failed to load invoice items');
        })
        .finally(() => setIsLoadingItems(false));

      setFormData({
        amountPaid: invoice.amountPaid || '0',
        status: invoice.status || 'pending',
        notes: invoice.notes || '',
        adjustmentNotes: invoice.adjustmentNotes || '',
      });
    }
  }, [open, invoice, token]);

  const utils = trpc.useUtils();

  const updateMutation = trpc.portal.billing.updateInvoice.useMutation({
    onSuccess: () => {
      toast.success('Invoice updated successfully');
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update invoice');
    },
  });

  const addItemMutation = trpc.portal.billing.addInvoiceItem.useMutation({
    onSuccess: () => {
      toast.success('Item added successfully');
      setShowAddForm(false);
      setNewItem({ description: '', quantity: 1, unitPrice: '0.00' });
      // Refresh items
      refreshItems();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add item');
    },
  });

  const deleteItemMutation = trpc.portal.billing.deleteInvoiceItem.useMutation({
    onSuccess: () => {
      toast.success('Item deleted successfully');
      refreshItems();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete item');
    },
  });

  const refreshItems = () => {
    setIsLoadingItems(true);
    fetch('/api/trpc/portal.billing.getInvoiceDetails?input=' + encodeURIComponent(JSON.stringify({ json: { token, invoiceId: invoice.id } })))
      .then(res => res.json())
      .then(result => {
        if (result.result?.data?.json) {
          setItems(result.result.data.json.items);
          // Update invoice totals in parent
          onSuccess();
        }
      })
      .catch(err => console.error('Error refreshing items:', err))
      .finally(() => setIsLoadingItems(false));
  };

  const handleAddItem = () => {
    if (!newItem.description.trim()) {
      toast.error('Please enter a description');
      return;
    }

    const price = parseFloat(newItem.unitPrice);
    if (isNaN(price)) {
      toast.error('Please enter a valid price');
      return;
    }

    addItemMutation.mutate({
      token,
      invoiceId: invoice.id,
      description: newItem.description,
      quantity: newItem.quantity,
      unitPrice: price.toFixed(2),
    });
  };

  const handleDeleteItem = (itemId: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    deleteItemMutation.mutate({
      token,
      invoiceId: invoice.id,
      itemId,
    });
  };

  const handlePresetClick = (preset: typeof PRESET_ITEMS[0]) => {
    setNewItem({
      description: preset.label,
      quantity: 1,
      unitPrice: preset.defaultPrice,
    });
    setShowAddForm(true);
  };

  const handleSave = () => {
    // Calculate totals from items
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);
    const taxes = 0;
    const total = subtotal + taxes;
    const amountPaid = parseFloat(formData.amountPaid) || 0;
    const balance = total - amountPaid;

    updateMutation.mutate({
      token,
      invoiceId: invoice.id,
      data: {
        subtotal: subtotal.toFixed(2),
        taxes: taxes.toFixed(2),
        total: total.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        balance: balance.toFixed(2),
        status: formData.status,
        notes: formData.notes,
        adjustmentNotes: formData.adjustmentNotes || undefined,
      },
    });
  };

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    return `${invoice?.currency || 'AED'} ${num.toFixed(2)}`;
  };

  // Calculate totals
  const calculatedSubtotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);
  const calculatedTotal = calculatedSubtotal;
  const amountPaid = parseFloat(formData.amountPaid) || 0;
  const calculatedBalance = calculatedTotal - amountPaid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Edit Invoice #{invoice?.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Invoice Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>

            {/* Quick Add Presets */}
            {showAddForm && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground mr-2">Quick add:</span>
                  {PRESET_ITEMS.map((preset, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handlePresetClick(preset)}
                    >
                      <preset.icon className="w-3 h-3 mr-1" />
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="newItemDesc">Description</Label>
                    <Input
                      id="newItemDesc"
                      value={newItem.description}
                      onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="e.g., Packaging, Handling Fee, Discount..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="newItemQty">Quantity</Label>
                    <Input
                      id="newItemQty"
                      type="number"
                      min="1"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newItemPrice">Unit Price ({invoice?.currency})</Label>
                    <Input
                      id="newItemPrice"
                      type="number"
                      step="0.01"
                      value={newItem.unitPrice}
                      onChange={(e) => setNewItem(prev => ({ ...prev, unitPrice: e.target.value }))}
                      placeholder="Use negative for discounts"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddItem}
                    disabled={addItemMutation.isPending}
                  >
                    {addItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Add Item
                  </Button>
                </div>
              </div>
            )}

            {/* Items Table */}
            {isLoadingItems ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50%]">Description</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className={item.shipmentId ? '' : 'bg-blue-500/5'}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.shipmentId ? (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">Shipment</span>
                          ) : (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Manual</span>
                          )}
                          {item.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className={`text-right font-medium ${parseFloat(item.total) < 0 ? 'text-red-400' : ''}`}>
                        {formatCurrency(item.total)}
                      </TableCell>
                      <TableCell>
                        {item.shipmentId === null && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={deleteItemMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No items in this invoice
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(calculatedSubtotal.toFixed(2))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxes</span>
                  <span>{formatCurrency('0.00')}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(calculatedTotal.toFixed(2))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Status Section */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="amountPaid">Amount Paid ({invoice?.currency})</Label>
              <Input
                id="amountPaid"
                type="number"
                step="0.01"
                value={formData.amountPaid}
                onChange={(e) => setFormData(prev => ({ ...prev, amountPaid: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="balance">Balance Due ({invoice?.currency})</Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                value={calculatedBalance.toFixed(2)}
                readOnly
                className={`bg-muted ${calculatedBalance > 0 ? 'text-orange-400' : 'text-green-400'}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes (Not visible to customer)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any internal notes..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustmentNotes" className="text-orange-400">Adjustment Reason (Visible to Customer)</Label>
              <Textarea
                id="adjustmentNotes"
                value={formData.adjustmentNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, adjustmentNotes: e.target.value }))}
                placeholder="Explain why this invoice was adjusted (e.g., 'Added packaging materials fee')..."
                rows={2}
                className="border-orange-300 focus:border-orange-500"
              />
              <p className="text-xs text-muted-foreground">
                This note will be visible to the customer to explain any changes made to the invoice.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
