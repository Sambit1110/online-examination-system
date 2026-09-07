import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { TiltCard } from '../../components/common/TiltCard';
import {
  Clock,
  Calendar,
  FileText,
  Award,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  BookOpen,
  UserCheck,
  CalendarClock
} from 'lucide-react';

interface StudentDashboardProps {
  onStartExam: (examId: string) => void;
  onViewResult: (examId: string) => void;
}

// Access-window logic (BR-02/BR-03) — mirrors the same rules the RPCs
// enforce authoritatively server-side; this is purely presentational.
const computeAccessState = (
  exam: { start_time: string; end_time: string },
  attemptStatus: Examination['attempt_status']
): { accessState: Examination['accessState']; canStart: boolean } => {
  if (attemptStatus === 'submitted' || attemptStatus === 'timed_out') {
    return { accessState: 'completed', canStart: false };
  }
  if (attemptStatus === 'in_progress') {
    return { accessState: 'in_progress', canStart: true };
  }
  const now = new Date();
  if (now < new Date(exam.start_time)) return { accessState: 'upcoming', canStart: false };
  if (now > new Date(exam.end_time)) return { accessState: 'expired', canStart: false };
  return { accessState: 'live', canStart: true };
};

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartExam, onViewResult }) => {
  const { user } = useAuth();
  const [exams, setExams] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const [examsRes, attemptsRes, resultsRes] = await Promise.all([
        supabase
          .from('examinations')
          .select(`
            exam_id:id, title, description, duration_minutes, start_time, end_time,
            total_marks, pass_percentage, negative_marks_per_question, status, results_released,
            exam_questions(count)
          `)
          .order('start_time', { ascending: true }),
        supabase
          .from('exam_attempts')
          .select('exam_id, attempt_id:id, status')
          .eq('user_id', user.id),
        supabase
          .from('results')
          .select('exam_id, result_id:id, marks_obtained, percentage, status')
          .eq('user_id', user.id)
      ]);

      if (examsRes.error) throw examsRes.error;
      if (attemptsRes.error) throw attemptsRes.error;
      if (resultsRes.error) throw resultsRes.error;

      const attemptByExam = new Map((attemptsRes.data || []).map((a: any) => [a.exam_id, a]));
      const resultByExam = new Map((resultsRes.data || []).map((r: any) => [r.exam_id, r]));

      const processed: Examination[] = (examsRes.data || []).map((e: any) => {
        const attempt = attemptByExam.get(e.exam_id);
        const result = resultByExam.get(e.exam_id);
        const { accessState, canStart } = computeAccessState(e, attempt?.status ?? null);
        return {
          exam_id: e.exam_id,
          title: e.title,
          description: e.description,
          duration_minutes: e.duration_minutes,
          start_time: e.start_time,
          end_time: e.end_time,
          total_marks: e.total_marks,
          pass_percentage: e.pass_percentage,
          negative_marks_per_question: e.negative_marks_per_question,
          status: e.status,
          results_released: e.results_released,
          question_count: e.exam_questions?.[0]?.count ?? 0,
          attempt_status: attempt?.status ?? null,
          attempt_id: attempt?.attempt_id ?? null,
          result_id: result?.result_id ?? null,
          marks_obtained: result?.marks_obtained ?? null,
          percentage: result?.percentage ?? null,
          result_status: result?.status ?? null,
          accessState,
          canStart,
          isReleased: e.results_released === true
        };
      });

      setExams(processed);
    } catch (err: any) {
      setError(err.message || 'Error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, [user?.id]);

  if (loading) {
    return <Spinner label="Loading candidate examination roster..." />;
  }

  const liveExams = exams.filter(e => e.accessState === 'live' || e.accessState === 'in_progress');
  const upcomingExams = exams.filter(e => e.accessState === 'upcoming');
  const completedExams = exams.filter(e => e.accessState === 'completed');

  const completedCount = completedExams.length;
  const completedWithScores = completedExams.filter(e => typeof e.percentage === 'number');
  const avgScore = completedWithScores.length > 0
    ? Math.round(completedWithScores.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / completedWithScores.length)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Candidate Academic Dossier Banner */}
      <div className="glass-panel animate-slide-up" style={{
        borderLeft: '4px solid var(--color-action)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <div style={{
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            fontWeight: 700,
            marginBottom: '0.2rem'
          }}>
            Candidate Examination Dossier
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {user?.name}
          </h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span>Roll: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{user?.rollNumber || 'UG/SOET/30/24/043'}</strong></span>
            <span>•</span>
            <span>B.Tech (Hons) CSE</span>
            <span>•</span>
            <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>Eligible</span>
          </div>
        </div>

        {/* Academic Metric Strip */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{
            padding: '0.5rem 0.85rem',
            backgroundColor: 'var(--bg-surface-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            minWidth: '80px'
          }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-success)', marginTop: '0.1rem' }}>{liveExams.length}</div>
          </div>
          <div style={{
            padding: '0.5rem 0.85rem',
            backgroundColor: 'var(--bg-surface-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            minWidth: '80px'
          }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.1rem' }}>{completedCount}</div>
          </div>
          <div style={{
            padding: '0.5rem 0.85rem',
            backgroundColor: 'var(--bg-surface-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            minWidth: '80px'
          }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Average</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-action)', marginTop: '0.1rem' }}>{completedWithScores.length > 0 ? `${avgScore}%` : '—'}</div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* 1. ACTIVE / LIVE EXAMINATIONS (High Priority Focus) */}
      <section className="animate-slide-up stagger-1">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="pulse-dot-live" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              Live Examinations Permitted for Attempt ({liveExams.length})
            </h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Schedule active • Direct entry
          </span>
        </div>

        {liveExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<BookOpen size={30} strokeWidth={1.5} />}
              title="No examinations are currently active for your cohort."
              description="Please consult the upcoming schedule below."
            />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
            {liveExams.map((exam, idx) => (
              <TiltCard
                key={exam.exam_id}
                maxTilt={4}
                className={`card animate-slide-up stagger-${(idx % 4) + 1}`}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '3px solid var(--color-action)' }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <Badge type={exam.attempt_status === 'in_progress' ? 'in_progress' : 'live'}>
                      {exam.attempt_status === 'in_progress' ? 'Session In Progress' : 'Live Examination'}
                    </Badge>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {exam.exam_id}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem', color: 'var(--color-brand-primary)' }}>
                    {exam.title}
                  </h3>

                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '1.25rem', lineHeight: 1.55 }}>
                    {exam.description || 'Departmental formal examination.'}
                  </p>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    backgroundColor: 'var(--bg-surface-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8125rem',
                    marginBottom: '1.25rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block', textTransform: 'uppercase' }}>Duration:</span>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.1rem' }}>
                        <Clock size={13} color="var(--color-action)" /> {exam.duration_minutes} Minutes
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block', textTransform: 'uppercase' }}>Weightage:</span>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.1rem' }}>
                        <FileText size={13} color="var(--color-success)" /> {exam.question_count || 10} MCQs ({exam.total_marks} Marks)
                      </strong>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onStartExam(exam.exam_id)}
                  className={`btn ${exam.attempt_status === 'in_progress' ? 'btn-primary' : 'btn-success'}`}
                  style={{ width: '100%' }}
                >
                  {exam.attempt_status === 'in_progress' ? (
                    <>
                      <RotateCcw size={15} /> Resume Examination Session
                    </>
                  ) : (
                    <>
                      <Play size={15} /> Review Instructions & Begin
                    </>
                  )}
                </button>
              </TiltCard>
            ))}
          </div>
        )}
      </section>

      {/* 2. UPCOMING EXAMINATIONS (Timeline Layout) */}
      <section className="animate-slide-up stagger-2">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
            Scheduled Upcoming Examinations ({upcomingExams.length})
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Schedule locked until configured start time (BR-02)
          </span>
        </div>

        {upcomingExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CalendarClock size={30} strokeWidth={1.5} />}
              title="No additional upcoming examinations currently scheduled."
            />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {upcomingExams.map((exam, idx) => (
              <div key={exam.exam_id} className={`card card-hover animate-slide-up stagger-${(idx % 4) + 1}`} style={{ backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <Badge type="scheduled">Scheduled</Badge>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {exam.exam_id}
                  </span>
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
                  {exam.title}
                </h3>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                  {exam.description}
                </p>

                <div style={{
                  backgroundColor: 'var(--color-warning-bg)',
                  border: '1px solid var(--color-warning-border)',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.78rem',
                  color: 'var(--color-warning)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  marginBottom: '1rem'
                }}>
                  <Calendar size={14} />
                  <span>
                    Opens: <strong>{new Date(exam.start_time).toLocaleString()}</strong>
                  </span>
                </div>

                <button disabled className="btn btn-secondary btn-sm" style={{ width: '100%', cursor: 'not-allowed' }}>
                  Locked Until Start Window
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. COMPLETED EXAMINATIONS & ACADEMIC TRANSCRIPTS */}
      <section className="animate-slide-up stagger-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
            Official Completed Examination Records ({completedExams.length})
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Provisional grade slips and evaluation records
          </span>
        </div>

        {completedExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Award size={30} strokeWidth={1.5} />}
              title="You have no recorded completed examinations for this academic term."
            />
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="academic-table">
                <thead>
                  <tr>
                    <th>Examination Paper</th>
                    <th>Weightage</th>
                    <th>Status</th>
                    <th>Marks Secured</th>
                    <th style={{ textAlign: 'right' }}>Official Document</th>
                  </tr>
                </thead>
                <tbody>
                  {completedExams.map(exam => (
                    <tr key={exam.exam_id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                          {exam.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {exam.exam_id} • {exam.duration_minutes} Mins Duration
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{exam.total_marks} Marks</strong>
                      </td>
                      <td>
                        <Badge type={exam.results_released ? 'released' : 'completed'}>
                          {exam.results_released ? 'Results Released' : 'Under Evaluation'}
                        </Badge>
                      </td>
                      <td>
                        {exam.results_released && typeof exam.marks_obtained === 'number' ? (
                          <div style={{ fontWeight: 700, color: exam.result_status === 'pass' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {exam.marks_obtained} / {exam.total_marks} ({exam.percentage}%)
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Withheld until release</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => onViewResult(exam.exam_id)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Award size={14} color="var(--color-action)" />
                          {exam.results_released ? 'View Grade Slip' : 'View Submission'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
