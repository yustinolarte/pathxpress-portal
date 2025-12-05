import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import RateCalculator from '@/components/RateCalculator';
import InternationalRateForm from '@/components/InternationalRateForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign,
  Truck,
  Globe2,
  Package,
  Clock,
  Shield,
  CheckCircle2,
  Zap,
  MapPin
} from 'lucide-react';

export default function Pricing() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('domestic');

  const pricingFeatures = [
    {
      icon: Shield,
      title: 'No Hidden Fees',
      description: 'What you see is what you pay. Transparent pricing with no surprises.',
    },
    {
      icon: Clock,
      title: 'Flexible Options',
      description: 'Choose between standard and same-day delivery based on your needs.',
    },
    {
      icon: Package,
      title: 'All Sizes Welcome',
      description: 'From small envelopes to large packages, we handle it all.',
    },
  ];

  const domesticRates = [
    { weight: '0 - 5 kg', standard: '20 AED', sameDay: '30 AED' },
    { weight: '5 - 10 kg', standard: '25 AED', sameDay: '35 AED' },
    { weight: '10 - 15 kg', standard: '30 AED', sameDay: '40 AED' },
    { weight: '15 - 20 kg', standard: '35 AED', sameDay: '45 AED' },
    { weight: '20+ kg', standard: '+1 AED/kg', sameDay: '+1 AED/kg' },
  ];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          {/* Hero Section */}
          <AnimatedSection animation="fade-in" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <span className="text-sm font-medium text-primary">Simple & Transparent</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4">{t('pricing.title')}</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{t('pricing.subtitle')}</p>
          </AnimatedSection>

          {/* Features Row */}
          <AnimatedSection animation="slide-up" className="mb-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pricingFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-6 rounded-xl glass hover:glass-strong transition-smooth"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </AnimatedSection>

          {/* Main Content with Tabs */}
          <AnimatedSection animation="slide-up" delay={0.1}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full max-w-md mx-auto grid grid-cols-2 mb-8 glass-strong p-1 h-14">
                <TabsTrigger
                  value="domestic"
                  className="data-[state=active]:bg-primary data-[state=active]:text-white h-12 text-base font-medium flex items-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  Domestic UAE
                </TabsTrigger>
                <TabsTrigger
                  value="international"
                  className="data-[state=active]:bg-secondary data-[state=active]:text-white h-12 text-base font-medium flex items-center gap-2"
                >
                  <Globe2 className="w-4 h-4" />
                  International
                </TabsTrigger>
              </TabsList>

              {/* Domestic Tab Content */}
              <TabsContent value="domestic" className="space-y-8">
                {/* Rate Calculator */}
                <div>
                  <h2 className="text-2xl font-bold text-center mb-6 flex items-center justify-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Package className="w-4 h-4 text-primary" />
                    </span>
                    Calculate Your Exact Rate
                  </h2>
                  <RateCalculator />
                </div>
              </TabsContent>

              {/* International Tab Content */}
              <TabsContent value="international" className="space-y-8">
                <div className="max-w-4xl mx-auto">
                  {/* Info Banner */}
                  <Card className="glass border-secondary/30 mb-8">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                          <Globe2 className="w-6 h-6 text-secondary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-1">International Shipping Quotes</h3>
                          <p className="text-muted-foreground">
                            For international shipments, we provide custom quotes based on destination,
                            package dimensions, and delivery requirements. Fill out the form below and
                            our team will respond within 2 hours during business hours.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* International Rate Form */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    <div className="lg:col-span-3">
                      <InternationalRateForm />
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                      {/* Why International */}
                      <Card className="glass-strong border-border">
                        <CardHeader>
                          <CardTitle className="text-lg">What's Included</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {[
                            'Door-to-door delivery',
                            'Full tracking & visibility',
                            'Customs clearance assistance',
                            'Insurance options available',
                            'Express & economy options',
                          ].map((item, index) => (
                            <div key={index} className="flex items-center gap-3">
                              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                              <span className="text-sm">{item}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Contact Card */}
                      <Card className="glass-strong border-border">
                        <CardContent className="p-6 text-center">
                          <p className="text-sm text-muted-foreground mb-4">
                            Need help with your international shipment?
                          </p>
                          <Link href="/contact">
                            <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                              Contact Our Team
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </AnimatedSection>

          {/* Bottom CTA */}
          <AnimatedSection animation="fade-in" delay={0.2} className="mt-16">
            <Card className="glass-strong border-primary/30 max-w-3xl mx-auto overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <CardContent className="p-8 flex flex-col justify-center">
                  <h3 className="text-2xl font-bold mb-2">Need a Custom Quote?</h3>
                  <p className="text-muted-foreground mb-6">
                    For bulk shipments, special handling, or recurring deliveries,
                    we offer custom pricing tailored to your business needs.
                  </p>
                  <Link href="/request-quote">
                    <Button
                      size="lg"
                      className="bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth w-full md:w-auto btn-hover-expand"
                    >
                      {t('pricing.requestQuoteBtn')}
                    </Button>
                  </Link>
                </CardContent>
                <div className="hidden md:flex items-center justify-center p-8 bg-gradient-to-br from-primary/20 to-secondary/20">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl"></div>
                    <DollarSign className="w-24 h-24 text-primary relative z-10" />
                  </div>
                </div>
              </div>
            </Card>
          </AnimatedSection>
        </div>
      </main>

      <Footer />
    </div>
  );
}
