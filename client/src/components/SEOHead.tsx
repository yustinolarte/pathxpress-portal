import { useEffect } from 'react';

interface SEOHeadProps {
    title: string;
    description: string;
    canonical: string;
    ogImage?: string;
    type?: 'website' | 'article';
    schema?: object | object[];
}

/**
 * SEO component that dynamically updates document head meta tags.
 * Use this on every public-facing page for optimal SEO.
 */
export default function SEOHead({
    title,
    description,
    canonical,
    ogImage = 'https://pathxpress.net/pathxpress-logo.png',
    type = 'website',
    schema,
}: SEOHeadProps) {
    useEffect(() => {
        // Update document title
        document.title = title;

        // Helper to update or create meta tags
        const setMeta = (name: string, content: string, property = false) => {
            const attr = property ? 'property' : 'name';
            let meta = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute(attr, name);
                document.head.appendChild(meta);
            }
            meta.content = content;
        };

        // Helper to update or create link tags
        const setLink = (rel: string, href: string) => {
            let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.rel = rel;
                document.head.appendChild(link);
            }
            link.href = href;
        };

        // Basic meta tags
        setMeta('description', description);

        // Canonical URL
        setLink('canonical', canonical);

        // Open Graph tags
        setMeta('og:title', title, true);
        setMeta('og:description', description, true);
        setMeta('og:url', canonical, true);
        setMeta('og:image', ogImage, true);
        setMeta('og:type', type, true);
        setMeta('og:site_name', 'PATHXPRESS', true);

        // Twitter Card tags
        setMeta('twitter:card', 'summary_large_image', true);
        setMeta('twitter:title', title, true);
        setMeta('twitter:description', description, true);
        setMeta('twitter:image', ogImage, true);

        // JSON-LD Schema
        if (schema) {
            // Remove existing schema scripts
            const existingSchemas = document.querySelectorAll('script[type="application/ld+json"][data-seo]');
            existingSchemas.forEach(el => el.remove());

            // Add new schema(s)
            const schemas = Array.isArray(schema) ? schema : [schema];
            schemas.forEach((s, index) => {
                const script = document.createElement('script');
                script.type = 'application/ld+json';
                script.setAttribute('data-seo', `schema-${index}`);
                script.textContent = JSON.stringify(s);
                document.head.appendChild(script);
            });
        }

        // Cleanup function
        return () => {
            const schemaScripts = document.querySelectorAll('script[type="application/ld+json"][data-seo]');
            schemaScripts.forEach(el => el.remove());
        };
    }, [title, description, canonical, ogImage, type, schema]);

    return null;
}

// Reusable schema definitions
export const PATHXPRESS_ORGANIZATION_SCHEMA = {
    '@context': 'https://schema.org',
    '@type': 'CourierService',
    name: 'PATHXPRESS',
    url: 'https://pathxpress.net',
    logo: 'https://pathxpress.net/pathxpress-logo.png',
    image: 'https://pathxpress.net/pathxpress-logo.png',
    description: 'AI-powered last mile delivery and COD courier services across UAE',
    areaServed: {
        '@type': 'Country',
        name: 'United Arab Emirates',
    },
    serviceType: [
        'Last Mile Delivery',
        'Same-Day Delivery',
        'Next-Day Delivery',
        'Cash on Delivery (COD)',
        'E-commerce Fulfillment',
    ],
    address: {
        '@type': 'PostalAddress',
        addressCountry: 'AE',
        addressLocality: 'Dubai',
        addressRegion: 'Dubai',
        streetAddress: 'Building A1, Dubai Silicon Oasis',
    },
    telephone: '+971 522803433',
    email: 'info@pathxpress.net',
    priceRange: '$$',
    openingHoursSpecification: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '00:00',
        closes: '23:59',
    },
};

export function createFAQSchema(faqs: { question: string; answer: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(faq => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
            },
        })),
    };
}

export function createBreadcrumbSchema(items: { name: string; url: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    };
}
