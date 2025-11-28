import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Linkedin, Instagram, Music2 } from 'lucide-react';
import { toast } from 'sonner';
import { APP_LOGO } from '@/const';

export default function Footer() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !email) {
      toast.error('Please fill in both phone and email');
      return;
    }
    // TODO: Implement newsletter subscription
    toast.success('Thank you for subscribing!');
    setPhone('');
    setEmail('');
  };

  return (
    <footer className="gradient-dark border-t border-border/50 mt-20">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <Link href="/">
              <img src={APP_LOGO} alt="PATHXPRESS" className="h-8 mb-4 cursor-pointer" />
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              {t('footer.description')}
            </p>
            <div className="flex gap-4">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-primary transition-smooth"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-primary transition-smooth"
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://tiktok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-primary transition-smooth"
                aria-label="TikTok"
              >
                <Music2 className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">{t('nav.services')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/services">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('services.sameDay.title')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/services">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('services.domestic.title')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/services">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('services.freight.title')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/services">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('services.latam.title')}
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('footer.legal.privacy')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/terms">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('footer.legal.terms')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/refund">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('footer.legal.refund')}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/accessibility">
                  <span className="hover:text-primary transition-smooth cursor-pointer">
                    {t('footer.legal.accessibility')}
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-semibold mb-4">{t('footer.newsletter.title')}</h4>
            <form onSubmit={handleNewsletterSubmit} className="space-y-3">
              <Input
                type="tel"
                placeholder={t('footer.newsletter.phone')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="bg-input border-border"
              />
              <Input
                type="email"
                placeholder={t('footer.newsletter.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-input border-border"
              />
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 transition-smooth"
              >
                {t('footer.newsletter.subscribe')}
              </Button>
            </form>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-border/50 text-center text-sm text-muted-foreground">
          <p>{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
