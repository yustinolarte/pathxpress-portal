import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import SEOHead, { createBreadcrumbSchema } from '@/components/SEOHead';
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
  Package
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

          {/* Core Values */}
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
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('about.differentiators.title')}</h2>
                  <p className="text-muted-foreground mb-8">
                    {t('about.differentiators.description')}
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

          {/* Savings/Results Banner - From Demo */}
          <AnimatedSection animation="scale-in" className="mb-20">
            <div className="glass-strong border-2 border-secondary/30 rounded-3xl p-8 md:p-12 text-center">
              <h2 className="text-xl md:text-2xl font-bold mb-8 flex items-center justify-center gap-3">
                <Target className="w-7 h-7 text-secondary" />
                <span>Resultados de la <span className="text-secondary">Optimización con IA</span></span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                {[
                  { value: '19 km', label: 'Km Ahorrados' },
                  { value: '33 min', label: 'Tiempo Ahorrado' },
                  { value: '3.7 L', label: 'Combustible Ahorrado' },
                  { value: '40%', label: 'Más Eficiente' },
                ].map((stat, index) => (
                  <div key={index} className="text-center">
                    <div className="text-3xl md:text-5xl font-black text-secondary mb-2">{stat.value}</div>
                    <div className="text-sm md:text-base text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          {/* Comparison Table - From Demo */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <BarChart3 className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium text-secondary">Comparación Detallada</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Diferencias <span className="text-secondary">Clave</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Diferencias clave entre optimizadores tradicionales y PATHXPRESS IA
              </p>
            </div>

            <div className="glass-strong rounded-2xl overflow-hidden border border-border max-w-4xl mx-auto">
              {/* Table Header */}
              <div className="grid grid-cols-3 bg-background/50 border-b border-border">
                <div className="p-4 md:p-5 font-semibold text-sm uppercase tracking-wide text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4" /> Característica
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  Tradicional
                </div>
                <div className="p-4 md:p-5 text-center font-semibold text-sm uppercase tracking-wide text-secondary">
                  PATHXPRESS
                </div>
              </div>

              {/* Table Rows */}
              {[
                { icon: TrafficCone, feature: 'Análisis de tráfico en tiempo real', traditional: false, ai: true },
                { icon: Brain, feature: 'Machine Learning predictivo', traditional: false, ai: true },
                { icon: CalendarClock, feature: 'Ventanas de tiempo de entrega', traditional: false, ai: true },
                { icon: RefreshCw, feature: 'Re-optimización dinámica', traditional: false, ai: true },
                { icon: BarChart3, feature: 'Optimización multi-objetivo', traditional: false, ai: true },
                { icon: CloudSun, feature: 'Factores climáticos', traditional: false, ai: true },
                { icon: TrendingUp, feature: 'Aprendizaje de patrones', traditional: false, ai: true },
              ].map((row, index) => {
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

          {/* AI Technology Features Grid - From Demo */}
          <AnimatedSection animation="fade-in" className="mb-20">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <Cpu className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium text-secondary">Tecnología de IA Avanzada</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Algoritmos de <span className="text-secondary">Última Generación</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Algoritmos de última generación para optimizar cada aspecto de tus entregas
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: TrafficCone, title: 'Tráfico en Tiempo Real', description: 'Evita congestionamientos y ajusta rutas dinámicamente.' },
                { icon: Brain, title: 'Algoritmos Predictivos', description: 'Machine Learning para predecir tiempos óptimos.' },
                { icon: CalendarClock, title: 'Ventanas de Tiempo', description: 'Respeta horarios preferidos por clientes.' },
                { icon: RefreshCw, title: 'Re-optimización', description: 'Actualiza rutas ante cambios o imprevistos.' },
                { icon: BarChart3, title: 'Multi-Objetivo', description: 'Optimiza distancia, tiempo y combustible.' },
                { icon: GitBranch, title: 'Clustering', description: 'Agrupa entregas cercanas inteligentemente.' },
                { icon: CloudSun, title: 'Clima', description: 'Considera condiciones meteorológicas.' },
                { icon: TrendingUp, title: 'Análisis Histórico', description: 'Aprende de cada ruta completada.' },
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

          {/* Company Culture */}
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

          {/* CTA Section */}
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
