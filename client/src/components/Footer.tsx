import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Linkedin, Instagram, Music2 } from 'lucide-react';
import { toast } from 'sonner';
import { APP_LOGO, APP_LOGO_LIGHT } from '@/const';
import { useTheme } from '@/contexts/ThemeContext';

export default function Footer() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !email) {
      toast.error(t('footer.newsletter.error'));
      return;
    }
    // TODO: Implement newsletter subscription
    toast.success(t('footer.newsletter.success'));
    setPhone('');
    setEmail('');
  };

  return (
    <footer className="bg-background border-t border-border mt-20">
      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          {/* Company Info */}
          <div>
            <Link href="/">
              <img src={theme === 'dark' ? APP_LOGO : APP_LOGO_LIGHT} alt="PATHXPRESS" className="h-7 mb-5 w-auto cursor-pointer" width="128" height="28" />
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
              <a
                href="https://wa.me/971522803433"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-primary transition-smooth"
                aria-label="WhatsApp"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mono-label mb-5">{t('nav.services')}</h4>
            <ul className="space-y-3 text-[14.5px] text-muted-foreground">
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
            <h4 className="mono-label mb-5">Legal</h4>
            <ul className="space-y-3 text-[14.5px] text-muted-foreground">
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
            <h4 className="mono-label mb-5">{t('footer.newsletter.title')}</h4>
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
        <div className="pt-8 border-t border-border text-center text-[13px] text-muted-foreground">
          <p>{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
