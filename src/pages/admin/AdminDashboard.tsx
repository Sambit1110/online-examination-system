import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { StatTile } from '../../components/common/StatTile';
import { EmptyState } from '../../components/common/EmptyState';
import { LiveAttempt } from '../../types';
import {
  Users,
  FileText,
  Calendar,
  Award,
  Database,
  PlusCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Download,
  Activity,
  ShieldCheck,
  Radio,
  Monitor
} from 'lucide-react';

// How often the live monitor re-polls the server. Frequent enough to feel
// "live" in a demo, gentle enough to not hammer the API for a handful of
// concurrent candidates.
const LIVE_POLL_INTERVAL_MS = 8000;

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveAttempts, setLiveAttempts] = useState<LiveAttempt[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    if (!user) return;
    try {
      setLoading(true);

      const [
        studentsCount, examsCount, activeExamsCount, questionsCount, submissionsCount,
        recentSubmissionsRes, recentActivityRes, examsForPerf, resultsForPerf
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('examinations').select('id', { count: 'exact', head: true }),
        supabase.from('examinations').select('id', { count: 'exact', head: true }).in('status', ['live', 'scheduled']),
        supabase.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('results').select('id', { count: 'exact', head: true }),
        supabase
          .from('results')
          .select('result_id:id, marks_obtained, total_marks, percentage, status, evaluated_at, exam_id, profiles(name, roll_number), examinations(title)')
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
          .neq('status', 'draft'),
        supabase.from('results').select('exam_id, percentage, status')
      ]);

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
        const avgPercentage = candidateCount > 0
          ? examResults.reduce((sum: number, r: any) => sum + r.percentage, 0) / candidateCount
          : 0;
        const passCount = examResults.filter((r: any) => r.status === 'pass').length;
        return {
          exam_id: ex.exam_id,
          title: ex.title,
          total_marks: ex.total_marks,
          results_released: ex.results_released,
          candidate_count: candidateCount,
          avg_percentage: avgPercentage,
          pass_count: passCount
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [user?.id]);

  // Live Exam Activity monitor — polls independently of the main metrics load
  // so it can refresh on its own cadence without re-triggering the full-page
  // spinner. Never blocks or is blocked by the rest of the dashboard.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchLiveAttempts = async () => {
      try {
        const { data: attempts, error: attemptsError } = await supabase
          .from('exam_attempts')
          .select('attempt_id:id, exam_id, start_time, profiles(name, roll_number), examinations(title, duration_minutes, exam_questions(count))')
          .eq('status', 'in_progress')
          .order('start_time', { ascending: true });

        if (attemptsError) throw attemptsError;

        const attemptIds = (attempts || []).map((a: any) => a.attempt_id);
        let answeredByAttempt = new Map<string, number>();
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
          const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
          return {
            attemptId: a.attempt_id,
            studentName: a.profiles?.name || 'Unknown',
            rollNumber: a.profiles?.roll_number ?? null,
            examTitle: a.examinations?.title || 'Unknown Exam',
            examId: a.exam_id,
            elapsedSeconds,
            remainingSeconds,
            answeredCount: answeredByAttempt.get(a.attempt_id) || 0,
            totalQuestions: a.examinations?.exam_questions?.[0]?.count ?? 0
          };
        });

        if (!cancelled) {
          setLiveAttempts(mapped);
          setLiveError(null);
        }
      } catch (err: any) {
        if (!cancelled) setLiveError(err.message);
      }
    };

    fetchLiveAttempts();
    const intervalId = setInterval(fetchLiveAttempts, LIVE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user?.id]);

  if (loading) {
    return <Spinner label="Loading administrative command center..." />;
  }

  const { metrics, recentSubmissions, recentActivity, examPerformance } = data || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div className="card animate-slide-up" style={{
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '4px solid var(--color-action)',
        padding: '1.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem'
      }}>
        <div>
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-action)', fontWeight: 700 }}>
            Office of the Controller of Examinations
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-brand-primary)', marginTop: '0.15rem' }}>
            Administrative Command Center
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
            Department of Computer Science & Engineering • Examination Operations Console
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('admin-exams')} className="btn btn-primary btn-sm">
            <PlusCircle size={14} /> Schedule Exam
          </button>
          <button onClick={() => onNavigate('admin-questions')} className="btn btn-secondary btn-sm">
            <FileText size={14} /> Author Question
          </button>
          <button onClick={() => onNavigate('admin-backup')} className="btn btn-secondary btn-sm">
            <Database size={14} /> System Backup
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* KPI Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <StatTile
          className="animate-slide-up stagger-1"
          label="Enrolled Students"
          value={metrics?.totalStudents || 0}
          meta="Verified candidate records"
          icon={<Users size={16} />}
        />
        <StatTile
          className="animate-slide-up stagger-2"
          label="Total Examinations"
          value={metrics?.totalExams || 0}
          meta={`${metrics?.activeExams || 0} Active / Scheduled`}
          icon={<Calendar size={16} />}
        />
        <StatTile
          className="animate-slide-up stagger-3"
          label="Question Bank"
          value={metrics?.questionCount || 0}
          meta="Verified objective questions"
          icon={<FileText size={16} />}
        />
        <StatTile
          className="animate-slide-up stagger-4"
          label="Total Submissions"
          value={metrics?.totalSubmissions || 0}
          meta="Evaluated attempts"
          icon={<Award size={16} />}
        />
      </div>

      {/* Live Exam Activity Monitor — real-time roster of in-progress attempts */}
      <div className="card animate-slide-up" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Radio size={16} color="var(--color-action)" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
              Live Exam Activity
            </h2>
            {liveAttempts.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className="pulse-dot-live" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Live
                </span>
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {liveAttempts.length} candidate{liveAttempts.length === 1 ? '' : 's'} in an active session • refreshes every {LIVE_POLL_INTERVAL_MS / 1000}s
          </span>
        </div>

        {liveError ? (
          <div className="error-banner">{liveError}</div>
        ) : liveAttempts.length === 0 ? (
          <EmptyState
            icon={<Monitor size={30} strokeWidth={1.5} />}
            title="No candidates are currently taking an examination."
            description="This panel updates automatically the moment a student starts a live exam."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Examination</th>
                  <th>Progress</th>
                  <th>Elapsed</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {liveAttempts.map(a => {
                  const progressPct = a.totalQuestions > 0 ? Math.round((a.answeredCount / a.totalQuestions) * 100) : 0;
                  const isCritical = a.remainingSeconds < 60;
                  const isWarning = a.remainingSeconds < 300;
                  return (
                    <tr key={a.attemptId}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{a.studentName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{a.rollNumber || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{a.examTitle}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '140px' }}>
                          <div className="progress-track" style={{ flex: 1 }}>
                            <div className="progress-fill" style={{ width: `${progressPct}%`, backgroundColor: 'var(--color-success)' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {a.answeredCount}/{a.totalQuestions}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {formatDuration(a.elapsedSeconds)}
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: isCritical ? 'var(--color-danger)' : (isWarning ? 'var(--color-warning)' : 'var(--text-main)')
                        }}>
                          {formatDuration(a.remainingSeconds)}
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

      {/* Main Operations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        {/* Left Column: Cohort Performance & Submissions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Cohort Performance Overview */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                Examination Cohort Performance
              </h2>
              <button onClick={() => onNavigate('admin-results')} className="btn btn-secondary btn-sm">
                Full Gradebook <ArrowRight size={13} />
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="academic-table">
                <thead>
                  <tr>
                    <th>Examination</th>
                    <th>Candidates</th>
                    <th>Average</th>
                    <th>Pass Rate</th>
                    <th>Results</th>
                  </tr>
                </thead>
                <tbody>
                  {examPerformance?.map((ex: any) => {
                    const passRate = ex.candidate_count > 0 ? Math.round((ex.pass_count / ex.candidate_count) * 100) : 0;
                    return (
                      <tr key={ex.exam_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{ex.title}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ex.exam_id}</div>
                        </td>
                        <td>{ex.candidate_count}</td>
                        <td style={{ fontWeight: 700 }}>
                          {ex.avg_percentage ? `${Math.round(ex.avg_percentage)}%` : '—'}
                        </td>
                        <td>
                          <span style={{ color: passRate >= 60 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
                            {passRate}%
                          </span>
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
          </div>

          {/* Recent Candidate Submissions Stream */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.85rem', color: 'var(--color-brand-primary)' }}>
              Recent Submission Stream
            </h2>

            {recentSubmissions?.length === 0 ? (
              <EmptyState title="No submissions recorded yet." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {recentSubmissions?.map((sub: any) => (
                  <div
                    key={sub.result_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                        {sub.student_name}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.45rem', fontFamily: 'var(--font-mono)' }}>
                          ({sub.roll_number})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {sub.exam_title}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: sub.status === 'pass' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {sub.marks_obtained} / {sub.total_marks} ({sub.percentage}%)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {new Date(sub.evaluated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Security Audit Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Activity size={16} color="var(--color-action)" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                  Administrative Audit Feed
                </h2>
              </div>
              <button onClick={() => onNavigate('admin-backup')} className="btn btn-secondary btn-sm">
                View All
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {recentActivity?.map((log: any) => (
                <div
                  key={log.log_id}
                  style={{
                    padding: '0.55rem 0.75rem',
                    borderRadius: 'var(--radius-xs)',
                    borderLeft: '3px solid var(--color-action)',
                    backgroundColor: 'var(--bg-page)',
                    fontSize: '0.78rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>{log.action}</span>
                    <span>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ color: 'var(--text-main)', lineHeight: 1.4 }}>{log.details}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-prominent)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-brand-primary)', marginBottom: '0.35rem' }}>
              Academic Integrity & Audit Protocol
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              All schedules, question revisions, and student attempts are permanently recorded with timestamps. Grading calculations are verified against official answer keys in atomic database transactions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
