import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, AlertCircle, ArrowRight, Mail, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { Footer } from '../../components/common/Footer';
import { TiltCard } from '../../components/common/TiltCard';
import { HeroBackground } from '../../components/three/HeroBackground';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleTab, setRoleTab] = useState<'student' | 'admin'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // REQ-07: Validation message when login fields are empty
    if (!email.trim() || !password.trim()) {
      setError('Please provide both institutional email/roll number and password.');
      return;
    }

    setLoading(true);
    const res = await login(email, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid credentials.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient 3D scene — floating geometric shapes, decorative only */}
      <HeroBackground />

      {/* Centered Authentication Experience */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.5rem',
        position: 'relative',
        zIndex: 1
      }}>
        <div className="animate-slide-up" style={{
          width: '100%',
          maxWidth: '420px'
        }}>
          {/* Institution Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-accent-indigo-bg)',
              border: '1px solid var(--color-accent-indigo-border)',
              color: 'var(--color-brand-secondary)',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '1.25rem'
            }}>
              <Sparkles size={11} />
              Examination Portal
            </div>

            <div className="auth-icon-badge" style={{
              width: '3.25rem',
              height: '3.25rem',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(160deg, var(--color-action-hover), var(--color-action))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              marginBottom: '1.1rem',
              boxShadow: 'var(--shadow-glow-brand)'
            }}>
              <GraduationCap size={24} />
            </div>
            <h1 className="serif-title" style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Adamas University
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Department of Computer Science & Engineering • Examination Portal
            </p>
          </div>

          {/* Form Card — glass surface with pointer-driven 3D tilt */}
          <TiltCard maxTilt={5} className="glass-panel animate-slide-up stagger-1" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
            {/* Minimal Segmented Switcher */}
            <div style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
              marginBottom: '1.5rem',
              border: '1px solid var(--border-subtle)'
            }}>
              <button
                type="button"
                onClick={() => setRoleTab('student')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  backgroundColor: roleTab === 'student' ? 'var(--bg-surface-muted)' : 'transparent',
                  color: roleTab === 'student' ? 'var(--text-main)' : 'var(--text-secondary)',
                  boxShadow: roleTab === 'student' ? 'var(--shadow-xs)' : 'none',
                  transition: 'background-color var(--duration-base) var(--ease-standard), box-shadow var(--duration-base) ease, transform var(--duration-fast) ease'
                }}
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => setRoleTab('admin')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  backgroundColor: roleTab === 'admin' ? 'var(--bg-surface-muted)' : 'transparent',
                  color: roleTab === 'admin' ? 'var(--text-main)' : 'var(--text-secondary)',
                  boxShadow: roleTab === 'admin' ? 'var(--shadow-xs)' : 'none',
                  transition: 'background-color var(--duration-base) var(--ease-standard), box-shadow var(--duration-base) ease, transform var(--duration-fast) ease'
                }}
              >
                Administrator
              </button>
            </div>

            {/* Error Message (REQ-06, REQ-07) */}
            {error && (
              <div className="error-banner" style={{ marginBottom: '1.25rem' }} role="alert">
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <div>{error}</div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">
                  {roleTab === 'student' ? 'Email or Roll Number' : 'Administrator Email'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="login-email"
                    type="text"
                    className="form-input"
                    placeholder={roleTab === 'student' ? 'sambit.biswas@adamas.ac.in or Roll No' : 'admin@adamas.ac.in'}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    style={{ paddingLeft: '2.25rem' }}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="login-password"
                    type="password"
                    className="form-input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingLeft: '2.25rem' }}
                    required
                  />
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
                    <span className="spinner spinner-sm" style={{ borderTopColor: '#ffffff', borderColor: 'rgba(255,255,255,0.35)' }} />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Sign in to Portal <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          </TiltCard>

          <div className="animate-slide-up stagger-2" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            marginTop: '1.25rem',
            color: 'var(--text-muted)',
            fontSize: '0.75rem'
          }}>
            <ShieldCheck size={13} />
            <span>Secured institutional access • Session encrypted end to end</span>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Footer />
      </div>
    </div>
  );
};
