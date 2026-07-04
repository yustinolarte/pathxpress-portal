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
  ShieldCheck,
  ShieldAlert,
  Globe,
  Navigation,
  Warehouse,
  PackageX,
  CalendarClock,
  MapPinOff,
} from 'lucide-react';

// International location options grouped by stage
const INTL_LOCATION_OPTIONS = [
  // Origin
  { value: 'pathxpress_hub_dubai', label: 'PathXpress Hub – Dubai', icon: Building2, group: 'origin' },
  { value: 'dubai_airport_dxb', label: 'Dubai Airport (DXB)', icon: Plane, group: 'origin' },

  // Transit
  { value: 'international_transit_hub', label: 'International Transit Hub', icon: Globe, group: 'transit' },
  { value: 'airline_belly', label: 'Airline Belly / Cargo', icon: Plane, group: 'transit' },
  { value: 'transit_country_airport', label: 'Transit Country Airport', icon: Navigation, group: 'transit' },

  // Destination
  { value: 'destination_airport', label: 'Destination Country Airport', icon: Plane, group: 'destination' },
  { value: 'customs_origin', label: 'Customs – Origin Country', icon: FileCheck, group: 'destination' },
  { value: 'customs_destination', label: 'Customs – Destination Country', icon: FileCheck, group: 'destination' },
  { value: 'local_delivery_partner', label: 'Local Delivery Partner (Destination)', icon: Truck, group: 'destination' },
  { value: 'destination_warehouse', label: 'Destination Warehouse / Sorting', icon: Warehouse, group: 'destination' },

  // Other
  { value: 'return_facility', label: 'Return Facility', icon: RotateCcw, group: 'other' },
  { value: 'customer_location', label: 'Customer Location', icon: MapPin, group: 'other' },
  { value: 'other', label: 'Other (Specify)', icon: MapPin, group: 'other' },
] as const;

