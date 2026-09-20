import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/common/Badge';
import { StatTile } from '../../components/common/StatTile';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner, ErrorState } from '../../components/common/ErrorState';
import { SkeletonCards, SkeletonTable } from '../../components/common/Skeleton';
import { LiveAttempt } from '../../types';
import { useDocumentVisible } from '../../hooks/useDocumentVisible';
import { formatClock, formatTime, describeError } from '../../lib/format';
import {
  Users,
  FileText,
  Calendar,
  Award,
  Database,
  PlusCircle,
  ArrowRight,
  Activity,
  Radio,
  Monitor
} from 'lucide-react';

// How often the live monitor re-polls. Frequent enough to feel live, gentle
// enough not to hammer the API — and paused entirely while the tab is hidden.
const LIVE_POLL_INTERVAL_MS = 8000;

interface DashboardData {
  metrics: {
    totalStudents: number;
    totalExams: number;
    activeExams: number;
    questionCount: number;
    totalSubmissions: number;
  };
  recentSubmissions: any[];
  recentActivity: any[];
  examPerformance: any[];
}

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const isVisible = useDocumentVisible();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveAttempts, setLiveAttempts] = useState<LiveAttempt[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [
        studentsCount,
        examsCount,
        activeExamsCount,
        questionsCount,
        submissionsCount,
        recentSubmissionsRes,
        recentActivityRes,
        examsForPerf,
        resultsForPerf
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('examinations').select('id', { count: 'exact', head: true }),
        supabase
          .from('examinations')
          .select('id', { count: 'exact', head: true })
          .in('status', ['live', 'scheduled']),
        supabase.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('results').select('id', { count: 'exact', head: true }),
        supabase
          .from('results')
          .select(
            'result_id:id, marks_obtained, total_marks, percentage, status, evaluated_at, exam_id, profiles(name, roll_number), examinations(title)'
          )
          .order('evaluated_at', { ascending: false })
          .limit(6),
        supabase
          .from('audit_logs')
          .select('log_id:id, action, details, created_at, profiles(name)')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('examinations')
          .select('exam_id:id, title, total_marks, results_released')
          .neq('status', 'draft')
          .order('start_time', { ascending: false })
          .limit(10),
        supabase.from('results').select('exam_id, percentage, status')
      ]);

      const firstError = [
        studentsCount.error,
        examsCount.error,
        activeExamsCount.error,
        questionsCount.error,
        submissionsCount.error,
        recentSubmissionsRes.error,
        recentActivityRes.error,
        examsForPerf.error,
        resultsForPerf.error
      ].find(Boolean);
      if (firstError) throw firstError;

      const recentSubmissions = (recentSubmissionsRes.data || []).map((r: any) => ({
        result_id: r.result_id,
        marks_obtained: r.marks_obtained,
        total_marks: r.total_marks,
        percentage: r.percentage,
        status: r.status,
        evaluated_at: r.evaluated_at,
        student_name: r.profiles?.name,
        roll_number: r.profiles?.roll_number,
        exam_title: r.examinations?.title,
        exam_id: r.exam_id
      }));

      const recentActivity = (recentActivityRes.data || []).map((l: any) => ({
        log_id: l.log_id,
        action: l.action,
        details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details),
        created_at: l.created_at,
        user_name: l.profiles?.name
      }));

      const examPerformance = (examsForPerf.data || []).map((ex: any) => {
        const examResults = (resultsForPerf.data || []).filter((r: any) => r.exam_id === ex.exam_id);
        const candidateCount = examResults.length;
        return {
          exam_id: ex.exam_id,
          title: ex.title,
          total_marks: ex.total_marks,
          results_released: ex.results_released,
          candidate_count: candidateCount,
          avg_percentage:
            candidateCount > 0
              ? examResults.reduce((sum: number, r: any) => sum + r.percentage, 0) / candidateCount
              : 0,
          pass_count: examResults.filter((r: any) => r.status === 'pass').length
        };
      });

      setData({
        metrics: {
          totalStudents: studentsCount.count || 0,
          totalExams: examsCount.count || 0,
          activeExams: activeExamsCount.count || 0,
          questionCount: questionsCount.count || 0,
          totalSubmissions: submissionsCount.count || 0
        },
        recentSubmissions,
        recentActivity,
        examPerformance
      });
    } catch (err) {
      setError(describeError(err, 'Could not load the dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // ==========================================================
  // LIVE EXAM MONITOR
  // Polls on its own cadence so it never re-triggers the main
  // page spinner, and stops entirely while the tab is hidden.
  // ==========================================================
  const cancelledRef = useRef(false);

  const fetchLiveAttempts = useCallback(async () => {
    try {
      const { data: attempts, error: attemptsError } = await supabase
        .from('exam_attempts')
        .select(
          'attempt_id:id, exam_id, start_time, profiles(name, roll_number), examinations(title, duration_minutes, exam_questions(count))'
        )
        .eq('status', 'in_progress')
        .order('start_time', { ascending: true });

      if (attemptsError) throw attemptsError;

      const attemptIds = (attempts || []).map((a: any) => a.attempt_id);
      const answeredByAttempt = new Map<string, number>();
      if (attemptIds.length > 0) {
        const { data: answers } = await supabase
          .from('submitted_answers')
          .select('attempt_id')
          .in('attempt_id', attemptIds)
          .not('selected_option_id', 'is', null);
        for (const a of answers || []) {
          answeredByAttempt.set(a.attempt_id, (answeredByAttempt.get(a.attempt_id) || 0) + 1);
        }
      }

      const now = Date.now();
      const mapped: LiveAttempt[] = (attempts || []).map((a: any) => {
        const elapsedSeconds = Math.max(0, Math.floor((now - new Date(a.start_time).getTime()) / 1000));
        const totalSeconds = (a.examinations?.duration_minutes || 0) * 60;
        return {
          attemptId: a.attempt_id,
          studentName: a.profiles?.name || 'Unknown',
          rollNumber: a.profiles?.roll_number ?? null,
          examTitle: a.examinations?.title || 'Unknown exam',
          examId: a.exam_id,
          elapsedSeconds,
          remainingSeconds: Math.max(0, totalSeconds - elapsedSeconds),
          answeredCount: answeredByAttempt.get(a.attempt_id) || 0,
          totalQuestions: a.examinations?.exam_questions?.[0]?.count ?? 0
        };
      });

      if (!cancelledRef.current) {
        setLiveAttempts(mapped);
        setLiveError(null);
      }
    } catch (err) {
      if (!cancelledRef.current) setLiveError(describeError(err, 'Live monitor unavailable.'));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // Nothing is changing on screen while the operator is elsewhere, so
    // there is no reason to keep requesting it.
    if (!isVisible) return;

    cancelledRef.current = false;
    fetchLiveAttempts();
    const intervalId = window.setInterval(fetchLiveAttempts, LIVE_POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(intervalId);
    };
  }, [user, isVisible, fetchLiveAttempts]);

  if (error && !data) {
    return (
      <div className="card">
        <ErrorState title="Dashboard unavailable" message={error} onRetry={fetchMetrics} />
      </div>
    );
  }

  const metrics = data?.metrics;

  return (
    <div className="page-stack">
      <div className="glass-panel page-banner animate-slide-up">
        <div>
          <div className="page-banner__eyebrow">Office of the Controller of Examinations</div>
          <h1 className="page-banner__title">Examination console</h1>
          <p className="page-banner__desc">
            Department of Computer Science &amp; Engineering
          </p>
        </div>

        <div className="page-banner__actions">
          <button onClick={() => onNavigate('admin-exams')} className="btn btn-primary btn-sm">
            <PlusCircle size={14} aria-hidden="true" /> Schedule exam
          </button>
          <button onClick={() => onNavigate('admin-questions')} className="btn btn-secondary btn-sm">
            <FileText size={14} aria-hidden="true" /> Add question
          </button>
          <button onClick={() => onNavigate('admin-backup')} className="btn btn-secondary btn-sm">
            <Database size={14} aria-hidden="true" /> Backup
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchMetrics} />}

      {loading ? (
        <SkeletonCards count={4} height="92px" label="Loading dashboard metrics" />
      ) : (
        <div className="stat-grid">
          <StatTile
            className="animate-slide-up stagger-1"
            label="Enrolled students"
            value={metrics?.totalStudents ?? 0}
            meta="Candidate accounts"
            icon={<Users size={16} />}
          />
          <StatTile
            className="animate-slide-up stagger-2"
            label="Examinations"
            value={metrics?.totalExams ?? 0}
            meta={`${metrics?.activeExams ?? 0} live or scheduled`}
            icon={<Calendar size={16} />}
          />
          <StatTile
            className="animate-slide-up stagger-3"
            label="Question bank"
            value={metrics?.questionCount ?? 0}
            meta="Active questions"
            icon={<FileText size={16} />}
          />
          <StatTile
            className="animate-slide-up stagger-4"
            label="Submissions"
            value={metrics?.totalSubmissions ?? 0}
            meta="Graded attempts"
            icon={<Award size={16} />}
          />
        </div>
      )}

      {/* LIVE MONITOR */}
      <div className="glass-panel animate-slide-up" style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)' }}>
        <div className="section-head">
          <h2 className="section-head__title" style={{ fontSize: '1rem' }}>
            <Radio size={16} color="var(--color-action-hover)" aria-hidden="true" />
            Live exam activity
            {liveAttempts.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span
                  className="pulse-dot-live"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-success)',
                    display: 'inline-block'
                  }}
                  aria-hidden="true"
                />
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--color-success)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                >
                  Live
                </span>
              </span>
            )}
          </h2>
          <span className="section-head__meta">
            {liveAttempts.length} candidate{liveAttempts.length === 1 ? '' : 's'} in session ·{' '}
            {isVisible ? `refreshes every ${LIVE_POLL_INTERVAL_MS / 1000}s` : 'paused while tab is hidden'}
          </span>
        </div>

        {liveError ? (
          <ErrorBanner message={liveError} onRetry={fetchLiveAttempts} />
        ) : liveAttempts.length === 0 ? (
          <EmptyState
            icon={<Monitor size={28} strokeWidth={1.5} />}
            title="No examinations in progress"
            description="This panel updates automatically the moment a candidate starts a live exam."
          />
        ) : (
          <div className="table-wrap">
            <table className="academic-table">
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Examination</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Elapsed</th>
                  <th scope="col">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {liveAttempts.map(a => {
                  const progressPct =
                    a.totalQuestions > 0 ? Math.round((a.answeredCount / a.totalQuestions) * 100) : 0;
                  const isCritical = a.remainingSeconds < 60;
                  const isWarning = a.remainingSeconds < 300;

                  return (
                    <tr key={a.attemptId}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{a.studentName}</div>
                        <div className="row-meta" style={{ fontFamily: 'var(--font-mono)' }}>
                          {a.rollNumber || '—'}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{a.examTitle}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '140px' }}>
                          <div className="progress-track" style={{ flex: 1 }}>
                            <div
                              className="progress-fill"
                              style={
                                {
                                  '--fill': progressPct / 100,
                                  background: 'var(--color-success)'
                                } as React.CSSProperties
                              }
                            />
                          </div>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0
                            }}
                          >
                            {a.answeredCount}/{a.totalQuestions}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {formatClock(a.elapsedSeconds)}
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: isCritical
                              ? 'var(--color-danger)'
                              : isWarning
                                ? 'var(--color-warning)'
                                : 'var(--text-main)'
                          }}
                        >
                          {formatClock(a.remainingSeconds)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-split">
        <div className="section-stack">
          {/* COHORT PERFORMANCE */}
          <div className="card">
            <div className="section-head">
              <h2 className="section-head__title" style={{ fontSize: '0.95rem' }}>
                Cohort performance
              </h2>
              <button onClick={() => onNavigate('admin-results')} className="btn btn-secondary btn-sm">
                Gradebook <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <SkeletonTable rows={4} columns={5} label="Loading cohort performance" />
            ) : (data?.examPerformance.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Calendar size={28} strokeWidth={1.5} />}
                title="No published examinations yet"
                description="Performance appears here once an examination has been scheduled and attempted."
              />
            ) : (
              <div className="table-wrap">
                <table className="academic-table">
                  <thead>
                    <tr>
                      <th scope="col">Examination</th>
                      <th scope="col">Candidates</th>
                      <th scope="col">Average</th>
                      <th scope="col">Pass rate</th>
                      <th scope="col">Results</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.examPerformance.map((ex: any) => {
                      const passRate =
                        ex.candidate_count > 0
                          ? Math.round((ex.pass_count / ex.candidate_count) * 100)
                          : 0;
                      return (
                        <tr key={ex.exam_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{ex.title}</div>
                            <div className="row-meta">{ex.total_marks} marks</div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{ex.candidate_count}</td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {ex.candidate_count > 0 ? `${Math.round(ex.avg_percentage)}%` : '—'}
                          </td>
                          <td>
                            {ex.candidate_count > 0 ? (
                              <span
                                style={{
                                  color:
                                    passRate >= 60 ? 'var(--color-success)' : 'var(--color-warning)',
                                  fontWeight: 600
                                }}
                              >
                                {passRate}%
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <Badge type={ex.results_released ? 'released' : 'scheduled'}>
                              {ex.results_released ? 'Released' : 'Withheld'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RECENT SUBMISSIONS */}
          <div className="card">
            <div className="section-head">
              <h2 className="section-head__title" style={{ fontSize: '0.95rem' }}>
                Recent submissions
              </h2>
            </div>

            {loading ? (
              <SkeletonTable rows={3} columns={2} label="Loading recent submissions" />
            ) : (data?.recentSubmissions.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Award size={28} strokeWidth={1.5} />}
                title="No submissions yet"
                description="Graded papers appear here as candidates submit them."
              />
            ) : (
              <div className="section-stack" style={{ gap: '0.55rem' }}>
                {data?.recentSubmissions.map((sub: any) => (
                  <div key={sub.result_id} className="feed-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                        {sub.student_name}
                        {sub.roll_number && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--text-muted)',
                              marginLeft: '0.4rem',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            {sub.roll_number}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {sub.exam_title}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          fontFamily: 'var(--font-mono)',
                          color: sub.status === 'pass' ? 'var(--color-success)' : 'var(--color-danger)'
                        }}
                      >
                        {sub.marks_obtained}/{sub.total_marks}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {formatTime(sub.evaluated_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AUDIT FEED */}
        <div className="section-stack">
          <div className="card">
            <div className="section-head">
              <h2 className="section-head__title" style={{ fontSize: '0.95rem' }}>
                <Activity size={15} color="var(--color-action-hover)" aria-hidden="true" /> Recent activity
              </h2>
              <button onClick={() => onNavigate('admin-backup')} className="btn btn-secondary btn-sm">
                View all
              </button>
            </div>

            {loading ? (
              <SkeletonTable rows={5} columns={2} label="Loading recent activity" />
            ) : (data?.recentActivity.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Activity size={28} strokeWidth={1.5} />}
                title="No recorded activity yet"
              />
            ) : (
              <div className="section-stack" style={{ gap: '0.55rem' }}>
                {data?.recentActivity.map((log: any) => (
                  <div key={log.log_id} className="activity-row">
                    <div className="activity-row__head">
                      <span className="activity-row__action">{log.action}</span>
                      <span>{formatTime(log.created_at)}</span>
                    </div>
                    <div className="activity-row__detail">{log.details}</div>
                    {log.user_name && <div className="activity-row__user">by {log.user_name}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
