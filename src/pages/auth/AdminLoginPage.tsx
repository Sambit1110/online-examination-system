import React, { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { ROUTES } from '../../hooks/useRoute';
import { useScrollReveal } from '../../hooks/useScrollReveal';

/** What the console actually governs: real features, not metrics. */
const SCOPE = ['Examinations', 'Question bank', 'Gradebook', 'Accounts', 'Backup & audit'];

interface Props {
  onNavigate: (to: string) => void;
}

/**
 * Staff portal. Same poster system as the student side, inverted: an ink
 * field instead of cobalt, and the console's scope set as a ruled index,
 * so the two portals can never be mistaken for each other.
 */
export const AdminLoginPage: React.FC<Props> = ({ onNavigate }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef);

  return (
    <div className="poster-page" ref={rootRef}>
      <main className="poster-auth">
        <section className="poster-field poster-field--ink" aria-labelledby="console-title">
          <header className="poster-field__masthead" data-reveal>
            <span>Office of the Controller of Examinations</span>
            <span>Restricted · staff only</span>
          </header>

          <div className="poster-field__body">
            <h1 id="console-title" className="poster-mega" data-reveal data-reveal-delay="1">
              Console
            </h1>
          </div>

          <ul className="poster-index" aria-label="This console governs">
            {SCOPE.map((label, i) => (
              <li key={label} data-reveal data-reveal-delay={String(2 + i)}>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="poster-form" aria-labelledby="admin-signin-title">
          <div className="poster-form__inner">
            <h2 id="admin-signin-title" className="poster-form__title" data-reveal data-reveal-delay="2">
              Administrator sign-in
            </h2>
            <p className="poster-form__hint" data-reveal data-reveal-delay="3">
              Adamas University · Department of Computer Science &amp; Engineering
            </p>

            <div data-reveal data-reveal-delay="4">
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
            </div>

            <p className="poster-form__foot">
              Every administrative action is recorded against your account in the audit trail.
            </p>

            <button type="button" className="poster-crosslink" onClick={() => onNavigate(ROUTES.studentLogin)}>
              <span>Sitting an exam?</span>
              <span className="poster-crosslink__action">
                Student portal <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </main>

      <footer className="poster-footer">
        <span>Adamas University · Online Examination System</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};
