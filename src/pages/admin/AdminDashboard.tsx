import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { StatTile } from '../../components/common/StatTile';
import { EmptyState } from '../../components/common/EmptyState';
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
  ShieldCheck
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load administrative metrics');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [token]);

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
                          <Badge type={ex.results_released === 1 ? 'released' : 'scheduled'}>
                            {ex.results_released === 1 ? 'Released' : 'Withheld'}
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
