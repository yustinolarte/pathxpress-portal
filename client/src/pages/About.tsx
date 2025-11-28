import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, MessageCircle, Clock, Leaf } from 'lucide-react';

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container max-w-4xl">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('about.title')}</h1>
            <p className="text-xl text-muted-foreground mb-8">{t('about.subtitle')}</p>
            <p className="text-lg text-foreground/80 leading-relaxed">{t('about.description')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 animate-slide-up">
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

          <div className="mt-12 text-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
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
      </main>

      <Footer />
    </div>
  );
}
