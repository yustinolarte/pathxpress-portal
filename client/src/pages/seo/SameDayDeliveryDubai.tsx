import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema, createBreadcrumbSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Clock, Package, MapPin, CreditCard, CheckCircle2, Truck, ArrowRight } from 'lucide-react';

const faqs = [
    {
        question: 'How fast is same-day delivery in Dubai?',
        answer: 'PATHXPRESS offers same-day delivery within Dubai with pickup before 2 PM and delivery by 9 PM. For urgent shipments, we also offer express 4-hour delivery windows in select areas.',
    },
    {
        question: 'What areas in Dubai do you cover for same-day delivery?',
        answer: 'We cover all major areas in Dubai including Downtown Dubai, Dubai Marina, JBR, Business Bay, DIFC, Jumeirah, Al Barsha, Dubai Silicon Oasis, and all other residential and commercial areas.',
    },
    {
        question: 'Can I track my same-day delivery in real-time?',
        answer: 'Yes, all PATHXPRESS deliveries include real-time GPS tracking. You will receive live updates via SMS and can track your shipment on our website or through our customer portal.',
    },
    {
        question: 'Do you offer COD (Cash on Delivery) for same-day orders?',
        answer: 'Absolutely! We support COD for all same-day deliveries in Dubai. Payment is collected upon delivery and remitted to your account within 24-48 hours.',
    },
    {
        question: 'What is the cost of same-day delivery in Dubai?',
        answer: 'Same-day delivery rates in Dubai start from AED 15 for standard packages. Pricing depends on package size, weight, and pickup/delivery locations. Request a quote for exact pricing.',
    },
    {
        question: 'How do I schedule a same-day pickup?',
        answer: 'You can schedule a pickup through our website, call us at +971 522803433, or email info@pathxpress.net. For business accounts, use our customer portal for instant pickup scheduling.',
    },
];

export default function SameDayDeliveryDubai() {
    const schema = [
        PATHXPRESS_ORGANIZATION_SCHEMA,
        createFAQSchema(faqs),
        createBreadcrumbSchema([
            { name: 'Home', url: 'https://pathxpress.net/' },
            { name: 'Same-Day Delivery Dubai', url: 'https://pathxpress.net/same-day-delivery-dubai' },
        ]),
    ];

    return (
        <div className="min-h-screen">
            <SEOHead
                title="Same-Day Delivery Dubai | Fast Courier Service | PATHXPRESS"
                description="Need same-day delivery in Dubai? PATHXPRESS offers reliable express courier services with real-time tracking, COD support, and delivery within hours. Get a quote now!"
                canonical="https://pathxpress.net/same-day-delivery-dubai"
                schema={schema}
            />
            <Header />

            {/* Hero Section */}
            <section className="pt-32 pb-16 gradient-dark">
                <div className="container">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                            <Clock className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">Express Delivery</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            Same-Day Delivery in <span className="text-primary">Dubai</span>
                        </h1>
                        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                            Fast, reliable same-day courier service across Dubai. Pickup before 2 PM, delivery by 9 PM.
                            Real-time tracking and COD support included.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/request-quote">
                                <Button size="lg" className="bg-secondary hover:bg-secondary/90 glow-red-hover px-8">
                                    Get a Quote <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                            <Link href="/request-pickup">
                                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                                    Schedule Pickup
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Why Choose PATHXPRESS for Same-Day Delivery?
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Clock, title: 'Delivery by 9 PM', description: 'Guaranteed same-day delivery for pickups before 2 PM' },
                            { icon: MapPin, title: 'All Dubai Areas', description: 'Complete coverage across Dubai including free zones' },
                            { icon: Package, title: 'Real-Time Tracking', description: 'GPS tracking and SMS updates for every shipment' },
                            { icon: CreditCard, title: 'COD Available', description: 'Cash on Delivery with fast remittance to your account' },
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

            {/* How It Works */}
            <section className="py-16 gradient-dark">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        How Same-Day Delivery Works
                    </h2>
                    <div className="max-w-3xl mx-auto">
                        <div className="space-y-6">
                            {[
                                { step: '1', title: 'Request Pickup', description: 'Schedule online, call, or use our portal. Tell us pickup address and package details.' },
                                { step: '2', title: 'We Collect Your Package', description: 'Our driver arrives at your location within the scheduled window.' },
                                { step: '3', title: 'Real-Time Tracking', description: 'Track your shipment live. Receive SMS updates at every milestone.' },
                                { step: '4', title: 'Same-Day Delivery', description: 'Package delivered to your customer with proof of delivery and optional COD collection.' },
                            ].map((item, index) => (
                                <div key={index} className="flex gap-4 items-start">
                                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                        <span className="font-bold text-white">{item.step}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                                        <p className="text-muted-foreground">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Ideal For Section */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Ideal For
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {[
                            { title: 'E-commerce Stores', description: 'Delight customers with same-day delivery for online orders' },
                            { title: 'Restaurants & F&B', description: 'Time-sensitive food and beverage deliveries' },
                            { title: 'Documents & Parcels', description: 'Urgent document delivery for businesses and individuals' },
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
                        <h2 className="text-3xl font-bold mb-4">Ready for Same-Day Delivery?</h2>
                        <p className="text-muted-foreground mb-8">
                            Join hundreds of businesses in Dubai using PATHXPRESS for reliable same-day courier services.
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
                        <p className="text-sm text-muted-foreground mt-6">
                            Call us: <a href="tel:+971522803433" className="text-primary hover:underline">+971 522803433</a> |
                            Email: <a href="mailto:info@pathxpress.net" className="text-primary hover:underline">info@pathxpress.net</a>
                        </p>
                    </div>
                </div>
            </section>

            {/* Internal Links */}
            <section className="py-12 gradient-dark border-t border-border">
                <div className="container">
                    <div className="max-w-4xl mx-auto">
                        <h3 className="text-lg font-semibold mb-4">Related Services</h3>
                        <div className="flex flex-wrap gap-3">
                            <Link href="/next-day-delivery-uae">
                                <span className="text-primary hover:underline cursor-pointer">Next-Day Delivery UAE</span>
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
