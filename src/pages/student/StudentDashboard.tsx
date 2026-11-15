import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination } from '../../types';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { SkeletonCards } from '../../components/common/Skeleton';
import { ExamWindowBar } from '../../components/poster/ExamWindowBar';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { formatDateTime, describeError } from '../../lib/format';
import { Award, RotateCcw, BookOpen, CalendarClock, ArrowRight } from 'lucide-react';

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

/** Derived from the device clock — not fabricated data. */
const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

/** Short, human-quotable reference derived from the real exam id. */
const shortRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onStartExam, onViewResult }) => {
  const { user } = useAuth();
  const [exams, setExams] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef, [loading, exams.length]);

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

  const greeting = greetingFor(new Date().getHours());
  const completedWithScores = completedExams.filter(e => typeof e.percentage === 'number');
  const avgScore =
    completedWithScores.length > 0
      ? Math.round(
          completedWithScores.reduce((acc, curr) => acc + (curr.percentage || 0), 0) /
            completedWithScores.length
        )
      : null;

  return (
    <div className="page-stack poster-dashboard" ref={rootRef}>
      <header className="poster-masthead">
        <div className="poster-masthead__identity">
          <h1 className="poster-masthead__name" data-reveal data-reveal-delay="1">{user?.name}</h1>
          <p className="poster-masthead__meta" data-reveal data-reveal-delay="2">
            {user?.rollNumber && <span>{user.rollNumber}</span>}
            {user?.department && <span>{user.department}</span>}
            <span>{greeting}</span>
          </p>
        </div>

        <p className="poster-masthead__summary" data-reveal data-reveal-delay="3" aria-live="polite">
          {loading ? (
            'Loading your examinations…'
          ) : (
            <>
              <strong>{liveExams.length}</strong> {liveExams.length === 1 ? 'paper' : 'papers'} open now
              <span className="poster-masthead__sep" aria-hidden="true" />
              <strong>{upcomingExams.length}</strong> scheduled
              <span className="poster-masthead__sep" aria-hidden="true" />
              <strong>{completedExams.length}</strong> completed
              {avgScore !== null && (
                <>
                  <span className="poster-masthead__sep" aria-hidden="true" />
                  average <strong>{avgScore}%</strong>
                </>
              )}
            </>
          )}
        </p>
      </header>

      {error && <ErrorBanner message={error} onRetry={fetchExams} />}

      {/* 1. OPEN NOW */}
      <section aria-labelledby="open-title">
        <div className="poster-section-head" data-reveal>
          <h2 id="open-title" className="poster-section-head__title">Open now</h2>
          <span className="poster-section-head__meta">Start within the scheduled window</span>
        </div>

        {loading ? (
          <SkeletonCards count={2} height="120px" label="Loading available examinations" />
        ) : liveExams.length === 0 ? (
          <div className="timetable-empty" data-reveal>
            <EmptyState
              icon={<BookOpen size={28} strokeWidth={1.5} />}
              title="No examinations are open right now"
              description="Anything scheduled for you appears here the moment its window opens."
            />
          </div>
        ) : (
          <ol className="timetable">
            {liveExams.map(exam => (
              <li key={exam.exam_id} className="timetable-row timetable-row--open" data-reveal>
                <div className="timetable-row__main">
                  <div className="timetable-row__status">
                    <Badge type={exam.attempt_status === 'in_progress' ? 'in_progress' : 'live'}>
                      {exam.attempt_status === 'in_progress' ? 'In progress' : 'Open'}
                    </Badge>
                    <span className="timetable-row__ref">{shortRef(exam.exam_id)}</span>
                  </div>
                  <h3 className="timetable-row__title">{exam.title}</h3>
                  {exam.description && <p className="timetable-row__desc">{exam.description}</p>}
                  <p className="timetable-row__facts">
                    <span>{exam.duration_minutes} min</span>
                    <span>{exam.question_count} questions</span>
                    <span>{exam.total_marks} marks</span>
                    {exam.negative_marks_per_question > 0 && (
                      <span>−{exam.negative_marks_per_question} per wrong answer</span>
                    )}
                  </p>
                </div>

                <div className="timetable-row__window">
                  <ExamWindowBar start={exam.start_time} end={exam.end_time} state="open" />
                </div>

                <div className="timetable-row__action">
                  <button
                    onClick={() => onStartExam(exam.exam_id)}
                    className="btn btn-primary timetable-row__button"
                  >
                    {exam.attempt_status === 'in_progress' ? (
                      <>
                        <RotateCcw size={15} aria-hidden="true" /> Resume
                      </>
                    ) : (
                      <>
                        Begin <ArrowRight size={15} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 2. SCHEDULED */}
      <section aria-labelledby="scheduled-title">
        <div className="poster-section-head" data-reveal>
          <h2 id="scheduled-title" className="poster-section-head__title">Scheduled</h2>
          <span className="poster-section-head__meta">Locked until the published start time</span>
        </div>

        {loading ? (
          <SkeletonCards count={2} height="100px" label="Loading scheduled examinations" />
        ) : upcomingExams.length === 0 ? (
          <div className="timetable-empty" data-reveal>
            <EmptyState
              icon={<CalendarClock size={28} strokeWidth={1.5} />}
              title="Nothing scheduled ahead"
              description="Upcoming papers appear here as soon as they are published."
            />
          </div>
        ) : (
          <ol className="timetable">
            {upcomingExams.map(exam => (
              <li key={exam.exam_id} className="timetable-row" data-reveal>
                <div className="timetable-row__main">
                  <div className="timetable-row__status">
                    <Badge type="scheduled">Scheduled</Badge>
                    <span className="timetable-row__ref">{shortRef(exam.exam_id)}</span>
                  </div>
                  <h3 className="timetable-row__title">{exam.title}</h3>
                  {exam.description && <p className="timetable-row__desc">{exam.description}</p>}
                  <p className="timetable-row__facts">
                    <span>{exam.duration_minutes} min</span>
                    <span>{exam.total_marks} marks</span>
                    <span>Opens {formatDateTime(exam.start_time)}</span>
                  </p>
                </div>
                <div className="timetable-row__window">
                  <ExamWindowBar start={exam.start_time} end={exam.end_time} state="upcoming" />
                </div>
                <div className="timetable-row__action" aria-hidden="true" />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 3. COMPLETED */}
      <section aria-labelledby="completed-title" data-reveal>
        <div className="poster-section-head">
          <h2 id="completed-title" className="poster-section-head__title">Completed</h2>
          <span className="poster-section-head__meta">Grade slips and submission records</span>
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
