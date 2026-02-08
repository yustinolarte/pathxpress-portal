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
  Warehouse,
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
  Link2
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
  // Sorting Centers - 7 Emirates
  { value: 'sorting_center_dubai', label: 'Dubai Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_abudhabi', label: 'Abu Dhabi Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_sharjah', label: 'Sharjah Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_ajman', label: 'Ajman Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_umm_al_quwain', label: 'Umm Al Quwain Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_ras_al_khaimah', label: 'Ras Al Khaimah Sorting Center', icon: Warehouse, group: 'sorting' },
  { value: 'sorting_center_fujairah', label: 'Fujairah Sorting Center', icon: Warehouse, group: 'sorting' },
  // Warehouses
  { value: 'warehouse_jebel_ali', label: 'Jebel Ali Warehouse', icon: Warehouse, group: 'warehouse' },
  { value: 'warehouse_dip', label: 'DIP Warehouse', icon: Warehouse, group: 'warehouse' },
  // Other locations
  { value: 'driver_vehicle', label: 'With Driver / In Vehicle', icon: Truck, group: 'other' },
  { value: 'customer_location', label: 'Customer Location', icon: MapPin, group: 'other' },
  { value: 'sender_location', label: 'Sender Location', icon: MapPin, group: 'other' },
  { value: 'other', label: 'Other (Specify)', icon: MapPin, group: 'other' },
] as const;

// Status options with visual styling
const STATUS_OPTIONS = [
  { value: 'pending_pickup', label: 'Pending Pickup', icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  { value: 'picked_up', label: 'Picked Up', icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  { value: 'in_transit', label: 'In Transit', icon: Truck, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  { value: 'out_for_delivery', label: 'Out for Delivery', icon: Truck, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  { value: 'delivered', label: 'Delivered', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  { value: 'failed_delivery', label: 'Failed Delivery', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  { value: 'on_hold', label: 'On Hold', icon: Pause, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { value: 'returned', label: 'Returned', icon: RotateCcw, color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
] as const;

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
    const option = STATUS_OPTIONS.find(s => s.value === value);
    setFormData({
      ...formData,
      statusCode: value,
      statusLabel: option?.label.toUpperCase() || value.toUpperCase(),
    });
  };

  const handleLocationChange = (value: string) => {
    setFormData({
      ...formData,
      locationKey: value,
      customLocation: value === 'other' ? formData.customLocation : '',
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

    const eventDatetimeWithOffset = `${formData.eventDatetime}:00+04:00`;

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
  const selectedStatus = STATUS_OPTIONS.find(s => s.value === formData.statusCode);
  const StatusIcon = selectedStatus?.icon || Clock;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong !w-[90vw] !max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10">
        {/* Decorative Top Line */}
        <div className="w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-600" />

        <div className="p-6">
          {/* Header */}
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Package className="w-6 h-6 text-emerald-400" />
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
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
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
                  className="bg-white/5 border-white/10"
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
                  <SelectTrigger className="bg-white/5 border-white/10">
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
                      📦 Sorting Centers
                    </div>
                    {LOCATION_OPTIONS.filter(loc => loc.group === 'sorting').map((location) => {
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
                      🏭 Warehouses
                    </div>
                    {LOCATION_OPTIONS.filter(loc => loc.group === 'warehouse').map((location) => {
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
                  <MapPin className="w-4 h-4 text-orange-400" />
                  Custom Location *
                </Label>
                <Input
                  placeholder="Enter the specific location"
                  value={formData.customLocation}
                  onChange={(e) => setFormData({ ...formData, customLocation: e.target.value })}
                  required
                  className="bg-orange-500/5 border-orange-500/20"
                />
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
                className="bg-white/5 border-white/10 resize-none"
              />
            </div>

            {/* POD URL - only show for delivered status */}
            {formData.statusCode === 'delivered' && (
              <div className="space-y-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <Label className="flex items-center gap-2 text-green-400">
                  <Link2 className="w-4 h-4" />
                  Proof of Delivery URL
                </Label>
                <Input
                  type="url"
                  placeholder="https://example.com/pod-image.jpg"
                  value={podFileUrl}
                  onChange={(e) => setPodFileUrl(e.target.value)}
                  className="bg-green-500/5 border-green-500/20"
                />
                <p className="text-xs text-green-400/70">
                  Link to signature or photo proof
                </p>
              </div>
            )}

            {/* Footer */}
            <DialogFooter className="pt-4 border-t border-white/10">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addEventMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
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
