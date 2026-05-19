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
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 space-y-2">
      <p className="text-xs font-medium text-white">Password requirements</p>
      <ul className="space-y-1.5">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {rule.met ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[#40bfae] shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-[#555] shrink-0" />
            )}
            <span className={rule.met ? 'text-white' : 'text-[#666]'}>
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
    if (data.session) {
      navigate('/app', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0A0A0A]">
      {/* Animated gradient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="login-bg-blob absolute rounded-full opacity-[0.12]"
          style={{
            width: 'min(80vmax, 600px)',
            height: 'min(80vmax, 600px)',
            left: '5%',
            top: '10%',
            background: '#40bfae',
            filter: 'blur(100px)',
            animation: 'loginBgFloat 25s ease-in-out infinite alternate',
          }}
        />
        <div
          className="login-bg-blob absolute rounded-full opacity-[0.08]"
          style={{
            width: 'min(70vmax, 500px)',
            height: 'min(70vmax, 500px)',
            right: '5%',
            bottom: '10%',
            background: '#40bfae',
            filter: 'blur(90px)',
            animation: 'loginBgFloat 30s ease-in-out infinite alternate-reverse',
            animationDelay: '-8s',
          }}
        />
        <div
          className="login-bg-blob absolute rounded-full opacity-[0.06]"
          style={{
            width: 'min(60vmax, 400px)',
            height: 'min(60vmax, 400px)',
            left: '50%',
            top: '50%',
            marginLeft: 'min(-30vmax, -200px)',
            marginTop: 'min(-30vmax, -200px)',
            background: '#3dc4b0',
            filter: 'blur(120px)',
            animation: 'loginBgFloat 22s ease-in-out infinite alternate',
            animationDelay: '-12s',
          }}
        />
      </div>

      <div className="relative w-full max-w-md rounded-2xl shadow-2xl bg-[#111111] border border-[#1e1e1e] p-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#40bfae] flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-[#0A0A0A]">◎</span>
            </div>
            <span className="text-xl font-semibold text-white">Loop AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-white">Create an account</h1>
            <p className="text-sm text-[#888] mt-1">
              Create your account to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}
            {success && (
              <p className="text-sm text-center text-[#888]">
                Account created. Check your email to confirm, or sign in below.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#555] focus:border-[#40bfae] focus:ring-[#40bfae]/20"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-white">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowPasswords((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-[#888] hover:text-white transition-colors"
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
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#555] focus:border-[#40bfae] focus:ring-[#40bfae]/20"
              />
              <PasswordRequirementsPanel rules={passwordRules} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-white">Re-enter password</Label>
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
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#555] focus:border-[#40bfae] focus:ring-[#40bfae]/20"
              />
              {showPasswordMismatch && (
                <p className="text-xs text-red-400">Password does not match</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-[#40bfae] hover:bg-[#3ab3a0] text-[#0A0A0A] font-semibold disabled:opacity-50"
              disabled={!canSubmit}
            >
              {isLoading ? 'Creating account...' : 'Sign up'}
            </Button>
          </form>

          <p className="text-center text-sm text-[#888]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#40bfae] hover:opacity-80 transition-opacity">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}