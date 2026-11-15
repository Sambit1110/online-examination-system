import React, { useState } from 'react';
import { useAuth, LoginFailureKind, PortalRole } from '../../context/AuthContext';
import { AlertCircle, ServerCrash, ShieldX, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  /** Which portal this form belongs to. Verified server-side after sign-in. */
  expectedRole: PortalRole;
  identifierLabel: string;
  identifierPlaceholder: string;
  identifierHint?: string;
  submitLabel: string;
  /** Where to send someone who used the wrong portal. */
  otherPortalHref: string;
  otherPortalLabel: string;
  onNavigate: (to: string) => void;
}

/** Configuration and transport failures are the institution's problem. */
const isOperational = (kind?: LoginFailureKind) => kind === 'configuration' || kind === 'network';

/**
 * The single sign-in implementation. Both portals render this; the only
 * thing that differs is the copy and which role the server is asked to
 * confirm. Nothing about authentication is duplicated per portal.
 */
export const LoginForm: React.FC<LoginFormProps> = ({
  expectedRole,
  identifierLabel,
  identifierPlaceholder,
  identifierHint,
  submitLabel,
  otherPortalHref,
  otherPortalLabel,
  onNavigate
}) => {
  const { login, serviceUnreachable, recheckService } = useAuth();
  const [rechecking, setRechecking] = useState(false);

  const handleRecheck = async () => {
    setRechecking(true);
    const reachable = await recheckService();
    setRechecking(false);
    if (reachable) {
      setError(null);
      setErrorKind(undefined);
    }
  };
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
      setError(`Enter your ${identifierLabel.toLowerCase()} and your password.`);
      setErrorKind('credentials');
      return;
    }

    setLoading(true);
    const res = await login(identifier, password, expectedRole);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Sign-in failed.');
      setErrorKind(res.kind);
      setPassword('');
    }
    // On success the auth listener swaps the view; nothing to do here.
  };

  const operational = isOperational(errorKind);
  const wrongPortal = errorKind === 'role';

  return (
    <>
      {serviceUnreachable && !error && (
        <div className="auth-alert auth-alert--operational" role="alert">
          <ServerCrash size={16} aria-hidden="true" />
          <div>
            <strong className="auth-alert__label">Exam server not responding</strong>
            <span>
              The examination server can't be reached right now, so sign-in won't work yet. Check your
              internet connection, then try again in a minute.
            </span>
            <button type="button" className="auth-alert__action" onClick={handleRecheck} disabled={rechecking}>
              {rechecking ? 'Checking…' : 'Try again'} <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className={`auth-alert${operational ? ' auth-alert--operational' : ''}${wrongPortal ? ' auth-alert--denied' : ''}`}
          role="alert"
        >
          {wrongPortal ? (
            <ShieldX size={16} aria-hidden="true" />
          ) : operational ? (
            <ServerCrash size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <div>
            {operational && <strong className="auth-alert__label">Service problem</strong>}
            {wrongPortal && <strong className="auth-alert__label">Wrong portal</strong>}
            <span>{error}</span>
            {wrongPortal && (
              <button
                type="button"
                className="auth-alert__action"
                onClick={() => onNavigate(otherPortalHref)}
              >
                {otherPortalLabel} <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="login-identifier">
            {identifierLabel}
          </label>
          <input
            id="login-identifier"
            name="identifier"
            type="text"
            className="form-input"
            placeholder={identifierPlaceholder}
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
            required
          />
          {identifierHint && <p className="form-hint">{identifierHint}</p>}
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

        <button type="submit" disabled={loading} className="btn btn-primary btn-lg auth-submit">
          {loading ? (
            <>
              <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
              Verifying…
            </>
          ) : (
            <>
              {submitLabel} <ArrowRight size={15} aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </>
  );
};
