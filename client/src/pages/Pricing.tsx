import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RateCalculator from '@/components/RateCalculator';
import InternationalRateForm from '@/components/InternationalRateForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

export default function Pricing() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('pricing.title')}</h1>
            <p className="text-xl text-muted-foreground">{t('pricing.subtitle')}</p>
          </div>

          {/* Domestic UAE Rate Calculator Section */}
          <div className="mb-16 animate-slide-up">
            <h2 className="text-3xl font-bold text-center mb-8">Domestic UAE Rates</h2>
            <RateCalculator />
          </div>

          {/* International Rate Request Section */}
          <div className="mb-16 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h2 className="text-3xl font-bold text-center mb-8">International Shipping</h2>
            <div className="max-w-2xl mx-auto">
              <InternationalRateForm />
            </div>
          </div>

          {/* Transparent Pricing Info */}
          <div className="max-w-4xl mx-auto">
            <Card className="glass-strong border-border animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <CardHeader>
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
                  <DollarSign className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl text-center">Transparent Pricing</CardTitle>
                <CardDescription className="text-center text-lg">
                  {t('pricing.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <p className="text-foreground/80 leading-relaxed">
                  {t('pricing.cta')}
                </p>
                <Link href="/request-quote">
                  <Button
                    size="lg"
                    className="bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth px-8"
                  >
                    {t('pricing.requestQuoteBtn')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
