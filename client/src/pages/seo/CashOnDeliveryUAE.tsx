import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema, createBreadcrumbSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Banknote, Package, Shield, Clock, CheckCircle2, Truck, ArrowRight, CreditCard } from 'lucide-react';

const faqs = [
    {
        question: 'How does Cash on Delivery (COD) work with PATHXPRESS?',
        answer: 'Our driver collects the payment from your customer upon delivery. We accept cash and card payments. The collected amount is remitted to your bank account within 24-48 hours after successful delivery.',
    },
    {
        question: 'What is the COD fee?',
        answer: 'Our COD fee is competitive and based on the collected amount. Contact us for exact pricing based on your expected volume. Volume discounts are available for high-volume merchants.',
    },
    {
        question: 'Can customers pay by card at the door?',
        answer: 'Yes! Our drivers are equipped with portable POS terminals that accept all major credit and debit cards including Visa, Mastercard, and local cards.',
    },
    {
        question: 'How quickly will I receive my COD remittance?',
        answer: 'Standard remittance is within 48 hours of successful delivery. Premium accounts can opt for daily remittance. All remittances include detailed reports.',
    },
    {
        question: 'What happens if the customer refuses delivery?',
        answer: 'If a customer refuses the package, we return it to your specified address at a reduced return fee. You can also opt for multiple delivery attempts before return.',
    },
    {
        question: 'Do you provide COD reports?',
        answer: 'Yes, all COD merchants receive detailed daily and monthly reports showing deliveries, collections, returns, and remittances. Access real-time data through our customer portal.',
    },
];

export default function CashOnDeliveryUAE() {
    const schema = [
        PATHXPRESS_ORGANIZATION_SCHEMA,
        createFAQSchema(faqs),
        createBreadcrumbSchema([
            { name: 'Home', url: 'https://pathxpress.net/' },
            { name: 'Cash on Delivery UAE', url: 'https://pathxpress.net/cash-on-delivery-uae' },
        ]),
    ];

    return (
        <div className="min-h-screen">
            <SEOHead
                title="Cash on Delivery UAE | COD Courier Service Dubai | PATHXPRESS"
                description="Reliable COD delivery service across UAE. PATHXPRESS offers cash on delivery with fast remittance, card payments at door, and full tracking. Perfect for e-commerce."
                canonical="https://pathxpress.net/cash-on-delivery-uae"
                schema={schema}
            />
            <Header />

            {/* Hero Section */}
            <section className="pt-32 pb-16 gradient-dark">
                <div className="container">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                            <Banknote className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">COD Services</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            Cash on Delivery <span className="text-primary">UAE</span>
                        </h1>
                        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                            Collect payments upon delivery across the UAE. Fast remittance, card payments at door,
                            and complete transparency for your e-commerce business.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/request-quote">
                                <Button size="lg" className="bg-secondary hover:bg-secondary/90 glow-red-hover px-8">
                                    Get Started <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                            <Link href="/contact">
                                <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8">
                                    Talk to Sales
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
                        Why PATHXPRESS COD?
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Banknote, title: 'Fast Remittance', description: '24-48 hour payment to your account after delivery' },
                            { icon: CreditCard, title: 'Cash + Card', description: 'Accept both cash and card payments at the door' },
                            { icon: Shield, title: 'Secure Collection', description: 'Trained drivers with secure cash handling protocols' },
                            { icon: Clock, title: 'Real-Time Reports', description: 'Track collections and remittances in our portal' },
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

            {/* How COD Works */}
            <section className="py-16 gradient-dark">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        How COD Works
                    </h2>
                    <div className="max-w-3xl mx-auto">
                        <div className="space-y-6">
                            {[
                                { step: '1', title: 'Ship Your Order', description: 'Send us your package with COD amount specified.' },
                                { step: '2', title: 'We Deliver', description: 'Our driver delivers to your customer and collects payment.' },
                                { step: '3', title: 'Payment Collection', description: 'Customer pays by cash or card at the door.' },
                                { step: '4', title: 'Fast Remittance', description: 'Collected funds transferred to your account within 24-48 hours.' },
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

            {/* Ideal For */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Perfect for E-commerce
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {[
                            { title: 'Online Stores', description: 'Increase conversions by offering COD payment option' },
                            { title: 'Social Sellers', description: 'Instagram and social media businesses' },
                            { title: 'Marketplaces', description: 'Multi-vendor platforms needing COD fulfillment' },
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
                        <h2 className="text-3xl font-bold mb-4">Start Accepting COD Today</h2>
                        <p className="text-muted-foreground mb-8">
                            Join hundreds of UAE businesses using PATHXPRESS for reliable COD delivery services.
                        </p>
                        <Link href="/request-quote">
                            <Button size="lg" className="bg-secondary hover:bg-secondary/90">
                                Get Your Quote
                            </Button>
                        </Link>
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
                            <Link href="/next-day-delivery-uae">
                                <span className="text-primary hover:underline cursor-pointer">Next-Day Delivery UAE</span>
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
