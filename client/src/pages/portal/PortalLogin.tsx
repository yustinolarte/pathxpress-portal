import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { APP_LOGO } from '@/const';
import { Lock, Mail } from 'lucide-react';

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.portal.auth.login.useMutation({
    onSuccess: (data) => {
      // Cookie is set by the server — redirect based on role
      const redirectPath = data.user.role === 'admin' ? '/portal/admin' : '/portal/customer';
      window.location.href = redirectPath;
    },
    onError: (error) => {
      toast.error(error.message || 'Login failed');
      setLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Left: brand band */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] shrink-0 p-14 relative overflow-hidden" style={{ background: 'var(--band)', color: 'var(--band-ink)' }}>
        <div className="absolute bottom-0 right-0 font-display font-bold text-[320px] leading-none opacity-[0.07] select-none pointer-events-none">
          X
        </div>
        <div className="relative">
          <img src={APP_LOGO} alt="PATHXPRESS" className="h-9 w-auto" />
        </div>
        <div className="relative">
          <p className="font-mono text-[10.5px] tracking-widest uppercase mb-4" style={{color:'rgba(255,255,255,0.45)'}}>
            Customer Portal
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight leading-tight mb-4">
            Last-mile logistics,<br />built for UAE.
          </h2>
          <p className="text-[15px]" style={{color:'rgba(255,255,255,0.6)'}}>
            Track shipments, manage COD, and grow your business.
          </p>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-10">
            <img src={APP_LOGO} alt="PATHXPRESS" className="h-7 w-auto" />
          </div>

          <div className="mb-8">
            <p className="font-mono text-[10.5px] tracking-widest uppercase text-muted-foreground mb-3">Pathxpress Portal</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-[15px] mt-2">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-secondary border-border"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-secondary border-border"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-full transition-smooth mt-2" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-[13px] text-muted-foreground">
            <p>Need access? Contact <a href="mailto:support@pathxpress.net" className="text-primary hover:underline">support@pathxpress.net</a></p>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setLocation('/')} className="mt-6 text-muted-foreground hover:text-foreground -ml-2">
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
