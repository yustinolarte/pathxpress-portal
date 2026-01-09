import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MapPin, Building2, Warehouse, Truck } from 'lucide-react';

// Ubicaciones predefinidas de PathXpress - 7 Emiratos de UAE
const LOCATION_OPTIONS = [
  // PathXpress Hubs - 7 Emirates
  { value: 'pathxpress_hub_dubai', label: 'PathXpress Hub - Dubai', icon: Building2 },
  { value: 'pathxpress_hub_abudhabi', label: 'PathXpress Hub - Abu Dhabi', icon: Building2 },
  { value: 'pathxpress_hub_sharjah', label: 'PathXpress Hub - Sharjah', icon: Building2 },
  { value: 'pathxpress_hub_ajman', label: 'PathXpress Hub - Ajman', icon: Building2 },
  { value: 'pathxpress_hub_umm_al_quwain', label: 'PathXpress Hub - Umm Al Quwain', icon: Building2 },
  { value: 'pathxpress_hub_ras_al_khaimah', label: 'PathXpress Hub - Ras Al Khaimah', icon: Building2 },
  { value: 'pathxpress_hub_fujairah', label: 'PathXpress Hub - Fujairah', icon: Building2 },
  // Sorting Centers - 7 Emirates
  { value: 'sorting_center_dubai', label: 'Dubai Sorting Center', icon: Warehouse },
  { value: 'sorting_center_abudhabi', label: 'Abu Dhabi Sorting Center', icon: Warehouse },
  { value: 'sorting_center_sharjah', label: 'Sharjah Sorting Center', icon: Warehouse },
  { value: 'sorting_center_ajman', label: 'Ajman Sorting Center', icon: Warehouse },
  { value: 'sorting_center_umm_al_quwain', label: 'Umm Al Quwain Sorting Center', icon: Warehouse },
  { value: 'sorting_center_ras_al_khaimah', label: 'Ras Al Khaimah Sorting Center', icon: Warehouse },
  { value: 'sorting_center_fujairah', label: 'Fujairah Sorting Center', icon: Warehouse },
  // Warehouses
  { value: 'warehouse_jebel_ali', label: 'Jebel Ali Warehouse', icon: Warehouse },
  { value: 'warehouse_dip', label: 'DIP Warehouse', icon: Warehouse },
  // Other locations
  { value: 'driver_vehicle', label: 'With Driver / In Vehicle', icon: Truck },
  { value: 'customer_location', label: 'Customer Location', icon: MapPin },
  { value: 'sender_location', label: 'Sender Location', icon: MapPin },
  { value: 'other', label: 'Other (Specify)', icon: MapPin },
] as const;

