import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calculator } from 'lucide-react';

type ServiceType = 'standard' | 'sameDay';
type Emirate = 'dubai' | 'abuDhabi' | 'sharjah';

interface CalculationResult {
  actualWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  basePrice: number;
  extraCost: number;
  totalPrice: number;
  service: ServiceType;
  origin: Emirate;
  destination: Emirate;
}

export default function RateCalculator() {
  const { t } = useTranslation();
  
  const [originEmirate, setOriginEmirate] = useState<Emirate | ''>('');
  const [destinationEmirate, setDestinationEmirate] = useState<Emirate | ''>('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('standard');
  const [actualWeight, setActualWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pricing configuration (easily extensible for emirate-specific pricing)
  const PRICING_CONFIG = {
    standard: {
      basePrice: 20, // AED for ≤5kg
      extraPerKg: 1,  // AED per kg above 5kg
    },
    sameDay: {
      basePrice: 30, // AED for ≤5kg
      extraPerKg: 1,  // AED per kg above 5kg
    },
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!originEmirate) newErrors.originEmirate = t('pricing.calculator.errors.requiredField');
    if (!destinationEmirate) newErrors.destinationEmirate = t('pricing.calculator.errors.requiredField');
    
    // Validate delivery date is in the future
    if (!deliveryDate) {
      newErrors.deliveryDate = t('pricing.calculator.errors.requiredField');
    } else {
      const selectedDate = new Date(deliveryDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      if (selectedDate < tomorrow) {
        newErrors.deliveryDate = 'Please select a future date (minimum tomorrow)';
      }
    }
    
    const weight = parseFloat(actualWeight);
    if (!actualWeight || isNaN(weight) || weight < 0.1) {
      newErrors.actualWeight = t('pricing.calculator.errors.minWeight');
    }

    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);
    
    if (!length || isNaN(l) || l < 1) {
      newErrors.length = t('pricing.calculator.errors.minDimension');
    }
    if (!width || isNaN(w) || w < 1) {
      newErrors.width = t('pricing.calculator.errors.minDimension');
    }
    if (!height || isNaN(h) || h < 1) {
      newErrors.height = t('pricing.calculator.errors.minDimension');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateRate = () => {
    if (!validateForm()) return;

    const weight = parseFloat(actualWeight);
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);

    // Calculate volumetric weight: (L × W × H) / 5000, rounded up
    const volumetricWeight = Math.ceil((l * w * h) / 5000);

    // Chargeable weight is the maximum of actual and volumetric
    const chargeableWeight = Math.max(weight, volumetricWeight);

    // Get pricing for selected service type
    const pricing = PRICING_CONFIG[serviceType];
    const basePrice = pricing.basePrice;

    // Calculate extra cost for weight above 5kg
    let extraCost = 0;
    if (chargeableWeight > 5) {
      const extraKgs = Math.ceil(chargeableWeight) - 5;
      extraCost = extraKgs * pricing.extraPerKg;
    }

    const totalPrice = basePrice + extraCost;

    setResult({
      actualWeight: weight,
      volumetricWeight,
      chargeableWeight,
      basePrice,
      extraCost,
      totalPrice,
      service: serviceType,
      origin: originEmirate as Emirate,
      destination: destinationEmirate as Emirate,
    });
  };

  const emirates: Emirate[] = ['dubai', 'abuDhabi', 'sharjah'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Calculator Form */}
      <Card className="glass-strong border-border">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{t('pricing.calculator.title')}</CardTitle>
            </div>
          </div>
          <CardDescription>{t('pricing.calculator.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Origin Emirate */}
          <div className="space-y-2">
            <Label htmlFor="origin">{t('pricing.calculator.originEmirate')}</Label>
            <Select value={originEmirate} onValueChange={(value) => setOriginEmirate(value as Emirate)}>
              <SelectTrigger id="origin" className={errors.originEmirate ? 'border-red-500' : ''}>
                <SelectValue placeholder={t('pricing.calculator.originEmirate')} />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {emirates.map((emirate) => (
                  <SelectItem key={emirate} value={emirate}>
                    {t(`pricing.calculator.emirates.${emirate}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.originEmirate && <p className="text-xs text-red-500">{errors.originEmirate}</p>}
          </div>

          {/* Destination Emirate */}
          <div className="space-y-2">
            <Label htmlFor="destination">{t('pricing.calculator.destinationEmirate')}</Label>
            <Select value={destinationEmirate} onValueChange={(value) => setDestinationEmirate(value as Emirate)}>
              <SelectTrigger id="destination" className={errors.destinationEmirate ? 'border-red-500' : ''}>
                <SelectValue placeholder={t('pricing.calculator.destinationEmirate')} />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {emirates.map((emirate) => (
                  <SelectItem key={emirate} value={emirate}>
                    {t(`pricing.calculator.emirates.${emirate}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.destinationEmirate && <p className="text-xs text-red-500">{errors.destinationEmirate}</p>}
          </div>

          {/* Delivery Date */}
          <div className="space-y-2">
            <Label htmlFor="date">{t('pricing.calculator.deliveryDate')}</Label>
            <Input
              id="date"
              type="date"
              min={(() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return tomorrow.toISOString().split('T')[0];
              })()}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={errors.deliveryDate ? 'border-red-500' : ''}
            />
            {errors.deliveryDate && <p className="text-xs text-red-500">{errors.deliveryDate}</p>}
          </div>

          {/* Service Type */}
          <div className="space-y-2">
            <Label>{t('pricing.calculator.serviceType')}</Label>
            <RadioGroup value={serviceType} onValueChange={(value) => setServiceType(value as ServiceType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="standard" id="standard" />
                <Label htmlFor="standard" className="font-normal cursor-pointer">
                  {t('pricing.calculator.standard')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sameDay" id="sameDay" />
                <Label htmlFor="sameDay" className="font-normal cursor-pointer">
                  {t('pricing.calculator.sameDay')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Actual Weight */}
          <div className="space-y-2">
            <Label htmlFor="weight">{t('pricing.calculator.actualWeight')}</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="0.0"
              value={actualWeight}
              onChange={(e) => setActualWeight(e.target.value)}
              className={errors.actualWeight ? 'border-red-500' : ''}
            />
            {errors.actualWeight && <p className="text-xs text-red-500">{errors.actualWeight}</p>}
          </div>

          {/* Dimensions */}
          <div className="space-y-2">
            <Label>{t('pricing.calculator.dimensions')}</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  placeholder={t('pricing.calculator.length')}
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className={errors.length ? 'border-red-500' : ''}
                />
                {errors.length && <p className="text-xs text-red-500 mt-1">{errors.length}</p>}
              </div>
              <div>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  placeholder={t('pricing.calculator.width')}
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className={errors.width ? 'border-red-500' : ''}
                />
                {errors.width && <p className="text-xs text-red-500 mt-1">{errors.width}</p>}
              </div>
              <div>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  placeholder={t('pricing.calculator.height')}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className={errors.height ? 'border-red-500' : ''}
                />
                {errors.height && <p className="text-xs text-red-500 mt-1">{errors.height}</p>}
              </div>
            </div>
          </div>

          {/* Calculate Button */}
          <Button
            onClick={calculateRate}
            className="w-full bg-primary hover:bg-primary/90 transition-smooth"
          >
            {t('pricing.calculator.calculateBtn')}
          </Button>
        </CardContent>
      </Card>

      {/* Result Display */}
      <div>
        {result ? (
          <Card className="glass-strong border-primary animate-fade-in">
            <CardHeader>
              <CardTitle className="text-3xl text-primary">
                {result.totalPrice.toFixed(2)} AED
              </CardTitle>
              <CardDescription className="text-lg">{t('pricing.calculator.result.title')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('pricing.calculator.result.actualWeight')}:</span>
                  <span className="font-medium">{result.actualWeight.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('pricing.calculator.result.volumetricWeight')}:</span>
                  <span className="font-medium">{result.volumetricWeight} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('pricing.calculator.result.chargeableWeight')}:</span>
                  <span className="font-medium">{Math.ceil(result.chargeableWeight)} kg</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">{t('pricing.calculator.result.service')}:</span>
                  <span className="font-medium">
                    {result.service === 'standard'
                      ? t('pricing.calculator.standard')
                      : t('pricing.calculator.sameDay')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('pricing.calculator.result.route')}:</span>
                  <span className="font-medium">
                    {t(`pricing.calculator.emirates.${result.origin}`)} →{' '}
                    {t(`pricing.calculator.emirates.${result.destination}`)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground italic">
                  {t('pricing.calculator.result.disclaimer')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-strong border-border h-full flex items-center justify-center">
            <CardContent className="text-center py-12">
              <Calculator className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                {t('pricing.calculator.subtitle')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
