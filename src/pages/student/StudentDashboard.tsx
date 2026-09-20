import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination } from '../../types';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { SkeletonCards } from '../../components/common/Skeleton';
import { TiltCard } from '../../components/common/TiltCard';
import { formatDateTime, formatRelative, describeError } from '../../lib/format';
import {
  Clock,
  Calendar,
  FileText,
  Award,
  Play,
  RotateCcw,
  BookOpen,
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

/** Short, human-quotable reference derived from the real exam id. */
const shortRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartExam, onViewResult }) => {
  const { user } = useAuth();
  const [exams, setExams] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [examsRes, attemptsRes, resultsRes] = await Promise.all([
        supabase
          .from('examinations')
          .select(
            `
            exam_id:id, title, description, duration_minutes, start_time, end_time,
            total_marks, pass_percentage, negative_marks_per_question, status, results_released,
            exam_questions(count)
          `
          )
          .order('start_time', { ascending: true }),
        supabase.from('exam_attempts').select('exam_id, attempt_id:id, status').eq('user_id', user.id),
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
    } catch (err) {
      setError(describeError(err, 'Could not load your examination roster.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const liveExams = exams.filter(e => e.accessState === 'live' || e.accessState === 'in_progress');
  const upcomingExams = exams.filter(e => e.accessState === 'upcoming');
  const completedExams = exams.filter(e => e.accessState === 'completed');

  const completedWithScores = completedExams.filter(e => typeof e.percentage === 'number');
  const avgScore =
    completedWithScores.length > 0
      ? Math.round(
          completedWithScores.reduce((acc, curr) => acc + (curr.percentage || 0), 0) /
            completedWithScores.length
        )
      : null;

  return (
    <div className="page-stack">
      {/* Candidate banner */}
      <div className="glass-panel page-banner animate-slide-up">
        <div>
          <div className="page-banner__eyebrow">Candidate dashboard</div>
          <h1 className="page-banner__title">{user?.name}</h1>
          <div className="page-banner__desc" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {user?.rollNumber && (
              <span>
                Roll:{' '}
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                  {user.rollNumber}
                </strong>
              </span>
            )}
            {user?.department && (
              <>
                {user?.rollNumber && <span aria-hidden="true">•</span>}
                <span>{user.department}</span>
              </>
            )}
          </div>
        </div>

        <div className="metric-strip">
          <div className="metric-chip">
            <div className="metric-chip__label">Active</div>
            <div className="metric-chip__value" style={{ color: 'var(--color-success)' }}>
              {loading ? '—' : liveExams.length}
            </div>
          </div>
          <div className="metric-chip">
            <div className="metric-chip__label">Completed</div>
            <div className="metric-chip__value">{loading ? '—' : completedExams.length}</div>
          </div>
          <div className="metric-chip">
            <div className="metric-chip__label">Average</div>
            <div className="metric-chip__value" style={{ color: 'var(--color-action-hover)' }}>
              {loading || avgScore === null ? '—' : `${avgScore}%`}
            </div>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchExams} />}

      {/* 1. LIVE EXAMINATIONS */}
      <section className="animate-slide-up stagger-1">
        <div className="section-head">
          <h2 className="section-head__title">
            <span
              className="pulse-dot-live"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success)',
                display: 'inline-block'
              }}
              aria-hidden="true"
            />
            Available now {!loading && `(${liveExams.length})`}
          </h2>
          <span className="section-head__meta">Open for attempt within the scheduled window</span>
        </div>

        {loading ? (
          <SkeletonCards count={2} height="230px" label="Loading available examinations" />
        ) : liveExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<BookOpen size={28} strokeWidth={1.5} />}
              title="No examinations are open right now"
              description="Anything scheduled for you appears here the moment its window opens."
            />
          </div>
        ) : (
          <div className="card-grid">
            {liveExams.map((exam, idx) => (
              <TiltCard
                key={exam.exam_id}
                maxTilt={4}
                className={`card animate-slide-up stagger-${(idx % 4) + 1}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: '3px solid var(--color-action)'
                }}
              >
                <div>
                  <div className="detail-row" style={{ marginBottom: '0.7rem' }}>
                    <Badge type={exam.attempt_status === 'in_progress' ? 'in_progress' : 'live'}>
                      {exam.attempt_status === 'in_progress' ? 'In progress' : 'Live'}
                    </Badge>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {shortRef(exam.exam_id)}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>{exam.title}</h3>

                  {exam.description && (
                    <p
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.84rem',
                        marginBottom: '1.15rem',
                        lineHeight: 1.55
                      }}
                    >
                      {exam.description}
                    </p>
                  )}

                  <div className="meta-grid exam-summary-box">
                    <div>
                      <div className="meta-grid__label">Duration</div>
                      <div className="meta-grid__value">
                        <Clock size={13} color="var(--color-action-hover)" aria-hidden="true" />{' '}
                        {exam.duration_minutes} minutes
                      </div>
                    </div>
                    <div>
                      <div className="meta-grid__label">Paper</div>
                      <div className="meta-grid__value">
                        <FileText size={13} color="var(--color-success)" aria-hidden="true" />{' '}
                        {exam.question_count} questions · {exam.total_marks} marks
                      </div>
                    </div>
                  </div>

                  <p className="muted-note" style={{ marginBottom: '1.15rem' }}>
                    Closes {formatDateTime(exam.end_time)}
                  </p>
                </div>

                <button
                  onClick={() => onStartExam(exam.exam_id)}
                  className={`btn ${exam.attempt_status === 'in_progress' ? 'btn-primary' : 'btn-success'}`}
                  style={{ width: '100%' }}
                >
                  {exam.attempt_status === 'in_progress' ? (
                    <>
                      <RotateCcw size={15} aria-hidden="true" /> Resume examination
                    </>
                  ) : (
                    <>
                      <Play size={15} aria-hidden="true" /> Review instructions &amp; begin
                    </>
                  )}
                </button>
              </TiltCard>
            ))}
          </div>
        )}
      </section>

      {/* 2. UPCOMING */}
      <section className="animate-slide-up stagger-2">
        <div className="section-head">
          <h2 className="section-head__title">Scheduled {!loading && `(${upcomingExams.length})`}</h2>
          <span className="section-head__meta">Locked until the published start time</span>
        </div>

        {loading ? (
          <SkeletonCards count={2} height="150px" label="Loading scheduled examinations" />
        ) : upcomingExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CalendarClock size={28} strokeWidth={1.5} />}
              title="Nothing scheduled ahead"
              description="Upcoming papers appear here as soon as they are published."
            />
          </div>
        ) : (
          <div className="card-grid">
            {upcomingExams.map((exam, idx) => (
              <div
                key={exam.exam_id}
                className={`card card-hover animate-slide-up stagger-${(idx % 4) + 1}`}
              >
                <div className="detail-row" style={{ marginBottom: '0.55rem' }}>
                  <Badge type="scheduled">Scheduled</Badge>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    {shortRef(exam.exam_id)}
                  </span>
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>{exam.title}</h3>

                {exam.description && (
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.8125rem',
                      marginBottom: '1rem'
                    }}
                  >
                    {exam.description}
                  </p>
                )}

                <div className="schedule-note">
                  <Calendar size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span>
                    Opens <strong>{formatDateTime(exam.start_time)}</strong>
                    <span style={{ opacity: 0.8 }}> · {formatRelative(exam.start_time)}</span>
                  </span>
                </div>

                <div className="muted-note" style={{ marginTop: '0.75rem' }}>
                  {exam.duration_minutes} minutes · {exam.total_marks} marks
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. COMPLETED */}
      <section className="animate-slide-up stagger-3">
        <div className="section-head">
          <h2 className="section-head__title">Completed {!loading && `(${completedExams.length})`}</h2>
          <span className="section-head__meta">Grade slips and submission records</span>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <SkeletonCards count={1} height="120px" label="Loading completed examinations" />
          </div>
        ) : completedExams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Award size={28} strokeWidth={1.5} />}
              title="No completed examinations yet"
              description="Once you submit a paper it is recorded here with its grade slip."
            />
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Examination</th>
                    <th scope="col">Total marks</th>
                    <th scope="col">Status</th>
                    <th scope="col">Score</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Grade slip
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {completedExams.map(exam => (
                    <tr key={exam.exam_id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{exam.title}</div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          {shortRef(exam.exam_id)} · {exam.duration_minutes} min
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{exam.total_marks}</td>
                      <td>
                        <Badge type={exam.results_released ? 'released' : 'completed'}>
                          {exam.results_released ? 'Released' : 'Under evaluation'}
                        </Badge>
                      </td>
                      <td>
                        {exam.results_released && typeof exam.marks_obtained === 'number' ? (
                          <div
                            style={{
                              fontWeight: 700,
                              color:
                                exam.result_status === 'pass'
                                  ? 'var(--color-success)'
                                  : 'var(--color-danger)'
                            }}
                          >
                            {exam.marks_obtained} / {exam.total_marks}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                              {' '}
                              ({exam.percentage}%)
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                            Withheld until release
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => onViewResult(exam.exam_id)} className="btn btn-secondary btn-sm">
                          <Award size={14} aria-hidden="true" />
                          {exam.results_released ? 'View grade slip' : 'View submission'}
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
