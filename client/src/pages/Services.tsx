import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import SEOHead, { createBreadcrumbSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Package,
  Truck,
  Globe2,
  Plane,
  ShoppingCart,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Headphones,
  MapPin,
  Zap,
  FileText,
  PackageCheck,
  Brain,
  Route,
  FileCheck,
  DollarSign,
  BarChart3,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export default function Services() {
  const { t } = useTranslation();

  const services = [
    {
      icon: Truck,
      title: t('services.sameDay.title'),
      label: t('services.sameDay.label'),
      color: 'primary',
      points: [
        t('services.sameDay.point1'),
        t('services.sameDay.point2'),
        t('services.sameDay.point3'),
        t('services.sameDay.point4'),
      ],
    },
    {
      icon: Package,
      title: t('services.domestic.title'),
      label: t('services.domestic.label'),
      color: 'primary',
      points: [
        t('services.domestic.point1'),
        t('services.domestic.point2'),
        t('services.domestic.point3'),
      ],
    },
    {
      icon: Globe2,
      title: t('services.freight.title'),
      label: t('services.freight.label'),
      color: 'secondary',
      points: [
        t('services.freight.point1'),
        t('services.freight.point2'),
        t('services.freight.point3'),
      ],
    },
    {
      icon: Plane,
      title: t('services.latam.title'),
      label: t('services.latam.label'),
      color: 'secondary',
      points: [
        t('services.latam.point1'),
        t('services.latam.point2'),
        t('services.latam.point3'),
      ],
    },
    {
      icon: ShoppingCart,
      title: t('services.lastMile.title'),
      label: t('services.lastMile.label'),
      color: 'accent',
      points: [
        t('services.lastMile.point1'),
        t('services.lastMile.point2'),
        t('services.lastMile.point3'),
      ],
    },
  ];

  const howItWorks = [
    {
      step: 1,
      icon: FileText,
      title: t('services.howItWorks.step1.title'),
      description: t('services.howItWorks.step1.description'),
    },
    {
      step: 2,
      icon: PackageCheck,
      title: t('services.howItWorks.step2.title'),
      description: t('services.howItWorks.step2.description'),
    },
    {
      step: 3,
      icon: Truck,
      title: t('services.howItWorks.step3.title'),
      description: t('services.howItWorks.step3.description'),
    },
    {
      step: 4,
      icon: MapPin,
      title: t('services.howItWorks.step4.title'),
      description: t('services.howItWorks.step4.description'),
    },
  ];

  const benefits = [
    {
      icon: Clock,
      title: t('services.whyChoose.fastDelivery.title'),
      description: t('services.whyChoose.fastDelivery.description'),
    },
    {
      icon: Shield,
      title: t('services.whyChoose.secureHandling.title'),
      description: t('services.whyChoose.secureHandling.description'),
    },
    {
      icon: Headphones,
      title: t('services.whyChoose.support247.title'),
      description: t('services.whyChoose.support247.description'),
    },
    {
      icon: Zap,
      title: t('services.whyChoose.realTimeTracking.title'),
      description: t('services.whyChoose.realTimeTracking.description'),
    },
  ];

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Delivery Services in UAE | Same-Day, Last Mile & Freight | PATHXPRESS"
        description="Complete logistics solutions in UAE: same-day delivery, last-mile fulfillment, international freight, and e-commerce shipping. AI-powered for faster, affordable service."
        canonical="https://pathxpress.net/services"
        schema={createBreadcrumbSchema([
          { name: 'Home', url: 'https://pathxpress.net/' },
          { name: 'Services', url: 'https://pathxpress.net/services' },
        ])}
      />
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          {/* Hero Section */}
          <AnimatedSection animation="fade-in" className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">{t('services.hero.badge')}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('services.title')}</h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              {t('services.hero.extendedSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/request-quote">
                <Button size="lg" className="bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth btn-hover-expand">
                  {t('services.hero.getStarted')} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                  {t('services.hero.contactSales')}
                </Button>
              </Link>
            </div>
          </AnimatedSection>

          {/* Services Grid */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('services.whatWeOffer.title')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('services.whatWeOffer.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((service, index) => {
                const Icon = service.icon;
                const colorClass = service.color === 'secondary' ? 'text-secondary' : service.color === 'accent' ? 'text-accent' : 'text-primary';
                const bgClass = service.color === 'secondary' ? 'bg-secondary/20' : service.color === 'accent' ? 'bg-accent/20' : 'bg-primary/20';

                return (
                  <AnimatedSection key={index} animation="slide-up" delay={index * 0.1}>
                    <Card className="glass-strong border-border hover:border-primary transition-smooth group card-hover-lift h-full flex flex-col">
                      <CardHeader>
                        <div className={`w-14 h-14 rounded-xl ${bgClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-smooth`}>
                          <Icon className={`w-7 h-7 ${colorClass}`} />
                        </div>
                        <CardTitle className="text-xl">{service.title}</CardTitle>
                        <CardDescription className={`${colorClass} font-medium`}>
                          {service.label}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col">
                        <ul className="space-y-3 mb-6 flex-1">
                          {service.points.map((point, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className={`w-4 h-4 ${colorClass} flex-shrink-0 mt-0.5`} />
                              {point}
                            </li>
                          ))}
                        </ul>
                        <Link href="/request-quote">
                          <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 btn-hover-expand">
                            {t('nav.requestQuote')}
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>

          {/* How It Works Section */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Zap className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">{t('services.howItWorks.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('services.howItWorks.title')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('services.howItWorks.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorks.map((item, index) => {
                const Icon = item.icon;
                return (
                  <AnimatedSection key={index} animation="scale-in" delay={index * 0.15}>
                    <div className="relative">
                      {/* Connector line */}
                      {index < howItWorks.length - 1 && (
                        <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                      )}

                      <div className="text-center p-6 rounded-xl glass hover:glass-strong transition-smooth group">
                        {/* Step number */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
                          {item.step}
                        </div>

                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 mt-2 group-hover:bg-primary/30 transition-smooth">
                          <Icon className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>

          {/* AI-Powered Technology Section */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-400">{t('aiPowered.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-primary bg-clip-text text-transparent">
                {t('aiPowered.title')}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('aiPowered.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { icon: Route, title: t('aiPowered.smartRoutes.title'), desc: t('aiPowered.smartRoutes.description'), color: 'text-blue-400', bg: 'bg-blue-500/20' },
                { icon: FileCheck, title: t('aiPowered.automation.title'), desc: t('aiPowered.automation.description'), color: 'text-green-400', bg: 'bg-green-500/20' },
                { icon: DollarSign, title: t('aiPowered.pricing.title'), desc: t('aiPowered.pricing.description'), color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
                { icon: BarChart3, title: t('aiPowered.demandPrediction.title'), desc: t('aiPowered.demandPrediction.description'), color: 'text-purple-400', bg: 'bg-purple-500/20' },
                { icon: ShieldAlert, title: t('aiPowered.incidentDetection.title'), desc: t('aiPowered.incidentDetection.description'), color: 'text-red-400', bg: 'bg-red-500/20' },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <AnimatedSection key={index} animation="scale-in" delay={index * 0.1}>
                    <div className="text-center p-4 rounded-xl glass hover:glass-strong transition-smooth group card-hover-lift h-full">
                      <div className={`w-12 h-12 rounded-full ${item.bg} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-smooth`}>
                        <Icon className={`w-6 h-6 ${item.color}`} />
                      </div>
                      <h4 className="font-semibold text-sm mb-1 flex items-center justify-center gap-1">
                        {item.title}
                        <Sparkles className="w-3 h-3 text-purple-400" />
                      </h4>
                      <p className="text-xs text-primary">{item.desc}</p>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>

            {/* Why Lower Prices - Compact */}
            <div className="mt-8 p-6 rounded-xl glass-strong border border-green-500/20">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <DollarSign className="w-8 h-8 text-green-400" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold">{t('aiPowered.whyLowerPrices.title')}</h4>
                    <p className="text-muted-foreground">{t('aiPowered.whyLowerPrices.description')}</p>
                  </div>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-primary bg-clip-text text-transparent">-40%</div>
                  <p className="text-xs text-muted-foreground">{t('aiPowered.operationalCosts')}</p>
                </div>
              </div>
            </div>
          </AnimatedSection>

          {/* Benefits Section */}
          <AnimatedSection animation="slide-up" className="mb-20">
            <Card className="glass-strong border-border overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <CardContent className="p-8 lg:p-12 flex flex-col justify-center">
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('services.whyChoose.title')}</h2>
                  <p className="text-muted-foreground mb-8">
                    {t('services.whyChoose.description')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {benefits.map((benefit, index) => {
                      const Icon = benefit.icon;
                      return (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold mb-1">{benefit.title}</h4>
                            <p className="text-sm text-muted-foreground">{benefit.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>

                <div className="hidden lg:flex items-center justify-center p-12 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-150" />
                    <div className="relative glass-strong rounded-2xl p-8">
                      <Truck className="w-32 h-32 text-primary mx-auto" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </AnimatedSection>

          {/* CTA Section */}
          <AnimatedSection animation="fade-in">
            <div className="text-center py-12 px-6 rounded-2xl glass-strong">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('services.cta.title')}</h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                {t('services.cta.description')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/request-quote">
                  <Button size="lg" className="bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth px-8 btn-hover-expand">
                    {t('services.cta.requestQuote')}
                  </Button>
                </Link>
                <Link href="/request-pickup">
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                    {t('services.cta.schedulePickup')}
                  </Button>
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </main>

      <Footer />
    </div>
  );
}
