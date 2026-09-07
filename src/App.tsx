import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { LoginPage } from './pages/auth/LoginPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { ExamInstructionsPage } from './pages/student/ExamInstructionsPage';
import { ExamInterfacePage } from './pages/student/ExamInterfacePage';
import { StudentResultPage } from './pages/student/StudentResultPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { QuestionBankPage } from './pages/admin/QuestionBankPage';
import { ExamManagementPage } from './pages/admin/ExamManagementPage';
import { AdminResultsPage } from './pages/admin/AdminResultsPage';
import { UserManagementPage } from './pages/admin/UserManagementPage';
import { SystemBackupPage } from './pages/admin/SystemBackupPage';
import { Footer } from './components/common/Footer';

export const App: React.FC = () => {
  const { user, loading, isAdmin, isStudent } = useAuth();
  const [currentView, setCurrentView] = useState<string>('default');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-page)',
        color: 'var(--text-main)',
        flexDirection: 'column',
        gap: '1.1rem'
      }}>
        <div
          className="spinner spinner-lg"
          style={{ borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'var(--color-action)' }}
        />
        <div style={{ fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
          ADAMAS UNIVERSITY ONLINE EXAMINATION SYSTEM
        </div>
      </div>
    );
  }

  // If unauthenticated, display the institutional login experience
  if (!user) {
    return <LoginPage />;
  }

  // Active Examination Interface mode (Distraction-free, dedicated full-screen header)
  if (currentView === 'exam-interface' && selectedExamId) {
    return (
      <ExamInterfacePage
        examId={selectedExamId}
        onFinishExam={(id) => {
          setSelectedExamId(id);
          setCurrentView('student-results');
        }}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Persistent Academic Institutional Navbar */}
      <Navbar
        currentView={currentView === 'default' ? (isAdmin ? 'admin-dashboard' : 'student-dashboard') : currentView}
        setCurrentView={(view) => {
          setSelectedExamId(null);
          setCurrentView(view);
        }}
      />

      {/* Main Workspace Page Router */}
      <main className="main-content">
        {/* ================= STUDENT VIEWS ================= */}
        {isStudent && (
          <>
            {(currentView === 'default' || currentView === 'student-dashboard') && (
              <StudentDashboard
                onStartExam={(examId) => {
                  setSelectedExamId(examId);
                  setCurrentView('exam-instructions');
                }}
                onViewResult={(examId) => {
                  setSelectedExamId(examId);
                  setCurrentView('student-results');
                }}
              />
            )}

            {currentView === 'exam-instructions' && selectedExamId && (
              <ExamInstructionsPage
                examId={selectedExamId}
                onProceedToExam={() => setCurrentView('exam-interface')}
                onBack={() => {
                  setSelectedExamId(null);
                  setCurrentView('student-dashboard');
                }}
              />
            )}

            {currentView === 'student-results' && (
              <StudentResultPage
                examId={selectedExamId || undefined}
                onBack={() => {
                  setSelectedExamId(null);
                  setCurrentView('student-dashboard');
                }}
              />
            )}
          </>
        )}

        {/* ================= ADMINISTRATOR VIEWS ================= */}
        {isAdmin && (
          <>
            {(currentView === 'default' || currentView === 'admin-dashboard') && (
              <AdminDashboard onNavigate={(view) => setCurrentView(view)} />
            )}

            {currentView === 'admin-questions' && (
              <QuestionBankPage />
            )}

            {currentView === 'admin-exams' && (
              <ExamManagementPage />
            )}

            {currentView === 'admin-results' && (
              <AdminResultsPage />
            )}

            {currentView === 'admin-users' && (
              <UserManagementPage />
            )}

            {currentView === 'admin-backup' && (
              <SystemBackupPage />
            )}
          </>
        )}
      </main>

      {/* Attractive Institutional Footer */}
      <Footer />
    </div>
  );
};
