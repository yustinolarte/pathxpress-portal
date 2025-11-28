import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface EditInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  token: string;
  onSuccess: () => void;
}

export default function EditInvoiceDialog({ open, onOpenChange, invoice, token, onSuccess }: EditInvoiceDialogProps) {
  const [formData, setFormData] = useState({
    subtotal: '',
    taxes: '',
    total: '',
    amountPaid: '',
    balance: '',
    status: 'pending' as 'pending' | 'paid' | 'overdue',
    notes: '',
    adjustmentNotes: '',
  });

  useEffect(() => {
    if (invoice) {
      setFormData({
        subtotal: invoice.subtotal || '',
        taxes: invoice.taxes || '',
        total: invoice.total || '',
        amountPaid: invoice.amountPaid || '0',
        balance: invoice.balance || invoice.total || '',
        status: invoice.status || 'pending',
        notes: invoice.notes || '',
        adjustmentNotes: invoice.adjustmentNotes || '',
      });
    }
  }, [invoice]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate numbers
    const subtotal = parseFloat(formData.subtotal);
    const taxes = parseFloat(formData.taxes);
    const total = parseFloat(formData.total);
    const amountPaid = parseFloat(formData.amountPaid);
    
    if (isNaN(subtotal) || isNaN(taxes) || isNaN(total) || isNaN(amountPaid)) {
      toast.error('Please enter valid numbers');
      return;
    }
    
    // Calculate balance
    const balance = (total - amountPaid).toFixed(2);
    
    updateMutation.mutate({
      token,
      invoiceId: invoice.id,
      data: {
        subtotal: subtotal.toFixed(2),
        taxes: taxes.toFixed(2),
        total: total.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        balance,
        status: formData.status,
        notes: formData.notes,
        adjustmentNotes: formData.adjustmentNotes || undefined,
      },
    });
  };

  const handleNumberChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-calculate total and balance
    if (field === 'subtotal' || field === 'taxes') {
      const subtotal = parseFloat(field === 'subtotal' ? value : formData.subtotal) || 0;
      const taxes = parseFloat(field === 'taxes' ? value : formData.taxes) || 0;
      const total = (subtotal + taxes).toFixed(2);
      const amountPaid = parseFloat(formData.amountPaid) || 0;
      const balance = (parseFloat(total) - amountPaid).toFixed(2);
      
      setFormData(prev => ({ ...prev, total, balance }));
    } else if (field === 'amountPaid') {
      const total = parseFloat(formData.total) || 0;
      const amountPaid = parseFloat(value) || 0;
      const balance = (total - amountPaid).toFixed(2);
      
      setFormData(prev => ({ ...prev, balance }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice #{invoice?.invoiceNumber}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="subtotal">Subtotal ({invoice?.currency})</Label>
              <Input
                id="subtotal"
                type="number"
                step="0.01"
                value={formData.subtotal}
                onChange={(e) => handleNumberChange('subtotal', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="taxes">Taxes ({invoice?.currency})</Label>
              <Input
                id="taxes"
                type="number"
                step="0.01"
                value={formData.taxes}
                onChange={(e) => handleNumberChange('taxes', e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total">Total ({invoice?.currency})</Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                value={formData.total}
                readOnly
                className="bg-muted"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amountPaid">Amount Paid ({invoice?.currency})</Label>
              <Input
                id="amountPaid"
                type="number"
                step="0.01"
                value={formData.amountPaid}
                onChange={(e) => handleNumberChange('amountPaid', e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="balance">Balance Due ({invoice?.currency})</Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                value={formData.balance}
                readOnly
                className="bg-muted"
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
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any notes about this invoice..."
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="adjustmentNotes">Adjustment Reason (Visible to Customer)</Label>
            <Textarea
              id="adjustmentNotes"
              value={formData.adjustmentNotes}
              onChange={(e) => setFormData(prev => ({ ...prev, adjustmentNotes: e.target.value }))}
              placeholder="Explain why this invoice was adjusted (e.g., 'Price correction due to weight discrepancy')..."
              rows={3}
              className="border-orange-300 focus:border-orange-500"
            />
            <p className="text-xs text-muted-foreground">This note will be visible to the customer to explain any changes made to the invoice.</p>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
