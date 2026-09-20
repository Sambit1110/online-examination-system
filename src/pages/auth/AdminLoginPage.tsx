import React from 'react';
import { ShieldCheck, KeyRound, ArrowRight, CalendarDays, FileQuestion, Award, Users, DatabaseBackup } from 'lucide-react';
import { HeroBackground } from '../../components/three/HeroBackground';
import { LoginForm } from './LoginForm';
import { ROUTES } from '../../hooks/useRoute';

/** What the console actually governs — describes real features, not metrics. */
const SCOPE = [
  { icon: <CalendarDays size={13} />, label: 'Examinations' },
  { icon: <FileQuestion size={13} />, label: 'Question bank' },
  { icon: <Award size={13} />, label: 'Gradebook' },
  { icon: <Users size={13} />, label: 'Accounts' },
  { icon: <DatabaseBackup size={13} />, label: 'Backup & audit' }
];

interface Props {
  onNavigate: (to: string) => void;
}

/**
 * Staff portal. Deliberately a different composition from the candidate
 * side: a single centred control panel rather than a narrative spread,
 * cooler palette, monospace framing, and an explicit restricted-access
 * notice. It should read as an operations console, not a welcome mat.
 */
export const AdminLoginPage: React.FC<Props> = ({ onNavigate }) => (
  <div className="auth-shell auth-shell--admin">
    <HeroBackground variant="admin" />

    <main className="admin-auth">
      <div className="admin-auth__panel">
        <div className="admin-auth__restricted">
          <ShieldCheck size={12} aria-hidden="true" />
          Restricted · Examination staff only
        </div>

        <header className="admin-auth__head">
          <span className="admin-auth__crest" aria-hidden="true">
            <KeyRound size={22} />
          </span>
          <span className="eyebrow">Office of the Controller of Examinations</span>
          <h1 className="admin-auth__title">Examination Console</h1>
          <p className="admin-auth__sub">
            Adamas University · Department of Computer Science &amp; Engineering
          </p>
        </header>

        <div className="admin-auth__rule" aria-hidden="true" />

        <LoginForm
          expectedRole="admin"
          identifierLabel="Administrator email"
          identifierPlaceholder="controller@adamasuniversity.ac.in"
          identifierHint="Staff accounts sign in with their institutional email address."
          submitLabel="Authenticate"
          otherPortalHref={ROUTES.studentLogin}
          otherPortalLabel="Go to Student Login"
          onNavigate={onNavigate}
        />

        <div className="admin-auth__scope">
          <span className="admin-auth__scope-label">This console governs</span>
          <ul className="admin-auth__scope-list">
            {SCOPE.map(s => (
              <li key={s.label}>
                <span aria-hidden="true">{s.icon}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="admin-auth__notice">
          All administrative actions are recorded against your account in the audit trail.
        </p>
      </div>

      <button type="button" className="auth-crosslink" onClick={() => onNavigate(ROUTES.studentLogin)}>
        Student? Sign in to Student Portal <ArrowRight size={13} aria-hidden="true" />
      </button>
    </main>

    <footer className="auth-footer">
      <span>Adamas University · Online Examination System</span>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  </div>
);
