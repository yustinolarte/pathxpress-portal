import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
// POD upload will be handled via backend endpoint

interface AddTrackingEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: number;
  token: string;
  onSuccess: () => void;
}

export default function AddTrackingEventDialog({
  open,
  onOpenChange,
  shipmentId,
  token,
  onSuccess,
}: AddTrackingEventDialogProps) {
  const [formData, setFormData] = useState({
    eventDatetime: new Date().toISOString().slice(0, 16),
    location: '',
    statusCode: 'in_transit',
    statusLabel: 'IN TRANSIT',
    description: '',
  });
  const [podFileUrl, setPodFileUrl] = useState('');

  const addEventMutation = trpc.portal.tracking.addEvent.useMutation({
    onSuccess: () => {
      toast.success('Tracking event added successfully');
      onSuccess();
      onOpenChange(false);
      // Reset form
      setFormData({
        eventDatetime: new Date().toISOString().slice(0, 16),
        location: '',
        statusCode: 'in_transit',
        statusLabel: 'IN TRANSIT',
        description: '',
      });
      setPodFileUrl('');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add tracking event');
    },
  });

  const handleStatusChange = (value: string) => {
    const statusLabels: Record<string, string> = {
      pending_pickup: 'PENDING PICKUP',
      in_transit: 'IN TRANSIT',
      out_for_delivery: 'OUT FOR DELIVERY',
      delivered: 'DELIVERED',
      failed_delivery: 'FAILED DELIVERY',
      returned: 'RETURNED',
    };
    setFormData({
      ...formData,
      statusCode: value,
      statusLabel: statusLabels[value] || value.toUpperCase(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Convert local datetime input to Dubai timezone (UTC+4)
    // The datetime-local input gives us a string like "2026-01-06T10:00"
    // We append the Dubai offset to ensure correct interpretation on the server
    const eventDatetimeWithOffset = `${formData.eventDatetime}:00+04:00`;

    // Add tracking event
    await addEventMutation.mutateAsync({
      token,
      shipmentId,
      ...formData,
      eventDatetime: eventDatetimeWithOffset,
      podFileUrl: podFileUrl || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Tracking Event</DialogTitle>
          <DialogDescription>
            Add a new tracking event for this shipment
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Event Date & Time *</Label>
              <Input
                type="datetime-local"
                value={formData.eventDatetime}
                onChange={(e) => setFormData({ ...formData, eventDatetime: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Location</Label>
              <Input
                placeholder="e.g., Dubai Sorting Facility"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label>Status *</Label>
              <Select value={formData.statusCode} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_pickup">Pending Pickup</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed_delivery">Failed Delivery</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Additional details about this event"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="col-span-2">
              <Label>Proof of Delivery URL (Optional)</Label>
              <Input
                type="url"
                placeholder="https://example.com/pod-image.jpg"
                value={podFileUrl}
                onChange={(e) => setPodFileUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter URL to signature or photo proof (for delivered status)
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addEventMutation.isPending}>
              Add Event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
