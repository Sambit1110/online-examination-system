import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Result, Examination, IntegritySummary, IntegrityEvent } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { StatTile } from '../../components/common/StatTile';
import { Modal } from '../../components/common/Modal';
import {
  Award,
  Search,
  Filter,
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Share2,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  Eye,
  LogOut,
  LogIn
} from 'lucide-react';

const INTEGRITY_EVENT_LABELS: Record<IntegrityEvent['type'], { label: string; icon: React.ReactNode }> = {
  tab_hidden: { label: 'Left the exam tab', icon: <EyeOff size={14} color="var(--color-warning)" /> },
  tab_visible: { label: 'Returned to the exam tab', icon: <Eye size={14} color="var(--color-success)" /> },
  window_blur: { label: 'Window lost focus', icon: <LogOut size={14} color="var(--color-warning)" /> },
  window_focus: { label: 'Window regained focus', icon: <LogIn size={14} color="var(--color-success)" /> }
};

export const AdminResultsPage: React.FC = () => {
  const { token } = useAuth();
  const [exams, setExams] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('EXAM-CS201');
  const [results, setResults] = useState<Result[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [integrityByAttempt, setIntegrityByAttempt] = useState<Record<string, IntegritySummary>>({});
  const [trailFor, setTrailFor] = useState<{ summary: IntegritySummary; studentName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExamList = async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/exams/admin', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          setExams(d.examinations || []);
          if (d.examinations && d.examinations.length > 0 && !selectedExamId) {
            setSelectedExamId(d.examinations[0].exam_id);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchExamList();
  }, [token]);

  const fetchExamResults = async (examId: string) => {
    if (!token || !examId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/results/admin/exam/${examId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch results');
      const data = await res.json();
      setResults(data.results || []);
      setStats(data.stats || null);
      setIntegrityByAttempt(data.integrityByAttempt || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedExamId) {
      fetchExamResults(selectedExamId);
    }
  }, [selectedExamId, token]);

  const filteredResults = results.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.student_name?.toLowerCase().includes(term) ||
      r.roll_number?.toLowerCase().includes(term) ||
      r.student_email?.toLowerCase().includes(term)
    );
  });

  const handleToggleRelease = async () => {
    const currentExam = exams.find(e => e.exam_id === selectedExamId);
    if (!currentExam) return;
    const nextState = currentExam.results_released !== 1;

    try {
      const res = await fetch(`/api/exams/${selectedExamId}/release-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ release: nextState })
      });
      if (res.ok) {
        // Update local exams list
        setExams(exams.map(e => e.exam_id === selectedExamId ? { ...e, results_released: nextState ? 1 : 0 } : e));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const currentExam = exams.find(e => e.exam_id === selectedExamId);
  const isReleased = currentExam?.results_released === 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Examination Gradebook & Evaluation Analytics"
        subtitle="Inspect candidate scores, percentage distribution, and control result publication (REQ-48, REQ-49)."
      >
        {currentExam && (
          <button
            onClick={handleToggleRelease}
            className={`btn btn-sm ${isReleased ? 'btn-success' : 'btn-primary'}`}
          >
            <Share2 size={15} />
            {isReleased ? 'Results Released to Students' : 'Release Results to Students'}
          </button>
        )}
      </PageHeader>

      {/* Select Exam & Search Controls */}
      <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 300px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
            Select Examination Cohort:
          </label>
          <select
            className="form-select"
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
          >
            {exams.map(ex => (
              <option key={ex.exam_id} value={ex.exam_id}>
                {ex.title} ({ex.exam_id})
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 240px', position: 'relative', marginTop: '1.25rem' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search candidate by name or roll..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      {/* Examination Performance Metrics Strip */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem'
        }}>
          <StatTile label="Total Candidates" value={stats.totalCandidates} />
          <StatTile label="Average Score" value={`${stats.averagePercentage}%`} valueColor="var(--color-action)" />
          <StatTile label="Qualified Candidates" value={stats.passedCandidates} valueColor="var(--color-success)" />
          <StatTile label="Highest Score" value={`${stats.highestPercentage}%`} valueColor="#4338ca" />
        </div>
      )}

      {/* Gradebook Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner label="Loading gradebook records..." />
        ) : filteredResults.length === 0 ? (
          <EmptyState icon={<Award size={30} strokeWidth={1.5} />} title="No candidate submissions found for this examination." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Candidate Details</th>
                  <th>Marks Secured</th>
                  <th>Percentage</th>
                  <th>Correct / Total</th>
                  <th>Result Status</th>
                  <th>Integrity</th>
                  <th>Submission Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map(res => {
                  const integrity = integrityByAttempt[res.attempt_id];
                  const awayCount = integrity ? integrity.tabHiddenCount + integrity.windowBlurCount : 0;
                  return (
                  <tr key={res.result_id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                        {res.student_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Roll: {res.roll_number || 'N/A'} • {res.student_email}
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: '1rem', color: 'var(--color-brand-primary)', fontFamily: 'var(--font-heading)' }}>
                        {res.marks_obtained}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> / {res.total_marks}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: res.status === 'pass' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {res.percentage}%
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8125rem' }}>
                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{res.correct_count} correct</span>
                        <span style={{ color: 'var(--text-muted)' }}> / {res.total_questions} questions</span>
                      </div>
                    </td>
                    <td>
                      <Badge type={res.status === 'pass' ? 'pass' : 'fail'}>
                        {res.status === 'pass' ? 'QUALIFIED' : 'FAILED'}
                      </Badge>
                    </td>
                    <td>
                      {integrity ? (
                        <button
                          onClick={() => setTrailFor({ summary: integrity, studentName: res.student_name || 'Candidate' })}
                          className="btn btn-secondary btn-sm"
                          title="View exam-session integrity trail"
                          aria-label={`View integrity trail for ${res.student_name}`}
                          style={awayCount > 0 ? { color: 'var(--color-warning)', borderColor: 'var(--color-warning-border)', backgroundColor: 'var(--color-warning-bg)' } : { color: 'var(--color-success)' }}
                        >
                          {awayCount > 0 ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                          {awayCount > 0 ? `${awayCount} noted` : 'Clean'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not tracked</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {new Date(res.evaluated_at).toLocaleString()}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INTEGRITY TRAIL VIEWER */}
      <Modal
        isOpen={!!trailFor}
        onClose={() => setTrailFor(null)}
        title="Exam Session Integrity Trail"
        footer={
          <button onClick={() => setTrailFor(null)} className="btn btn-secondary">
            Close
          </button>
        }
      >
        {trailFor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.84rem' }}>
              Candidate: <strong>{trailFor.studentName}</strong>
              {trailFor.summary.examTitle && <> • {trailFor.summary.examTitle}</>}
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: (trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount) > 0 ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
                border: `1px solid ${(trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount) > 0 ? 'var(--color-warning-border)' : 'var(--color-success-border)'}`,
                color: (trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount) > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem'
              }}
            >
              {(trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount) > 0 ? <ShieldAlert size={16} style={{ flexShrink: 0 }} /> : <ShieldCheck size={16} style={{ flexShrink: 0 }} />}
              <span>
                <strong>{trailFor.summary.tabHiddenCount}</strong> tab exit{trailFor.summary.tabHiddenCount === 1 ? '' : 's'} •{' '}
                <strong>{trailFor.summary.windowBlurCount}</strong> focus loss{trailFor.summary.windowBlurCount === 1 ? '' : 'es'} •{' '}
                <strong>{Math.round(trailFor.summary.totalAwayMs / 1000)}s</strong> total away time
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              This is an observational trail only — it does not affect the candidate's score. A small number of
              brief events is common and expected; use judgement rather than treating any single event as proof
              of misconduct.
            </p>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {trailFor.summary.events.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  No focus-loss events were recorded during this session.
                </div>
              ) : (
                trailFor.summary.events.map((evt, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.7rem',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {INTEGRITY_EVENT_LABELS[evt.type]?.icon}
                      <span>{INTEGRITY_EVENT_LABELS[evt.type]?.label || evt.type}</span>
                      {typeof evt.awayMs === 'number' && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          (away {Math.round(evt.awayMs / 1000)}s)
                        </span>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
