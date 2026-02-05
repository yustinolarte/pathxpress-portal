import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import SEOHead, { createBreadcrumbSchema } from '@/components/SEOHead';
import RouteSimulation from '@/components/RouteSimulation';
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
  ArrowRight,
  Brain,
  Cpu,
  TrafficCone,
  RefreshCw,
  BarChart3,
  GitBranch,
  CloudSun,
  Check,
  X,
  CalendarClock,
  Route,
  Fuel,
  MapPin,
  Package,
  Radio,
  Database,
  Navigation
} from 'lucide-react';

export default function About() {
  const { t } = useTranslation();

  const coreValues = [
    {
      icon: TrendingUp,
      title: t('about.values.innovation'),
      description: t('about.values.innovationDesc'),
    },
    {
      icon: MessageCircle,
      title: t('about.values.empathy'),
      description: t('about.values.empathyDesc'),
    },
    {
      icon: Clock,
      title: t('about.values.efficiency'),
      description: t('about.values.efficiencyDesc'),
    },
    {
      icon: Leaf,
      title: t('about.values.sustainability'),
      description: t('about.values.sustainabilityDesc'),
    },
  ];

  const differentiators = [
    {
      icon: Shield,
      title: t('about.differentiators.reliability.title'),
      description: t('about.differentiators.reliability.description'),
    },
    {
      icon: Zap,
      title: t('about.differentiators.speed.title'),
      description: t('about.differentiators.speed.description'),
    },
    {
      icon: Heart,
      title: t('about.differentiators.care.title'),
      description: t('about.differentiators.care.description'),
    },
    {
      icon: Award,
      title: t('about.differentiators.excellence.title'),
      description: t('about.differentiators.excellence.description'),
    },
  ];

  const timeline = [
    {
      year: t('about.timeline.foundation.year'),
      title: t('about.timeline.foundation.title'),
      description: t('about.timeline.foundation.description'),
    },
    {
      year: t('about.timeline.growth.year'),
      title: t('about.timeline.growth.title'),
      description: t('about.timeline.growth.description'),
    },
    {
      year: t('about.timeline.innovation.year'),
      title: t('about.timeline.innovation.title'),
      description: t('about.timeline.innovation.description'),
    },
    {
      year: t('about.timeline.today.year'),
      title: t('about.timeline.today.title'),
      description: t('about.timeline.today.description'),
    },
  ];

  const howWeAchieveItems = [
    {
      icon: Radio,
      title: t('about.howWeAchieve.realTimeData.title'),
      description: t('about.howWeAchieve.realTimeData.description'),
    },
    {
      icon: Brain,
      title: t('about.howWeAchieve.mlAlgorithms.title'),
      description: t('about.howWeAchieve.mlAlgorithms.description'),
    },
    {
      icon: Database,
      title: t('about.howWeAchieve.clusterOptimization.title'),
      description: t('about.howWeAchieve.clusterOptimization.description'),
    },
    {
      icon: Navigation,
      title: t('about.howWeAchieve.dynamicRerouting.title'),
      description: t('about.howWeAchieve.dynamicRerouting.description'),
    },
  ];

  const comparisonRows = [
    { icon: TrafficCone, feature: t('about.comparison.trafficAnalysis'), traditional: false, ai: true },
    { icon: Brain, feature: t('about.comparison.predictiveML'), traditional: false, ai: true },
    { icon: CalendarClock, feature: t('about.comparison.deliveryWindows'), traditional: false, ai: true },
    { icon: RefreshCw, feature: t('about.comparison.dynamicReopt'), traditional: false, ai: true },
    { icon: BarChart3, feature: t('about.comparison.multiObjective'), traditional: false, ai: true },
    { icon: CloudSun, feature: t('about.comparison.weatherFactors'), traditional: false, ai: true },
    { icon: TrendingUp, feature: t('about.comparison.patternLearning'), traditional: false, ai: true },
  ];

  return (
    <div className="min-h-screen">
      <SEOHead
        title="About PATHXPRESS | AI-Powered Logistics Company in UAE"
        description="Learn about PATHXPRESS - UAE's AI-powered delivery company. Our innovative technology delivers faster, more affordable logistics services across Dubai and all Emirates."
        canonical="https://pathxpress.net/about"
        schema={createBreadcrumbSchema([
          { name: 'Home', url: 'https://pathxpress.net/' },
          { name: 'About', url: 'https://pathxpress.net/about' },
        ])}
      />
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container">
          {/* Hero Section */}
          <AnimatedSection animation="fade-in" className="text-center mb-20 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">{t('about.hero.badge')}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">{t('about.title')}</h1>
            <p className="text-xl text-muted-foreground mb-4">{t('about.subtitle')}</p>
            <p className="text-lg text-foreground/80 leading-relaxed">
              {t('about.description')} {t('about.hero.extendedDescription')}
            </p>
          </AnimatedSection>

          {/* 1. Vision & Mission Cards */}
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

          {/* 2. Our Story Timeline */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">{t('about.timeline.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.timeline.title')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('about.timeline.subtitle')}
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

          {/* 3. Core Values */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.values.title')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('about.values.subtitle')}
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

          {/* 4. Route Simulation - Interactive Demo */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <RouteSimulation />
          </AnimatedSection>

          {/* 5. Comparison Table */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <BarChart3 className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium text-secondary">{t('about.comparison.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('about.comparison.title')}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('about.comparison.subtitle')}
              </p>
            </div>

            <div className="glass-strong rounded-2xl overflow-hidden border border-border max-w-4xl mx-auto">
              {/* Table Header */}
              <div className="grid grid-cols-3 bg-background/50 border-b border-border">
                <div className="p-4 md:p-5 font-semibold text-sm uppercase tracking-wide text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4" /> {t('about.comparison.feature')}
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  {t('about.comparison.traditional')}
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-secondary">
                  PATHXPRESS
                </div>
              </div>

              {/* Table Rows */}
              {comparisonRows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <div key={index} className="grid grid-cols-3 border-b border-border/50 last:border-b-0 hover:bg-white/5 transition-colors">
                    <div className="p-4 md:p-5 flex items-center gap-3 text-foreground">
                      <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm md:text-base">{row.feature}</span>
                    </div>
                    <div className="p-4 md:p-5 flex items-center justify-center">
                      {row.traditional ? (
                        <Check className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <X className="w-5 h-5 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="p-4 md:p-5 flex items-center justify-center">
                      <Check className="w-5 h-5 text-secondary" />
                    </div>
                  </div>
                );
              })}
            </div>
          </AnimatedSection>

          {/* 6. AI Technology Features Grid */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Cpu className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium text-secondary">{t('aiPowered.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('aiPowered.title')}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('aiPowered.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: TrafficCone, title: t('aiPowered.smartRoutes.title'), description: t('aiPowered.smartRoutes.description') },
                { icon: Brain, title: t('aiPowered.demandPrediction.title'), description: t('aiPowered.demandPrediction.description') },
                { icon: Cpu, title: t('aiPowered.automation.title'), description: t('aiPowered.automation.description') },
                { icon: BarChart3, title: t('aiPowered.pricing.title'), description: t('aiPowered.pricing.description') },
              ].map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <AnimatedSection key={index} animation="scale-in" delay={index * 0.05}>
                    <Card className="glass-strong border-border h-full text-center card-hover-lift hover:border-secondary/50 transition-all">
                      <CardContent className="pt-8 pb-6">
                        <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                          <Icon className="w-7 h-7 text-secondary" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </CardContent>
                    </Card>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>

          {/* 7. How We Achieve This - NEW Section */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{t('about.howWeAchieve.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('about.howWeAchieve.title')}
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {t('about.howWeAchieve.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {howWeAchieveItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <AnimatedSection key={index} animation="slide-up" delay={index * 0.1}>
                    <Card className="glass-strong border-primary/20 h-full card-hover-lift">
                      <CardContent className="p-6 flex items-start gap-4">
                        <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-7 h-7 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </AnimatedSection>
                );
              })}
            </div>
          </AnimatedSection>

          {/* 8. Company Culture */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                <Heart className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">{t('about.culture.badge')}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('about.culture.title')}</h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                {t('about.culture.description1')}
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {t('about.culture.description2')}
              </p>
            </div>
          </AnimatedSection>

          {/* 9. CTA Section */}
          <AnimatedSection animation="scale-in">
            <div className="text-center py-16 px-6 rounded-2xl glass-strong max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('about.cta.title')}</h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                {t('about.cta.description')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/request-quote">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth px-8 btn-hover-expand">
                    {t('about.cta.getStarted')} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                    {t('about.cta.contactUs')}
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
