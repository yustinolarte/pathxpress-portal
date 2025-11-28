import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Menu, X, Globe } from 'lucide-react';
import { APP_LOGO } from '@/const';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Header() {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', i18n.language === 'ar' ? 'rtl' : 'ltr');
  }, [i18n.language]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const navItems = [
    { path: '/', label: t('nav.home') },
    { path: '/services', label: t('nav.services') },
    { path: '/about', label: t('nav.about') },
    { path: '/tracking', label: t('nav.tracking') },
    { path: '/request-pickup', label: t('nav.requestPickup') },
    { path: '/pricing', label: t('nav.rates') },
    { path: '/contact', label: t('nav.contact') },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isMenuOpen
          ? 'bg-background/90 backdrop-blur-xl shadow-lg'
          : isScrolled
            ? 'glass-strong shadow-lg'
            : 'bg-transparent'
        }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/">
            <img src={APP_LOGO} alt="PATHXPRESS" className="h-8 cursor-pointer" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <span
                  className={`text-sm font-medium transition-smooth hover:text-primary cursor-pointer ${location === item.path ? 'text-primary' : 'text-foreground/80'
                    }`}
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right side: Language Switcher + CTA Buttons */}
          <div className="hidden lg:flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Globe className="w-4 h-4" />
                  {i18n.language.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong">
                <DropdownMenuItem onClick={() => changeLanguage('en')}>
                  English (EN)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage('es')}>
                  Español (ES)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage('ar')}>
                  العربية (AR)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/customer-portal">
              <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
                {t('nav.customerPortal')}
              </Button>
            </Link>

            <Link href="/request-quote">
              <Button className="glow-red-hover transition-smooth bg-secondary hover:bg-secondary/90">
                {t('nav.requestQuote')}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden pb-6 animate-fade-in">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <span
                    className={`block py-2 text-sm font-medium transition-smooth hover:text-primary cursor-pointer ${location === item.path ? 'text-primary' : 'text-foreground/80'
                      }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </span>
                </Link>
              ))}

              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 w-full">
                      <Globe className="w-4 h-4" />
                      {i18n.language.toUpperCase()}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="glass-strong">
                    <DropdownMenuItem onClick={() => changeLanguage('en')}>
                      English (EN)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage('es')}>
                      Español (ES)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage('ar')}>
                      العربية (AR)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Link href="/customer-portal">
                  <Button
                    variant="outline"
                    className="w-full border-primary text-primary hover:bg-primary/10"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.customerPortal')}
                  </Button>
                </Link>

                <Link href="/request-quote">
                  <Button
                    className="w-full glow-red-hover transition-smooth bg-secondary hover:bg-secondary/90"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.requestQuote')}
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
