import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema, createBreadcrumbSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Calendar, Package, MapPin, Shield, CheckCircle2, Truck, ArrowRight } from 'lucide-react';

const faqs = [
    {
        question: 'What is the cutoff time for next-day delivery in UAE?',
        answer: 'For guaranteed next-day delivery across the UAE, packages must be picked up by 6 PM. Orders placed after this time will be delivered on the following business day.',
    },
    {
        question: 'Do you deliver to all Emirates?',
        answer: 'Yes, PATHXPRESS provides next-day delivery to all seven Emirates: Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, and Umm Al Quwain.',
    },
    {
        question: 'What is the maximum weight for next-day delivery?',
        answer: 'Our standard next-day delivery supports packages up to 30kg. For heavier shipments, please contact us for freight delivery options.',
    },
    {
        question: 'Can I get proof of delivery?',
        answer: 'Yes, all deliveries include digital proof of delivery with recipient signature, photo confirmation, and GPS location stamp.',
    },
    {
        question: 'Do you offer business accounts for regular shipments?',
        answer: 'Absolutely! Business accounts get priority pickup, volume discounts, dedicated account management, and access to our customer portal for easy order management.',
    },
];

export default function NextDayDeliveryUAE() {
    const schema = [
        PATHXPRESS_ORGANIZATION_SCHEMA,
        createFAQSchema(faqs),
        createBreadcrumbSchema([
            { name: 'Home', url: 'https://pathxpress.net/' },
            { name: 'Next-Day Delivery UAE', url: 'https://pathxpress.net/next-day-delivery-uae' },
        ]),
    ];

    return (
        <div className="min-h-screen">
            <SEOHead
                title="Next-Day Delivery UAE | Nationwide Courier Service | PATHXPRESS"
                description="Reliable next-day delivery across all UAE Emirates. PATHXPRESS offers affordable nationwide courier services with tracking, COD, and proof of delivery. Get started today!"
                canonical="https://pathxpress.net/next-day-delivery-uae"
                schema={schema}
            />
            <Header />

            {/* Hero Section */}
            <section className="pt-32 pb-16 gradient-dark">
                <div className="container">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">Nationwide Coverage</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            Next-Day Delivery Across the <span className="text-primary">UAE</span>
                        </h1>
                        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                            Reliable next-day courier service to all seven Emirates. Order before 6 PM,
                            receive tomorrow. Affordable rates with full tracking.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/request-quote">
                                <Button size="lg" className="bg-secondary hover:bg-secondary/90 glow-red-hover px-8">
                                    Get a Quote <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                            <Link href="/pricing">
                                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                                    View Rates
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Coverage Section */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        We Deliver to All Emirates
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 max-w-5xl mx-auto">
                        {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah', 'UAQ'].map((emirate) => (
                            <div key={emirate} className="glass-strong rounded-xl p-4 text-center">
                                <MapPin className="w-6 h-6 text-primary mx-auto mb-2" />
                                <span className="font-medium text-sm">{emirate}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-16 gradient-dark">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Why PATHXPRESS for Next-Day Delivery?
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Calendar, title: 'Guaranteed Next Day', description: 'Order by 6 PM, delivered tomorrow across UAE' },
                            { icon: MapPin, title: 'All 7 Emirates', description: 'Complete nationwide coverage including remote areas' },
                            { icon: Package, title: 'Full Tracking', description: 'GPS tracking from pickup to delivery' },
                            { icon: Shield, title: 'Insured Shipments', description: 'Full insurance coverage for your packages' },
                        ].map((benefit, index) => {
                            const Icon = benefit.icon;
                            return (
                                <Card key={index} className="glass-strong border-border hover:border-primary transition-smooth">
                                    <CardHeader>
                                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                                            <Icon className="w-6 h-6 text-primary" />
                                        </div>
                                        <CardTitle className="text-lg">{benefit.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">{benefit.description}</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Business Types */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Perfect For Your Business
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {[
                            { title: 'E-commerce Brands', description: 'Affordable nationwide shipping for online stores' },
                            { title: 'B2B Logistics', description: 'Inter-emirate business deliveries and supplies' },
                            { title: 'Retail Chains', description: 'Store-to-store and customer delivery solutions' },
                        ].map((item, index) => (
                            <div key={index} className="glass-strong rounded-xl p-6 text-center">
                                <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                                <p className="text-muted-foreground text-sm">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-16 gradient-dark">
                <div className="container">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                            Frequently Asked Questions
                        </h2>
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

            {/* CTA Section */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <div className="max-w-2xl mx-auto text-center">
                        <Truck className="w-12 h-12 text-primary mx-auto mb-6" />
                        <h2 className="text-3xl font-bold mb-4">Ship Across UAE Tomorrow</h2>
                        <p className="text-muted-foreground mb-8">
                            Get reliable next-day delivery to any location in the United Arab Emirates.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/request-quote">
                                <Button size="lg" className="bg-secondary hover:bg-secondary/90">
                                    Get Your Quote
                                </Button>
                            </Link>
                            <Link href="/contact">
                                <Button size="lg" variant="outline" className="border-primary text-primary">
                                    Contact Us
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Internal Links */}
            <section className="py-12 gradient-dark border-t border-border">
                <div className="container">
                    <div className="max-w-4xl mx-auto">
                        <h3 className="text-lg font-semibold mb-4">Related Services</h3>
                        <div className="flex flex-wrap gap-3">
                            <Link href="/same-day-delivery-dubai">
                                <span className="text-primary hover:underline cursor-pointer">Same-Day Delivery Dubai</span>
                            </Link>
                            <span className="text-muted-foreground">•</span>
                            <Link href="/cash-on-delivery-uae">
                                <span className="text-primary hover:underline cursor-pointer">COD Services UAE</span>
                            </Link>
                            <span className="text-muted-foreground">•</span>
                            <Link href="/ecommerce-last-mile-uae">
                                <span className="text-primary hover:underline cursor-pointer">E-commerce Last Mile</span>
                            </Link>
                            <span className="text-muted-foreground">•</span>
                            <Link href="/services">
                                <span className="text-primary hover:underline cursor-pointer">All Services</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
