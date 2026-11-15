import React, { useRef } from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { ROUTES } from '../../hooks/useRoute';
import { DayRuler } from '../../components/poster/DayRuler';
import { useScrollReveal } from '../../hooks/useScrollReveal';

const PRINCIPLES = [
  {
    statement: 'The clock is kept by the server.',
    detail:
      'Your time limit is enforced by the university database, not your browser. Answers sent after time is up are refused, and a late submission is recorded as timed out.'
  },
  {
    statement: 'Every answer is saved as you go.',
    detail:
      'Each response is written the moment you choose it. If the network drops it is retried, and the header shows anything still unsaved before you submit.'
  },
  {
    statement: 'Integrity, without cameras.',
    detail:
      'Only tab and window focus are noted, for the Examination Cell to review. No webcam, microphone or screen recording, ever.'
  },
  {
    statement: 'Marks stay sealed until release.',
    detail:
      'Correct answers and scores never reach your browser while an exam is under evaluation. They appear together, as an official grade slip, once results are released.'
  }
];

const today = () =>
  new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

interface Props {
  onNavigate: (to: string) => void;
}

/**
 * Candidate portal, set as the department's official notice: a cobalt
 * field carrying the day itself, the sign-in form on the paper beside it,
 * and below the fold the four rules the portal enforces.
 */
export const StudentLoginPage: React.FC<Props> = ({ onNavigate }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef);

  return (
    <div className="poster-page" ref={rootRef}>
      <main className="poster-auth">
        <section className="poster-field" aria-labelledby="portal-title">
          <header className="poster-field__masthead" data-reveal>
            <span>Adamas University</span>
            <span>Department of Computer Science &amp; Engineering</span>
          </header>

          <div className="poster-field__body">
            <p className="poster-field__date" data-reveal data-reveal-delay="1">
              {today()}
            </p>
            <h1 id="portal-title" className="poster-mega" data-reveal data-reveal-delay="2">
              Examin&shy;ations
            </h1>
            <p className="poster-field__lede" data-reveal data-reveal-delay="3">
              The student portal for departmental assessments: timed MCQ papers, saved as you answer,
              graded by the server.
            </p>
          </div>

          <div data-reveal data-reveal-delay="4">
            <DayRuler />
          </div>

          <a className="poster-field__cue" href="#how-it-works">
            How the portal keeps an exam fair <ArrowDown size={14} aria-hidden="true" />
          </a>
        </section>

        <section className="poster-form" aria-labelledby="signin-title">
          <div className="poster-form__inner">
            <h2 id="signin-title" className="poster-form__title" data-reveal data-reveal-delay="2">
              Student sign-in
            </h2>
            <p className="poster-form__hint" data-reveal data-reveal-delay="3">
              Use your university email or roll number.
            </p>

            <div data-reveal data-reveal-delay="4">
              <LoginForm
                expectedRole="student"
                identifierLabel="Email or roll number"
                identifierPlaceholder="you@adamasuniversity.ac.in"
                submitLabel="Sign in"
                otherPortalHref={ROUTES.adminLogin}
                otherPortalLabel="Go to Admin Login"
                onNavigate={onNavigate}
              />
            </div>

            <p className="poster-form__foot">Access is restricted to enrolled candidates.</p>

            <button type="button" className="poster-crosslink" onClick={() => onNavigate(ROUTES.adminLogin)}>
              <span>Examination staff</span>
              <span className="poster-crosslink__action">
                Admin portal <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </main>

      <section id="how-it-works" className="poster-principles" aria-labelledby="principles-title">
        <h2 id="principles-title" className="poster-section-title" data-reveal>
          How the portal keeps an exam fair
        </h2>
        <ol className="poster-principles__list">
          {PRINCIPLES.map(p => (
            <li className="poster-principle" key={p.statement} data-reveal>
              <p className="poster-principle__statement">{p.statement}</p>
              <p className="poster-principle__detail">{p.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="poster-footer">
        <span>Adamas University · Online Examination System</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};
