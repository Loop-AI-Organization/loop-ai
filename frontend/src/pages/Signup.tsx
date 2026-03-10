import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabase } from '@/lib/supabase';

interface PasswordRule {
  label: string;
  met: boolean;
}

function PasswordRequirementsPanel({ rules }: { rules: PasswordRule[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
      <p className="text-xs font-medium text-foreground">Password requirements</p>
      <ul className="space-y-1.5">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {rule.met ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-accent-success shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={rule.met ? 'text-foreground' : 'text-muted-foreground'}>
              {rule.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const passwordRules: PasswordRule[] = [
    { label: '9+ characters', met: password.length >= 9 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number (0-9)', met: /\d/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const allPasswordRulesMet = passwordRules.every((rule) => rule.met);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const showPasswordMismatch =
    (password.length > 0 || confirmPassword.length > 0) && !passwordsMatch;
  const canSubmit =
    !isLoading && email.trim().length > 0 && allPasswordRulesMet && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allPasswordRulesMet) {
      setError('Please satisfy all password requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Password does not match.');
      return;
    }

    setIsLoading(true);

    const { data, error: signUpError } = await getSupabase().auth.signUp({ email, password });

    setIsLoading(false);
    if (signUpError) {
      setError(signUpError.message ?? 'Sign up failed');
      return;
    }
    setSuccess(true);
    // If session exists (e.g. email confirmation disabled), go to app
    if (data.session) {
      navigate('/app', { replace: true });
    }
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
            <h1 className="text-2xl font-semibold text-foreground">Create an account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create your account to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            {success && (
              <p className="text-sm text-center text-muted-foreground">
                Account created. Check your email to confirm, or sign in below.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowPasswords((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPasswords ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Show
                    </>
                  )}
                </button>
              </div>
              <Input
                id="password"
                type={showPasswords ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSuccess(false);
                }}
                required
                autoComplete="new-password"
                minLength={9}
              />
              <PasswordRequirementsPanel rules={passwordRules} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Re-enter password</Label>
              <Input
                id="confirm-password"
                type={showPasswords ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setSuccess(false);
                }}
                required
                autoComplete="new-password"
                minLength={9}
              />
              {showPasswordMismatch && (
                <p className="text-xs text-destructive">Password does not match</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {isLoading ? 'Creating account...' : 'Sign up'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
