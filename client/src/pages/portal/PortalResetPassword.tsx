import { useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, CheckCircle2, Lock, Mail } from 'lucide-react';
import { APP_LOGO } from '@/const';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PortalResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestMutation = trpc.portal.auth.requestPasswordReset.useMutation({
    onSuccess: (result) => { setError(''); setMessage(result.message); },
    onError: () => { setError('Unable to process the request right now. Please try again.'); setMessage(''); },
  });
  const resetMutation = trpc.portal.auth.resetPassword.useMutation({
    onSuccess: () => { setError(''); setMessage('Password updated. You can now sign in.'); },
    onError: (requestError) => { setError(requestError.message || 'This reset link is invalid or has expired.'); setMessage(''); },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!token) {
      requestMutation.mutate({ email });
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    resetMutation.mutate({ token, password });
  };

  const pending = requestMutation.isPending || resetMutation.isPending;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-7 shadow-xl">
        <img src={APP_LOGO} alt="PATHXPRESS" className="h-7 w-auto mb-8" />
        <p className="font-mono text-[10.5px] tracking-widest uppercase text-muted-foreground mb-3">Secure account recovery</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{token ? 'Choose a new password' : 'Reset your password'}</h1>
        <p className="text-sm text-muted-foreground mt-2 mb-6">
          {token ? 'Use at least 8 characters, including one letter and one number.' : 'Enter your portal email and we’ll send a one-time link if an active account exists.'}
        </p>

        <form className="space-y-4" onSubmit={submit}>
          {!token ? (
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="reset-email" type="email" className="pl-10" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending || !!message} />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="new-password" type="password" className="pl-10" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required disabled={pending || !!message} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} required disabled={pending || !!message} />
              </div>
            </>
          )}

          {error && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{error}</div>}
          {message && <div role="status" className="flex gap-2 rounded-lg border border-[var(--st-green)]/30 bg-[var(--st-green-bg)] p-3 text-sm text-[var(--st-green)]"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />{message}</div>}

          {!message && <Button type="submit" className="w-full rounded-full" disabled={pending}>{pending ? 'Processing…' : token ? 'Update password' : 'Send reset link'}</Button>}
        </form>

        <Button variant="ghost" className="mt-5 -ml-3 text-muted-foreground" onClick={() => setLocation('/portal/login')}>← Back to sign in</Button>
      </div>
    </div>
  );
}
