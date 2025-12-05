import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
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
  PackageCheck
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
      title: 'Request a Quote',
      description: 'Fill out our simple form with your shipment details and get an instant quote.',
    },
    {
      step: 2,
      icon: PackageCheck,
      title: 'Schedule Pickup',
      description: 'Choose a convenient pickup time. Our driver will collect your package.',
    },
    {
      step: 3,
      icon: Truck,
      title: 'Track in Real-Time',
      description: 'Monitor your shipment with live tracking updates every step of the way.',
    },
    {
      step: 4,
      icon: MapPin,
      title: 'Delivered!',
      description: 'Your package arrives safely with proof of delivery confirmation.',
    },
  ];

  const benefits = [
    {
      icon: Clock,
      title: 'Fast Delivery',
      description: 'Same-day and next-day delivery options across the UAE.',
    },
    {
      icon: Shield,
      title: 'Secure Handling',
      description: 'Your packages are handled with care and fully insured.',
    },
    {
      icon: Headphones,
      title: '24/7 Support',
      description: 'Our team is always available via WhatsApp and phone.',
    },
    {
      icon: Zap,
      title: 'Real-Time Tracking',
      description: 'Track every movement of your shipment in real-time.',
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          {/* Hero Section */}
          <AnimatedSection animation="fade-in" className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Delivery Solutions</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('services.title')}</h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              {t('services.subtitle')}. From same-day express to international freight,
              we provide comprehensive logistics solutions tailored to your needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/request-quote">
                <Button size="lg" className="bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth btn-hover-expand">
                  Get Started <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </AnimatedSection>

          {/* Services Grid */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">What We Offer</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Choose from our range of delivery services designed to meet every shipping need
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
                <span className="text-sm font-medium text-accent">Simple Process</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Getting your package delivered is easy. Just follow these simple steps.
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

          {/* Benefits Section */}
          <AnimatedSection animation="slide-up" className="mb-20">
            <Card className="glass-strong border-border overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <CardContent className="p-8 lg:p-12 flex flex-col justify-center">
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">Why Choose PATHXPRESS?</h2>
                  <p className="text-muted-foreground mb-8">
                    We're not just another delivery company. We're your logistics partner,
                    committed to making shipping simple, reliable, and affordable.
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Ship?</h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Get started today and experience the fastest, most reliable delivery service in the UAE.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/request-quote">
                  <Button size="lg" className="bg-secondary hover:bg-secondary/90 glow-red-hover transition-smooth px-8 btn-hover-expand">
                    Request a Quote
                  </Button>
                </Link>
                <Link href="/request-pickup">
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                    Schedule Pickup
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
