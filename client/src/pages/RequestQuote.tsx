import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function RequestQuote() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    pickupAddress: '',
    deliveryAddress: '',
    serviceType: '',
    weight: '',
    comments: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const createQuoteMutation = trpc.quoteRequest.create.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success(t('quoteForm.submitSuccess'));
      setFormData({
        name: '',
        phone: '',
        email: '',
        pickupAddress: '',
        deliveryAddress: '',
        serviceType: '',
        weight: '',
        comments: '',
      });
    },
    onError: (error) => {
      toast.error(error.message || t('quoteForm.error'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createQuoteMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="pt-32 pb-20 gradient-dark min-h-screen flex items-center justify-center">
          <div className="container max-w-2xl">
            <Card className="glass-strong border-primary text-center animate-fade-in">
              <CardContent className="py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-6 text-primary" />
                <h2 className="text-3xl font-bold mb-4">{t('quoteForm.successTitle')}</h2>
                <p className="text-muted-foreground mb-8">
                  {t('quoteForm.successMessage')}
                </p>
                <Button
                  onClick={() => setSubmitted(false)}
                  className="bg-primary hover:bg-primary/90"
                >
                  {t('quoteForm.submitAnother')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container max-w-3xl">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('quoteForm.title')}</h1>
            <p className="text-xl text-muted-foreground">{t('quoteForm.subtitle')}</p>
          </div>

          <Card className="glass-strong border-border animate-slide-up">
            <CardHeader>
              <CardTitle className="text-2xl">{t('quoteForm.cardTitle')}</CardTitle>
              <CardDescription>
                {t('quoteForm.cardDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('quoteForm.name')} *</Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      required
                      className="bg-input border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('quoteForm.phone')} *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      required
                      className="bg-input border-border"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('quoteForm.email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    required
                    className="bg-input border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupAddress">{t('quoteForm.pickupAddress')} *</Label>
                  <Textarea
                    id="pickupAddress"
                    value={formData.pickupAddress}
                    onChange={(e) => handleChange('pickupAddress', e.target.value)}
                    required
                    rows={3}
                    className="bg-input border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deliveryAddress">{t('quoteForm.deliveryAddress')}</Label>
                  <Textarea
                    id="deliveryAddress"
                    value={formData.deliveryAddress}
                    onChange={(e) => handleChange('deliveryAddress', e.target.value)}
                    rows={3}
                    className="bg-input border-border"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="serviceType">{t('quoteForm.serviceType')} *</Label>
                    <Select
                      value={formData.serviceType}
                      onValueChange={(value) => handleChange('serviceType', value)}
                      required
                    >
                      <SelectTrigger className="bg-input border-border">
                        <SelectValue placeholder={t('quoteForm.selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent className="glass-strong">
                        <SelectItem value="same-day">{t('quoteForm.serviceTypes.sameDay')}</SelectItem>
                        <SelectItem value="domestic">{t('quoteForm.serviceTypes.domestic')}</SelectItem>
                        <SelectItem value="freight">{t('quoteForm.serviceTypes.freight')}</SelectItem>
                        <SelectItem value="latam">{t('quoteForm.serviceTypes.latam')}</SelectItem>
                        <SelectItem value="last-mile">{t('quoteForm.serviceTypes.lastMile')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weight">{t('quoteForm.weight')} *</Label>
                    <Input
                      id="weight"
                      type="text"
                      placeholder="e.g., 5 kg / 11 lb"
                      value={formData.weight}
                      onChange={(e) => handleChange('weight', e.target.value)}
                      required
                      className="bg-input border-border"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">{t('quoteForm.comments')}</Label>
                  <Textarea
                    id="comments"
                    value={formData.comments}
                    onChange={(e) => handleChange('comments', e.target.value)}
                    rows={4}
                    className="bg-input border-border"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth"
                  disabled={createQuoteMutation.isPending}
                >
                  {createQuoteMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {t('quoteForm.submitting')}
                    </>
                  ) : (
                    t('quoteForm.submit')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
