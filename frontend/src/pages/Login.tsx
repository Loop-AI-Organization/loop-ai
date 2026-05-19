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
    const apiUrl = import.meta.env.VITE_API_URL ?? 'https://api.loopai-project.me';
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

      {/* Login card */}
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl bg-[#111111] border border-[#1e1e1e] p-8">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#40bfae] flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-[#0A0A0A]">◎</span>
            </div>
            <span className="text-xl font-semibold text-white">Loop AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-white">Log in to Loop AI</h1>
            <p className="text-sm text-[#888] mt-1">
              Welcome back — sign in with your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-white sr-only">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666] pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#555] focus:border-[#40bfae] focus:ring-[#40bfae]/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-white sr-only">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666] pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-10 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-[#555] focus:border-[#40bfae] focus:ring-[#40bfae]/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  className="border-[#2a2a2a] data-[state=checked]:bg-[#40bfae] data-[state=checked]:border-[#40bfae]"
                />
                <span className="text-sm text-[#888]">Remember me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm text-[#40bfae] hover:opacity-80 transition-opacity"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#40bfae] hover:bg-[#3ab3a0] text-[#0A0A0A] font-semibold disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-[#888]">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-[#40bfae] hover:opacity-80 transition-opacity">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}