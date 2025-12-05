import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  MessageCircle,
  Clock,
  Leaf,
  Target,
  Eye,
  Users,
  Shield,
  Zap,
  Heart,
  Award,
  Globe2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function About() {
  const { t } = useTranslation();

  const coreValues = [
    {
      icon: TrendingUp,
      title: t('about.values.innovation'),
      description: 'We continuously invest in technology and processes to deliver cutting-edge logistics solutions.',
    },
    {
      icon: MessageCircle,
      title: t('about.values.empathy'),
      description: 'Understanding our customers\' needs and building long-lasting relationships is at our core.',
    },
    {
      icon: Clock,
      title: t('about.values.efficiency'),
      description: 'Time is precious. We optimize every step to ensure your shipments arrive on time, every time.',
    },
    {
      icon: Leaf,
      title: t('about.values.sustainability'),
      description: 'We\'re committed to reducing our environmental impact through eco-friendly practices.',
    },
  ];

  const differentiators = [
    {
      icon: Shield,
      title: 'Reliability',
      description: 'Industry-leading on-time delivery rates with full insurance coverage.',
    },
    {
      icon: Zap,
      title: 'Speed',
      description: 'Same-day delivery across the UAE with real-time tracking updates.',
    },
    {
      icon: Heart,
      title: 'Care',
      description: 'Every package is handled with the utmost care and professionalism.',
    },
    {
      icon: Award,
      title: 'Excellence',
      description: 'Committed to exceeding expectations with world-class service standards.',
    },
  ];

  const timeline = [
    {
      year: 'Foundation',
      title: 'The Beginning',
      description: 'Started with a vision to revolutionize logistics in the UAE, focusing on speed and reliability.',
    },
    {
      year: 'Growth',
      title: 'Expanding Services',
      description: 'Added international shipping and freight forwarding to our portfolio.',
    },
    {
      year: 'Innovation',
      title: 'Technology First',
      description: 'Launched real-time tracking and automated booking systems for better customer experience.',
    },
    {
      year: 'Today',
      title: 'Your Trusted Partner',
      description: 'Serving businesses and individuals across the UAE with comprehensive delivery solutions.',
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          {/* Hero Section */}
          <AnimatedSection animation="fade-in" className="text-center mb-20 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Our Story</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('about.title')}</h1>
            <p className="text-xl text-muted-foreground mb-4">{t('about.subtitle')}</p>
            <p className="text-lg text-foreground/80 leading-relaxed">
              {t('about.description')} We believe that logistics should be simple, reliable, and accessible to everyone.
            </p>
          </AnimatedSection>

          {/* Vision & Mission Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20 max-w-5xl mx-auto">
            <AnimatedSection animation="slide-right">
              <Card className="glass-strong border-primary/30 h-full card-hover-lift">
                <CardHeader>
                  <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                    <Eye className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl text-primary">{t('about.vision.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {t('about.vision.content')}
                  </p>
                </CardContent>
              </Card>
            </AnimatedSection>

            <AnimatedSection animation="slide-left" delay={0.1}>
              <Card className="glass-strong border-secondary/30 h-full card-hover-lift">
                <CardHeader>
                  <div className="w-16 h-16 rounded-xl bg-secondary/20 flex items-center justify-center mb-4">
                    <Target className="w-8 h-8 text-secondary" />
                  </div>
                  <CardTitle className="text-2xl text-secondary">{t('about.mission.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {t('about.mission.content')}
                  </p>
                </CardContent>
              </Card>
            </AnimatedSection>
          </div>

          {/* Our Story Timeline */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Journey</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">How We Got Here</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From humble beginnings to becoming a trusted logistics partner
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="space-y-8">
                {timeline.map((item, index) => (
                  <AnimatedSection key={index} animation="slide-up" delay={index * 0.1}>
                    <div className="relative pl-8 border-l-2 border-primary/30">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary" />
                      <div className="glass-strong p-6 rounded-xl hover:glass transition-smooth">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-semibold">
                            {item.year}
                          </span>
                          <h3 className="text-xl font-bold">{item.title}</h3>
                        </div>
                        <p className="text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </AnimatedSection>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* Core Values */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.values.title')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                The principles that guide everything we do
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {coreValues.map((value, index) => {
                const Icon = value.icon;
                return (
                  <AnimatedSection key={index} animation="scale-in" delay={index * 0.1}>
                    <Card className="glass-strong border-border h-full text-center card-hover-lift">
                      <CardContent className="pt-8 pb-6">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Icon className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold mb-3">{value.title}</h3>
                        <p className="text-sm text-muted-foreground">{value.description}</p>
                      </CardContent>
                    </Card>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>

          {/* What Sets Us Apart */}
          <AnimatedSection animation="slide-up" className="mb-20">
            <Card className="glass-strong border-border overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="hidden lg:flex items-center justify-center p-12 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-150" />
                    <div className="relative glass-strong rounded-2xl p-8">
                      <Globe2 className="w-32 h-32 text-primary mx-auto" />
                    </div>
                  </div>
                </div>

                <CardContent className="p-8 lg:p-12 flex flex-col justify-center">
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">What Sets Us Apart</h2>
                  <p className="text-muted-foreground mb-8">
                    We're not just about moving packages from A to B. We're about building trust,
                    ensuring reliability, and delivering peace of mind with every shipment.
                  </p>

                  <div className="space-y-6">
                    {differentiators.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <div key={index} className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg mb-1">{item.title}</h4>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </div>
            </Card>
          </AnimatedSection>

          {/* Company Culture */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                <Heart className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Culture</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">More Than Just Logistics</h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                At PATHXPRESS, we believe in creating a workplace where innovation thrives,
                ideas are valued, and every team member is empowered to make a difference.
                Our culture is built on collaboration, continuous learning, and a shared commitment
                to excellence.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We're a diverse team of logistics professionals, tech enthusiasts, and customer
                service experts who share one common goal: making shipping seamless for everyone.
              </p>
            </div>
          </AnimatedSection>

          {/* CTA Section */}
          <AnimatedSection animation="scale-in">
            <div className="text-center py-16 px-6 rounded-2xl glass-strong max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Join Our Journey</h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Whether you're a business looking for a reliable logistics partner or an individual
                shipping a precious package, we're here for you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/request-quote">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth px-8 btn-hover-expand">
                    Get Started <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                    Contact Us
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
