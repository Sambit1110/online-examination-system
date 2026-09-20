import React, { useState } from 'react';
import { useAuth, LoginFailureKind } from '../../context/AuthContext';
import {
  GraduationCap,
  AlertCircle,
  ServerCrash,
  ArrowRight,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Clock,
  FileCheck
} from 'lucide-react';
import { TiltCard } from '../../components/common/TiltCard';
import { HeroBackground } from '../../components/three/HeroBackground';

const HIGHLIGHTS = [
  { icon: <Clock size={15} />, title: 'Timed, server-authoritative', body: 'The clock is held by the university server, not your browser.' },
  { icon: <FileCheck size={15} />, title: 'Continuous autosave', body: 'Every response is written as you answer, and retried if the network drops.' },
  { icon: <ShieldCheck size={15} />, title: 'Transparent integrity', body: 'Only tab and window focus are observed. No camera, microphone or screen capture.' }
];

/** Configuration and transport failures are the institution's problem, not
 *  the candidate's — they get a distinct, non-accusatory treatment. */
const isOperationalFailure = (kind?: LoginFailureKind) =>
  kind === 'configuration' || kind === 'network';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<LoginFailureKind | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);

    if (!identifier.trim() || !password) {
      setError('Enter your institutional email or roll number, and your password.');
      setErrorKind('credentials');
      return;
    }

    setLoading(true);
    const res = await login(identifier, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Sign-in failed.');
      setErrorKind(res.kind);
    }
    // On success the auth listener swaps the view; nothing to do here.
  };

  const operational = isOperationalFailure(errorKind);

  return (
    <div className="auth-shell">
      <HeroBackground variant="hero" />

      <main className="auth-grid">
        {/* Narrative column — establishes what this system is before asking
            for credentials. Hidden on small screens where it would just
            push the form below the fold. */}
        <section className="auth-story" aria-hidden="true">
          <span className="eyebrow">Adamas University</span>
          <h1 className="serif-title auth-story__title">
            The examination hall,
            <br />
            <em>reimagined.</em>
          </h1>
          <p className="auth-story__lede">
            Department of Computer Science &amp; Engineering — a calm, monitored environment for
            sitting departmental assessments.
          </p>

          <ul className="auth-story__list">
            {HIGHLIGHTS.map(h => (
              <li className="auth-story__item" key={h.title}>
                <span className="auth-story__icon">{h.icon}</span>
                <span>
                  <strong>{h.title}</strong>
                  <span className="auth-story__body">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Form column */}
        <section className="auth-panel">
          <TiltCard maxTilt={3.5} className="glass-panel auth-card">
            <header className="auth-card__head">
              <span className="auth-card__mark" aria-hidden="true">
                <GraduationCap size={20} />
              </span>
              <div>
                <h2 className="auth-card__title">Sign in</h2>
                <p className="auth-card__hint">Use your university email or roll number.</p>
              </div>
            </header>

            {error && (
              <div
                className={`auth-alert${operational ? ' auth-alert--operational' : ''}`}
                role="alert"
              >
                {operational ? (
                  <ServerCrash size={16} aria-hidden="true" />
                ) : (
                  <AlertCircle size={16} aria-hidden="true" />
                )}
                <div>
                  {operational && <strong className="auth-alert__label">Service problem</strong>}
                  <span>{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="login-identifier">
                  Email or roll number
                </label>
                <input
                  id="login-identifier"
                  name="identifier"
                  type="text"
                  className="form-input"
                  placeholder="you@adamasuniversity.ac.in"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
                <div className="input-affix">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input input-affix__field--trailing"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="input-affix__action"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg auth-submit"
              >
                {loading ? (
                  <>
                    <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={15} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="auth-card__foot">
              <Lock size={12} aria-hidden="true" />
              Access is restricted to enrolled candidates and examination staff.
            </p>
          </TiltCard>
        </section>
      </main>

      <footer className="auth-footer">
        <span>Adamas University · Online Examination System</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};
