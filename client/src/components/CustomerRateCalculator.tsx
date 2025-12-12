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
      weight: Math.max(weightNum, getVolumetricWeight()),
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
    <div className="space-y-6">
      <Card className="glass-strong border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Rate Calculator
          </CardTitle>
          <CardDescription>
            Calculate shipping costs before creating your shipment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Service Type */}
          <div className="space-y-2">
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={(value: 'DOM' | 'SDD') => setServiceType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DOM">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Domestic Express (DOM) - Next Business Day
                  </div>
                </SelectItem>
                <SelectItem value="SDD">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Same-Day Delivery (SDD) - City Limits
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {serviceType === 'SDD' && (
              <p className="text-xs text-yellow-400">
                Cut-off: 14:00 | Min 4 shipments/collection | Max 10kg
              </p>
            )}
          </div>

          {/* Weight */}
          <div className="space-y-2">
            <Label>Weight (kg)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="e.g., 2.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          {/* Dimensions (Volumetric Weight) */}
          <div className="space-y-2">
            <Label>Dimensions (cm) - Optional for Volumetric Weight</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Input
                  placeholder="L"
                  type="number"
                  value={dimL}
                  onChange={(e) => setDimL(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Input
                  placeholder="W"
                  type="number"
                  value={dimW}
                  onChange={(e) => setDimW(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Input
                  placeholder="H"
                  type="number"
                  value={dimH}
                  onChange={(e) => setDimH(e.target.value)}
                />
              </div>
            </div>
            {getVolumetricWeight() > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Volumetric Weight: <span className="font-medium">{getVolumetricWeight().toFixed(2)} kg</span>
                {parseFloat(weight) < getVolumetricWeight() && (
                  <span className="text-orange-400 ml-1">(Chargeable Weight)</span>
                )}
              </p>
            )}
          </div>

          {/* COD Options */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="cod"
                checked={codRequired}
                onCheckedChange={(checked) => setCodRequired(checked as boolean)}
              />
              <Label htmlFor="cod" className="cursor-pointer">
                Cash on Delivery (COD)
              </Label>
            </div>
            {codRequired && (
              <div className="space-y-2 pl-6">
                <Label>COD Amount (AED)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 150.00"
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  COD Fee: 3.3% (minimum 2 AED)
                </p>
              </div>
            )}
          </div>

          {/* Calculate Button */}
          <Button
            onClick={handleCalculate}
            disabled={!weight || parseFloat(weight) <= 0 || calculateRateMutation.isPending}
            className="w-full"
          >
            {calculateRateMutation.isPending ? 'Calculating...' : 'Calculate Rate'}
          </Button>

          {/* Results */}
          {calculatedRate && (
            <div className="mt-6 p-4 bg-green-500/10 rounded-lg border border-green-500/30 space-y-3">
              <div className="flex items-center gap-2 text-green-400 font-semibold">
                <DollarSign className="w-5 h-5" />
                <span>Estimated Cost Breakdown</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Base Rate (0-{calculatedRate.appliedTier?.maxWeight || 5}kg):
                  </span>
                  <span className="font-medium">{calculatedRate.baseRate.toFixed(2)} AED</span>
                </div>

                {calculatedRate.additionalKgCharge > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Additional Weight Charge:
                    </span>
                    <span className="font-medium">+{calculatedRate.additionalKgCharge.toFixed(2)} AED</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-green-500/30">
                  <span className="font-semibold">Shipping Cost:</span>
                  <span className="text-lg font-bold text-green-400">
                    {calculatedRate.totalRate.toFixed(2)} AED
                  </span>
                </div>

                {codRequired && calculatedCODFee > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">COD Fee:</span>
                      <span className="font-medium text-orange-400">
                        +{calculatedCODFee.toFixed(2)} AED
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-green-500/30">
                      <span className="font-semibold">Total Cost:</span>
                      <span className="text-xl font-bold text-green-400">
                        {(calculatedRate.totalRate + calculatedCODFee).toFixed(2)} AED
                      </span>
                    </div>
                  </>
                )}
              </div>

              {calculatedRate.usingManualTier && (
                <div className="mt-3 p-2 bg-blue-500/10 rounded border border-blue-500/30">
                  <p className="text-xs text-blue-200">
                    <strong>Note:</strong> You have a special rate tier assigned by your account manager.
                  </p>
                </div>
              )}

              <div className="mt-3 p-2 bg-muted/30 rounded">
                <p className="text-xs text-muted-foreground">
                  <strong>Tier Info:</strong> {calculatedRate.appliedTier?.minVolume} - {calculatedRate.appliedTier?.maxVolume || '∞'} shipments/month
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4" />
              Domestic Express (DOM)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 text-muted-foreground">
            <p>• Next-business-day delivery</p>
            <p>• UAE-wide coverage</p>
            <p>• Base weight: 5kg</p>
            <p>• Additional: +1 AED/kg</p>
            <p>• Volume-based discounts available</p>
          </CardContent>
        </Card>

        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Same-Day Delivery (SDD)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 text-muted-foreground">
            <p>• Same-day delivery</p>
            <p>• Dubai / Sharjah / Abu Dhabi</p>
            <p>• Cut-off time: 14:00</p>
            <p>• Max weight: 10kg</p>
            <p>• Min 4 shipments per collection</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
