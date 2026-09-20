import React, { Suspense, lazy, useCallback, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { LoginPage } from './pages/auth/LoginPage';
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
  const { user, loading, profileError, logout, isAdmin, isStudent } = useAuth();
  const [currentView, setCurrentView] = useState<string>('default');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

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

  if (loading) {
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

  if (!user) {
    return <LoginPage />;
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

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Navbar
        currentView={currentView === 'default' ? (isAdmin ? 'admin-dashboard' : 'student-dashboard') : currentView}
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

        {isAdmin && (
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
        )}
      </main>

      <Footer />
    </div>
  );
};
