import React from 'react';
import { GraduationCap, Lock, Clock, FileCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import { TiltCard } from '../../components/common/TiltCard';
import { HeroBackground } from '../../components/three/HeroBackground';
import { LoginForm } from './LoginForm';
import { ROUTES } from '../../hooks/useRoute';

const HIGHLIGHTS = [
  {
    icon: <Clock size={15} />,
    title: 'Timed, server-authoritative',
    body: 'The clock is held by the university server, not your browser.'
  },
  {
    icon: <FileCheck size={15} />,
    title: 'Continuous autosave',
    body: 'Every response is written as you answer, and retried if the network drops.'
  },
  {
    icon: <ShieldCheck size={15} />,
    title: 'Transparent integrity',
    body: 'Only tab and window focus are observed. No camera, microphone or screen capture.'
  }
];

interface Props {
  onNavigate: (to: string) => void;
}

/**
 * Candidate portal. Warm, academic, editorial — the narrative column sets
 * expectations about the examination environment before asking for
 * credentials.
 */
export const StudentLoginPage: React.FC<Props> = ({ onNavigate }) => (
  <div className="auth-shell auth-shell--student">
    <HeroBackground variant="hero" />

    <main className="auth-grid">
      <section className="auth-story" aria-hidden="true">
        <span className="eyebrow">Adamas University · Student Portal</span>
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

      <section className="auth-panel">
        <TiltCard maxTilt={3.5} className="glass-panel auth-card">
          <header className="auth-card__head">
            <span className="auth-card__mark" aria-hidden="true">
              <GraduationCap size={20} />
            </span>
            <div>
              <h2 className="auth-card__title">Student sign in</h2>
              <p className="auth-card__hint">Use your university email or roll number.</p>
            </div>
          </header>

          <LoginForm
            expectedRole="student"
            identifierLabel="Email or roll number"
            identifierPlaceholder="you@adamasuniversity.ac.in"
            submitLabel="Sign in"
            otherPortalHref={ROUTES.adminLogin}
            otherPortalLabel="Go to Admin Login"
            onNavigate={onNavigate}
          />

          <p className="auth-card__foot">
            <Lock size={12} aria-hidden="true" />
            Access is restricted to enrolled candidates.
          </p>
        </TiltCard>

        <button type="button" className="auth-crosslink" onClick={() => onNavigate(ROUTES.adminLogin)}>
          Administrator? Sign in to Admin Portal <ArrowRight size={13} aria-hidden="true" />
        </button>
      </section>
    </main>

    <footer className="auth-footer">
      <span>Adamas University · Online Examination System</span>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  </div>
);
