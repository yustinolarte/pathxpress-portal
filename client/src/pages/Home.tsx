import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import FloatingParticles from '@/components/FloatingParticles';
import AnimatedSection from '@/components/AnimatedSection';
import MouseGradientText from '@/components/MouseGradientText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Package, Truck, Globe2, Plane, ShoppingCart, Clock, MapPin, MessageCircle, TrendingUp, Leaf, ChevronDown } from 'lucide-react';
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
        t('services.sameDay.point4'),
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

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center pt-20 relative overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src="/vid.mp4" type="video/mp4" />
        </video>

        {/* Dark Overlay with Glassmorphism effect */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm z-[1]"></div>

        {/* Floating Particles - reduced for performance */}
        <FloatingParticles count={8} color="mixed" />

        {/* Decorative Glow Elements - optimized */}
        <div className="absolute inset-0 z-[2] opacity-15 pointer-events-none">
          <div className="absolute top-20 left-10 w-64 h-64 bg-primary rounded-full blur-2xl"></div>
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-accent rounded-full blur-2xl"></div>
        </div>

        <div className="container relative z-[10]">
          <div className="max-w-4xl mx-auto text-center">
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
            <span className="text-sm font-medium">Scroll</span>
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

      {/* About Section */}
      <section className="py-20 gradient-dark">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">{t('about.title')}</h2>
              <p className="text-xl text-muted-foreground mb-8">{t('about.subtitle')}</p>
              <p className="text-lg text-foreground/80 leading-relaxed">{t('about.description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
              <Card className="glass-strong border-border">
                <CardHeader>
                  <CardTitle className="text-2xl text-primary">{t('about.vision.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t('about.vision.content')}</p>
                </CardContent>
              </Card>

              <Card className="glass-strong border-border">
                <CardHeader>
                  <CardTitle className="text-2xl text-primary">{t('about.mission.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{t('about.mission.content')}</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 text-center">
              <h3 className="text-2xl font-semibold mb-6">{t('about.values.title')}</h3>
              <div className="flex flex-wrap justify-center gap-4">
                {[
                  { icon: TrendingUp, label: t('about.values.innovation') },
                  { icon: MessageCircle, label: t('about.values.empathy') },
                  { icon: Clock, label: t('about.values.efficiency') },
                  { icon: Leaf, label: t('about.values.sustainability') },
                ].map((value, index) => {
                  const Icon = value.icon;
                  return (
                    <div
                      key={index}
                      className="glass-strong px-6 py-3 rounded-full flex items-center gap-2"
                    >
                      <Icon className="w-5 h-5 text-primary" />
                      <span className="font-medium">{value.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
