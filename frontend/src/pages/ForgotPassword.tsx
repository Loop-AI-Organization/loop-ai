import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitted(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    // UI-only flow for now (no backend integration yet).
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Animated background – floating blurred blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="login-bg-blob absolute rounded-full opacity-20"
          style={{
            width: 'min(80vmax, 480px)',
            height: 'min(80vmax, 480px)',
            left: '10%',
            top: '20%',
            background: 'hsl(var(--primary))',
            filter: 'blur(80px)',
            animation: 'loginBgFloat 22s ease-in-out infinite alternate',
          }}
        />
        <div
          className="login-bg-blob absolute rounded-full opacity-[0.15]"
          style={{
            width: 'min(70vmax, 400px)',
            height: 'min(70vmax, 400px)',
            right: '5%',
            bottom: '15%',
            background: 'hsl(var(--primary))',
            filter: 'blur(70px)',
            animation: 'loginBgFloat 25s ease-in-out infinite alternate-reverse',
            animationDelay: '-5s',
          }}
        />
        <div
          className="login-bg-blob absolute rounded-full opacity-[0.12]"
          style={{
            width: 'min(60vmax, 360px)',
            height: 'min(60vmax, 360px)',
            left: '50%',
            top: '50%',
            marginLeft: 'min(-30vmax, -180px)',
            marginTop: 'min(-30vmax, -180px)',
            background: 'hsl(var(--muted-foreground))',
            filter: 'blur(90px)',
            animation: 'loginBgFloat 20s ease-in-out infinite alternate',
            animationDelay: '-10s',
          }}
        />
      </div>

      <div className="relative w-full max-w-md rounded-xl shadow-lg bg-card border border-border p-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary-foreground">◎</span>
            </div>
            <span className="text-xl font-semibold text-foreground">Loop AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-foreground">Account recovery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your account email and we&apos;ll send you a password reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-email">Enter account email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="recovery-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                    setSubmitted(false);
                  }}
                  autoComplete="email"
                  className="pl-10"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <Button type="submit" className="w-full">
              Send reset email
            </Button>
          </form>

          {submitted && (
            <p className="text-sm text-accent-success text-center">
              Check your email for a password reset link.
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary underline underline-offset-2">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
