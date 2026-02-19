import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { getSupabase, getAuthHeaders } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/app';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: signInError } = await getSupabase().auth.signInWithPassword({ email, password });

    setIsLoading(false);
    if (signInError) {
      setError(signInError.message ?? 'Invalid email or password');
      return;
    }
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
    try {
      const headers = await getAuthHeaders();
      await fetch(`${apiUrl}/api/auth/log-event`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_type: 'sign_in' }),
      });
    } catch {
      // Ignore if backend unavailable
    }
    navigate(from, { replace: true });
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

      {/* Login card */}
      <div className="relative w-full max-w-md rounded-xl shadow-lg bg-card border border-border p-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary-foreground">◎</span>
            </div>
            <span className="text-xl font-semibold text-foreground">Loop AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-foreground">Log in to Loop AI</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back — sign in with your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground sr-only">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground sr-only">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>
              <Link
                to="#"
                className="text-sm text-primary underline underline-offset-2 hover:opacity-80"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-primary underline underline-offset-2">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
