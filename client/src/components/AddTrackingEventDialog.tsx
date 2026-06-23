import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  MapPin,
  Building2,
  Truck,
  Clock,
  CheckCircle2,
  Package,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Pause,
  Loader2,
  Calendar,
  FileText,
  Link2,
  Plane,
  FileCheck,
  Bike
} from 'lucide-react';

// Ubicaciones predefinidas de PathXpress - 7 Emiratos de UAE
const LOCATION_OPTIONS = [
  // PathXpress Hubs - 7 Emirates
  { value: 'pathxpress_hub_dubai', label: 'PathXpress Hub - Dubai', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_abudhabi', label: 'PathXpress Hub - Abu Dhabi', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_sharjah', label: 'PathXpress Hub - Sharjah', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_ajman', label: 'PathXpress Hub - Ajman', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_umm_al_quwain', label: 'PathXpress Hub - Umm Al Quwain', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_ras_al_khaimah', label: 'PathXpress Hub - Ras Al Khaimah', icon: Building2, group: 'hubs' },
  { value: 'pathxpress_hub_fujairah', label: 'PathXpress Hub - Fujairah', icon: Building2, group: 'hubs' },

  // International / Global
  { value: 'international_hub', label: 'International Hub', icon: Building2, group: 'international' },
  { value: 'dubai_airport', label: 'Dubai Airport', icon: Plane, group: 'international' },
  { value: 'customs_clearance', label: 'Customs Clearance', icon: FileCheck, group: 'international' },
  { value: 'local_courier', label: 'Local Courier Delivery', icon: Bike, group: 'international' },

  // Other locations
  { value: 'driver_vehicle', label: 'With Driver / In Vehicle', icon: Truck, group: 'other' },
  { value: 'customer_location', label: 'Customer Location', icon: MapPin, group: 'other' },
  { value: 'sender_location', label: 'Sender Location', icon: MapPin, group: 'other' },
  { value: 'other', label: 'Other (Specify)', icon: MapPin, group: 'other' },
] as const;

// Status options with visual styling
// Functional tones only: blue = moving, amber = waiting, green = done, red = problem
const STATUS_OPTIONS = [
  { value: 'pending_pickup', label: 'Pending Pickup', icon: Clock, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'picked_up', label: 'Picked Up', icon: Package, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'in_transit', label: 'In Transit', icon: Truck, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'out_for_delivery', label: 'Out for Delivery', icon: Truck, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'delivered', label: 'Delivered', icon: CheckCircle2, color: 'text-[var(--st-green)]', bg: 'bg-[var(--st-green-bg)]', border: 'border-[var(--st-green)]/30' },
  { value: 'failed_delivery', label: 'Failed Delivery', icon: XCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { value: 'on_hold', label: 'On Hold', icon: Pause, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'returned', label: 'Returned', icon: RotateCcw, color: 'text-[var(--st-gray)]', bg: 'bg-[var(--st-gray-bg)]', border: 'border-border' },
  { value: 'returned_to_sender', label: 'Return to Sender', icon: RotateCcw, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
] as const;

// Default location for each status — can still be changed by the user
const STATUS_DEFAULT_LOCATION: Record<string, string> = {
  pending_pickup:     'sender_location',
  picked_up:          'sender_location',
  in_transit:         'pathxpress_hub_dubai',
  out_for_delivery:   'driver_vehicle',
  delivered:          'customer_location',
  failed_delivery:    'customer_location',
  on_hold:            'pathxpress_hub_dubai',
  returned:           'pathxpress_hub_dubai',
  returned_to_sender: 'sender_location',
};

// Función para obtener la fecha/hora actual en formato datetime-local
const getCurrentDatetime = () => {
  const now = new Date();
  const dubaiOffset = 4 * 60;
  const localOffset = now.getTimezoneOffset();
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
  onSuccess: () => void;
}

export default function AddTrackingEventDialog({
  open,
  onOpenChange,
  shipmentId,
  onSuccess,
}: AddTrackingEventDialogProps) {
  const [formData, setFormData] = useState({
    eventDatetime: getCurrentDatetime(),
    locationKey: 'pathxpress_hub_dubai', // Updated default
    customLocation: '',
    statusCode: 'in_transit',
    statusLabel: 'IN TRANSIT',
    description: '',
    courierName: '',
    courierTracking: '',
  });
  const [podFileUrl, setPodFileUrl] = useState('');
  const [podFileUrl2, setPodFileUrl2] = useState('');

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
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add tracking event');
    },
  });

  const resetForm = () => {
    setFormData({
      eventDatetime: getCurrentDatetime(),
      locationKey: 'pathxpress_hub_dubai',
      customLocation: '',
      statusCode: 'in_transit',
      statusLabel: 'IN TRANSIT',
      description: '',
      courierName: '',
      courierTracking: '',
    });
    setPodFileUrl('');
    setPodFileUrl2('');
  };

  const handleStatusChange = (value: string) => {
    const option = STATUS_OPTIONS.find(s => s.value === value);
    const defaultLocation = STATUS_DEFAULT_LOCATION[value];
    setFormData({
      ...formData,
      statusCode: value,
      statusLabel: option?.label.toUpperCase() || value.toUpperCase(),
      ...(defaultLocation ? { locationKey: defaultLocation, customLocation: '' } : {}),
    });
  };

  const handleLocationChange = (value: string) => {
    setFormData({
      ...formData,
      locationKey: value,
      customLocation: value === 'other' ? formData.customLocation : '',
      // Clear courier fields if switching away from local_courier
      courierName: value === 'local_courier' ? formData.courierName : '',
      courierTracking: value === 'local_courier' ? formData.courierTracking : '',
    });
  };

  const getLocationLabel = () => {
    if (formData.locationKey === 'other') {
      return formData.customLocation;
    }
    const location = LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
    return location?.label || '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.locationKey === 'other' && !formData.customLocation.trim()) {
      toast.error('Please specify the custom location');
      return;
    }

    if (formData.locationKey === 'local_courier' && (!formData.courierName.trim() || !formData.courierTracking.trim())) {
      toast.error('Please specify Courier Name and Tracking Number');
      return;
    }

    const eventDatetimeWithOffset = `${formData.eventDatetime}:00+04:00`;

    // Construct description
    let finalDescription = formData.description;

    if (formData.locationKey === 'local_courier') {
      const courierInfo = `Handed over to ${formData.courierName}, Tracking: ${formData.courierTracking}`;
      finalDescription = finalDescription
        ? `${courierInfo}. ${finalDescription}`
        : courierInfo;
    }

    await addEventMutation.mutateAsync({
      shipmentId,
      eventDatetime: eventDatetimeWithOffset,
      location: getLocationLabel(),
      statusCode: formData.statusCode,
      statusLabel: formData.statusLabel,
      description: finalDescription,
      podFileUrl: podFileUrl || undefined,
      podFileUrl2: podFileUrl2 || undefined,
    });
  };

  const selectedLocation = LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
  const LocationIcon = selectedLocation?.icon || MapPin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
        {/* Decorative Top Line */}
        <div className="w-full h-1 bg-primary" />

        <div className="p-6">
          {/* Header */}
          <DialogHeader className="mb-6">
            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="w-6 h-6 text-primary" />
              </div>
              Add Tracking Event
            </DialogTitle>
            <DialogDescription className="mt-1">
              Record a new milestone for shipment tracking
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Status Selection - Visual Cards */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                Status *
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {STATUS_OPTIONS.map((status) => {
                  const Icon = status.icon;
                  const isSelected = formData.statusCode === status.value;
                  return (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => handleStatusChange(status.value)}
                      className={`
                        p-3 rounded-lg border transition-all text-left
                        ${isSelected
                          ? `${status.bg} ${status.border} ring-2 ring-offset-2 ring-offset-background ring-${status.color.replace('text-', '')}`
                          : 'bg-white/5 border-border hover:bg-white/10'
                        }
                      `}
                    >
                      <Icon className={`w-5 h-5 mb-1 ${isSelected ? status.color : 'text-muted-foreground'}`} />
                      <p className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                        {status.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date/Time and Location Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Date & Time */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Event Date & Time *
                </Label>
                <Input
                  type="datetime-local"
                  value={formData.eventDatetime}
                  onChange={(e) => setFormData({ ...formData, eventDatetime: e.target.value })}
                  required
                  className="bg-white/5 border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Dubai Time (UTC+4)
                </p>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  Location *
                </Label>
                <Select value={formData.locationKey} onValueChange={handleLocationChange}>
                  <SelectTrigger className="bg-white/5 border-border">
                    <div className="flex items-center gap-2">
                      <LocationIcon className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select location" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <div className="px-2 py-1.5 text-xs font-semibold text-primary">
                      🏢 PathXpress Hubs
                    </div>
                    {LOCATION_OPTIONS.filter(loc => loc.group === 'hubs').map((location) => {
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

                    <div className="px-2 py-1.5 text-xs font-semibold text-primary border-t mt-1 pt-2">
                      🌍 International / Global
                    </div>
                    {LOCATION_OPTIONS.filter(loc => loc.group === 'international').map((location) => {
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

                    <div className="px-2 py-1.5 text-xs font-semibold text-primary border-t mt-1 pt-2">
                      📍 Other Locations
                    </div>
                    {LOCATION_OPTIONS.filter(loc => loc.group === 'other').map((location) => {
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
            </div>

            {/* Custom Location Field */}
            {formData.locationKey === 'other' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--st-amber)]" />
                  Custom Location *
                </Label>
                <Input
                  placeholder="Enter the specific location"
                  value={formData.customLocation}
                  onChange={(e) => setFormData({ ...formData, customLocation: e.target.value })}
                  required
                  className="bg-secondary border-border"
                />
              </div>
            )}

            {/* Local Courier Fields */}
            {formData.locationKey === 'local_courier' && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary border border-border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-[var(--st-blue)]">
                    <Truck className="w-4 h-4" />
                    Courier Name *
                  </Label>
                  <Input
                    placeholder="e.g. Aramex, DHL"
                    value={formData.courierName}
                    onChange={(e) => setFormData({ ...formData, courierName: e.target.value })}
                    required
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-[var(--st-blue)]">
                    <FileText className="w-4 h-4" />
                    Tracking Number *
                  </Label>
                  <Input
                    placeholder="Enter tracking number"
                    value={formData.courierTracking}
                    onChange={(e) => setFormData({ ...formData, courierTracking: e.target.value })}
                    required
                    className="bg-background border-border font-mono"
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Description
              </Label>
              <Textarea
                placeholder="Additional details about this event..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="bg-white/5 border-border resize-none"
              />
            </div>

            {/* POD URL - only show for delivered status */}
            {formData.statusCode === 'delivered' && (
              <div className="space-y-2 p-4 rounded-lg bg-[var(--st-green-bg)] border border-[var(--st-green)]/25">
                <Label className="flex items-center gap-2 text-[var(--st-green)]">
                  <Link2 className="w-4 h-4" />
                  Proof of Delivery URLs
                </Label>
                <Input
                  type="url"
                  placeholder="https://example.com/pod-image.jpg"
                  value={podFileUrl}
                  onChange={(e) => setPodFileUrl(e.target.value)}
                  className="bg-background border-border"
                />
                <Input
                  type="url"
                  placeholder="https://example.com/pod-image-2.jpg (optional)"
                  value={podFileUrl2}
                  onChange={(e) => setPodFileUrl2(e.target.value)}
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Add up to two links to signature or photo proof
                </p>
              </div>
            )}

            {/* Footer */}
            <DialogFooter className="pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addEventMutation.isPending}
              >
                {addEventMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Add Event
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

