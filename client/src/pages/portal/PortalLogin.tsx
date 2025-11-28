import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { toast } from 'sonner';
import { APP_LOGO } from '@/const';
import { Lock, Mail } from 'lucide-react';

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const { login } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.portal.auth.login.useMutation({
    onSuccess: (data) => {
      // Save auth data
      login(data.token, { 
        userId: data.user.id, 
        email: data.user.email, 
        role: data.user.role, 
        clientId: data.user.clientId || undefined 
      });
      
      // Redirect based on role
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={APP_LOGO} alt="PATHXPRESS" className="h-12" />
        </div>

        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Customer Portal</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {/* Help Text */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              <p>Need help accessing your account?</p>
              <p className="mt-1">Contact: <a href="mailto:support@pathxpress.net" className="text-blue-400 hover:underline">support@pathxpress.net</a></p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="text-blue-400 hover:text-blue-300"
          >
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
