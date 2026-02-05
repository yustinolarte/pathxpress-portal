import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FloatingParticles from '@/components/FloatingParticles';
import AnimatedSection from '@/components/AnimatedSection';
import MouseGradientText from '@/components/MouseGradientText';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Package, Truck, Globe2, Plane, ShoppingCart, Clock, MapPin, MessageCircle, TrendingUp, Leaf, ChevronDown, Brain, Route, FileCheck, DollarSign, BarChart3, ShieldAlert, Sparkles, ArrowRight, CheckCircle2, Eye, Target } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [trackingId, setTrackingId] = useState('');

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId) {
      toast.error('Please enter a tracking ID');
      return;
    }
    setLocation(`/tracking?id=${trackingId}`);
  };

  const services = [
    {
      icon: Truck,
      title: t('services.sameDay.title'),
      label: t('services.sameDay.label'),
      points: [
        t('services.sameDay.point1'),
        t('services.sameDay.point2'),
        t('services.sameDay.point3'),
      ],
    },
    {
      icon: Package,
      title: t('services.domestic.title'),
      label: t('services.domestic.label'),
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
      points: [
        t('services.lastMile.point1'),
        t('services.lastMile.point2'),
        t('services.lastMile.point3'),
      ],
    },
  ];

  const whyChooseUs = [
    {
      icon: Clock,
      title: t('whyChooseUs.onTime.title'),
      description: t('whyChooseUs.onTime.description'),
    },
    {
      icon: MapPin,
      title: t('whyChooseUs.tracking.title'),
      description: t('whyChooseUs.tracking.description'),
    },
    {
      icon: MessageCircle,
      title: t('whyChooseUs.support.title'),
      description: t('whyChooseUs.support.description'),
    },
    {
      icon: TrendingUp,
      title: t('whyChooseUs.flexible.title'),
      description: t('whyChooseUs.flexible.description'),
    },
    {
      icon: Globe2,
      title: t('whyChooseUs.specialist.title'),
      description: t('whyChooseUs.specialist.description'),
    },
  ];

  const faqs = [
    {
      question: t('faq.q1.question'),
      answer: t('faq.q1.answer'),
    },
    {
      question: t('faq.q2.question'),
      answer: t('faq.q2.answer'),
    },
    {
      question: t('faq.q3.question'),
      answer: t('faq.q3.answer'),
    },
    {
      question: t('faq.q4.question'),
      answer: t('faq.q4.answer'),
    },
  ];

  // SEO: Create FAQ schema from translated FAQ content
  const faqSchemaData = useMemo(() => createFAQSchema(
    faqs.map(faq => ({ question: faq.question, answer: faq.answer }))
  ), [faqs]);

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Last Mile Delivery & COD Courier in UAE | PATHXPRESS"
        description="PATHXPRESS provides same-day, next-day and COD last-mile delivery services across Dubai, Abu Dhabi and all UAE. AI-powered logistics for faster, affordable e-commerce shipping."
        canonical="https://pathxpress.net/"
        schema={[PATHXPRESS_ORGANIZATION_SCHEMA, faqSchemaData]}
      />
      <Header />

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center pt-20 relative overflow-hidden">
        {/* Static Hero Image - Shows on mobile always, on desktop as fallback/poster */}
        <img
          src="/hero-mobile.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-0"
          loading="eager"
          fetchPriority="high"
          width="1024"
          height="1024"
        />

        {/* Video Background - Desktop only, overlays the static image */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster="/hero-mobile.png"
          className="absolute inset-0 w-full h-full object-cover z-0 hidden md:block"
        >
          <source src="/vid.mp4" type="video/mp4" />
        </video>

        {/* Dark Overlay with Glassmorphism effect */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm z-[1]"></div>

        {/* Floating Particles - reduced count for better mobile performance */}
        <FloatingParticles count={6} color="mixed" />

        {/* Decorative Glow Elements - optimized */}
        <div className="absolute inset-0 z-[2] opacity-15 pointer-events-none">
          <div className="absolute top-20 left-10 w-64 h-64 bg-primary rounded-full blur-2xl"></div>
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-accent rounded-full blur-2xl"></div>
        </div>

        <div className="container relative z-[10]">
          <div className="max-w-4xl mx-auto text-center">
            {/* AI Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6 animate-blur-in">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {t('hero.aiBadge')}
              </span>
              <Sparkles className="w-4 h-4 text-accent animate-pulse" />
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight animate-blur-in text-white">
              {t('hero.title')}
            </h1>
            <p className="text-xl md:text-2xl text-foreground/80 mb-12 animate-fade-in stagger-2">
              {t('hero.subtitle')}
            </p>

            {/* Glassmorphism Tracking Bar */}
            <div className="glass-strong rounded-2xl p-6 md:p-8 mb-8 animate-slide-up stagger-3 card-hover-lift">
              <form onSubmit={handleTrack} className="flex flex-col md:flex-row gap-4">
                <Input
                  type="text"
                  placeholder={t('hero.trackingPlaceholder')}
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  className="flex-1 bg-input border-border text-lg h-14"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-14 px-8 bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth btn-hover-expand"
                >
                  {t('hero.trackButton')}
                </Button>
              </form>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up stagger-4">
              <Link href="/request-quote">
                <Button
                  size="lg"
                  className="bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth px-8 btn-hover-expand"
                >
                  {t('hero.requestQuoteBtn')}
                </Button>
              </Link>
              <Link href="/request-pickup">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary/10 transition-smooth px-8 btn-hover-expand"
                >
                  {t('hero.requestPickupBtn')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[10] animate-scroll-indicator">
          <div className="flex flex-col items-center gap-2 text-foreground/50">
            <span className="text-sm font-medium">{t('hero.scroll')}</span>
            <ChevronDown className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 gradient-dark">
        <div className="container">
          <AnimatedSection animation="fade-in" className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">{t('services.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('services.subtitle')}</p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <AnimatedSection key={index} animation="slide-up" delay={index * 0.1}>
                  <Card className="glass-strong border-border hover:border-primary transition-smooth group card-hover-lift h-full">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-smooth icon-hover-rotate">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{service.title}</CardTitle>
                      <CardDescription className="text-accent font-medium">
                        {service.label}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-4">
                        {service.points.map((point, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start">
                            <span className="text-primary mr-2">•</span>
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
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-card/30">
        <div className="container">
          <AnimatedSection animation="fade-in" className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">{t('whyChooseUs.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('whyChooseUs.subtitle')}</p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyChooseUs.map((item, index) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={index} animation="scale-in" delay={index * 0.1}>
                  <div className="flex flex-col items-center text-center p-6 rounded-xl glass hover:glass-strong transition-smooth card-hover-lift h-full">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 icon-hover-bounce animate-float">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI-Powered Technology Section */}
      <section className="py-20 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-accent/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />

        <div className="container relative z-10">
          <AnimatedSection animation="fade-in" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-400">{t('aiPowered.badge')}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-primary bg-clip-text text-transparent">
              {t('aiPowered.title')}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t('aiPowered.subtitle')}
            </p>
          </AnimatedSection>

          {/* AI Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: Route,
                title: t('aiPowered.smartRoutes.title'),
                description: t('aiPowered.smartRoutes.description'),
                detail: t('aiPowered.smartRoutes.detail'),
                color: 'from-blue-500 to-cyan-500',
                bgColor: 'bg-blue-500/20',
              },
              {
                icon: FileCheck,
                title: t('aiPowered.automation.title'),
                description: t('aiPowered.automation.description'),
                detail: t('aiPowered.automation.detail'),
                color: 'from-green-500 to-emerald-500',
                bgColor: 'bg-green-500/20',
              },
              {
                icon: DollarSign,
                title: t('aiPowered.pricing.title'),
                description: t('aiPowered.pricing.description'),
                detail: t('aiPowered.pricing.detail'),
                color: 'from-yellow-500 to-orange-500',
                bgColor: 'bg-yellow-500/20',
              },
              {
                icon: BarChart3,
                title: t('aiPowered.demandPrediction.title'),
                description: t('aiPowered.demandPrediction.description'),
                detail: t('aiPowered.demandPrediction.detail'),
                color: 'from-purple-500 to-pink-500',
                bgColor: 'bg-purple-500/20',
              },
              {
                icon: ShieldAlert,
                title: t('aiPowered.incidentDetection.title'),
                description: t('aiPowered.incidentDetection.description'),
                detail: t('aiPowered.incidentDetection.detail'),
                color: 'from-red-500 to-rose-500',
                bgColor: 'bg-red-500/20',
              },
            ].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={index} animation="slide-up" delay={index * 0.1}>
                  <Card className="glass-strong border-border hover:border-purple-500/50 transition-smooth group card-hover-lift h-full">
                    <CardHeader>
                      <div className={`w-14 h-14 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-smooth`}>
                        <Icon className={`w-7 h-7 bg-gradient-to-r ${feature.color} bg-clip-text`} style={{ color: 'transparent', background: `linear-gradient(to right, var(--tw-gradient-stops))`, WebkitBackgroundClip: 'text', backgroundClip: 'text' }} />
                        <Icon className={`w-7 h-7 text-white absolute`} />
                      </div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {feature.title}
                        <Sparkles className="w-4 h-4 text-purple-400" />
                      </CardTitle>
                      <CardDescription className="text-primary font-semibold">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {feature.detail}
                      </p>
                    </CardContent>
                  </Card>
                </AnimatedSection>
              );
            })}
          </div>

          {/* Why Lower Prices Section */}
          <AnimatedSection animation="scale-in">
            <Card className="glass-strong border-purple-500/30 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <CardContent className="p-8 lg:p-12">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 mb-4">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">{t('aiPowered.costSavingsBadge')}</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold mb-4">
                    {t('aiPowered.whyLowerPrices.title')}
                  </h3>
                  <p className="text-lg text-muted-foreground mb-6">
                    {t('aiPowered.whyLowerPrices.description')}
                  </p>
                  <ul className="space-y-3">
                    {[
                      t('aiPowered.whyLowerPrices.point1'),
                      t('aiPowered.whyLowerPrices.point2'),
                      t('aiPowered.whyLowerPrices.point3'),
                      t('aiPowered.whyLowerPrices.point4'),
                    ].map((point, index) => (
                      <li key={index} className="flex items-center gap-3 text-foreground">
                        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <div className="hidden lg:flex items-center justify-center p-12 bg-gradient-to-br from-purple-500/10 via-primary/10 to-green-500/10 relative">
                  <div className="absolute inset-0 bg-grid-pattern opacity-5" />
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-3xl scale-150" />
                    <div className="relative glass-strong rounded-2xl p-8 text-center">
                      <div className="text-6xl font-bold bg-gradient-to-r from-green-400 to-primary bg-clip-text text-transparent mb-2">
                        -40%
                      </div>
                      <p className="text-muted-foreground">{t('aiPowered.operationalCosts')}</p>
                      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-400">
                        <TrendingUp className="w-4 h-4" />
                        <span>{t('aiPowered.savingsPassedToYou')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </AnimatedSection>

          {/* AI CTA */}
          <AnimatedSection animation="fade-in" className="mt-12 text-center">
            <Link href="/request-quote">
              <Button size="lg" className="bg-gradient-to-r from-purple-500 to-primary hover:from-purple-600 hover:to-primary/90 glow-blue-hover transition-smooth px-8 btn-hover-expand">
                {t('aiPowered.cta.button')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </AnimatedSection>
        </div>
      </section>

      {/* About Section - Enhanced with Demo Design */}
      <section className="py-20 gradient-dark relative overflow-hidden">
        {/* Subtle wave background pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(255,255,255,0.03) 50px, rgba(255,255,255,0.03) 51px)',
            transform: 'rotate(-15deg) scale(2)',
          }} />
        </div>

        <div className="container relative z-10">
          {/* Header */}
          <AnimatedSection animation="fade-in" className="text-center mb-16 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Brain className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-secondary">{t('about.hero.badge') || 'AI-Powered Logistics'}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">{t('about.title')}</h2>
            <p className="text-xl text-muted-foreground mb-4">{t('about.subtitle')}</p>
            <p className="text-lg text-foreground/80 leading-relaxed">{t('about.description')}</p>
          </AnimatedSection>

          {/* Stats Banner - Similar to Demo Savings Banner */}
          <AnimatedSection animation="scale-in" className="mb-16">
            <div className="glass-strong border-2 border-secondary/30 rounded-3xl p-8 md:p-12">
              <h3 className="text-xl md:text-2xl font-bold text-center mb-8 flex items-center justify-center gap-3">
                <Target className="w-7 h-7 text-secondary" />
                {t('aiPowered.whyLowerPrices.title') || 'AI Optimization Results'}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                {[
                  { value: '40%', label: t('about.stats.faster') || 'Faster Delivery' },
                  { value: '30%', label: t('about.stats.cheaper') || 'Cost Savings' },
                  { value: '99%', label: t('about.stats.accuracy') || 'On-Time Rate' },
                  { value: '24/7', label: t('about.stats.support') || 'Support' },
                ].map((stat, index) => (
                  <div key={index} className="text-center">
                    <div className="text-3xl md:text-5xl font-black text-secondary mb-2">{stat.value}</div>
                    <div className="text-sm md:text-base text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* Vision & Mission Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 max-w-5xl mx-auto">
            <AnimatedSection animation="slide-right">
              <Card className="glass-strong border-primary/30 h-full card-hover-lift overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                    <Eye className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl text-primary">{t('about.vision.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{t('about.vision.content')}</p>
                </CardContent>
              </Card>
            </AnimatedSection>

            <AnimatedSection animation="slide-left" delay={0.1}>
              <Card className="glass-strong border-secondary/30 h-full card-hover-lift overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="w-16 h-16 rounded-2xl bg-secondary/20 flex items-center justify-center mb-4">
                    <Target className="w-8 h-8 text-secondary" />
                  </div>
                  <CardTitle className="text-2xl text-secondary">{t('about.mission.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{t('about.mission.content')}</p>
                </CardContent>
              </Card>
            </AnimatedSection>
          </div>

          {/* Comparison Table - Traditional vs PathXpress AI */}
          <AnimatedSection animation="fade-in" className="mb-16">
            <div className="text-center mb-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-2 flex items-center justify-center gap-3">
                <BarChart3 className="w-7 h-7 text-secondary" />
                {t('about.comparison.title') || 'Why Choose PATHXPRESS?'}
              </h3>
              <p className="text-muted-foreground">{t('about.comparison.subtitle') || 'Traditional delivery vs AI-powered logistics'}</p>
            </div>

            <div className="glass-strong rounded-2xl overflow-hidden border border-border max-w-4xl mx-auto">
              {/* Table Header */}
              <div className="grid grid-cols-3 bg-background/50 border-b border-border">
                <div className="p-4 md:p-5 font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  {t('about.comparison.feature') || 'Feature'}
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  {t('about.comparison.traditional') || 'Traditional'}
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-secondary">
                  PATHXPRESS
                </div>
              </div>

              {/* Table Rows */}
              {[
                { feature: t('about.comparison.realTimeTracking') || 'Real-time Tracking', traditional: true, ai: true },
                { feature: t('about.comparison.aiRouteOptimization') || 'AI Route Optimization', traditional: false, ai: true },
                { feature: t('about.comparison.dynamicPricing') || 'Dynamic Pricing', traditional: false, ai: true },
                { feature: t('about.comparison.predictiveETA') || 'Predictive ETA', traditional: false, ai: true },
                { feature: t('about.comparison.sameDayDelivery') || 'Same-Day Delivery', traditional: true, ai: true },
                { feature: t('about.comparison.codService') || 'COD Service', traditional: true, ai: true },
                { feature: t('about.comparison.autoReoptimization') || 'Auto Re-Optimization', traditional: false, ai: true },
                { feature: t('about.comparison.trafficAnalysis') || 'Traffic Analysis', traditional: false, ai: true },
              ].map((row, index) => (
                <div key={index} className="grid grid-cols-3 border-b border-border/50 last:border-b-0 hover:bg-white/5 transition-colors">
                  <div className="p-4 md:p-5 flex items-center gap-3 text-foreground">
                    {index === 1 && <Brain className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    {index === 2 && <DollarSign className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    {index === 3 && <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    {index === 6 && <Route className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    {index === 7 && <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    {![1, 2, 3, 6, 7].includes(index) && <Package className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                    <span className="text-sm md:text-base">{row.feature}</span>
                  </div>
                  <div className="p-4 md:p-5 flex items-center justify-center">
                    {row.traditional ? (
                      <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div className="p-4 md:p-5 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-secondary" />
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>

          {/* Core Values Pills */}
          <AnimatedSection animation="slide-up" className="text-center">
            <h3 className="text-2xl font-semibold mb-8">{t('about.values.title')}</h3>
            <div className="flex flex-wrap justify-center gap-4">
              {[
                { icon: TrendingUp, label: t('about.values.innovation'), color: 'primary' },
                { icon: MessageCircle, label: t('about.values.empathy'), color: 'secondary' },
                { icon: Clock, label: t('about.values.efficiency'), color: 'primary' },
                { icon: Leaf, label: t('about.values.sustainability'), color: 'secondary' },
              ].map((value, index) => {
                const Icon = value.icon;
                const colorClass = value.color === 'secondary' ? 'text-secondary bg-secondary/20 border-secondary/30' : 'text-primary bg-primary/20 border-primary/30';
                return (
                  <AnimatedSection key={index} animation="scale-in" delay={index * 0.1}>
                    <div className={`glass-strong px-6 py-4 rounded-2xl flex items-center gap-3 border card-hover-lift ${value.color === 'secondary' ? 'border-secondary/30' : 'border-primary/30'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${value.color === 'secondary' ? 'bg-secondary/20' : 'bg-primary/20'}`}>
                        <Icon className={`w-5 h-5 ${value.color === 'secondary' ? 'text-secondary' : 'text-primary'}`} />
                      </div>
                      <span className="font-semibold">{value.label}</span>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-card/30">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">{t('faq.title')}</h2>
              <p className="text-xl text-muted-foreground">{t('faq.subtitle')}</p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="glass-strong border-border rounded-lg px-6"
                >
                  <AccordionTrigger className="text-left font-semibold hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
