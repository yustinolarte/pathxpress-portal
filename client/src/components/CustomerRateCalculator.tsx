import { useState } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calculator, Package, Truck, DollarSign } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

export default function CustomerRateCalculator() {
  const { token, user } = usePortalAuth();
  const [serviceType, setServiceType] = useState<'DOM' | 'SDD'>('DOM');
  const [weight, setWeight] = useState<string>('');
  const [emirate, setEmirate] = useState<string>('');
  const [dimL, setDimL] = useState<string>('');
  const [dimW, setDimW] = useState<string>('');
  const [dimH, setDimH] = useState<string>('');
  const [codRequired, setCodRequired] = useState(false);
  const [codAmount, setCodAmount] = useState<string>('');
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [calculatedCODFee, setCalculatedCODFee] = useState<number>(0);

  const getVolumetricWeight = () => {
    const l = parseFloat(dimL) || 0;
    const w = parseFloat(dimW) || 0;
    const h = parseFloat(dimH) || 0;
    if (l > 0 && w > 0 && h > 0) {
      return (l * w * h) / 5000;
    }
    return 0;
  };

  // Calculate rate mutation
  const calculateRateMutation = trpc.portal.rates.calculate.useMutation({
    onSuccess: (data) => {
      setCalculatedRate(data);
    },
  });

  // Calculate COD fee mutation
  const calculateCODMutation = trpc.portal.rates.calculateCOD.useMutation({
    onSuccess: (data) => {
      setCalculatedCODFee(data.fee);
    },
  });

  const handleCalculate = () => {
    const weightNum = parseFloat(weight);
    if (!weightNum || weightNum <= 0 || !user?.clientId) {
      return;
    }

    calculateRateMutation.mutate({
      token: token || '',
      clientId: user.clientId,
      serviceType,
      weight: weightNum,
      length: parseFloat(dimL) > 0 ? parseFloat(dimL) : undefined,
      width: parseFloat(dimW) > 0 ? parseFloat(dimW) : undefined,
      height: parseFloat(dimH) > 0 ? parseFloat(dimH) : undefined,
      emirate: emirate || undefined,
    });

    if (codRequired && codAmount) {
      const codAmountNum = parseFloat(codAmount);
      if (!isNaN(codAmountNum) && codAmountNum > 0) {
        calculateCODMutation.mutate({
          token: token || '',
          codAmount: codAmountNum,
        });
      }
    } else {
      setCalculatedCODFee(0);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 mb-8">
        <h2 className="text-3xl font-black tracking-tight text-foreground">Rate Calculator</h2>
        <p className="text-muted-foreground text-lg max-w-2xl">Compare domestic shipping services and calculate estimated costs for your parcels instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Calculator Section */}
        <div className="lg:col-span-2 bg-card rounded-2xl shadow-xl shadow-primary/5 border border-primary/10 overflow-hidden">
          <div className="p-8 border-b border-primary/10 bg-primary/5">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">calculate</span>
              Shipment Details
            </h3>
            <p className="text-muted-foreground text-sm mt-1">Enter your package information to get an accurate quote.</p>
          </div>

          <div className="p-8 space-y-8">
            {/* Service Type */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-bold text-foreground ml-1">Service Level</Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-muted-foreground group-focus-within:text-primary transition-colors text-lg">local_shipping</span>
                  </div>
                  <Select value={serviceType} onValueChange={(value: 'DOM' | 'SDD') => setServiceType(value)}>
                    <SelectTrigger className="w-full pl-10 h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DOM">Express (DOM) - Next Day</SelectItem>
                      <SelectItem value="SDD">Same-Day (SDD) - City Limits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {serviceType === 'SDD' && (
                  <p className="text-xs text-amber-500 font-medium ml-1">
                    Cut-off: 14:00 | Min 4 qty | Max 10kg
                  </p>
                )}
              </div>

              {/* Weight */}
              <div className="space-y-3">
                <Label className="text-sm font-bold text-foreground ml-1">Actual Weight (kg)</Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-muted-foreground group-focus-within:text-primary transition-colors text-lg">scale</span>
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full pl-10 h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span className="text-sm text-muted-foreground font-bold">KG</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Destination Emirate */}
            {serviceType === 'DOM' && (
              <div className="space-y-3">
                <Label className="text-sm font-bold text-foreground ml-1">Destination Emirate <span className="text-muted-foreground font-normal">(for zone-based pricing)</span></Label>
                <Select value={emirate} onValueChange={setEmirate}>
                  <SelectTrigger className="w-full h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium">
                    <SelectValue placeholder="Select emirate..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dubai">Dubai</SelectItem>
                    <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
                    <SelectItem value="Sharjah">Sharjah</SelectItem>
                    <SelectItem value="Ajman">Ajman</SelectItem>
                    <SelectItem value="RAK">Ras Al Khaimah</SelectItem>
                    <SelectItem value="Fujairah">Fujairah</SelectItem>
                    <SelectItem value="UAQ">Umm Al Quwain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dimensions (Volumetric Weight) */}
            <div className="space-y-3 pt-6 border-t border-primary/10">
              <div className="flex justify-between items-end mb-4">
                <Label className="text-sm font-bold text-foreground ml-1">Dimensions <span className="text-muted-foreground font-normal">(Optional for precise quoting)</span></Label>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="relative group">
                  <span className="absolute -top-2.5 left-3 bg-card px-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest z-10">Length</span>
                  <Input
                    type="number"
                    value={dimL}
                    onChange={(e) => setDimL(e.target.value)}
                    className="w-full h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium text-center"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-3 text-xs text-muted-foreground font-bold">CM</span>
                </div>
                <div className="relative group">
                  <span className="absolute -top-2.5 left-3 bg-card px-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest z-10">Width</span>
                  <Input
                    type="number"
                    value={dimW}
                    onChange={(e) => setDimW(e.target.value)}
                    className="w-full h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium text-center"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-3 text-xs text-muted-foreground font-bold">CM</span>
                </div>
                <div className="relative group">
                  <span className="absolute -top-2.5 left-3 bg-card px-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest z-10">Height</span>
                  <Input
                    type="number"
                    value={dimH}
                    onChange={(e) => setDimH(e.target.value)}
                    className="w-full h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium text-center"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-3 text-xs text-muted-foreground font-bold">CM</span>
                </div>
              </div>

              {getVolumetricWeight() > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Volumetric Weight</p>
                  <p className="font-bold">{getVolumetricWeight().toFixed(2)} kg</p>
                </div>
              )}
            </div>

            {/* COD Options */}
            <div className="space-y-4 pt-6 border-t border-primary/10">
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-primary/10 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setCodRequired(!codRequired)}>
                <Checkbox
                  id="cod"
                  checked={codRequired}
                  onCheckedChange={(checked) => setCodRequired(checked as boolean)}
                  className="rounded border-2 border-primary/50 text-primary data-[state=checked]:bg-primary data-[state=checked]:text-white h-5 w-5"
                />
                <div className="flex-1">
                  <Label htmlFor="cod" className="text-sm font-bold cursor-pointer block">
                    Cash on Delivery (COD)
                  </Label>
                  <p className="text-xs text-muted-foreground">Collect payment from your customer upon delivery.</p>
                </div>
                <span className="material-symbols-outlined text-primary/50 text-2xl">payments</span>
              </div>

              {codRequired && (
                <div className="pl-12 w-full animate-in slide-in-from-top-2 duration-300">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-muted-foreground font-bold">AED</span>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={codAmount}
                      onChange={(e) => setCodAmount(e.target.value)}
                      className="w-full max-w-sm pl-12 h-12 bg-background/50 border-2 border-primary/10 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">
                    Standard COD Fee: 3.3% (minimum 2.00 AED)
                  </p>
                </div>
              )}
            </div>

            {/* Calculate Button */}
            <div className="pt-8">
              <Button
                onClick={handleCalculate}
                disabled={!weight || parseFloat(weight) <= 0 || calculateRateMutation.isPending}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 text-lg group"
              >
                {calculateRateMutation.isPending ? (
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined group-hover:scale-110 transition-transform">calculate</span>
                )}
                {calculateRateMutation.isPending ? 'Calculating...' : 'Calculate Exact Rate'}
              </Button>
            </div>

            {/* Results Component Integrated Here for Mobile, or absolute for Desktop */}
            {calculatedRate && (
              <div className="mt-8 p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-2xl border-2 border-green-500/20 shadow-lg animate-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 text-green-600 dark:text-green-500 font-black text-xl mb-6">
                  <span className="material-symbols-outlined text-3xl">check_circle</span>
                  <span>Quote Summary</span>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-muted-foreground">
                      Base Rate (0-{calculatedRate.appliedTier?.maxWeight || 5}kg)
                    </span>
                    <span className="font-bold text-foreground">{calculatedRate.baseRate.toFixed(2)} AED</span>
                  </div>

                  {calculatedRate.additionalKgCharge > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-muted-foreground">
                        Overweight Charge
                      </span>
                      <span className="font-bold text-foreground">+{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                    </div>
                  )}

                  {codRequired && calculatedCODFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-muted-foreground">COD Processing Fee</span>
                      <span className="font-bold text-amber-500">
                        +{calculatedCODFee.toFixed(2)} AED
                      </span>
                    </div>
                  )}

                  <div className="h-px w-full bg-green-500/20 my-4"></div>

                  <div className="flex justify-between items-end">
                    <div>
                      <span className="font-black uppercase tracking-widest text-xs text-green-600/70 dark:text-green-500/70 block mb-1">Total Shipping Cost</span>
                      <span className="text-4xl font-black text-green-600 dark:text-green-500 shadow-sm">
                        {(calculatedRate.totalRate + calculatedCODFee).toFixed(2)}
                      </span>
                      <span className="text-lg font-bold text-green-600/70 dark:text-green-500/70 ml-1">AED</span>
                    </div>
                    {calculatedRate.usingManualTier && (
                      <div className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">verified</span> Standard Tier
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Info Cards */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-xl p-6 border border-border hover:border-primary transition-colors cursor-default group shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined text-3xl">local_shipping</span>
              </div>
            </div>
            <h4 className="text-lg font-bold mb-2">Domestic Express (DOM)</h4>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Fast and reliable delivery within 1-2 business days across all major regions.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm font-medium">
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
                Next-business-day delivery in UAE
              </li>
              <li className="flex items-center gap-3 text-sm font-medium">
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
                Base weight: 5kg (+2 AED/kg additional)
              </li>
              <li className="flex items-center gap-3 text-sm font-medium">
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
                Volume-based discounts
              </li>
            </ul>
          </div>

          <div className="bg-card rounded-2xl p-6 shadow-xl shadow-primary/5 border border-primary/10 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 relative">
              <span className="material-symbols-outlined text-2xl">bolt</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Same-Day Delivery</h3>
            <p className="text-sm text-muted-foreground mb-4">Urgent shipments delivered on the same day within city limits.</p>
            <div className="space-y-3 pt-4 border-t border-primary/10 relative">
              <div className="flex items-center gap-3 text-sm"><span className="material-symbols-outlined text-primary text-lg">check_circle</span> Same Day Guarantee</div>
              <div className="flex items-center gap-3 text-sm"><span className="material-symbols-outlined text-primary text-lg">check_circle</span> Before 2 PM Pickups</div>
              <div className="flex items-center gap-3 text-sm"><span className="material-symbols-outlined text-primary text-lg">check_circle</span> Premium Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-4 bg-primary/5 border border-primary/10 p-5 rounded-xl shadow-sm">
        <span className="material-symbols-outlined text-primary text-xl">info</span>
        <p className="text-sm text-muted-foreground font-medium">
          Rates are estimated based on provided details. Actual charges may vary after physical inspection and weight verification at the hub.
        </p>
      </div>
    </div>
  );
}
