import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LegalPageProps {
  title: string;
  content: string;
}

export function LegalPage({ title, content }: LegalPageProps) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-32 pb-20 gradient-dark min-h-screen">
        <div className="container max-w-4xl">
          <Card className="glass-strong border-border animate-fade-in">
            <CardHeader>
              <CardTitle className="text-3xl">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {content}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      content={`Last updated: January 2025

PATHXPRESS FZCO ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our logistics services.

Information We Collect
We collect information that you provide directly to us, including:
- Name, email address, and phone number
- Pickup and delivery addresses
- Shipment details and preferences
- Payment information

How We Use Your Information
We use the information we collect to:
- Process and fulfill your shipment requests
- Communicate with you about your shipments
- Improve our services
- Comply with legal obligations

Data Security
We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

Contact Us
If you have questions about this Privacy Policy, please contact us at info@pathxpress.net`}
    />
  );
}

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      content={`Last updated: January 2025

Welcome to PATHXPRESS FZCO. By using our services, you agree to these Terms of Service.

Service Description
PATHXPRESS provides logistics and delivery services in the UAE and internationally, including same-day delivery, domestic shipping, freight brokerage, and last-mile delivery for e-commerce.

User Responsibilities
You agree to:
- Provide accurate shipment information
- Ensure packages comply with shipping regulations
- Pay for services as agreed
- Not use our services for illegal purposes

Liability
PATHXPRESS will make reasonable efforts to deliver shipments on time. However, we are not liable for delays caused by circumstances beyond our control.

Pricing
Prices are subject to change. Custom quotes are valid for 30 days unless otherwise specified.

Contact
For questions about these Terms, contact us at info@pathxpress.net`}
    />
  );
}

export function Refund() {
  return (
    <LegalPage
      title="Refund Policy"
      content={`Last updated: January 2025

PATHXPRESS FZCO is committed to customer satisfaction. This Refund Policy outlines our approach to refunds and cancellations.

Cancellation Policy
- Same-day delivery: Cancellations accepted up to 2 hours before scheduled pickup
- Domestic/International: Cancellations accepted up to 24 hours before scheduled pickup
- Cancellation fees may apply based on service type

Refund Eligibility
Refunds may be issued in the following cases:
- Service not delivered as promised
- Significant delays caused by PATHXPRESS
- Damaged shipments (subject to investigation)

Refund Process
To request a refund:
1. Contact us at info@pathxpress.net within 7 days of service
2. Provide your tracking ID and reason for refund
3. We will review and respond within 5 business days

Refund Method
Approved refunds will be processed to the original payment method within 10-14 business days.

Contact
For refund inquiries, email info@pathxpress.net or call +971 52 280 3433`}
    />
  );
}

export function Accessibility() {
  return (
    <LegalPage
      title="Accessibility Statement"
      content={`Last updated: January 2025

PATHXPRESS FZCO is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.

Measures to Support Accessibility
PATHXPRESS takes the following measures to ensure accessibility:
- Include accessibility as part of our mission statement
- Integrate accessibility into our procurement practices
- Provide continual accessibility training for our staff

Conformance Status
We aim to conform to WCAG 2.1 Level AA standards. Our website includes:
- Clear navigation structure
- Keyboard navigation support
- Screen reader compatibility
- Sufficient color contrast
- Resizable text without loss of functionality

Feedback
We welcome your feedback on the accessibility of our website. Please contact us:
- Email: info@pathxpress.net
- Phone: +971 52 280 3433

We aim to respond to accessibility feedback within 5 business days.

Compatibility
Our website is designed to be compatible with:
- Recent versions of major browsers (Chrome, Firefox, Safari, Edge)
- Screen readers (JAWS, NVDA, VoiceOver)
- Mobile devices and tablets

Technical Specifications
This website relies on the following technologies:
- HTML5
- CSS3
- JavaScript
- ARIA attributes for enhanced accessibility`}
    />
  );
}
