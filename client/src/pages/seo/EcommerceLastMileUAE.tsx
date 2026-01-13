import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead, { PATHXPRESS_ORGANIZATION_SCHEMA, createFAQSchema, createBreadcrumbSchema } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ShoppingCart, Package, Zap, BarChart3, CheckCircle2, Truck, ArrowRight, Globe2 } from 'lucide-react';

const faqs = [
    {
        question: 'What is last-mile delivery for e-commerce?',
        answer: 'Last-mile delivery is the final step of the delivery process - from our hub to your customer\'s doorstep. PATHXPRESS specializes in this crucial phase, ensuring fast and reliable delivery for online orders.',
    },
    {
        question: 'How can PATHXPRESS help my e-commerce business?',
        answer: 'We provide end-to-end fulfillment including pickup from your warehouse, real-time tracking, same-day/next-day delivery, COD collection, and return handling. Our API integrates with major e-commerce platforms.',
    },
    {
        question: 'Do you integrate with Shopify, WooCommerce, and other platforms?',
        answer: 'Yes! We offer API integration and plugins for Shopify, WooCommerce, Magento, and other major e-commerce platforms. Our Shopify app allows automated order sync and waybill generation.',
    },
    {
        question: 'What are your delivery success rates?',
        answer: 'PATHXPRESS maintains a 98%+ first-attempt delivery success rate across the UAE. Our AI-powered route optimization and customer communication system ensures high delivery efficiency.',
    },
    {
        question: 'How do you handle returns?',
        answer: 'We offer seamless return logistics. When a customer initiates a return, we pickup from their location and return to your warehouse. Exchanges can also be handled in a single visit.',
    },
    {
        question: 'Do you offer warehousing and fulfillment?',
        answer: 'Yes, we offer complete fulfillment services including warehousing, pick-pack, and ship. Contact us for a custom fulfillment solution tailored to your business needs.',
    },
];

export default function EcommerceLastMileUAE() {
    const schema = [
        PATHXPRESS_ORGANIZATION_SCHEMA,
        createFAQSchema(faqs),
        createBreadcrumbSchema([
            { name: 'Home', url: 'https://pathxpress.net/' },
            { name: 'E-commerce Last Mile UAE', url: 'https://pathxpress.net/ecommerce-last-mile-uae' },
        ]),
    ];

    return (
        <div className="min-h-screen">
            <SEOHead
                title="E-commerce Last Mile Delivery UAE | Fulfillment Services | PATHXPRESS"
                description="Complete e-commerce delivery solutions in UAE. PATHXPRESS offers last-mile delivery, COD, returns handling, and platform integrations for online stores. Scale your business."
                canonical="https://pathxpress.net/ecommerce-last-mile-uae"
                schema={schema}
            />
            <Header />

            {/* Hero Section */}
            <section className="pt-32 pb-16 gradient-dark">
                <div className="container">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                            <ShoppingCart className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">E-commerce Solutions</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6">
                            E-commerce Last Mile <span className="text-primary">UAE</span>
                        </h1>
                        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                            Complete delivery solution for online stores. From pickup to doorstep,
                            with COD, returns handling, and seamless platform integration.
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

            {/* Features Section */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Complete E-commerce Delivery Stack
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: Zap, title: 'Same-Day Delivery', description: 'Delight customers with fast delivery in Dubai' },
                            { icon: Package, title: 'COD Collection', description: 'Cash and card payment collection at door' },
                            { icon: Globe2, title: 'UAE-Wide Coverage', description: 'Deliver to all Emirates nationwide' },
                            { icon: BarChart3, title: 'Analytics Dashboard', description: 'Real-time tracking and performance insights' },
                        ].map((feature, index) => {
                            const Icon = feature.icon;
                            return (
                                <Card key={index} className="glass-strong border-border hover:border-primary transition-smooth">
                                    <CardHeader>
                                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                                            <Icon className="w-6 h-6 text-primary" />
                                        </div>
                                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">{feature.description}</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Platform Integrations */}
            <section className="py-16 gradient-dark">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">
                        Platform Integrations
                    </h2>
                    <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
                        Connect your store with PATHXPRESS for automated order sync, waybill generation, and tracking updates.
                    </p>
                    <div className="flex flex-wrap justify-center gap-6">
                        {['Shopify', 'WooCommerce', 'Magento', 'Custom API'].map((platform) => (
                            <div key={platform} className="glass-strong rounded-xl px-8 py-4 text-center">
                                <span className="font-semibold">{platform}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Why Choose Us */}
            <section className="py-16 bg-card/30">
                <div className="container">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
                        Why E-commerce Brands Choose Us
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {[
                            { title: '98% Success Rate', description: 'Industry-leading first-attempt delivery rate' },
                            { title: 'AI-Powered Routing', description: 'Optimized routes for faster deliveries' },
                            { title: 'Transparent Pricing', description: 'No hidden fees, volume discounts available' },
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
                        <h2 className="text-3xl font-bold mb-4">Scale Your E-commerce Delivery</h2>
                        <p className="text-muted-foreground mb-8">
                            Partner with PATHXPRESS and focus on growing your business while we handle logistics.
                        </p>
                        <Link href="/request-quote">
                            <Button size="lg" className="bg-secondary hover:bg-secondary/90">
                                Get Custom Quote
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
                            <Link href="/cash-on-delivery-uae">
                                <span className="text-primary hover:underline cursor-pointer">COD Services UAE</span>
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
