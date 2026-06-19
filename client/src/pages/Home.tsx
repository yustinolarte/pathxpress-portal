import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Package, Truck, Globe2, Plane, ShoppingCart, Clock, MapPin, MessageCircle, TrendingUp, Leaf, ChevronDown, Brain, Route, FileCheck, DollarSign, BarChart3, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

export default function Home() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [trackingId, setTrackingId] = useState('');

  const handleTrack = (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
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
      <section className="min-h-screen flex items-center justify-center pt-[76px] relative overflow-hidden">
        {/* Static Hero Image */}
        <img
          src="/hero-mobile.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-0"
          loading="eager"
          fetchPriority="high"
          width="1024"
          height="1024"
        />

        {/* Video Background - Desktop only */}
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

        {/* Clean overlay — lighter in light theme so the video reads through */}
        <div className={`absolute inset-0 z-[1] ${theme === 'dark' ? 'bg-background/75' : 'bg-background/50'}`} />

        <div className="container relative z-[10]">
          <div className="max-w-3xl mx-auto text-center">
            {/* Eyebrow label — editorial */}
            <p className="eyebrow mb-8 animate-fade-in justify-center">
              {t('hero.aiBadge')}
            </p>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.05] tracking-tight animate-blur-in text-foreground">
              {t('hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 animate-fade-in stagger-2 max-w-xl mx-auto">
              {t('hero.subtitle')}
            </p>

            {/* Tracking Bar */}
            <form onSubmit={handleTrack} className="bg-card border border-border rounded-full p-2 mb-6 animate-slide-up stagger-3 flex flex-col md:flex-row gap-2 max-w-xl mx-auto shadow-sm">
              <Input
                type="text"
                placeholder={t('hero.trackingPlaceholder')}
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                className="flex-1 bg-transparent border-none shadow-none text-base h-11 px-4 focus-visible:ring-0"
              />
              <Button
                type="submit"
                className="h-11 px-7 bg-primary hover:bg-primary/90 text-white rounded-full transition-smooth shrink-0"
              >
                {t('hero.trackButton')}
              </Button>
            </form>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up stagger-4">
              <Link href="/request-quote">
                <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 transition-smooth px-8 rounded-full btn-hover-expand">
                  {t('hero.requestQuoteBtn')}
                </Button>
              </Link>
              <Link href="/request-pickup">
                <Button size="lg" variant="outline" className="border-border/60 text-foreground hover:border-foreground/40 transition-smooth px-8 rounded-full">
                  {t('hero.requestPickupBtn')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[10] animate-scroll-indicator">
          <div className="flex flex-col items-center gap-1.5 text-foreground/40">
            <span className="text-xs font-mono tracking-widest uppercase">{t('hero.scroll')}</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 bg-background border-t border-border">
        <div className="container">
          <AnimatedSection animation="fade-in" className="mb-14">
            <p className="eyebrow mb-4">{t('services.subtitle')}</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('services.title')}</h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-[var(--radius)] overflow-hidden border border-border">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <AnimatedSection key={index} animation="fade-in" delay={index * 0.06}>
                  <div className="bg-card hover:bg-secondary transition-smooth p-8 h-full group">
                    <div className="flex items-start justify-between mb-6">
                      <span className="font-mono text-[11px] text-muted-foreground tracking-widest">0{index + 1}</span>
                      <Icon className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-smooth" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1 tracking-tight">{service.title}</h3>
                    <p className="font-mono text-[11px] tracking-widest uppercase text-primary mb-5">{service.label}</p>
                    <ul className="space-y-2.5 mb-7">
                      {service.points.map((point, i) => (
                        <li key={i} className="text-[14px] text-muted-foreground flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-sm bg-primary mt-2 shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <Link href="/request-quote">
                      <Button variant="outline" size="sm" className="border-border text-foreground/70 hover:text-foreground hover:border-foreground/40 transition-smooth rounded-full">
                        {t('nav.requestQuote')}
                      </Button>
                    </Link>
                  </div>
                </AnimatedSection>
              );
            })}

            {/* 6th card — CTA: Custom Case */}
            <AnimatedSection animation="fade-in" delay={5 * 0.06}>
              <div className="bg-primary/10 hover:bg-primary/15 transition-smooth p-8 h-full group flex flex-col justify-between relative overflow-hidden">
                <div className="absolute right-0 bottom-0 font-display font-bold text-[180px] leading-none opacity-[0.05] select-none pointer-events-none pr-2">
                  ?
                </div>
                <div className="relative">
                  <div className="flex items-start justify-between mb-6">
                    <span className="font-mono text-[11px] text-primary tracking-widest">06</span>
                    <MessageCircle className="w-5 h-5 text-primary group-hover:text-foreground transition-smooth" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1 tracking-tight">{t('services.customCase.title')}</h3>
                  <p className="font-mono text-[11px] tracking-widest uppercase text-primary mb-5">{t('services.customCase.label')}</p>
                  <p className="text-[14px] text-muted-foreground mb-7 leading-relaxed">{t('services.customCase.description')}</p>
                </div>
                <div className="relative">
                  <Link href="/contact">
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-white transition-smooth rounded-full btn-hover-expand">
                      {t('services.customCase.cta')}
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="container">
          <AnimatedSection animation="fade-in" className="mb-14">
            <p className="eyebrow mb-4">{t('whyChooseUs.subtitle')}</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('whyChooseUs.title')}</h2>
          </AnimatedSection>

          <div className="border-t border-border">
            {whyChooseUs.map((item, index) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={index} animation="fade-in" delay={index * 0.05}>
                  <div className="flex items-start gap-8 py-8 border-b border-border group">
                    <span className="font-mono text-[11px] text-muted-foreground tracking-widest pt-1 shrink-0 w-8">0{index + 1}</span>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-smooth">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1.5 tracking-tight">{item.title}</h3>
                      <p className="text-muted-foreground text-[15px]">{item.description}</p>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI-Powered Technology Section */}
      <section className="py-24 bg-card border-t border-border">
        <div className="container">
          <AnimatedSection animation="fade-in" className="mb-14">
            <p className="eyebrow mb-4">{t('aiPowered.badge')}</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{t('aiPowered.title')}</h2>
            <p className="text-muted-foreground text-[17px] max-w-2xl">{t('aiPowered.subtitle')}</p>
          </AnimatedSection>

          {/* AI Features — editorial list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border rounded-[var(--radius)] overflow-hidden mb-8">
            {[
              { icon: Route,      title: t('aiPowered.smartRoutes.title'),      detail: t('aiPowered.smartRoutes.detail') },
              { icon: FileCheck,  title: t('aiPowered.automation.title'),       detail: t('aiPowered.automation.detail') },
              { icon: DollarSign, title: t('aiPowered.pricing.title'),          detail: t('aiPowered.pricing.detail') },
              { icon: BarChart3,  title: t('aiPowered.demandPrediction.title'), detail: t('aiPowered.demandPrediction.detail') },
              { icon: ShieldAlert, title: t('aiPowered.incidentDetection.title'), detail: t('aiPowered.incidentDetection.detail') },
              { icon: Brain,      title: t('aiPowered.cta.button'),             detail: t('aiPowered.whyLowerPrices.description') },
            ].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={index} animation="fade-in" delay={index * 0.06}>
                  <div className="bg-card hover:bg-secondary transition-smooth p-8 h-full flex gap-5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4.5 h-4.5 text-primary" style={{width:'18px',height:'18px'}} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[16px] mb-1.5 tracking-tight">{feature.title}</h3>
                      <p className="text-[14px] text-muted-foreground leading-relaxed">{feature.detail}</p>
                    </div>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>

          {/* Cost savings band */}
          <AnimatedSection animation="fade-in">
            <div className="rounded-[var(--radius)] p-10 md:p-14 relative overflow-hidden" style={{ background: 'var(--band)', color: 'var(--band-ink)' }}>
              <div className="absolute right-0 bottom-0 font-display font-bold text-[260px] leading-none opacity-[0.07] select-none pointer-events-none pr-4">
                X
              </div>
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                <div>
                  <p className="font-mono text-[11px] tracking-widest uppercase mb-4" style={{color:'rgba(255,255,255,0.5)'}}>
                    {t('aiPowered.costSavingsBadge')}
                  </p>
                  <h3 className="text-3xl md:font-display text-4xl font-bold tracking-tight mb-4">{t('aiPowered.whyLowerPrices.title')}</h3>
                  <p className="text-[15px] mb-6" style={{color:'rgba(255,255,255,0.7)'}}>{t('aiPowered.whyLowerPrices.description')}</p>
                  <ul className="space-y-2.5">
                    {[
                      t('aiPowered.whyLowerPrices.point1'),
                      t('aiPowered.whyLowerPrices.point2'),
                      t('aiPowered.whyLowerPrices.point3'),
                      t('aiPowered.whyLowerPrices.point4'),
                    ].map((point, i) => (
                      <li key={i} className="flex items-center gap-3 text-[14.5px]" style={{color:'rgba(255,255,255,0.85)'}}>
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <p className="font-mono text-[11px] tracking-widest uppercase" style={{color:'rgba(255,255,255,0.45)'}}>
                    {t('aiPowered.operationalCosts')}
                  </p>
                  <p className="font-display font-bold text-[80px] leading-none tracking-tighter text-primary">-40%</p>
                  <div className="flex items-center gap-2 text-[13px]" style={{color:'rgba(255,255,255,0.6)'}}>
                    <TrendingUp className="w-3.5 h-3.5" />
                    {t('aiPowered.savingsPassedToYou')}
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection animation="fade-in" className="mt-8 flex">
            <Link href="/request-quote">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white transition-smooth px-8 rounded-full btn-hover-expand">
                {t('aiPowered.cta.button')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </AnimatedSection>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="container">
          <div className="max-w-4xl">
            <AnimatedSection animation="fade-in" className="mb-14">
              <p className="eyebrow mb-4">{t('about.subtitle')}</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">{t('about.title')}</h2>
              <p className="text-[17px] text-muted-foreground leading-relaxed max-w-2xl">{t('about.description')}</p>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
              <AnimatedSection animation="slide-up" delay={0.06}>
                <Card className="card-editorial h-full">
                  <CardHeader>
                    <p className="font-mono text-[11px] tracking-widest uppercase text-primary mb-2">{t('about.vision.title')}</p>
                    <CardTitle className="text-xl tracking-tight">{t('about.vision.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-[15px]">{t('about.vision.content')}</p>
                  </CardContent>
                </Card>
              </AnimatedSection>

              <AnimatedSection animation="slide-up" delay={0.12}>
                <Card className="card-editorial h-full">
                  <CardHeader>
                    <p className="font-mono text-[11px] tracking-widest uppercase text-primary mb-2">{t('about.mission.title')}</p>
                    <CardTitle className="text-xl tracking-tight">{t('about.mission.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-[15px]">{t('about.mission.content')}</p>
                  </CardContent>
                </Card>
              </AnimatedSection>
            </div>

            <AnimatedSection animation="fade-in">
              <h3 className="mono-label mb-5">{t('about.values.title')}</h3>
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: TrendingUp,   label: t('about.values.innovation') },
                  { icon: MessageCircle, label: t('about.values.empathy') },
                  { icon: Clock,        label: t('about.values.efficiency') },
                  { icon: Leaf,         label: t('about.values.sustainability') },
                ].map((value, index) => {
                  const Icon = value.icon;
                  return (
                    <div key={index} className="inline-flex items-center gap-2.5 px-5 py-2.5 border border-border rounded-full text-[14.5px] font-medium hover:border-foreground/30 transition-smooth">
                      <Icon className="w-4 h-4 text-primary" />
                      {value.label}
                    </div>
                  );
                })}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-background border-t border-border">
        <div className="container">
          <div className="max-w-2xl">
            <AnimatedSection animation="fade-in" className="mb-12">
              <p className="eyebrow mb-4">{t('faq.subtitle')}</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">{t('faq.title')}</h2>
            </AnimatedSection>

            <Accordion type="single" collapsible className="border-t border-border">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-b border-border">
                  <AccordionTrigger className="text-left text-[18px] font-semibold tracking-tight hover:text-primary py-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-[15px] pb-6 leading-relaxed">
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
