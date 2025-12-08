import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnimatedSection from '@/components/AnimatedSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Package, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function Tracking() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [trackingId, setTrackingId] = useState('');
  const [searchId, setSearchId] = useState('');

  const { data: shipment, isLoading, error } = trpc.tracking.getByTrackingId.useQuery(
    { trackingId: searchId },
    { enabled: !!searchId && /^PX\d+$/.test(searchId) }
  );

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingId) {
      toast.error('Please enter a tracking ID');
      return;
    }
    if (!/^PX\d+$/.test(trackingId)) {
      toast.error('Invalid tracking ID format. Use format: PX00001 or PX202500001');
      return;
    }
    setSearchId(trackingId);
  };

  // Parse URL query parameter on mount
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setTrackingId(id);
      if (/^PX\d+$/.test(id)) {
        setSearchId(id);
      }
    }
  });

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container max-w-4xl">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('tracking.title')}</h1>
            <p className="text-xl text-muted-foreground">{t('tracking.subtitle')}</p>
          </div>

          {/* Tracking Form */}
          <Card className="glass-strong border-border mb-8 animate-slide-up">
            <CardContent className="pt-6">
              <form onSubmit={handleTrack} className="flex flex-col md:flex-row gap-4">
                <Input
                  type="text"
                  placeholder={t('tracking.placeholder')}
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                  className="flex-1 bg-input border-border text-lg h-14"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-14 px-8 bg-primary hover:bg-primary/90 glow-blue-hover transition-smooth"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {t('tracking.loading')}
                    </>
                  ) : (
                    t('tracking.trackButton')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Results */}
          {searchId && (
            <div className="animate-fade-in">
              {isLoading && (
                <Card className="glass-strong border-border">
                  <CardContent className="py-12 text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                    <p className="text-muted-foreground">{t('tracking.searching')}</p>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card className="glass-strong border-destructive">
                  <CardContent className="py-12 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
                    <h3 className="text-xl font-semibold mb-2 text-destructive">
                      {t('tracking.notFound')}
                    </h3>
                    <p className="text-muted-foreground">
                      {error.message || t('tracking.error')}
                    </p>
                  </CardContent>
                </Card>
              )}

              {shipment && !isLoading && (
                <>
                  <Card className="glass-strong border-primary mb-6">
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                          <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl">{shipment.trackingId}</CardTitle>
                          <CardDescription className="text-lg">
                            {t('tracking.status')}: <span className="text-primary font-semibold">{shipment.status}</span>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {shipment.pickupAddress && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-1">{t('tracking.pickupAddress')}</h4>
                          <p className="text-foreground">{shipment.pickupAddress}</p>
                        </div>
                      )}
                      {shipment.deliveryAddress && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-1">{t('tracking.deliveryAddress')}</h4>
                          <p className="text-foreground">{shipment.deliveryAddress}</p>
                        </div>
                      )}
                      {shipment.serviceType && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-1">{t('tracking.serviceType')}</h4>
                          <p className="text-foreground">{shipment.serviceType}</p>
                        </div>
                      )}
                      {shipment.weight && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-1">{t('tracking.weight')}</h4>
                          <p className="text-foreground">{shipment.weight}</p>
                        </div>
                      )}
                      <div className="pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                          {t('tracking.lastUpdated')}: {new Date(shipment.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tracking Events Timeline */}
                  {shipment.trackingEvents && shipment.trackingEvents.length > 0 && (
                    <Card className="glass-strong border-border">
                      <CardHeader>
                        <CardTitle>{t('tracking.history.title')}</CardTitle>
                        <CardDescription>{t('tracking.history.subtitle')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="relative space-y-6">
                          {/* Timeline line */}
                          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

                          {shipment.trackingEvents.map((event: any, index: number) => (
                            <div key={event.id} className="relative pl-10 pb-6 last:pb-0">
                              {/* Timeline dot */}
                              <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${index === 0 ? 'bg-primary' : 'bg-muted'
                                }`}>
                                <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-primary-foreground' : 'bg-muted-foreground'
                                  }`} />
                              </div>

                              {/* Event content */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <h4 className={`font-semibold ${index === 0 ? 'text-primary' : ''}`}>
                                    {event.statusLabel}
                                  </h4>
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(event.eventDatetime).toLocaleString()}
                                  </span>
                                </div>
                                {event.location && (
                                  <p className="text-sm text-muted-foreground">
                                    📍 {event.location}
                                  </p>
                                )}
                                {event.description && (
                                  <p className="text-sm text-foreground">
                                    {event.description}
                                  </p>
                                )}
                                {event.podFileUrl && (
                                  <a
                                    href={event.podFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    📄 {t('tracking.viewPod')}
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* FAQ Section */}
          <AnimatedSection animation="slide-up" className="mt-16">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                <HelpCircle className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{t('tracking.faq.badge')}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">{t('tracking.faq.title')}</h2>
              <p className="text-muted-foreground">{t('tracking.faq.subtitle')}</p>
            </div>

            <Card className="glass-strong border-border">
              <CardContent className="pt-6">
                <Accordion type="single" collapsible className="space-y-2">
                  <AccordionItem value="item-1" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q1.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t('tracking.faq.q1.answer')}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q2.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t('tracking.faq.q2.answer')}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-3" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q3.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground whitespace-pre-line">
                      {t('tracking.faq.q3.answer')}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-4" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q4.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t('tracking.faq.q4.answer')}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-5" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q5.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t('tracking.faq.q5.answer')}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-6" className="border-border rounded-lg px-4">
                    <AccordionTrigger className="text-left font-semibold hover:text-primary">
                      {t('tracking.faq.q6.question')}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {t('tracking.faq.q6.answer')}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </AnimatedSection>
        </div>
      </main>

      <Footer />
    </div>
  );
}