// Función para obtener la fecha/hora actual en formato datetime-local
const getCurrentDatetime = () => {
  const now = new Date();
  // Ajustar a UTC+4 (Dubai timezone)
  const dubaiOffset = 4 * 60; // minutos
  const localOffset = now.getTimezoneOffset(); // minutos (negativo para zonas adelante de UTC)
  const dubaiTime = new Date(now.getTime() + (dubaiOffset + localOffset) * 60 * 1000);

  const year = dubaiTime.getFullYear();
  const month = String(dubaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(dubaiTime.getDate()).padStart(2, '0');
  const hours = String(dubaiTime.getHours()).padStart(2, '0');
  const minutes = String(dubaiTime.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

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
    eventDatetime: getCurrentDatetime(),
    locationKey: 'sorting_center_dubai',
    customLocation: '',
    statusCode: 'in_transit',
    statusLabel: 'IN TRANSIT',
    description: '',
  });
  const [podFileUrl, setPodFileUrl] = useState('');

  // Actualizar fecha/hora cuando se abre el diálogo
  useEffect(() => {
    if (open) {
      setFormData(prev => ({
        ...prev,
        eventDatetime: getCurrentDatetime(),
      }));
    }
  }, [open]);

  const addEventMutation = trpc.portal.tracking.addEvent.useMutation({
    onSuccess: () => {
      toast.success('Tracking event added successfully');
      onSuccess();
      onOpenChange(false);
      // Reset form
      setFormData({
        eventDatetime: getCurrentDatetime(),
        locationKey: 'sorting_center_dubai',
        customLocation: '',
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
      picked_up: 'PICKED UP',
      in_transit: 'IN TRANSIT',
      out_for_delivery: 'OUT FOR DELIVERY',
      delivered: 'DELIVERED',
      failed_delivery: 'FAILED DELIVERY',
      returned: 'RETURNED',
      on_hold: 'ON HOLD',
    };
    setFormData({
      ...formData,
      statusCode: value,
      statusLabel: statusLabels[value] || value.toUpperCase(),
    });
  };

  const handleLocationChange = (value: string) => {
    setFormData({
      ...formData,
      locationKey: value,
      customLocation: value === 'other' ? formData.customLocation : '',
    });
  };

  // Obtener el label de la ubicación para enviar al servidor
  const getLocationLabel = () => {
    if (formData.locationKey === 'other') {
      return formData.customLocation;
    }
    const location = LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
    return location?.label || '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar ubicación personalizada si se seleccionó "Otro"
    if (formData.locationKey === 'other' && !formData.customLocation.trim()) {
      toast.error('Please specify the custom location');
      return;
    }

    // Convert local datetime input to Dubai timezone (UTC+4)
    const eventDatetimeWithOffset = `${formData.eventDatetime}:00+04:00`;

    // Add tracking event
    await addEventMutation.mutateAsync({
      token,
      shipmentId,
      eventDatetime: eventDatetimeWithOffset,
      location: getLocationLabel(),
      statusCode: formData.statusCode,
      statusLabel: formData.statusLabel,
      description: formData.description,
      podFileUrl: podFileUrl || undefined,
    });
  };

  const selectedLocation = LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
  const LocationIcon = selectedLocation?.icon || MapPin;

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
              <p className="text-xs text-muted-foreground mt-1">
                Dubai Time (UTC+4)
              </p>
            </div>

            <div>
              <Label>Location *</Label>
              <Select value={formData.locationKey} onValueChange={handleLocationChange}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <LocationIcon className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select location" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    PathXpress Hubs
                  </div>
                  {LOCATION_OPTIONS.filter(loc => loc.value.startsWith('pathxpress')).map((location) => {
                    const Icon = location.icon;
                    return (
                      <SelectItem key={location.value} value={location.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {location.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                    Sorting Centers
                  </div>
                  {LOCATION_OPTIONS.filter(loc => loc.value.startsWith('sorting')).map((location) => {
                    const Icon = location.icon;
                    return (
                      <SelectItem key={location.value} value={location.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {location.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                    Warehouses
                  </div>
                  {LOCATION_OPTIONS.filter(loc => loc.value.startsWith('warehouse')).map((location) => {
                    const Icon = location.icon;
                    return (
                      <SelectItem key={location.value} value={location.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {location.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                    Other Locations
                  </div>
                  {LOCATION_OPTIONS.filter(loc =>
                    !loc.value.startsWith('pathxpress') &&
                    !loc.value.startsWith('sorting') &&
                    !loc.value.startsWith('warehouse')
                  ).map((location) => {
                    const Icon = location.icon;
                    return (
                      <SelectItem key={location.value} value={location.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {location.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Campo de ubicación personalizada cuando se selecciona "Otro" */}
            {formData.locationKey === 'other' && (
              <div className="col-span-2">
                <Label>Custom Location *</Label>
                <Input
                  placeholder="Enter the specific location"
                  value={formData.customLocation}
                  onChange={(e) => setFormData({ ...formData, customLocation: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="col-span-2">
              <Label>Status *</Label>
              <Select value={formData.statusCode} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_pickup">Pending Pickup</SelectItem>
                  <SelectItem value="picked_up">Picked Up</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed_delivery">Failed Delivery</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
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
              {addEventMutation.isPending ? 'Adding...' : 'Add Event'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
