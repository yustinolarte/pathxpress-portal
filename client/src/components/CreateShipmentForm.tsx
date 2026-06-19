import React, { useState, useEffect, useRef } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { LocationPicker, type PickedLocation, type ParsedAddress } from '@/components/LocationPicker';
import ServiceSelectionStep from '@/components/ServiceSelectionStep';

const SHIPMENT_CITY_MAP: Record<string, string> = {
  'dubai': 'Dubai',
  'abu dhabi': 'Abu Dhabi',
  'abū ẓaby': 'Abu Dhabi',
  'sharjah': 'Sharjah',
  'ash shāriqah': 'Sharjah',
  'ajman': 'Ajman',
  "'ajmān": 'Ajman',
  'fujairah': 'Fujairah',
  'ras al-khaimah': 'Ras Al Khaimah',
  "raʾs al-khaymah": 'Ras Al Khaimah',
  'ras al khaimah': 'Ras Al Khaimah',
  'umm al-quwain': 'Umm Al Quwain',
  'umm al quwain': 'Umm Al Quwain',
  'al ain': 'Abu Dhabi',
};
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Save } from 'lucide-react';

export default function CreateShipmentForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = usePortalAuth();
  const [formData, setFormData] = useState({
    // Shipper
    shipperName: '',
    shipperPhonePrefix: '+971',
    shipperPhone: '',
    shipperBuilding: '',
    shipperApt: '',
    shipperStreet: '',
    shipperArea: '',
    shipperCity: 'Dubai',
    shipperCountry: 'UAE',
    
    // Consignee
    customerName: '',
    customerPhonePrefix: '+971',
    customerPhone: '',
    consigneeBuilding: '',
    consigneeApt: '',
    consigneeStreet: '',
    consigneeArea: '',
    consigneeLandmark: '',
    city: 'Dubai',
    emirate: 'Dubai',
    destinationCountry: 'UAE',
    
    // Package
    pieces: 1,
    weight: '1.5',
    length: '',
    width: '',
    height: '', // Changed to string
    
    // Service & Payment
    serviceType: 'DOM',
    specialInstructions: '',
    codRequired: 0,
    codAmount: '',
    codCurrency: 'AED',
    fitOnDelivery: 0,
  });

  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [calculatedCODFee, setCalculatedCODFee] = useState<number>(0);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [locationError, setLocationError] = useState(false);
  const consigneeSearchRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<'details' | 'service'>('details');
  const [selectedService, setSelectedService] = useState('DOM');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');

  // Keep formData.serviceType in sync with wizard selection
  useEffect(() => {
    if (selectedService) {
      setFormData(prev => ({ ...prev, serviceType: selectedService }));
    }
  }, [selectedService]);

  function handleAddressParsed(parsed: ParsedAddress) {
    const matched = parsed.emirate
      ? SHIPMENT_CITY_MAP[parsed.emirate.toLowerCase()] ?? undefined
      : undefined;
    setFormData(prev => ({
      ...prev,
      // Building fills only when Google returns a number/premise; villas have neither,
      // so the field stays empty for the customer to fill in manually.
      consigneeBuilding: parsed.streetNumber ?? prev.consigneeBuilding,
      consigneeStreet: parsed.street ?? prev.consigneeStreet,
      consigneeArea: parsed.area ?? prev.consigneeArea,
      ...(matched ? { city: matched, emirate: matched } : {}),
    }));
  }

  const [showSaveShipperDialog, setShowSaveShipperDialog] = useState(false);
  const [shipperNickname, setShipperNickname] = useState('');

  // Fetch client settings
  const { data: clientSettings } = trpc.portal.customer.getMyAccount.useQuery();

  const { data: savedShippers = [], refetch: refetchShippers } = trpc.portal.customer.getSavedShippers.useQuery();

  const createShipperMutation = trpc.portal.customer.createSavedShipper.useMutation({
    onSuccess: () => {
      toast.success('Shipper information saved!');
      setShowSaveShipperDialog(false);
      setShipperNickname('');
      refetchShippers();
    },
    onError: (err) => toast.error(err.message || 'Failed to save shipper')
  });

  const handleSaveShipper = () => {
    if (!shipperNickname.trim()) return toast.error('Please enter a nickname');
    const shipperAddress = [formData.shipperBuilding, formData.shipperApt ? `Apt ${formData.shipperApt}` : '', formData.shipperStreet, formData.shipperArea].filter(Boolean).join(', ');
    createShipperMutation.mutate({
      nickname: shipperNickname,
      shipperName: formData.shipperName,
      shipperAddress: shipperAddress,
      shipperCity: formData.shipperCity,
      shipperCountry: formData.shipperCountry,
      shipperPhone: `${formData.shipperPhonePrefix} ${formData.shipperPhone}`,
    });
  };

  const handleLoadShipper = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const shipperId = e.target.value;
    if (!shipperId) return;
    const shipper = savedShippers.find((s: any) => s.id.toString() === shipperId);
    if (shipper) {
      let phonePrefix = '+971';
      let phoneNum = shipper.shipperPhone || '';
      if (phoneNum.match(/^\+\d+\s/)) {
        const parts = phoneNum.split(' ');
        phonePrefix = parts[0];
        phoneNum = parts.slice(1).join(' ');
      }
      setFormData(prev => ({
        ...prev,
        shipperName: shipper.shipperName || '',
        shipperAddress: shipper.shipperAddress || '',
        shipperBuilding: shipper.shipperAddress || '', // Simplified for loaded
        shipperStreet: '', 
        shipperArea: '',
        shipperCity: shipper.shipperCity || '',
        shipperCountry: shipper.shipperCountry || 'UAE',
        shipperPhonePrefix: phonePrefix,
        shipperPhone: phoneNum,
      }));
      toast.success(`Loaded shipper: ${shipper.nickname}`);
    }
  };

  const calculateRateMutation = trpc.portal.rates.calculate.useMutation({
    onSuccess: (data) => setCalculatedRate(data),
  });

  const calculateCODMutation = trpc.portal.rates.calculateCOD.useMutation({
    onSuccess: (data) => setCalculatedCODFee(data.fee),
  });

  // Rates calculation effect
  useEffect(() => {
    const weightVal = parseFloat(formData.weight);
    const lengthVal = parseFloat(formData.length);
    const widthVal = parseFloat(formData.width);
    const heightVal = parseFloat(formData.height);

    if (!isNaN(weightVal) && weightVal > 0 && user?.clientId) {
      calculateRateMutation.mutate({
        clientId: user.clientId,
        serviceType: formData.serviceType as 'DOM' | 'SDD' | 'BULLET',
        weight: weightVal,
        length: !isNaN(lengthVal) && lengthVal > 0 ? lengthVal : undefined,
        width: !isNaN(widthVal) && widthVal > 0 ? widthVal : undefined,
        height: !isNaN(heightVal) && heightVal > 0 ? heightVal : undefined,
        emirate: formData.emirate || undefined,
      });
    }
  }, [formData.weight, formData.length, formData.width, formData.height, formData.serviceType, formData.emirate]);

  // COD calculation effect
  useEffect(() => {
    if (formData.codRequired === 1 && formData.codAmount) {
      const amount = parseFloat(formData.codAmount);
      if (!isNaN(amount) && amount > 0) {
        calculateCODMutation.mutate({ codAmount: amount });
      }
    } else {
      setCalculatedCODFee(0);
    }
  }, [formData.codRequired, formData.codAmount]);

  const createMutation = trpc.portal.customer.createShipment.useMutation({
    onSuccess: () => {
      toast.success('Shipment created successfully!');
      setPickedLocation(null);
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create shipment');
    },
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    const weightVal = parseFloat(formData.weight);
    if (isNaN(weightVal) || weightVal <= 0) {
      toast.error('Please enter a valid weight greater than 0');
      return;
    }
    if (!formData.shipperName.trim()) {
      toast.error('Please enter the shipper name');
      return;
    }
    if (!formData.customerName.trim()) {
      toast.error('Please enter the receiver name');
      return;
    }
    if (formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates') {
      if (!pickedLocation) {
        setLocationError(true);
        toast.error('Please use the Search Address field or click the map to confirm the delivery location.');
        return;
      }
    }
    setLocationError(false);
    setStep('service');
  };

  const handleSubmit = () => {
    const weightVal = parseFloat(formData.weight);
    if (isNaN(weightVal) || weightVal <= 0) return;

    const shipperAddress = [formData.shipperBuilding, formData.shipperApt ? `Apt ${formData.shipperApt}` : '', formData.shipperStreet, formData.shipperArea].filter(Boolean).join(', ');
    const receiverAddress = [formData.consigneeBuilding, formData.consigneeApt ? `Apt ${formData.consigneeApt}` : '', formData.consigneeStreet, formData.consigneeArea, formData.consigneeLandmark].filter(Boolean).join(', ');

    createMutation.mutate({
      shipment: {
        shipperName: formData.shipperName,
        shipperPhone: `${formData.shipperPhonePrefix} ${formData.shipperPhone}`,
        shipperAddress: shipperAddress,
        shipperCity: formData.shipperCity,
        shipperCountry: formData.shipperCountry,

        customerName: formData.customerName,
        customerPhone: `${formData.customerPhonePrefix} ${formData.customerPhone}`,
        address: receiverAddress,
        city: formData.city,
        emirate: formData.emirate,
        destinationCountry: formData.destinationCountry,

        pieces: formData.pieces,
        weight: weightVal,
        length: parseFloat(formData.length) || 0,
        width: parseFloat(formData.width) || 0,
        height: parseFloat(formData.height) || 0,
        serviceType: selectedService || formData.serviceType,
        specialInstructions: formData.specialInstructions,

        codRequired: formData.codRequired,
        codAmount: formData.codRequired === 1 ? formData.codAmount : undefined,
        codCurrency: formData.codCurrency,
        fitOnDelivery: formData.fitOnDelivery,

        latitude: pickedLocation?.latitude,
        longitude: pickedLocation?.longitude,

        preferredDeliveryDate: (selectedService === 'PREFERRED_TIME' || selectedService === 'PREFERRED_TIME_SDD') ? preferredDate : undefined,
        preferredDeliveryTime: (selectedService === 'PREFERRED_TIME' || selectedService === 'PREFERRED_TIME_SDD') ? preferredTime : undefined,
      }
    });
  };

  const applyPreset = (preset: 'small' | 'medium' | 'large' | 'extra-large') => {
    if (preset === 'small') {
      setFormData({ ...formData, weight: '2.0', length: '20', width: '20', height: '25' });
    } else if (preset === 'medium') {
      setFormData({ ...formData, weight: '5.0', length: '40', width: '25', height: '25' });
    } else if (preset === 'large') {
      setFormData({ ...formData, weight: '15.0', length: '50', width: '50', height: '30' });
    } else if (preset === 'extra-large') {
      setFormData({ ...formData, weight: '30.0', length: '60', width: '50', height: '50' });
    }
  };

  const inputClass = "w-full rounded-[9px] border border-border bg-card text-foreground px-[13px] py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="p-0 w-full bg-background text-foreground antialiased font-sans flex flex-col min-h-[calc(90vh-2.5rem)]">
      {/* Drawer-style header */}
      <div className="flex items-center gap-4 mb-6 border-b border-border pb-5">
        <span className="w-[44px] h-[44px] rounded-[12px] grid place-items-center flex-none"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>deployed_code</span>
        </span>
        <div>
          <div className="font-display text-[22px] font-bold tracking-tight leading-none">Create shipment</div>
          <div className="text-[13.5px] text-muted-foreground mt-1.5">
            {step === 'details' ? 'Step 1 of 2 — Shipment details' : 'Step 2 of 2 — Select service'}
          </div>
        </div>
      </div>

      {/* Step 2: Service Selection */}
      {step === 'service' && (
        <ServiceSelectionStep
          emirate={formData.emirate || formData.city || 'Dubai'}
          weight={parseFloat(formData.weight) || 0}
          selectedService={selectedService}
          onServiceSelect={setSelectedService}
          preferredDate={preferredDate}
          preferredTime={preferredTime}
          onPreferredDateChange={setPreferredDate}
          onPreferredTimeChange={setPreferredTime}
          onConfirm={handleSubmit}
          onBack={() => setStep('details')}
          isSubmitting={createMutation.isPending}
          codRequired={formData.codRequired}
          codAmount={formData.codAmount}
          calculatedCODFee={calculatedCODFee}
          fitOnDelivery={formData.fitOnDelivery}
          fodFee={clientSettings?.fodFee ? Number(clientSettings.fodFee) : 5.00}
          shipperName={formData.shipperName}
        />
      )}

      {/* Step 1: Shipment Details Form */}
      {step === 'details' && (
      <form
        onSubmit={handleNext}
        onKeyDown={(e) => {
          // Enter inside a text input would submit the form and advance the step,
          // remounting the map and losing the pin. Only the "Next" button submits.
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
          }
        }}
        className=""
      >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Sender & Receiver */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Shipper Details */}
          <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-muted-foreground text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>outbox</span>
                <h2 className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Shipper Details</h2>
              </div>
              <div className="flex items-center gap-2">
                {savedShippers.length > 0 && (
                  <select className={`${inputClass} !w-auto !py-1 !px-2 !h-8 text-xs font-bold bg-background text-primary border-primary`} defaultValue="" onChange={handleLoadShipper}>
                      <option value="" disabled>Load Saved Address...</option>
                      {savedShippers.map((shipper: any) => (
                        <option key={shipper.id} value={shipper.id.toString()}>{shipper.nickname}</option>
                      ))}
                  </select>
                )}
                <Dialog open={showSaveShipperDialog} onOpenChange={setShowSaveShipperDialog}>
                  <DialogTrigger asChild>
                    <button type="button" className="flex items-center gap-1 px-3 py-1 text-xs font-medium border border-border rounded-full bg-background hover:bg-muted transition-colors">
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Save Shipper</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nickname *</label>
                        <input className={inputClass} value={shipperNickname} onChange={e => setShipperNickname(e.target.value)} placeholder="e.g. Main Warehouse" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                      <button type="button" className="px-4 py-2 text-[13px] border border-border rounded-full hover:bg-muted" onClick={() => setShowSaveShipperDialog(false)}>Cancel</button>
                      <button type="button" className="px-4 py-2 text-[13px] bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90" onClick={handleSaveShipper}>Save</button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Name / Company</label>
                  <input required className={inputClass} type="text" value={formData.shipperName} onChange={e => setFormData({...formData, shipperName: e.target.value})} placeholder="Company Name" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contact Number</label>
                  <div className="flex">
                    <select className="px-2 rounded-l-lg border border-r-0 border-border bg-muted text-foreground text-sm font-medium focus:outline-none" value={formData.shipperPhonePrefix} onChange={e => setFormData({...formData, shipperPhonePrefix: e.target.value})}>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+966">🇸🇦 +966</option>
                      <option value="+965">🇰🇼 +965</option>
                      <option value="+973">🇧🇭 +973</option>
                      <option value="+968">🇴🇲 +968</option>
                      <option value="+974">🇶🇦 +974</option>
                    </select>
                    <input required className={`${inputClass} rounded-l-none`} type="text" value={formData.shipperPhone} onChange={e => setFormData({...formData, shipperPhone: e.target.value})} placeholder="5x xxx xxxx" />
                  </div>
                </div>
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Building / Villa</label>
                    <input required className={inputClass} placeholder="Al Khaleej Twr" type="text" value={formData.shipperBuilding} onChange={e => setFormData({...formData, shipperBuilding: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Apt / Unit (Opt)</label>
                    <input className={inputClass} placeholder="e.g. 402" type="text" value={formData.shipperApt} onChange={e => setFormData({...formData, shipperApt: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Street</label>
                    <input required className={inputClass} placeholder="e.g. SZR" type="text" value={formData.shipperStreet} onChange={e => setFormData({...formData, shipperStreet: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</label>
                    <select className={inputClass} value={formData.shipperCity} onChange={e => setFormData({...formData, shipperCity: e.target.value})}>
                      {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Consignee Details */}
          <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-muted-foreground text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>move_to_inbox</span>
              <h2 className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Consignee / Receiver</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receiver Name</label>
                  <input required className={inputClass} placeholder="Enter receiver's name" type="text" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
                  <div className="flex">
                    <select className="px-2 rounded-l-lg border border-r-0 border-border bg-muted text-foreground text-sm font-medium focus:outline-none" value={formData.customerPhonePrefix} onChange={e => setFormData({...formData, customerPhonePrefix: e.target.value})}>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+966">🇸🇦 +966</option>
                      <option value="+965">🇰🇼 +965</option>
                      <option value="+973">🇧🇭 +973</option>
                      <option value="+968">🇴🇲 +968</option>
                      <option value="+974">🇶🇦 +974</option>
                    </select>
                    <input required className={`${inputClass} rounded-l-none`} placeholder="5x xxx xxxx" type="text" value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} />
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Search Address</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input
                      ref={consigneeSearchRef}
                      type="text"
                      placeholder="Type to search and auto-fill all address fields..."
                      className={`${inputClass} pl-9 border-primary/50 focus-visible:ring-primary`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">Select a suggestion to fill building, street, area and city automatically</p>
                </div>
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Building/Villa</label>
                    <input required className={inputClass} placeholder="Building" type="text" value={formData.consigneeBuilding} onChange={e => setFormData({...formData, consigneeBuilding: e.target.value})} />
                  </div>
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Apt (Opt)</label>
                    <input className={inputClass} placeholder="Apt #" type="text" value={formData.consigneeApt} onChange={e => setFormData({...formData, consigneeApt: e.target.value})} />
                  </div>
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Street</label>
                    <input required className={inputClass} placeholder="Street" type="text" value={formData.consigneeStreet} onChange={e => setFormData({...formData, consigneeStreet: e.target.value})} />
                  </div>
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Area</label>
                    <input required className={inputClass} placeholder="Area / Zone" type="text" value={formData.consigneeArea} onChange={e => setFormData({...formData, consigneeArea: e.target.value})} />
                  </div>
                  <div className="space-y-1 md:col-span-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">City</label>
                    <select className={inputClass} value={formData.city} onChange={e => setFormData({...formData, city: e.target.value, emirate: e.target.value})}>
                      {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain', 'Al Ain'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {(formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates') && (
                <div className={`mt-6 pt-6 border-t ${locationError ? 'border-destructive' : 'border-border'}`}>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">Pin on Map <span className="text-destructive ml-0.5">*</span><span className="normal-case font-normal text-muted-foreground/60 ml-1">— use Search Address above or click the map</span></label>
                  <LocationPicker
                    onLocationPicked={(loc) => { setPickedLocation(loc); if (loc) setLocationError(false); }}
                    onAddressParsed={handleAddressParsed}
                    searchInputRef={consigneeSearchRef}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Shipment Details */}
          <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-muted-foreground text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>inventory</span>
              <h2 className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Package Details</h2>
            </div>
            <div className="p-6 space-y-8">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-4">Package Size Presets</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div onClick={() => applyPreset('small')} className={`border ${formData.weight==='2.0' ? 'border-primary bg-primary/10' : 'border-border'} p-4 rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105`}>
                    <span className={`material-symbols-outlined text-3xl ${formData.weight==='2.0' ? 'text-primary':'text-muted-foreground'}`}>draft</span>
                    <span className="font-bold">Small</span>
                    <span className="text-[10px] text-muted-foreground text-center">2kg<br/>20x20x25 cm</span>
                  </div>
                  <div onClick={() => applyPreset('medium')} className={`border ${formData.weight==='5.0' ? 'border-primary bg-primary/10' : 'border-border'} p-4 rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105`}>
                    <span className={`material-symbols-outlined text-3xl ${formData.weight==='5.0' ? 'text-primary':'text-muted-foreground'}`}>package_2</span>
                    <span className="font-bold">Medium</span>
                    <span className="text-[10px] text-muted-foreground text-center">5kg<br/>40x25x25 cm</span>
                  </div>
                  <div onClick={() => applyPreset('large')} className={`border ${formData.weight==='15.0' ? 'border-primary bg-primary/10' : 'border-border'} p-4 rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105`}>
                    <span className={`material-symbols-outlined text-3xl ${formData.weight==='15.0' ? 'text-primary':'text-muted-foreground'}`}>inventory_2</span>
                    <span className="font-bold">Large</span>
                    <span className="text-[10px] text-muted-foreground text-center">15kg<br/>50x50x30 cm</span>
                  </div>
                  <div onClick={() => applyPreset('extra-large')} className={`border ${formData.weight==='30.0' ? 'border-primary bg-primary/10' : 'border-border'} p-4 rounded-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105`}>
                    <span className={`material-symbols-outlined text-3xl ${formData.weight==='30.0' ? 'text-primary':'text-muted-foreground'}`}>conveyor_belt</span>
                    <span className="font-bold">Extra Large</span>
                    <span className="text-[10px] text-muted-foreground text-center">30kg<br/>60x50x50 cm</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pieces</label>
                  <input className={inputClass} type="text" inputMode="numeric" pattern="[0-9]*" required value={formData.pieces} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, pieces: parseInt(v)||1}); }} placeholder="1" />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weight(kg)</label>
                  <input className={inputClass} type="text" inputMode="decimal" required value={formData.weight} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setFormData({...formData, weight: v}); }} placeholder="0.0" />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">L (cm)</label>
                  <input className={inputClass} placeholder="0" type="text" inputMode="numeric" pattern="[0-9]*" value={formData.length} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, length: v}); }} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">W (cm)</label>
                  <input className={inputClass} placeholder="0" type="text" inputMode="numeric" pattern="[0-9]*" value={formData.width} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, width: v}); }} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">H (cm)</label>
                  <input className={inputClass} placeholder="0" type="text" inputMode="numeric" pattern="[0-9]*" value={formData.height} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({...formData, height: v}); }} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes / Special Instructions</label>
                <textarea className={inputClass} placeholder="Any special handling instructions or notes for delivery..." rows={2} value={formData.specialInstructions} onChange={e => setFormData({...formData, specialInstructions: e.target.value})}></textarea>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Summary & Payment */}
        <div className="space-y-8">
          
          {/* Service & Payment Configuration */}
          <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-muted-foreground text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>room_service</span>
              <h2 className="font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">Payment Method</h2>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-border rounded-lg">
                <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                <p className="text-xs text-muted-foreground">Service selection happens in the next step based on destination and availability.</p>
              </div>

              <div className="pt-4 border-t border-border space-y-4">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Payment Method</label>
                <div className="space-y-3">
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.codRequired === 1 ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="payment_method" type="radio" checked={formData.codRequired === 1} onChange={() => setFormData({...formData, codRequired: 1})} />
                    <div className="ml-3">
                      <div className="font-bold text-sm">Cash on Delivery (COD)</div>
                      <div className="text-[11px] text-muted-foreground">Collect payment from the receiver</div>
                    </div>
                  </label>

                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.codRequired === 0 ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="payment_method" type="radio" checked={formData.codRequired === 0} onChange={() => setFormData({...formData, codRequired: 0})} />
                    <div className="ml-3">
                      <div className="font-bold text-sm">Prepaid (Monthly Billing)</div>
                      <div className="text-[11px] text-muted-foreground">Billed to your monthly invoice</div>
                    </div>
                  </label>
                </div>
              </div>

              {formData.codRequired === 1 && (
                <div className="pl-8 -mt-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">COD Amount to Collect</label>
                  <div className="relative">
                    <input className={`${inputClass} pl-12 text-lg font-bold h-12`} placeholder="0.00" type="text" inputMode="decimal" required value={formData.codAmount} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setFormData({...formData, codAmount: v}); }} />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">AED</span>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border space-y-4">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Additional Services</label>
                <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.fitOnDelivery === 1 ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'} ${clientSettings?.fodAllowed !== 1 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="checkbox" className="text-primary focus:ring-primary w-4 h-4 rounded border-primary bg-transparent" disabled={clientSettings?.fodAllowed !== 1} checked={formData.fitOnDelivery === 1} onChange={(e) => setFormData({...formData, fitOnDelivery: e.target.checked ? 1 : 0})} />
                  <div className="ml-3">
                    <div className="font-bold text-sm">Fit on Delivery (FOD)</div>
                    <div className="text-[11px] text-muted-foreground">Receiver can try on items before accepting</div>
                  </div>
                </label>
              </div>

            </div>
          </section>

          {/* Order Summary */}
          <section className="band rounded-lg p-6 relative overflow-hidden">
            <p className="font-mono text-[10px] uppercase tracking-widest mb-4 relative z-10" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Order Summary
            </p>
            <div className="space-y-3 text-sm relative z-10">
              {calculatedCODFee > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">COD Handling</span>
                  <span className="font-medium">{calculatedCODFee.toFixed(2)} AED</span>
                </div>
              )}
              {formData.fitOnDelivery === 1 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Fit on Delivery</span>
                  <span className="font-medium" style={{ color: 'var(--st-amber)' }}>{(clientSettings?.fodFee ? Number(clientSettings.fodFee) : 5.00).toFixed(2)} AED</span>
                </div>
              )}
              <div className="flex items-start gap-2 pt-1">
                <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                <p className="text-xs opacity-70">Shipping price is shown per service in the next step, where all available services appear with prices included.</p>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-3 relative z-10">
              <button type="submit" className="w-full py-3.5 bg-primary text-primary-foreground rounded-full font-semibold text-[14px] hover:opacity-90 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">arrow_forward</span>
                Next: Select Service
              </button>
            </div>
          </section>

        </div>
      </div>
      </form>
      )}
    </div>
  );
}

