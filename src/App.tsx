import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useRoute, ROUTES } from './hooks/useRoute';
import { Navbar } from './components/common/Navbar';
import { AdminRail } from './components/common/AdminRail';
import { StudentLoginPage } from './pages/auth/StudentLoginPage';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { ExamInstructionsPage } from './pages/student/ExamInstructionsPage';
import { ExamInterfacePage } from './pages/student/ExamInterfacePage';
import { StudentResultPage } from './pages/student/StudentResultPage';
import { Footer } from './components/common/Footer';
import { ErrorState } from './components/common/ErrorState';
import { Spinner } from './components/common/Spinner';
import { isSupabaseConfigured } from './lib/supabaseClient';

// The admin console is a large surface that the great majority of users —
// candidates — never open. Splitting it keeps it out of their download.
const AdminDashboard = lazy(() =>
  import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard }))
);
const QuestionBankPage = lazy(() =>
  import('./pages/admin/QuestionBankPage').then(m => ({ default: m.QuestionBankPage }))
);
const ExamManagementPage = lazy(() =>
  import('./pages/admin/ExamManagementPage').then(m => ({ default: m.ExamManagementPage }))
);
const AdminResultsPage = lazy(() =>
  import('./pages/admin/AdminResultsPage').then(m => ({ default: m.AdminResultsPage }))
);
const UserManagementPage = lazy(() =>
  import('./pages/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage }))
);
const SystemBackupPage = lazy(() =>
  import('./pages/admin/SystemBackupPage').then(m => ({ default: m.SystemBackupPage }))
);

export const App: React.FC = () => {
  const { user, loading, profileError, portalCheckPending, logout, isAdmin, isStudent } = useAuth();
  const { path, navigate: go } = useRoute();
  const [currentView, setCurrentView] = useState<string>('default');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  const onLoginRoute = path === ROUTES.studentLogin || path === ROUTES.adminLogin;

  // Keep the URL and the session honest about each other. A signed-in user
  // sitting on a login route is sent to their own portal; a signed-out user
  // anywhere else is sent to the login page that matches where they were
  // trying to go. Role still comes from the authenticated profile, never
  // from the URL — this only decides which screen to show.
  useEffect(() => {
    if (loading || portalCheckPending) return;

    if (user) {
      if (onLoginRoute) go(ROUTES.app, true);
      return;
    }

    if (!onLoginRoute) {
      go(ROUTES.studentLogin, true);
    }
  }, [user, loading, portalCheckPending, onLoginRoute, go]);

  const navigate = useCallback((view: string) => {
    setSelectedExamId(null);
    setCurrentView(view);
    // A view swap is a page change in every sense except the URL; without
    // this the operator lands mid-scroll on the previous screen's position.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // A deployment missing its Supabase keys should say so plainly rather
  // than failing as a blank page.
  if (!isSupabaseConfigured) {
    return (
      <div className="crash-screen">
        <div className="crash-screen__card card">
          <ErrorState
            title="Portal not configured"
            message="This deployment is missing its Supabase credentials, so it cannot reach the examination database."
          />
          <p className="crash-screen__detail">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild. See README.md.
          </p>
        </div>
      </div>
    );
  }

  if (loading || portalCheckPending) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="spinner spinner-lg" aria-hidden="true" />
        <p className="boot-screen__label">Adamas University Online Examination System</p>
        <span className="sr-only">Loading the examination portal…</span>
      </div>
    );
  }

  // Authenticated with Supabase, but the portal profile could not be read.
  // Surfacing this beats bouncing the candidate back to a login screen that
  // will accept their password and strand them in the same place.
  if (profileError) {
    return (
      <div className="crash-screen">
        <div className="crash-screen__card card">
          <ErrorState title="Profile unavailable" message={profileError} />
          <button type="button" className="btn btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Signed out: only the two portals are reachable. The redirect effect
  // above normalises anything else to the student portal.
  if (!user) {
    return path === ROUTES.adminLogin ? (
      <AdminLoginPage onNavigate={go} />
    ) : (
      <StudentLoginPage onNavigate={go} />
    );
  }

  // Signed in but the role is neither of the two the product supports —
  // refuse rather than rendering an empty shell.
  if (!isAdmin && !isStudent) {
    return (
      <div className="crash-screen">
        <div className="crash-screen__card card">
          <ErrorState
            title="Access denied"
            message="This account does not carry a student or administrator role, so no portal can be opened for it."
          />
          <button type="button" className="btn btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Active examination mode: dedicated full-screen chrome, no portal nav.
  if (currentView === 'exam-interface' && selectedExamId) {
    return (
      <ExamInterfacePage
        examId={selectedExamId}
        onFinishExam={examId => {
          setSelectedExamId(examId);
          setCurrentView('student-results');
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
      />
    );
  }

  // The console has a fixed set of destinations an operator moves between
  // constantly, so it gets a persistent rail. Candidates have two, so they
  // get a top bar and the full width of the screen.
  if (isAdmin) {
    return (
      <div className="console-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>

        <AdminRail currentView={currentView} setCurrentView={navigate} />

        <main className="console-content" id="main-content" tabIndex={-1}>
          <div className="console-content__inner">
            <Suspense fallback={<Spinner label="Loading console…" size="lg" />}>
              {(currentView === 'default' || currentView === 'admin-dashboard') && (
                <AdminDashboard onNavigate={navigate} />
              )}
              {currentView === 'admin-questions' && <QuestionBankPage />}
              {currentView === 'admin-exams' && <ExamManagementPage />}
              {currentView === 'admin-results' && <AdminResultsPage />}
              {currentView === 'admin-users' && <UserManagementPage />}
              {currentView === 'admin-backup' && <SystemBackupPage />}
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Navbar
        currentView={currentView === 'default' ? 'student-dashboard' : currentView}
        setCurrentView={navigate}
      />

      <main className="main-content" id="main-content" tabIndex={-1}>
        {isStudent && (
          <>
            {(currentView === 'default' || currentView === 'student-dashboard') && (
              <StudentDashboard
                onStartExam={examId => {
                  setSelectedExamId(examId);
                  setCurrentView('exam-instructions');
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }}
                onViewResult={examId => {
                  setSelectedExamId(examId);
                  setCurrentView('student-results');
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }}
              />
            )}

            {currentView === 'exam-instructions' && selectedExamId && (
              <ExamInstructionsPage
                examId={selectedExamId}
                onProceedToExam={() => setCurrentView('exam-interface')}
                onBack={() => navigate('student-dashboard')}
              />
            )}

            {currentView === 'student-results' && (
              <StudentResultPage
                examId={selectedExamId || undefined}
                onBack={() => navigate('student-dashboard')}
              />
            )}
          </>
        )}

      </main>

      <Footer />
    </div>
  );
};
