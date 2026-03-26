import React, { useState, useEffect } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';

export default function CreateShipmentForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
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

  // Fetch client settings
  const { data: clientSettings } = trpc.portal.customer.getMyAccount.useQuery(
    { token },
    { enabled: !!token }
  );

  const { data: savedShippers = [] } = trpc.portal.customer.getSavedShippers.useQuery(
    { token },
    { enabled: !!token }
  );

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
        token,
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
        calculateCODMutation.mutate({ token, codAmount: amount });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const weightVal = parseFloat(formData.weight);
    if (isNaN(weightVal) || weightVal <= 0) {
      toast.error('Please enter a valid weight greater than 0');
      return;
    }

    const shipperAddress = [formData.shipperBuilding, formData.shipperApt ? `Apt ${formData.shipperApt}` : '', formData.shipperStreet, formData.shipperArea].filter(Boolean).join(', ');
    const receiverAddress = [formData.consigneeBuilding, formData.consigneeApt ? `Apt ${formData.consigneeApt}` : '', formData.consigneeStreet, formData.consigneeArea, formData.consigneeLandmark].filter(Boolean).join(', ');

    createMutation.mutate({
      token,
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
        serviceType: formData.serviceType,
        specialInstructions: formData.specialInstructions,
        
        codRequired: formData.codRequired,
        codAmount: formData.codRequired === 1 ? formData.codAmount : undefined,
        codCurrency: formData.codCurrency,
        fitOnDelivery: formData.fitOnDelivery,
        
        latitude: pickedLocation?.latitude,
        longitude: pickedLocation?.longitude,
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

  const inputClass = "w-full rounded-lg border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="p-6 md:p-8 max-w-7xl mx-auto w-full bg-background text-foreground antialiased font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Create New Shipment</h1>
          <p className="text-muted-foreground">Fill in the details to generate a new waybill and schedule pickup.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="px-4 py-2 text-muted-foreground bg-secondary hover:bg-secondary/80 rounded-lg font-medium border border-border transition-colors">
            Save as Draft
          </button>
          <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-2">
            {createMutation.isPending ? 'Creating...' : 'Create Shipment'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Sender & Receiver */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* Shipper Details */}
          <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>outbox</span>
                <h2 className="font-bold">Shipper Details</h2>
              </div>
              {savedShippers.length > 0 && (
                <select className={`${inputClass} !w-auto !py-1 !px-2 !h-8 text-xs font-bold bg-background text-primary border-primary`} defaultValue="" onChange={handleLoadShipper}>
                    <option value="" disabled>Load Saved Address...</option>
                    {savedShippers.map((shipper: any) => (
                      <option key={shipper.id} value={shipper.id.toString()}>{shipper.nickname}</option>
                    ))}
                </select>
              )}
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
          <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>move_to_inbox</span>
              <h2 className="font-bold">Consignee (Receiver)</h2>
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

              <div className="mt-6 pt-6 border-t border-border">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">Find Location</label>
                {(formData.destinationCountry === 'UAE' || formData.destinationCountry === 'United Arab Emirates') && (
                  <div className="col-span-2">
                    <LocationPicker onLocationPicked={setPickedLocation} />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Shipment Details */}
          <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>inventory</span>
              <h2 className="font-bold">Shipment Details</h2>
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
                  <input className={inputClass} min="1" type="number" required value={formData.pieces} onChange={e => setFormData({...formData, pieces: parseInt(e.target.value)||1})} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Weight(kg)</label>
                  <input className={inputClass} step="0.1" type="number" required value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">L (cm)</label>
                  <input className={inputClass} placeholder="0" type="number" value={formData.length} onChange={e => setFormData({...formData, length: e.target.value})} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">W (cm)</label>
                  <input className={inputClass} placeholder="0" type="number" value={formData.width} onChange={e => setFormData({...formData, width: e.target.value})} />
                </div>
                <div className="space-y-1 col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">H (cm)</label>
                  <input className={inputClass} placeholder="0" type="number" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} />
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
          <section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>room_service</span>
              <h2 className="font-bold">Service & Payment</h2>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="space-y-4">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Service Type</label>
                <div className="space-y-3">
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'DOM' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="service_type" type="radio" checked={formData.serviceType === 'DOM'} onChange={() => setFormData({...formData, serviceType: 'DOM'})} />
                    <div className="ml-3">
                      <div className="font-bold text-sm">Domestic Express (DOM)</div>
                      <div className="text-[11px] text-muted-foreground">Standard Next Day</div>
                    </div>
                  </label>
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'SDD' ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                    <input className="text-primary focus:ring-primary w-4 h-4 rounded-full border border-primary bg-transparent" name="service_type" type="radio" checked={formData.serviceType === 'SDD'} onChange={() => setFormData({...formData, serviceType: 'SDD'})} />
                    <div className="ml-3">
                      <div className="font-bold text-sm">Same Day (SDD)</div>
                      <div className="text-[11px] text-muted-foreground">Delivered today</div>
                    </div>
                  </label>
                  {clientSettings?.bulletAllowed === 1 && (
                      <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${formData.serviceType === 'BULLET' ? 'border-red-500 bg-red-500/10' : 'border-border hover:bg-muted'}`}>
                          <input className="text-red-500 focus:ring-red-500 w-4 h-4 rounded-full border border-red-500 bg-transparent" name="service_type" type="radio" checked={formData.serviceType === 'BULLET'} onChange={() => setFormData({...formData, serviceType: 'BULLET'})} />
                          <div className="ml-3">
                              <div className="font-bold text-sm text-red-500">🚀 Bullet Service</div>
                              <div className="text-[11px] text-muted-foreground">Premium 4-Hour Delivery</div>
                          </div>
                      </label>
                  )}
                </div>
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
                    <input className={`${inputClass} pl-12 text-lg font-bold h-12`} placeholder="0.00" type="number" required value={formData.codAmount} onChange={e => setFormData({...formData, codAmount: e.target.value})} />
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
          <section className="bg-slate-900 text-white rounded-xl shadow-xl p-6 relative overflow-hidden">
            <h2 className="font-bold mb-4 flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined text-blue-400">receipt_long</span>
              Summary
            </h2>
            <div className="space-y-3 text-sm relative z-10">
              <div className="flex justify-between">
                <span className="opacity-70">Base Shipping</span>
                <span className="font-medium">{calculatedRate ? calculatedRate.baseRate.toFixed(2) : '0.00'} AED</span>
              </div>
              {calculatedRate?.additionalKgCharge > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Overweight</span>
                  <span className="font-medium">{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                </div>
              )}
              {calculatedCODFee > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">COD Handling</span>
                  <span className="font-medium">{calculatedCODFee.toFixed(2)} AED</span>
                </div>
              )}
              {formData.fitOnDelivery === 1 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Fit on Delivery</span>
                  <span className="font-medium text-purple-400">{(clientSettings?.fodFee ? Number(clientSettings.fodFee) : 5.00).toFixed(2)} AED</span>
                </div>
              )}
              <div className="flex justify-between items-end pt-4 border-t border-white/20">
                <span className="text-lg font-bold">Total Payable</span>
                <span className="text-2xl font-black text-blue-400">{calculatedRate ? ((calculatedRate.totalRate + calculatedCODFee + (formData.fitOnDelivery === 1 ? (clientSettings?.fodFee ? Number(clientSettings.fodFee) : 5.00) : 0))).toFixed(2) : '0.00'} AED</span>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-3 relative z-10">
              <button type="submit" disabled={createMutation.isPending} className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:opacity-90 transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">rocket_launch</span>
                {createMutation.isPending ? 'Processing...' : 'Confirm & Ship'}
              </button>
            </div>
          </section>

        </div>
      </div>
    </form>
  );
}
