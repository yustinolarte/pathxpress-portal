import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Menu, X, Globe, Sun, Moon } from 'lucide-react';
import { APP_LOGO, APP_LOGO_LIGHT } from '@/const';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${isMenuOpen
        ? 'bg-card border-border'
        : isScrolled
          ? 'bg-card/95 backdrop-blur-md border-border'
          : 'bg-transparent border-transparent'
        }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-[76px]">
          {/* Logo */}
          <Link href="/">
            <img src={theme === 'dark' ? APP_LOGO : APP_LOGO_LIGHT} alt="PATHXPRESS" className="h-7 w-auto cursor-pointer" width="128" height="28" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <span
                  className={`text-[14.5px] font-medium transition-smooth cursor-pointer relative group ${
                    location === item.path ? 'text-primary' : 'text-foreground/70 hover:text-foreground'
                  }`}
                >
                  {item.label}
                  <span className={`absolute -bottom-1 left-0 h-[2px] bg-primary transition-all duration-300 ${
                    location === item.path ? 'w-full' : 'w-0 group-hover:w-full'
                  }`} />
                </span>
              </Link>
            ))}
          </nav>

          {/* Right side: Language Switcher + CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 font-mono text-xs tracking-widest text-muted-foreground hover:text-foreground">
                  <Globe className="w-3.5 h-3.5" />
                  {i18n.language.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => changeLanguage('en')}>English (EN)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage('es')}>Español (ES)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage('ar')}>العربية (AR)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="w-9 h-9 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-smooth"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <Link href="/customer-portal">
              <Button variant="outline" size="sm" className="border-border text-foreground/80 hover:text-foreground hover:border-foreground/40 transition-smooth">
                {t('nav.customerPortal')}
              </Button>
            </Link>

            <Link href="/request-quote">
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-white transition-smooth btn-hover-expand">
                {t('nav.requestQuote')}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-foreground/70 hover:text-foreground transition-smooth"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden pb-6 animate-fade-in border-t border-border/50 pt-4">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <span
                    className={`block py-2.5 px-2 text-sm font-medium transition-smooth cursor-pointer rounded-lg ${
                      location === item.path
                        ? 'text-primary bg-primary/8'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </span>
                </Link>
              ))}

              <div className="flex flex-col gap-2.5 pt-4 mt-2 border-t border-border">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 w-full justify-start font-mono text-xs tracking-widest text-muted-foreground">
                      <Globe className="w-3.5 h-3.5" />
                      {i18n.language.toUpperCase()}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => changeLanguage('en')}>English (EN)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage('es')}>Español (ES)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage('ar')}>العربية (AR)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  className="w-full border-border justify-start gap-2"
                  onClick={() => { toggleTheme?.(); }}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </Button>

                <Link href="/customer-portal">
                  <Button variant="outline" className="w-full border-border" onClick={() => setIsMenuOpen(false)}>
                    {t('nav.customerPortal')}
                  </Button>
                </Link>

                <Link href="/request-quote">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={() => setIsMenuOpen(false)}>
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