// All possible international package statuses
// Functional tones only: blue = moving, amber = waiting, green = done, red = problem
const INTL_STATUS_OPTIONS = [
  { value: 'pending_pickup', label: 'Pending Pickup', description: 'Order created; waiting for the courier to collect the package from the sender.', icon: Clock, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'picked_up', label: 'Picked Up', description: "Courier has collected the package from the sender's location.", icon: Package, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'failed_pickup', label: 'Failed Pickup', description: 'Pickup attempt failed — sender unavailable, address incorrect, or package not ready.', icon: PackageX, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { value: 'departed_origin', label: 'Departed Origin', description: 'Package has left the origin country and is en route internationally.', icon: Plane, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'in_transit', label: 'In Transit', description: 'Package is moving through the international network toward the destination country.', icon: Globe, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'arrived_destination', label: 'Arrived Destination', description: 'Package has arrived in the destination country and is awaiting further processing.', icon: Navigation, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'customs_clearance', label: 'Customs Clearance', description: 'Package is being processed by customs in the destination country.', icon: FileCheck, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'customs_cleared', label: 'Customs Cleared', description: 'Package has cleared customs and can continue to final delivery.', icon: ShieldCheck, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'customs_held', label: 'Held by Customs', description: 'Customs has held the package — additional documentation or duties may be required.', icon: ShieldAlert, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { value: 'out_for_delivery', label: 'Out for Delivery', description: 'Package is with the local delivery partner on the final leg to the recipient.', icon: Truck, color: 'text-[var(--st-blue)]', bg: 'bg-[var(--st-blue-bg)]', border: 'border-[var(--st-blue)]/30' },
  { value: 'delivered', label: 'Delivered', description: 'Package was successfully handed to the recipient.', icon: CheckCircle2, color: 'text-[var(--st-green)]', bg: 'bg-[var(--st-green-bg)]', border: 'border-[var(--st-green)]/30' },
  { value: 'failed_delivery', label: 'Failed Delivery', description: 'Delivery attempt failed — recipient unavailable, refused, or address unreachable.', icon: XCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { value: 'address_issue', label: 'Address Issue', description: 'Address is incomplete or incorrect; recipient/sender must be contacted to confirm the location.', icon: MapPinOff, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'rescheduled', label: 'Rescheduled', description: 'Pickup or delivery was rebooked to a new confirmed date/time.', icon: CalendarClock, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'damaged', label: 'Damaged', description: 'Package shows visible damage detected in transit or before delivery.', icon: ShieldAlert, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { value: 'on_hold', label: 'On Hold', description: 'Shipment is paused pending review, payment, or customer instructions.', icon: Pause, color: 'text-[var(--st-amber)]', bg: 'bg-[var(--st-amber-bg)]', border: 'border-[var(--st-amber)]/30' },
  { value: 'returned', label: 'Returned', description: 'Package is on its way back to the PathXpress hub.', icon: RotateCcw, color: 'text-[var(--st-gray)]', bg: 'bg-[var(--st-gray-bg)]', border: 'border-border' },
  { value: 'returned_to_sender', label: 'Return to Sender', description: 'Package was returned and handed back to the original sender.', icon: RotateCcw, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
] as const;

// Default location for each international status — can still be changed by the user
const STATUS_DEFAULT_LOCATION: Record<string, string> = {
  pending_pickup:       'pathxpress_hub_dubai',
  picked_up:            'pathxpress_hub_dubai',
  failed_pickup:        'pathxpress_hub_dubai',
  departed_origin:      'dubai_airport_dxb',
  in_transit:           'international_transit_hub',
  arrived_destination:  'destination_airport',
  customs_clearance:    'customs_destination',
  customs_cleared:      'customs_destination',
  customs_held:         'customs_destination',
  out_for_delivery:     'local_delivery_partner',
  delivered:            'customer_location',
  failed_delivery:      'customer_location',
  damaged:              'destination_warehouse',
  on_hold:              'destination_warehouse',
  returned:             'return_facility',
  returned_to_sender:   'pathxpress_hub_dubai',
};

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

interface AddIntlTrackingEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: number;
  onSuccess: () => void;
}

export default function AddIntlTrackingEventDialog({
  open,
  onOpenChange,
  shipmentId,
  onSuccess,
}: AddIntlTrackingEventDialogProps) {
  const [formData, setFormData] = useState({
    eventDatetime: getCurrentDatetime(),
    locationKey: 'pathxpress_hub_dubai',
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
      setFormData(prev => ({ ...prev, eventDatetime: getCurrentDatetime() }));
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
    const option = INTL_STATUS_OPTIONS.find(s => s.value === value);
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
      courierName: value === 'local_delivery_partner' ? formData.courierName : '',
      courierTracking: value === 'local_delivery_partner' ? formData.courierTracking : '',
    });
  };

  const getLocationLabel = () => {
    if (formData.locationKey === 'other') return formData.customLocation;
    const location = INTL_LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
    return location?.label || '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.locationKey === 'other' && !formData.customLocation.trim()) {
      toast.error('Please specify the custom location');
      return;
    }

    if (formData.locationKey === 'local_delivery_partner' && (!formData.courierName.trim() || !formData.courierTracking.trim())) {
      toast.error('Please specify Courier Name and Tracking Number');
      return;
    }

    const eventDatetimeWithOffset = `${formData.eventDatetime}:00+04:00`;

    let finalDescription = formData.description;
    if (formData.locationKey === 'local_delivery_partner') {
      const courierInfo = `Handed over to ${formData.courierName}, Tracking: ${formData.courierTracking}`;
      finalDescription = finalDescription ? `${courierInfo}. ${finalDescription}` : courierInfo;
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

  const selectedLocation = INTL_LOCATION_OPTIONS.find(loc => loc.value === formData.locationKey);
  const LocationIcon = selectedLocation?.icon || MapPin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border !w-[90vw] !max-w-[760px] max-h-[90vh] overflow-y-auto p-0 gap-0 ">
        <div className="w-full h-1 bg-primary" />

        <div className="p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-display text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              Update International Tracking
            </DialogTitle>
            <DialogDescription className="mt-1">
              Record a new milestone for this international shipment
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Status Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                Status *
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {INTL_STATUS_OPTIONS.map((status) => {
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
                          ? `${status.bg} ${status.border} ring-2 ring-offset-2 ring-offset-background`
                          : 'bg-white/5 border-border hover:bg-white/10'
                        }
                      `}
                    >
                      <Icon className={`w-5 h-5 mb-1 ${isSelected ? status.color : 'text-muted-foreground'}`} />
                      <p className={`text-xs font-medium leading-tight ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                        {status.label}
                      </p>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const selected = INTL_STATUS_OPTIONS.find(s => s.value === formData.statusCode);
                return selected ? (
                  <p className="text-xs text-muted-foreground italic">{selected.description}</p>
                ) : null;
              })()}
            </div>

            {/* Date/Time and Location Row */}
            <div className="grid grid-cols-2 gap-4">
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
                <p className="text-xs text-muted-foreground">Dubai Time (UTC+4)</p>
              </div>

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
                  <SelectContent className="max-h-[320px]">
                    <div className="px-2 py-1.5 text-xs font-semibold text-primary">
                      🇦🇪 Origin
                    </div>
                    {INTL_LOCATION_OPTIONS.filter(loc => loc.group === 'origin').map((location) => {
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
                      ✈️ Transit
                    </div>
                    {INTL_LOCATION_OPTIONS.filter(loc => loc.group === 'transit').map((location) => {
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
                      🌍 Destination
                    </div>
                    {INTL_LOCATION_OPTIONS.filter(loc => loc.group === 'destination').map((location) => {
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
                      📍 Other
                    </div>
                    {INTL_LOCATION_OPTIONS.filter(loc => loc.group === 'other').map((location) => {
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

            {/* Local Delivery Partner Fields */}
            {formData.locationKey === 'local_delivery_partner' && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary border border-border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-[var(--st-blue)]">
                    <Truck className="w-4 h-4" />
                    Courier / Partner Name *
                  </Label>
                  <Input
                    placeholder="e.g. Aramex, DHL, local carrier"
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

            {/* POD URL - only for delivered */}
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
                <p className="text-xs text-muted-foreground">Add up to two links to signature or photo proof</p>
              </div>
            )}

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
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Save Event
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

