import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { User, AlertTriangle } from 'lucide-react';
import { LocationPicker, type PickedLocation, type ParsedAddress } from '@/components/LocationPicker';
import ClientCombobox from '@/components/ClientCombobox';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { DEFAULT_PREFERRED_SLOTS, isPreferredTimeService, isSameDayPreferredService, todayStr, tomorrowStr } from '@/const';
import {
    UAE_CITIES,
    PHONE_PREFIXES,
    normalizeEmirate,
    normalizeCity,
    normalizePhone,
    isPlausiblePhone,
    splitPhone,
} from '@shared/uae';

interface Client {
    id: number;
    companyName: string;
    contactName: string;
    phone: string;
    billingAddress: string;
    city: string;
    country: string;
    codAllowed: number;
    cardOnDeliveryAllowed?: number;
    fodAllowed: number;
    bulletAllowed: number;
    fodFee?: string | null;
    payAtOrigin?: number;
}

interface AdminCreateOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[] | undefined;
    onSuccess: () => void;
}

const DEFAULT_FOD_FEE = 5.0;

const INITIAL_FORM = {
    orderNumber: '',
    customerName: '',
    customerPhonePrefix: '+971',
    customerPhone: '',
    // Structured consignee address — mirrors the customer portal so both flows
    // store the same shape. A single free-text field used to get wiped whenever
    // the operator nudged the map pin.
    consigneeBuilding: '',
    consigneeApt: '',
    consigneeStreet: '',
    consigneeArea: '',
    consigneeLandmark: '',
    city: 'Dubai',
    destinationCountry: 'UAE',
    // Numeric fields are kept as strings so the operator can clear and retype
    // them; a bare parseFloat(...) || 0.5 fights back on every keystroke.
    pieces: '1',
    weight: '0.5',
    length: '',
    width: '',
    height: '',
    serviceType: 'DOM',
    specialInstructions: '',
    codRequired: false,
    codAmount: '',
    codPaymentMethod: 'cash' as 'cash' | 'card' | 'any',
    fitOnDelivery: false,
    preferredDate: '',
    preferredTime: '',
    originPaymentCollected: false,
    originPaymentMethod: 'cash' as 'cash' | 'card',
    originPaymentAmount: '',
    originPaymentReference: '',
};

const INITIAL_SHIPPER = {
    shipperName: '',
    shipperBuilding: '',
    shipperApt: '',
    shipperStreet: '',
    shipperArea: '',
    shipperCity: 'Dubai',
    shipperCountry: 'UAE',
    shipperPhonePrefix: '+971',
    shipperPhone: '',
};

const SIZE_PRESETS = [
    { key: 'small', label: 'Small', icon: 'draft', weight: '2.0', length: '20', width: '20', height: '25' },
    { key: 'medium', label: 'Medium', icon: 'package_2', weight: '5.0', length: '40', width: '25', height: '25' },
    { key: 'large', label: 'Large', icon: 'inventory_2', weight: '15.0', length: '50', width: '50', height: '30' },
    { key: 'xlarge', label: 'Extra Large', icon: 'conveyor_belt', weight: '30.0', length: '60', width: '50', height: '50' },
] as const;

/** Join structured address parts into the single line stored on the order. */
function composeAddress(parts: {
    building: string;
    apt: string;
    street: string;
    area: string;
    landmark?: string;
}): string {
    return [
        parts.building,
        parts.apt ? `Apt ${parts.apt}` : '',
        parts.street,
        parts.area,
        parts.landmark,
    ]
        .map(p => p?.trim())
        .filter(Boolean)
        .join(', ');
}

const decimalOnly = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40';
const labelClass = 'text-xs font-bold text-muted-foreground uppercase tracking-wider';

