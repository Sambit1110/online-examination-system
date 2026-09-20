import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GraduationCap,
  AlertCircle,
  ArrowRight,
  Mail,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { Footer } from '../../components/common/Footer';
import { TiltCard } from '../../components/common/TiltCard';
import { HeroBackground } from '../../components/three/HeroBackground';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError('Enter your institutional email or roll number, and your password.');
      return;
    }

    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid credentials.');
    }
    // On success the auth listener swaps the whole view; nothing to do here.
  };

  return (
    <div className="auth-shell">
      {/* Ambient 3D scene — decorative only, skipped under reduced motion. */}
      <HeroBackground />

      <main className="auth-main">
        <div className="animate-slide-up auth-column">
          <div className="auth-head">
            <div className="auth-icon-badge" aria-hidden="true">
              <GraduationCap size={24} />
            </div>
            <h1 className="serif-title auth-head__title">Adamas University</h1>
            <p className="auth-head__sub">
              Department of Computer Science &amp; Engineering · Online Examination System
            </p>
          </div>

          <TiltCard
            maxTilt={5}
            className="glass-panel animate-slide-up stagger-1"
            style={{ padding: '1.85rem', borderRadius: 'var(--radius-lg)' }}
          >
            <h2 className="auth-card__title">Sign in</h2>
            <p className="auth-card__hint">
              Students may sign in with either their university email or roll number.
            </p>

            {error && (
              <div className="error-banner" style={{ marginBottom: '1.15rem' }} role="alert">
                <AlertCircle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="login-identifier">
                  Email or roll number
                </label>
                <div className="input-affix">
                  <Mail size={15} className="input-affix__icon" aria-hidden="true" />
                  <input
                    id="login-identifier"
                    name="identifier"
                    type="text"
                    className="form-input input-affix__field"
                    placeholder="you@adamasuniversity.ac.in"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
                <div className="input-affix">
                  <Lock size={15} className="input-affix__icon" aria-hidden="true" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input input-affix__field input-affix__field--trailing"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="input-affix__action"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {loading ? (
                  <>
                    <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={14} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </TiltCard>

          <p className="auth-foot animate-slide-up stagger-2">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>Access is restricted to enrolled candidates and examination staff.</span>
          </p>
        </div>
      </main>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Footer />
      </div>
    </div>
  );
};
