import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function InternationalRateForm() {
  const { t } = useTranslation();
  
  const [originCountry, setOriginCountry] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.internationalRate.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      // Reset form
      setOriginCountry('');
      setDestinationCountry('');
      setDeliveryDate('');
      setWeight('');
      setLength('');
      setWidth('');
      setHeight('');
      setPhone('');
      setEmail('');
      setErrors({});
    },
    onError: (error) => {
      toast.error(t('pricing.international.error'));
      console.error('Error submitting international rate request:', error);
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!originCountry.trim()) newErrors.originCountry = t('pricing.international.errors.requiredField');
    if (!destinationCountry.trim()) newErrors.destinationCountry = t('pricing.international.errors.requiredField');
    
    // Validate delivery date is in the future
    if (!deliveryDate) {
      newErrors.deliveryDate = t('pricing.international.errors.requiredField');
    } else {
      const selectedDate = new Date(deliveryDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      if (selectedDate < tomorrow) {
        newErrors.deliveryDate = 'Please select a future date (minimum tomorrow)';
      }
    }
    
    const w = parseFloat(weight);
    if (!weight || isNaN(w) || w < 0.1) {
      newErrors.weight = t('pricing.international.errors.minWeight');
    }

    const l = parseFloat(length);
    const wd = parseFloat(width);
    const h = parseFloat(height);
    
    if (!length || isNaN(l) || l < 1) {
      newErrors.length = t('pricing.international.errors.minDimension');
    }
    if (!width || isNaN(wd) || wd < 1) {
      newErrors.width = t('pricing.international.errors.minDimension');
    }
    if (!height || isNaN(h) || h < 1) {
      newErrors.height = t('pricing.international.errors.minDimension');
    }

    if (!phone.trim()) newErrors.phone = t('pricing.international.errors.requiredField');
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      newErrors.email = t('pricing.international.errors.requiredField');
    } else if (!emailRegex.test(email)) {
      newErrors.email = t('pricing.international.errors.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    submitMutation.mutate({
      originCountry,
      destinationCountry,
      deliveryDate,
      weight,
      length,
      width,
      height,
      phone,
      email,
    });
  };

  if (submitted) {
    return (
      <Card className="glass-strong border-primary animate-fade-in">
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">{t('pricing.international.success')}</h3>
          <Button
            onClick={() => setSubmitted(false)}
            variant="outline"
            className="mt-4"
          >
            Submit Another Request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-strong border-border">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <CardTitle className="text-2xl">{t('pricing.international.title')}</CardTitle>
          </div>
        </div>
        <CardDescription>{t('pricing.international.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Origin Country */}
        <div className="space-y-2">
          <Label htmlFor="originCountry">{t('pricing.international.originCountry')}</Label>
          <Input
            id="originCountry"
            type="text"
            placeholder="e.g. United Arab Emirates"
            value={originCountry}
            onChange={(e) => setOriginCountry(e.target.value)}
            className={errors.originCountry ? 'border-red-500' : ''}
          />
          {errors.originCountry && <p className="text-xs text-red-500">{errors.originCountry}</p>}
        </div>

        {/* Destination Country */}
        <div className="space-y-2">
          <Label htmlFor="destinationCountry">{t('pricing.international.destinationCountry')}</Label>
          <Input
            id="destinationCountry"
            type="text"
            placeholder="e.g. Colombia"
            value={destinationCountry}
            onChange={(e) => setDestinationCountry(e.target.value)}
            className={errors.destinationCountry ? 'border-red-500' : ''}
          />
          {errors.destinationCountry && <p className="text-xs text-red-500">{errors.destinationCountry}</p>}
        </div>

        {/* Delivery Date */}
        <div className="space-y-2">
          <Label htmlFor="deliveryDate">{t('pricing.international.deliveryDate')}</Label>
          <Input
            id="deliveryDate"
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

        {/* Weight */}
        <div className="space-y-2">
          <Label htmlFor="weight">{t('pricing.international.weight')}</Label>
          <Input
            id="weight"
            type="number"
            step="0.1"
            min="0.1"
            placeholder="0.0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={errors.weight ? 'border-red-500' : ''}
          />
          {errors.weight && <p className="text-xs text-red-500">{errors.weight}</p>}
        </div>

        {/* Dimensions */}
        <div className="space-y-2">
          <Label>{t('pricing.international.dimensions')}</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder={t('pricing.international.length')}
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
                placeholder={t('pricing.international.width')}
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
                placeholder={t('pricing.international.height')}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className={errors.height ? 'border-red-500' : ''}
              />
              {errors.height && <p className="text-xs text-red-500 mt-1">{errors.height}</p>}
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">{t('pricing.international.phone')}</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+971 50 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={errors.phone ? 'border-red-500' : ''}
          />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">{t('pricing.international.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="w-full bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth"
        >
          {submitMutation.isPending ? 'Submitting...' : t('pricing.international.calculateBtn')}
        </Button>
      </CardContent>
    </Card>
  );
}