export default function AdminCreateOrderDialog({
    open,
    onOpenChange,
    clients,
    onSuccess,
}: AdminCreateOrderDialogProps) {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [overrideShipper, setOverrideShipper] = useState(false);
    const [calculatedCODFee, setCalculatedCODFee] = useState<number>(0);
    const [codCardFee, setCodCardFee] = useState<number>(0);
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [shipperData, setShipperData] = useState(INITIAL_SHIPPER);
    const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
    const [shipperPickedLocation, setShipperPickedLocation] = useState<PickedLocation | null>(null);
    const [showShipperMap, setShowShipperMap] = useState(false);
    const [locationError, setLocationError] = useState(false);
    // Bumped on every reset so both LocationPickers drop their pin. Without this
    // a pickup pin survived into the next order and routed the driver to the
    // previous shipper.
    const [resetSignal, setResetSignal] = useState(0);
    const [keepClientAfterCreate, setKeepClientAfterCreate] = useState(true);
    const consigneeSearchRef = useRef<HTMLInputElement>(null);
    const shipperSearchRef = useRef<HTMLInputElement>(null);

    const selectedClient = useMemo(
        () => clients?.find(c => c.id.toString() === selectedClientId) ?? null,
        [clients, selectedClientId],
    );

    // The emirate is derived from the city rather than being a second dropdown
    // the operator can contradict. Al Ain administratively is a city of Abu
    // Dhabi, so it's still labelled "Abu Dhabi" here for display/persistence —
    // but that label is no longer what decides its delivery ZONE (Al Ain bills
    // Zone 2, Abu Dhabi Zone 1). The pin dropped in the map below is passed as
    // lat/lng to the rate and service-availability queries and takes priority
    // there via resolveDeliveryZone; this string is only their fallback until
    // a pin is dropped.
    const emirate = normalizeEmirate(formData.city) ?? 'Dubai';

    const weightNum = parseFloat(formData.weight);
    const piecesNum = parseInt(formData.pieces, 10);
    const hasValidWeight = !isNaN(weightNum) && weightNum > 0;

    const fodFee = selectedClient?.fodFee ? Number(selectedClient.fodFee) : DEFAULT_FOD_FEE;
    const cardOnDeliveryAllowed = selectedClient?.cardOnDeliveryAllowed === 1;

    /**
     * Clear everything that describes a shipment, leaving the client alone.
     *
     * The component stays mounted between openings, so any field omitted here
     * leaks into the next order — that is how a pickup pin from one order ended
     * up routing the driver to the previous shipper. Both the close handler and
     * the create-another path go through this single function so the two can
     * never drift apart.
     */
    function clearShipmentFields() {
        setOverrideShipper(false);
        setCalculatedCODFee(0);
        setCodCardFee(0);
        setFormData(INITIAL_FORM);
        setShipperData(INITIAL_SHIPPER);
        setPickedLocation(null);
        setShipperPickedLocation(null);
        setShowShipperMap(false);
        setLocationError(false);
        setResetSignal(n => n + 1);
    }

    useEffect(() => {
        if (!open) {
            setSelectedClientId('');
            clearShipmentFields();
        }
    }, [open]);

    // Pay-per-shipment clients (e.g. Walk-in) almost never ship as themselves —
    // default to the custom shipper block so staff type the real sender instead
    // of leaving the client's own placeholder contact info on the waybill. Each
    // order is also a one-off transaction for a different person, not a batch
    // for the same company, so don't leave the dialog open by default either.
    // Default assumption: the customer already paid at the counter — staff only
    // have to act (toggle "Payment to Collect") for the exception, not the norm.
    useEffect(() => {
        if (selectedClient?.payAtOrigin === 1) {
            setOverrideShipper(true);
            setShowShipperMap(true);
            setKeepClientAfterCreate(false);
            setFormData(fd => ({ ...fd, originPaymentCollected: true }));
        }
    }, [selectedClientId]);

    /* ---------------------------------------------------------------- quotes */

    const debouncedWeight = useDebouncedValue(formData.weight, 400);
    const debouncedDims = useDebouncedValue(
        `${formData.length}x${formData.width}x${formData.height}`,
        400,
    );
    const debouncedCodAmount = useDebouncedValue(formData.codAmount, 400);
    const debouncedReference = useDebouncedValue(formData.orderNumber, 500);

    const quoteWeight = parseFloat(debouncedWeight);
    const quoteReady = !!selectedClientId && !isNaN(quoteWeight) && quoteWeight > 0;

    const dims = useMemo(() => {
        const [l, w, h] = debouncedDims.split('x').map(v => parseFloat(v));
        return {
            length: !isNaN(l) && l > 0 ? l : undefined,
            width: !isNaN(w) && w > 0 ? w : undefined,
            height: !isNaN(h) && h > 0 ? h : undefined,
        };
    }, [debouncedDims]);

    const pickedLat = pickedLocation?.latitude ? parseFloat(pickedLocation.latitude) : undefined;
    const pickedLng = pickedLocation?.longitude ? parseFloat(pickedLocation.longitude) : undefined;
    // Raw city, not the normalized `emirate` label Al Ain collapses to — keeps
    // zone/region resolution correct even before a pin is dropped (once one
    // is, lat/lng takes priority anyway). `emirate` itself stays the
    // administrative label for order persistence and the "Bills as" display.
    const zoneQueryEmirate = formData.city || emirate;

    const rateQuery = trpc.portal.rates.quote.useQuery(
        {
            clientId: parseInt(selectedClientId || '0', 10),
            serviceType: formData.serviceType as 'DOM' | 'SDD' | 'BULLET' | 'EXPRESS_ZONE2' | 'PREFERRED_TIME' | 'PREFERRED_TIME_SDD',
            // NaN would serialise into the query key as null; keep it numeric
            // even while the query is disabled.
            weight: quoteReady ? quoteWeight : 0,
            emirate: zoneQueryEmirate,
            lat: Number.isFinite(pickedLat) ? pickedLat : undefined,
            lng: Number.isFinite(pickedLng) ? pickedLng : undefined,
            ...dims,
        },
        { enabled: quoteReady },
    );
    const calculatedRate = quoteReady ? rateQuery.data ?? null : null;

    const codQuery = trpc.portal.rates.quoteCOD.useQuery(
        {
            codAmount: parseFloat(debouncedCodAmount || '0'),
            clientId: parseInt(selectedClientId || '0', 10),
        },
        {
            enabled:
                !!selectedClientId &&
                formData.codRequired &&
                parseFloat(debouncedCodAmount || '0') > 0,
        },
    );

    useEffect(() => {
        // Turning COD off has to clear the fees first — React Query keeps the
        // last response cached after a query is disabled, so checking `data`
        // first would leave a stale fee attached to a non-COD order.
        if (!formData.codRequired) {
            setCalculatedCODFee(0);
            setCodCardFee(0);
        } else if (codQuery.data) {
            setCalculatedCODFee(codQuery.data.cashFee ?? codQuery.data.fee);
            setCodCardFee(codQuery.data.cardFee ?? codQuery.data.fee);
        }
    }, [codQuery.data, formData.codRequired]);

    // Per-client service availability: enablement, region limits, cut-offs and
    // real prices. Previously the dialog listed the whole catalogue, so an
    // admin could book Bullet for a client without Bullet, or Express Zone 2
    // to a Zone 1 address (which prices at 0).
    const servicesQuery = trpc.portal.admin.adminGetAvailableServices.useQuery(
        {
            clientId: parseInt(selectedClientId || '0', 10),
            emirate,
            weight: quoteReady ? quoteWeight : 1,
            lat: Number.isFinite(pickedLat) ? pickedLat : undefined,
            lng: Number.isFinite(pickedLng) ? pickedLng : undefined,
        },
        { enabled: quoteReady },
    );
    // React Query keeps the last response after a query is disabled, so gate on
    // the same condition to avoid showing prices for a weight that was cleared.
    const services = quoteReady ? servicesQuery.data ?? [] : [];

    // If the destination or weight makes the chosen service unavailable, fall
    // back to the first one that still works rather than submitting a service
    // the client cannot use.
    useEffect(() => {
        if (!services.length) return;
        const current = services.find(s => s.code === formData.serviceType);
        if (current && current.available) return;
        const firstAvailable = services.find(s => s.available);
        if (firstAvailable && firstAvailable.code !== formData.serviceType) {
            setFormData(prev => ({ ...prev, serviceType: firstAvailable.code }));
        }
    }, [services, formData.serviceType]);

    // Fetched whenever a client is selected (not just while overriding) so the
    // client's default saved location can silently fill the shipper block —
    // including its exact map pin — without the operator lifting a finger.
    const savedShippersQuery = trpc.portal.admin.adminGetClientSavedShippers.useQuery(
        { clientId: parseInt(selectedClientId || '0', 10) },
        { enabled: !!selectedClientId },
    );
    const savedShippers = savedShippersQuery.data ?? [];
    const defaultLocation = savedShippers.find(s => s.isDefault === 1) ?? null;

    // Auto-fill the pickup pin from the client's default location. Only runs
    // while the operator hasn't manually overridden the shipper — a custom
    // address means a one-off pickup point that has nothing to do with the
    // client's saved locations.
    useEffect(() => {
        if (overrideShipper) return;
        if (defaultLocation?.latitude && defaultLocation?.longitude) {
            setShipperPickedLocation({ latitude: defaultLocation.latitude, longitude: defaultLocation.longitude });
        } else {
            setShipperPickedLocation(null);
        }
    }, [overrideShipper, defaultLocation?.id]);

    const duplicateQuery = trpc.portal.admin.adminCheckOrderReference.useQuery(
        {
            clientId: parseInt(selectedClientId || '0', 10),
            orderNumber: debouncedReference,
        },
        { enabled: !!selectedClientId && debouncedReference.trim().length > 0 },
    );
    // Same caching caveat: clearing the reference must clear the warning.
    const duplicates = debouncedReference.trim() ? duplicateQuery.data ?? [] : [];

    /* ------------------------------------------------------------- addresses */

    /**
     * Merge Google's components into the form.
     *
     * A picked suggestion is an explicit operator choice, so it overwrites. A
     * dropped pin only knows the rough street/area, so it fills the blanks and
     * never overwrites text that was typed by hand.
     */
    function handleConsigneeAddressParsed(parsed: ParsedAddress) {
        const overwrite = parsed.source === 'search';
        const take = (incoming: string | undefined, current: string) => {
            if (!incoming) return current;
            return overwrite || !current.trim() ? incoming : current;
        };
        const city = normalizeCity(parsed.city) ?? normalizeEmirate(parsed.emirate);
        setFormData(prev => ({
            ...prev,
            consigneeBuilding: take(parsed.streetNumber, prev.consigneeBuilding),
            consigneeStreet: take(parsed.street, prev.consigneeStreet),
            consigneeArea: take(parsed.area, prev.consigneeArea),
            city: city ?? prev.city,
        }));
    }

    function handleShipperAddressParsed(parsed: ParsedAddress) {
        const overwrite = parsed.source === 'search';
        const take = (incoming: string | undefined, current: string) => {
            if (!incoming) return current;
            return overwrite || !current.trim() ? incoming : current;
        };
        const city = normalizeCity(parsed.city) ?? normalizeEmirate(parsed.emirate);
        setShipperData(prev => ({
            ...prev,
            shipperBuilding: take(parsed.streetNumber, prev.shipperBuilding),
            shipperStreet: take(parsed.street, prev.shipperStreet),
            shipperArea: take(parsed.area, prev.shipperArea),
            shipperCity: city ?? prev.shipperCity,
        }));
    }

    function loadSavedShipper(id: string) {
        const shipper = savedShippers.find(s => s.id.toString() === id);
        if (!shipper) return;
        const { prefix, national } = splitPhone(shipper.shipperPhone);
        setShipperData(prev => ({
            ...prev,
            shipperName: shipper.shipperName || '',
            // Saved shippers store one address line; drop it into the building
            // field and let the operator split it if they need to.
            shipperBuilding: shipper.shipperAddress || '',
            shipperApt: '',
            shipperStreet: '',
            shipperArea: '',
            shipperCity: normalizeCity(shipper.shipperCity) ?? prev.shipperCity,
            shipperCountry: shipper.shipperCountry || 'UAE',
            shipperPhonePrefix: prefix,
            shipperPhone: national,
        }));
        // A saved location's exact pin travels with it now — no more re-pinning
        // a warehouse the operator already placed on the map once.
        setShipperPickedLocation(
            shipper.latitude && shipper.longitude
                ? { latitude: shipper.latitude, longitude: shipper.longitude }
                : null
        );
        toast.success(`Loaded ${shipper.nickname}`);
    }

    /* -------------------------------------------------------------- totals */

    const effectiveCODFee = !formData.codRequired
        ? 0
        : formData.codPaymentMethod === 'card'
            ? codCardFee
            : formData.codPaymentMethod === 'any'
                ? Math.max(calculatedCODFee, codCardFee)
                : calculatedCODFee;

    const total = (calculatedRate?.totalRate ?? 0) + effectiveCODFee + (formData.fitOnDelivery ? fodFee : 0);

    const phoneLooksWrong =
        formData.customerPhone.trim().length > 0 &&
        !isPlausiblePhone(formData.customerPhonePrefix, formData.customerPhone);
    const shipperPhoneLooksWrong =
        overrideShipper &&
        shipperData.shipperPhone.trim().length > 0 &&
        !isPlausiblePhone(shipperData.shipperPhonePrefix, shipperData.shipperPhone);

    /* -------------------------------------------------------------- submit */

    const createOrderMutation = trpc.portal.admin.adminCreateOrder.useMutation({
        onSuccess: order => {
            toast.success(`Order ${order.waybillNumber} created successfully`);
            onSuccess();
            // Operators normally key several orders for the same client in a
            // row, so keep the dialog open and only clear the shipment.
            if (keepClientAfterCreate) {
                clearShipmentFields();
            } else {
                onOpenChange(false);
            }
        },
        onError: error => {
            toast.error(`Failed to create order: ${error.message}`);
        },
    });

    const handleSubmit = () => {
        if (!selectedClientId) return toast.error('Please select a client');
        if (!formData.customerName.trim()) return toast.error('Please enter the receiver name');
        if (!formData.customerPhone.trim()) return toast.error('Please enter the receiver phone number');
        if (phoneLooksWrong) return toast.error('The receiver phone number does not look valid');
        if (!formData.consigneeBuilding.trim() && !formData.consigneeStreet.trim()) {
            return toast.error('Enter at least a building or a street for the receiver');
        }
        if (!formData.consigneeArea.trim()) return toast.error('Please enter the receiver area');
        if (!hasValidWeight) return toast.error('Weight must be greater than 0');
        if (isNaN(piecesNum) || piecesNum < 1) return toast.error('Pieces must be at least 1');

        if (overrideShipper) {
            if (!shipperData.shipperName.trim()) return toast.error('Please enter the shipper name');
            if (!shipperData.shipperPhone.trim()) return toast.error('Please enter the shipper phone number');
            if (shipperPhoneLooksWrong) return toast.error('The shipper phone number does not look valid');
            if (!shipperData.shipperBuilding.trim() && !shipperData.shipperStreet.trim()) {
                return toast.error('Enter at least a building or a street for the shipper');
            }
        }

        if (formData.codRequired && (!formData.codAmount || parseFloat(formData.codAmount) <= 0)) {
            return toast.error('Please enter a valid COD amount');
        }
        if (selectedClient?.payAtOrigin === 1 && !formData.originPaymentCollected) {
            if (!formData.originPaymentAmount || parseFloat(formData.originPaymentAmount) <= 0) {
                return toast.error('Please enter the amount to collect');
            }
            if (formData.originPaymentMethod === 'card' && !formData.originPaymentReference.trim()) {
                return toast.error('Please enter the card payment reference');
            }
        }
        if (isPreferredTimeService(formData.serviceType) && (!formData.preferredDate || !formData.preferredTime)) {
            return toast.error('Please select a preferred delivery date and time window');
        }

        const selectedService = services.find(s => s.code === formData.serviceType);
        if (selectedService && !selectedService.available) {
            return toast.error(selectedService.reason || 'The selected service is not available for this order');
        }

        if (!pickedLocation) {
            setLocationError(true);
            return toast.error('Please place a map pin to confirm the delivery location.');
        }
        setLocationError(false);

        createOrderMutation.mutate({
            clientId: parseInt(selectedClientId, 10),
            shipment: {
                orderNumber: formData.orderNumber.trim() || undefined,
                customerName: formData.customerName.trim(),
                customerPhone: normalizePhone(formData.customerPhonePrefix, formData.customerPhone),
                address: composeAddress({
                    building: formData.consigneeBuilding,
                    apt: formData.consigneeApt,
                    street: formData.consigneeStreet,
                    area: formData.consigneeArea,
                    landmark: formData.consigneeLandmark,
                }),
                city: formData.city,
                emirate,
                destinationCountry: formData.destinationCountry,
                pieces: piecesNum,
                weight: weightNum,
                length: dims.length,
                width: dims.width,
                height: dims.height,
                serviceType: formData.serviceType,
                specialInstructions: formData.specialInstructions.trim() || undefined,
                codRequired: formData.codRequired ? 1 : 0,
                codAmount: formData.codRequired ? formData.codAmount : undefined,
                codCurrency: 'AED',
                codPaymentMethod: formData.codRequired ? formData.codPaymentMethod : undefined,
                fitOnDelivery: formData.fitOnDelivery ? 1 : 0,
                // Pay-per-shipment clients: default assumption is "already paid" (silently
                // invoiced + marked paid, see adminCreateOrder). "Payment to Collect" flips
                // that — nothing's paid yet, so the amount/method entered here is what's
                // still owed, and it's what puts the collect-at-delivery banner on the waybill.
                originPaymentCollected: selectedClient?.payAtOrigin === 1 ? formData.originPaymentCollected : false,
                originPaymentMethod: selectedClient?.payAtOrigin === 1
                    ? (formData.originPaymentCollected ? 'cash' : formData.originPaymentMethod)
                    : undefined,
                originPaymentAmount: selectedClient?.payAtOrigin === 1
                    ? (formData.originPaymentCollected ? total.toFixed(2) : formData.originPaymentAmount)
                    : undefined,
                latitude: pickedLocation.latitude,
                longitude: pickedLocation.longitude,
                // Only send a pickup pin that belongs to *this* order.
                shipperLat: shipperPickedLocation?.latitude,
                shipperLng: shipperPickedLocation?.longitude,
                preferredDeliveryDate: isPreferredTimeService(formData.serviceType) ? formData.preferredDate : undefined,
                preferredDeliveryTime: isPreferredTimeService(formData.serviceType) ? formData.preferredTime : undefined,
                shipperOverride: overrideShipper,
                shipperName: overrideShipper ? shipperData.shipperName.trim() : undefined,
                shipperAddress: overrideShipper
                    ? composeAddress({
                        building: shipperData.shipperBuilding,
                        apt: shipperData.shipperApt,
                        street: shipperData.shipperStreet,
                        area: shipperData.shipperArea,
                    })
                    : undefined,
                shipperCity: overrideShipper ? shipperData.shipperCity : undefined,
                shipperCountry: overrideShipper ? shipperData.shipperCountry : undefined,
                shipperPhone: overrideShipper
                    ? normalizePhone(shipperData.shipperPhonePrefix, shipperData.shipperPhone)
                    : undefined,
            },
        });
    };

    /* ---------------------------------------------------------------- render */

    const phonePrefixSelect = (value: string, onChange: (v: string) => void) => (
        <select
            className="px-2 rounded-l-lg border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none"
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            {PHONE_PREFIXES.map(p => (
                <option key={p.code} value={p.code}>
                    {p.flag} {p.code}
                </option>
            ))}
        </select>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="bg-card border-border !w-[95vw] !max-w-[1400px] max-h-[95vh] overflow-y-auto p-0 gap-0 bg-background text-foreground antialiased font-sans"
                onInteractOutside={e => {
                    if ((e.target as HTMLElement)?.closest?.('.pac-container')) {
                        e.preventDefault();
                    }
                }}
            >
                <div className="w-full h-1 bg-primary" />

                <div className="p-6 md:p-8 space-y-6">
                    <DialogHeader className="p-0 mb-4">
                        <DialogTitle className="text-2xl font-extrabold tracking-tight">Create Order (Admin)</DialogTitle>
                        <DialogDescription>
                            Create a new order on behalf of a client. Select a client first, then fill in details.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Client selection */}
                    <div className="bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col md:flex-row gap-6 md:items-end">
                        <div className="w-full md:w-1/3">
                            <Label className={`flex items-center gap-2 mb-2 ${labelClass}`}>
                                <User className="h-4 w-4 text-primary" />
                                Select Client *
                            </Label>
                            <ClientCombobox
                                clients={clients}
                                value={selectedClientId}
                                onChange={setSelectedClientId}
                            />
                        </div>
                        {selectedClient && (
                            <div className="flex flex-wrap gap-2 items-center md:pl-6 md:border-l border-border">
                                <span className={`badge2 ${selectedClient.codAllowed ? 'b-green' : 'b-gray'}`}>
                                    COD {selectedClient.codAllowed ? 'allowed' : 'off'}
                                </span>
                                <span className={`badge2 ${selectedClient.cardOnDeliveryAllowed ? 'b-green' : 'b-gray'}`}>
                                    Card {selectedClient.cardOnDeliveryAllowed ? 'allowed' : 'off'}
                                </span>
                                <span className={`badge2 ${selectedClient.fodAllowed ? 'b-green' : 'b-gray'}`}>
                                    FOD {selectedClient.fodAllowed ? 'allowed' : 'off'}
                                </span>
                                {selectedClient.bulletAllowed === 1 && <span className="badge2 b-red">Bullet allowed</span>}
                            </div>
                        )}
                    </div>

                    {selectedClient && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            {/* Left column */}
                            <div className="xl:col-span-2 space-y-8">
                                {/* Shipper */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>outbox</span>
                                            <h2 className="font-bold">Shipper (Pickup)</h2>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {overrideShipper && savedShippers.length > 0 && (
                                                <select
                                                    className={`${inputClass} !w-auto !py-1 h-8 text-xs font-bold`}
                                                    defaultValue=""
                                                    onChange={e => loadSavedShipper(e.target.value)}
                                                >
                                                    <option value="" disabled>Load saved address...</option>
                                                    {savedShippers.map(s => (
                                                        <option key={s.id} value={s.id.toString()}>{s.nickname}</option>
                                                    ))}
                                                </select>
                                            )}
                                            <label htmlFor="overrideShipper" className={`${labelClass} cursor-pointer flex items-center gap-2`}>
                                                Custom address
                                                <Checkbox
                                                    id="overrideShipper"
                                                    checked={overrideShipper}
                                                    onCheckedChange={checked => {
                                                        setOverrideShipper(!!checked);
                                                        // The pickup search box only works while the map is
                                                        // mounted (that is what attaches autocomplete to it).
                                                        if (checked) setShowShipperMap(true);
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        {overrideShipper ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Shipper Name *</label>
                                                    <input className={inputClass} value={shipperData.shipperName} onChange={e => setShipperData({ ...shipperData, shipperName: e.target.value })} placeholder="Company or person" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Contact Number *</label>
                                                    <div className="flex">
                                                        {phonePrefixSelect(shipperData.shipperPhonePrefix, v => setShipperData({ ...shipperData, shipperPhonePrefix: v }))}
                                                        <input
                                                            className={`${inputClass} rounded-l-none ${shipperPhoneLooksWrong ? 'border-destructive' : ''}`}
                                                            value={shipperData.shipperPhone}
                                                            onChange={e => setShipperData({ ...shipperData, shipperPhone: e.target.value })}
                                                            placeholder="5x xxx xxxx"
                                                        />
                                                    </div>
                                                    {shipperPhoneLooksWrong && (
                                                        <p className="text-[11px] text-destructive">Check this number — it does not match the selected country.</p>
                                                    )}
                                                </div>
                                                <div className="md:col-span-2 space-y-1">
                                                    <label className={labelClass}>Search Pickup Address</label>
                                                    <input
                                                        ref={shipperSearchRef}
                                                        type="text"
                                                        className={`${inputClass} border-primary/50`}
                                                        placeholder="Type to search and auto-fill the pickup address..."
                                                    />
                                                </div>
                                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>Building / Villa</label>
                                                        <input className={inputClass} value={shipperData.shipperBuilding} onChange={e => setShipperData({ ...shipperData, shipperBuilding: e.target.value })} placeholder="Al Khaleej Twr" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>Apt / Unit</label>
                                                        <input className={inputClass} value={shipperData.shipperApt} onChange={e => setShipperData({ ...shipperData, shipperApt: e.target.value })} placeholder="402" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>Street</label>
                                                        <input className={inputClass} value={shipperData.shipperStreet} onChange={e => setShipperData({ ...shipperData, shipperStreet: e.target.value })} placeholder="SZR" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>City</label>
                                                        <select className={inputClass} value={shipperData.shipperCity} onChange={e => setShipperData({ ...shipperData, shipperCity: e.target.value })}>
                                                            {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2 space-y-1">
                                                    <label className={labelClass}>Area</label>
                                                    <input className={inputClass} value={shipperData.shipperArea} onChange={e => setShipperData({ ...shipperData, shipperArea: e.target.value })} placeholder="Area / Zone" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3 opacity-75">
                                                {defaultLocation && (
                                                    <span className="badge2 b-green">
                                                        Default location: {defaultLocation.nickname}
                                                        {defaultLocation.latitude && ' · exact pin on file'}
                                                    </span>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>Company Name</label>
                                                        <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={defaultLocation?.shipperName || selectedClient.companyName} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>Phone</label>
                                                        <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={defaultLocation?.shipperPhone || selectedClient.phone || '-'} />
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <label className={labelClass}>Address</label>
                                                        <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={defaultLocation?.shipperAddress || selectedClient.billingAddress || '-'} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={labelClass}>City</label>
                                                        <input disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm" value={defaultLocation?.shipperCity || selectedClient.city || '-'} />
                                                    </div>
                                                </div>
                                                {!defaultLocation && (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        No saved location yet for this client — set one up in Client Settings to get an exact pickup pin here automatically.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className="space-y-2 pt-2 border-t border-border">
                                            <button
                                                type="button"
                                                onClick={() => setShowShipperMap(v => !v)}
                                                className="text-xs font-medium text-primary hover:underline"
                                            >
                                                {showShipperMap ? '− Hide pickup map' : '+ Pin the pickup location on the map (optional)'}
                                            </button>
                                            {showShipperMap && (
                                                <LocationPicker
                                                    onLocationPicked={setShipperPickedLocation}
                                                    onAddressParsed={overrideShipper ? handleShipperAddressParsed : undefined}
                                                    searchInputRef={overrideShipper ? shipperSearchRef : undefined}
                                                    biasEmirate={shipperData.shipperCity}
                                                    resetSignal={resetSignal}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* Consignee */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>move_to_inbox</span>
                                        <h2 className="font-bold">Consignee (Receiver)</h2>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1">
                                                <label className={labelClass}>Customer Name *</label>
                                                <input className={inputClass} value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} placeholder="Full name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClass}>Phone Number *</label>
                                                <div className="flex">
                                                    {phonePrefixSelect(formData.customerPhonePrefix, v => setFormData({ ...formData, customerPhonePrefix: v }))}
                                                    <input
                                                        className={`${inputClass} rounded-l-none ${phoneLooksWrong ? 'border-destructive' : ''}`}
                                                        value={formData.customerPhone}
                                                        onChange={e => setFormData({ ...formData, customerPhone: e.target.value })}
                                                        placeholder="5x xxx xxxx"
                                                    />
                                                </div>
                                                {phoneLooksWrong ? (
                                                    <p className="text-[11px] text-destructive">Check this number — it does not match the selected country.</p>
                                                ) : formData.customerPhone.trim() ? (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Saved as {normalizePhone(formData.customerPhonePrefix, formData.customerPhone)}
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="md:col-span-2 space-y-1">
                                                <label className={labelClass}>Search Address</label>
                                                <div className="relative">
                                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                                                    <input
                                                        ref={consigneeSearchRef}
                                                        type="text"
                                                        placeholder="Type to search and auto-fill building, street, area and city..."
                                                        className={`${inputClass} pl-9 border-primary/50`}
                                                    />
                                                </div>
                                                <p className="text-[11px] text-muted-foreground/60">
                                                    Picking a suggestion replaces the fields below. Moving the pin only fills what is still empty.
                                                </p>
                                            </div>

                                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-5 gap-4">
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Building / Villa</label>
                                                    <input className={inputClass} value={formData.consigneeBuilding} onChange={e => setFormData({ ...formData, consigneeBuilding: e.target.value })} placeholder="Building" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Apt / Unit</label>
                                                    <input className={inputClass} value={formData.consigneeApt} onChange={e => setFormData({ ...formData, consigneeApt: e.target.value })} placeholder="Apt #" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Street</label>
                                                    <input className={inputClass} value={formData.consigneeStreet} onChange={e => setFormData({ ...formData, consigneeStreet: e.target.value })} placeholder="Street" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className={labelClass}>Area *</label>
                                                    <input className={inputClass} value={formData.consigneeArea} onChange={e => setFormData({ ...formData, consigneeArea: e.target.value })} placeholder="Area / Zone" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className={labelClass}>City *</label>
                                                    <select className={inputClass} value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}>
                                                        {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2 space-y-1">
                                                <label className={labelClass}>Landmark (optional)</label>
                                                <input className={inputClass} value={formData.consigneeLandmark} onChange={e => setFormData({ ...formData, consigneeLandmark: e.target.value })} placeholder="Near ... / opposite ..." />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>sell</span>
                                            Bills as <strong className="text-foreground">{emirate}</strong>
                                            {formData.city !== emirate && <span>(city: {formData.city})</span>}
                                        </div>

                                        <div className={`mt-6 pt-6 border-t ${locationError ? 'border-destructive' : 'border-border'}`}>
                                            <label className={`${labelClass} block mb-3`}>
                                                Pin on Map <span className="text-destructive">*</span>
                                                <span className="normal-case font-normal text-muted-foreground/60 ml-1">
                                                    — use Search Address above or click the map
                                                </span>
                                            </label>
                                            <LocationPicker
                                                onLocationPicked={loc => { setPickedLocation(loc); if (loc) setLocationError(false); }}
                                                onAddressParsed={handleConsigneeAddressParsed}
                                                searchInputRef={consigneeSearchRef}
                                                biasEmirate={formData.city}
                                                resetSignal={resetSignal}
                                            />
                                        </div>
                                    </div>
                                </section>

                                {/* Package */}
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>inventory</span>
                                        <h2 className="font-bold">Package Details</h2>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div>
                                            <label className={`${labelClass} block mb-3`}>Size presets</label>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {SIZE_PRESETS.map(preset => {
                                                    const active =
                                                        formData.weight === preset.weight &&
                                                        formData.length === preset.length &&
                                                        formData.width === preset.width &&
                                                        formData.height === preset.height;
                                                    return (
                                                        <button
                                                            key={preset.key}
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, weight: preset.weight, length: preset.length, width: preset.width, height: preset.height })}
                                                            className={`border p-3 rounded-xl flex flex-col items-center gap-1.5 transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                                                        >
                                                            <span className={`material-symbols-outlined text-2xl ${active ? 'text-primary' : 'text-muted-foreground'}`}>{preset.icon}</span>
                                                            <span className="font-bold text-sm">{preset.label}</span>
                                                            <span className="text-[10px] text-muted-foreground text-center">
                                                                {preset.weight}kg<br />{preset.length}x{preset.width}x{preset.height} cm
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                            <div className="space-y-1">
                                                <label className={labelClass}>Pieces *</label>
                                                <input className={inputClass} inputMode="numeric" value={formData.pieces} onChange={e => setFormData({ ...formData, pieces: digitsOnly(e.target.value) })} placeholder="1" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClass}>Weight (kg) *</label>
                                                <input className={inputClass} inputMode="decimal" value={formData.weight} onChange={e => setFormData({ ...formData, weight: decimalOnly(e.target.value) })} placeholder="0.0" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClass}>L (cm)</label>
                                                <input className={inputClass} inputMode="numeric" value={formData.length} onChange={e => setFormData({ ...formData, length: digitsOnly(e.target.value) })} placeholder="0" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClass}>W (cm)</label>
                                                <input className={inputClass} inputMode="numeric" value={formData.width} onChange={e => setFormData({ ...formData, width: digitsOnly(e.target.value) })} placeholder="0" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className={labelClass}>H (cm)</label>
                                                <input className={inputClass} inputMode="numeric" value={formData.height} onChange={e => setFormData({ ...formData, height: digitsOnly(e.target.value) })} placeholder="0" />
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground -mt-3">
                                            Dimensions are optional but drive volumetric weight — leaving them blank can under-bill bulky parcels.
                                        </p>

                                        <div className="space-y-1">
                                            <label className={labelClass}>Reference # (client order number)</label>
                                            <input className={inputClass} value={formData.orderNumber} onChange={e => setFormData({ ...formData, orderNumber: e.target.value })} placeholder="Optional order number" />
                                            {duplicates.length > 0 && (
                                                <div className="flex items-start gap-2 text-xs rounded-md px-3 py-2 border" style={{ color: 'var(--st-amber)', borderColor: 'color-mix(in srgb, var(--st-amber) 35%, transparent)', background: 'color-mix(in srgb, var(--st-amber) 10%, transparent)' }}>
                                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    <span>
                                                        This client already has {duplicates.length === 1 ? 'an order' : `${duplicates.length} orders`} with this reference:{' '}
                                                        <strong>{duplicates.map(d => d.waybillNumber).join(', ')}</strong>. Creating another will issue a second waybill.
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            <label className={labelClass}>Special Instructions</label>
                                            <textarea className={inputClass} rows={2} value={formData.specialInstructions} onChange={e => setFormData({ ...formData, specialInstructions: e.target.value })} placeholder="Any delivery instructions..." />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Right column */}
                            <div className="space-y-8">
                                <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                                    <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
                                        <h2 className="font-bold">Service &amp; Add-ons</h2>
                                    </div>
                                    <div className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <label className={`${labelClass} block`}>Service Type</label>
                                            {!quoteReady && (
                                                <p className="text-xs text-muted-foreground">Enter a weight to see available services and prices.</p>
                                            )}
                                            {quoteReady && servicesQuery.isLoading && (
                                                <p className="text-xs text-muted-foreground">Checking availability...</p>
                                            )}
                                            {services.map(svc => {
                                                const isSelected = formData.serviceType === svc.code;
                                                const disabled = !svc.available;
                                                return (
                                                    <label
                                                        key={svc.code}
                                                        className={`flex items-start p-3 border rounded-lg transition-colors ${disabled
                                                            ? 'opacity-55 cursor-not-allowed border-border'
                                                            : isSelected
                                                                ? 'border-primary bg-primary/10 cursor-pointer'
                                                                : 'border-border hover:bg-muted cursor-pointer'
                                                            }`}
                                                    >
                                                        <input
                                                            className="w-4 h-4 mt-0.5 accent-[var(--primary)]"
                                                            name="admin_service_type"
                                                            type="radio"
                                                            disabled={disabled}
                                                            checked={isSelected}
                                                            onChange={() => setFormData({ ...formData, serviceType: svc.code })}
                                                        />
                                                        <div className="ml-3 flex-1 min-w-0">
                                                            <div className="flex items-baseline justify-between gap-2">
                                                                <span className="font-bold text-sm">{svc.displayName}</span>
                                                                {svc.price != null && (
                                                                    <span className="font-mono text-sm font-bold shrink-0">{svc.price.toFixed(2)} AED</span>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground">
                                                                {disabled ? svc.reason : svc.deliveryTime || svc.description}
                                                            </div>
                                                            {!disabled && svc.cutoffTime && (
                                                                <div className="text-[10px] text-muted-foreground/70 mt-0.5">Cut-off {svc.cutoffTime} Dubai time</div>
                                                            )}
                                                        </div>
                                                    </label>
                                                );
                                            })}

                                            {isPreferredTimeService(formData.serviceType) && (
                                                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className={`${labelClass} block`}>Delivery Date</label>
                                                        <Input
                                                            type="date"
                                                            min={isSameDayPreferredService(formData.serviceType) ? todayStr() : tomorrowStr()}
                                                            max={isSameDayPreferredService(formData.serviceType) ? todayStr() : undefined}
                                                            value={formData.preferredDate}
                                                            onChange={e => setFormData({ ...formData, preferredDate: e.target.value })}
                                                            className="bg-background border-border"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className={`${labelClass} block`}>Time Window</label>
                                                        <select
                                                            value={formData.preferredTime}
                                                            onChange={e => setFormData({ ...formData, preferredTime: e.target.value })}
                                                            className={`${inputClass} h-10`}
                                                        >
                                                            <option value="">Select time window</option>
                                                            {DEFAULT_PREFERRED_SLOTS.map(slot => (
                                                                <option key={slot} value={slot}>{slot}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-border space-y-4">
                                            <label className={`${labelClass} block`}>Add-ons</label>

                                            <label className={`flex items-center p-3 border rounded-lg transition-colors ${formData.codRequired ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'} ${!selectedClient.codAllowed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                                <Checkbox
                                                    checked={formData.codRequired}
                                                    disabled={!selectedClient.codAllowed}
                                                    onCheckedChange={checked => setFormData({ ...formData, codRequired: !!checked, codAmount: checked ? formData.codAmount : '' })}
                                                    className="mr-3"
                                                />
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {!selectedClient.codAllowed ? 'Not allowed for client' : 'Collect payment from receiver'}
                                                    </div>
                                                </div>
                                            </label>

                                            {formData.codRequired && (
                                                <div className="pl-8 -mt-2 space-y-3">
                                                    <div className="relative">
                                                        <input
                                                            className={`${inputClass} pl-12 h-10 font-bold`}
                                                            placeholder="0.00"
                                                            inputMode="decimal"
                                                            value={formData.codAmount}
                                                            onChange={e => setFormData({ ...formData, codAmount: decimalOnly(e.target.value) })}
                                                        />
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">AED</span>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Receiver pays with</label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {([
                                                                { value: 'cash', label: 'Cash', hint: calculatedCODFee > 0 ? `${calculatedCODFee.toFixed(2)} AED fee` : '' },
                                                                { value: 'card', label: 'Card', hint: cardOnDeliveryAllowed ? (codCardFee > 0 ? `${codCardFee.toFixed(2)} AED fee` : 'Tap to Pay') : 'Not allowed' },
                                                                { value: 'any', label: 'Cash or Card', hint: cardOnDeliveryAllowed ? 'Decided at door' : 'Not allowed' },
                                                            ] as const).map(opt => {
                                                                const disabled = opt.value !== 'cash' && !cardOnDeliveryAllowed;
                                                                return (
                                                                    <label key={opt.value} className={`flex flex-col p-2 border rounded-lg transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : formData.codPaymentMethod === opt.value ? 'border-primary bg-primary/10 cursor-pointer' : 'border-border hover:bg-muted cursor-pointer'}`}>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <input type="radio" name="admin_cod_method" className="w-3.5 h-3.5 accent-[var(--primary)]" disabled={disabled} checked={formData.codPaymentMethod === opt.value} onChange={() => setFormData({ ...formData, codPaymentMethod: opt.value })} />
                                                                            <span className="font-bold text-xs">{opt.label}</span>
                                                                        </div>
                                                                        {opt.hint && <span className="text-[10px] text-muted-foreground mt-0.5">{opt.hint}</span>}
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <label className={`flex items-center p-3 border rounded-lg transition-colors ${formData.fitOnDelivery ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'} ${!selectedClient.fodAllowed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                                <Checkbox
                                                    checked={formData.fitOnDelivery}
                                                    disabled={!selectedClient.fodAllowed}
                                                    onCheckedChange={checked => setFormData({ ...formData, fitOnDelivery: !!checked })}
                                                    className="mr-3"
                                                />
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm">Fit on Delivery (FOD)</div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {!selectedClient.fodAllowed ? 'Not allowed for client' : 'Allow try-on before accept'}
                                                    </div>
                                                </div>
                                            </label>

                                            {selectedClient.payAtOrigin === 1 && (
                                                <>
                                                    <label className={`flex items-center p-3 border rounded-lg transition-colors cursor-pointer ${!formData.originPaymentCollected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                        <Checkbox
                                                            checked={!formData.originPaymentCollected}
                                                            onCheckedChange={checked => setFormData({
                                                                ...formData,
                                                                originPaymentCollected: !checked,
                                                                originPaymentAmount: checked && !formData.originPaymentAmount ? total.toFixed(2) : formData.originPaymentAmount,
                                                            })}
                                                            className="mr-3"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="font-bold text-sm">Payment to Collect</div>
                                                            <div className="text-[11px] text-muted-foreground">
                                                                {formData.originPaymentCollected
                                                                    ? 'Customer already paid — an invoice is issued and marked paid automatically'
                                                                    : 'Not paid yet — shows on the waybill so the driver collects it at delivery'}
                                                            </div>
                                                        </div>
                                                    </label>

                                                    {!formData.originPaymentCollected && (
                                                        <div className="pl-8 -mt-2 space-y-3">
                                                            <div className="relative">
                                                                <input
                                                                    className={`${inputClass} pl-12 h-10 font-bold`}
                                                                    placeholder="0.00"
                                                                    inputMode="decimal"
                                                                    value={formData.originPaymentAmount}
                                                                    onChange={e => setFormData({ ...formData, originPaymentAmount: decimalOnly(e.target.value) })}
                                                                />
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">AED</span>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">To collect with</label>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {([
                                                                        { value: 'cash', label: 'Cash' },
                                                                        { value: 'card', label: 'Card' },
                                                                    ] as const).map(opt => (
                                                                        <label key={opt.value} className={`flex items-center gap-1.5 p-2 border rounded-lg cursor-pointer transition-colors ${formData.originPaymentMethod === opt.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                                                                            <input type="radio" name="admin_origin_payment_method" className="w-3.5 h-3.5 accent-[var(--primary)]" checked={formData.originPaymentMethod === opt.value} onChange={() => setFormData({ ...formData, originPaymentMethod: opt.value })} />
                                                                            <span className="font-bold text-xs">{opt.label}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* Summary */}
                                <section className="band rounded-xl p-6 relative overflow-hidden">
                                    <p className="font-mono text-[10px] uppercase tracking-widest mb-4 relative z-10" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                        Order Summary
                                    </p>
                                    <div className="space-y-3 text-sm relative z-10 text-white">
                                        {calculatedRate ? (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="opacity-70">Base Shipping</span>
                                                    <span className="font-medium">{calculatedRate.baseRate.toFixed(2)} AED</span>
                                                </div>
                                                {calculatedRate.additionalKgCharge > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Overweight</span>
                                                        <span className="font-medium">{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                {effectiveCODFee > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">
                                                            {formData.codPaymentMethod === 'card'
                                                                ? 'Card on Delivery Handling'
                                                                : formData.codPaymentMethod === 'any'
                                                                    ? 'COD Handling (up to)'
                                                                    : 'COD Handling'}
                                                        </span>
                                                        <span className="font-medium">{effectiveCODFee.toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                {formData.fitOnDelivery && (
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Fit on Delivery</span>
                                                        <span className="font-medium">{fodFee.toFixed(2)} AED</span>
                                                    </div>
                                                )}
                                                {calculatedRate.chargeableWeight != null && calculatedRate.chargeableWeight > weightNum && (
                                                    <div className="flex justify-between text-xs">
                                                        <span className="opacity-60">Chargeable weight (volumetric)</span>
                                                        <span className="opacity-80">{calculatedRate.chargeableWeight.toFixed(2)} kg</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-end pt-4 border-t border-white/20">
                                                    <span className="text-lg font-bold">Total Payable</span>
                                                    <span className="font-display text-2xl font-bold tracking-tight">{total.toFixed(2)} AED</span>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="opacity-70 text-center py-4 text-xs">
                                                {rateQuery.isLoading ? 'Calculating...' : 'Awaiting client / weight info to estimate costs.'}
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-8 flex flex-col gap-3 relative z-10">
                                        <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 accent-[var(--primary)]"
                                                checked={keepClientAfterCreate}
                                                onChange={e => setKeepClientAfterCreate(e.target.checked)}
                                            />
                                            Keep this client and create another after saving
                                        </label>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={!selectedClientId || createOrderMutation.isPending}
                                            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {createOrderMutation.isPending ? (
                                                <>Creating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined">rocket_launch</span> Confirm Order</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => onOpenChange(false)}
                                            className="w-full py-3 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
