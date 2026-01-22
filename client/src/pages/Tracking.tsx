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
import { Package, Loader2, AlertCircle, HelpCircle, MapPin, Calendar, Scale, Truck, CreditCard, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
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
                <div className="space-y-6">
                  {/* Status Card */}
                  <Card className="glass-strong border-primary/20 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-cyan-400" />
                    <CardHeader className="pb-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground uppercase tracking-widest mb-1">{t('tracking.shipmentNumber')}</p>
                          <CardTitle className="text-3xl md:text-4xl font-mono text-primary tracking-tight">{shipment.trackingId}</CardTitle>
                        </div>
                        <div className={`px-4 py-2 rounded-full border ${shipment.status === 'delivered' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                            shipment.status === 'canceled' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                              'bg-blue-500/10 border-blue-500/20 text-blue-500'
                          } flex items-center gap-2`}>
                          {shipment.status === 'delivered' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          <span className="font-semibold uppercase tracking-wide">{shipment.status.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border/50">
                        {/* Service */}
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                            <Truck className="w-4 h-4" />
                            <span className="text-xs uppercase font-medium">{t('tracking.serviceType')}</span>
                          </div>
                          <p className="font-semibold text-lg">{shipment.serviceType || '-'}</p>
                        </div>

                        {/* Weight */}
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                            <Scale className="w-4 h-4" />
                            <span className="text-xs uppercase font-medium">{t('tracking.weight')}</span>
                          </div>
                          <p className="font-semibold text-lg">{shipment.weight} <span className="text-sm font-normal">kg</span></p>
                        </div>

                        {/* Pieces */}
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                            <Package className="w-4 h-4" />
                            <span className="text-xs uppercase font-medium">Pieces</span>
                          </div>
                          <p className="font-semibold text-lg">{shipment.pieces || 1}</p>
                        </div>

                        {/* COD */}
                        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                            <CreditCard className="w-4 h-4" />
                            <span className="text-xs uppercase font-medium">COD Amount</span>
                          </div>
                          <p className="font-semibold text-lg">{shipment.codAmount ? `${shipment.codAmount} ${shipment.codCurrency}` : 'N/A'}</p>
                        </div>
                      </div>

                      {/* Addresses */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-border/50">
                        {shipment.pickupAddress && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              </div>
                              <span className="text-sm font-medium uppercase">{t('tracking.pickupAddress')}</span>
                            </div>
                            <p className="pl-8 text-foreground/90 leading-relaxed">{shipment.pickupAddress}</p>
                          </div>
                        )}
                        {shipment.deliveryAddress && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-primary">
                              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <MapPin className="w-3 h-3 text-primary" />
                              </div>
                              <span className="text-sm font-medium uppercase">{t('tracking.deliveryAddress')}</span>
                            </div>
                            <p className="pl-8 text-foreground/90 text-lg font-medium leading-relaxed">{shipment.deliveryAddress}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tracking Events Timeline */}
                  {shipment.trackingEvents && shipment.trackingEvents.length > 0 && (
                    <Card className="glass-strong border-border">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary" />
                          {t('tracking.history.title')}
                        </CardTitle>
                        <CardDescription>{t('tracking.history.subtitle')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="relative space-y-0">
                          {/* Vertical Line */}
                          <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />

                          {shipment.trackingEvents.map((event: any, index: number) => (
                            <div key={event.id} className="relative pl-12 pb-10 last:pb-0 group">
                              {/* Timeline dot */}
                              <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-background transition-transform group-hover:scale-110 ${index === 0 ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'
                                }`}>
                                {index === 0 ? <Truck className="w-4 h-4 text-primary-foreground" /> : <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />}
                              </div>

                              {/* Event card */}
                              <div className={`p-5 rounded-xl border transition-all duration-300 ${index === 0
                                  ? 'bg-primary/5 border-primary/20 shadow-sm'
                                  : 'bg-muted/10 border-border/50 hover:bg-muted/20'
                                }`}>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                  <h4 className={`font-bold text-lg ${index === 0 ? 'text-primary' : ''}`}>
                                    {event.statusLabel}
                                  </h4>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 px-2 py-1 rounded">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(event.eventDatetime).toLocaleString('en-AE', { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>

                                {event.location && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
                                    <MapPin className="w-3.5 h-3.5" /> {event.location}
                                  </p>
                                )}

                                {event.description && (
                                  <p className="text-foreground/90">{event.description}</p>
                                )}

                                {/* Embedded POD Image */}
                                {event.podFileUrl && (
                                  <div className="mt-4 animate-fade-in">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-500" /> Proof of Delivery
                                    </p>
                                    <div className="relative group/image overflow-hidden rounded-lg border border-border max-w-sm">
                                      <img
                                        src={event.podFileUrl}
                                        alt="Proof of Delivery"
                                        className="w-full h-auto object-cover transition-transform duration-500 group-hover/image:scale-105 cursor-zoom-in"
                                        onClick={() => window.open(event.podFileUrl, '_blank')}
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors pointer-events-none" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
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
