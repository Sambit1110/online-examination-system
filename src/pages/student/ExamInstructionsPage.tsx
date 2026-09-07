import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Examination } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import {
  Clock,
  FileQuestion,
  Award,
  ArrowLeft,
  Play,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

interface ExamInstructionsPageProps {
  examId: string;
  onProceedToExam: () => void;
  onBack: () => void;
}

export const ExamInstructionsPage: React.FC<ExamInstructionsPageProps> = ({
  examId,
  onProceedToExam,
  onBack
}) => {
  const { user, token } = useAuth();
  const [exam, setExam] = useState<Examination | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [scheduleStatus, setScheduleStatus] = useState<string>('');
  const [confirmedDeclaration, setConfirmedDeclaration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInstructions = async () => {
      if (!token) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/exams/instructions/${examId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to load instructions');
        }
        const data = await res.json();
        setExam(data.exam);
        setRules(data.rules || []);
        setScheduleStatus(data.scheduleStatus);
      } catch (err: any) {
        setError(err.message || 'Error loading examination instructions');
      } finally {
        setLoading(false);
      }
    };

    fetchInstructions();
  }, [examId, token]);

  const handleStartExam = async () => {
    if (!confirmedDeclaration) return;
    setStarting(true);
    setError(null);

    try {
      const res = await fetch(`/api/conduct/start/${examId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start examination');
      }

      onProceedToExam();
    } catch (err: any) {
      setError(err.message);
      setStarting(false);
    }
  };

  if (loading) {
    return <Spinner label="Loading examination protocol directives..." />;
  }

  if (!exam) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '2rem auto', textAlign: 'center', padding: '2rem' }}>
        <AlertTriangle size={30} color="var(--color-danger)" style={{ margin: '0 auto 0.75rem' }} />
        <h3>Examination Record Not Located</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>{error || 'Unable to retrieve examination instructions.'}</p>
        <button onClick={onBack} className="btn btn-secondary" style={{ marginTop: '1.25rem' }}>
          <ArrowLeft size={15} /> Return to Dashboard
        </button>
      </div>
    );
  }

  const isScheduleLocked = scheduleStatus === 'not_started_yet';
  const isExpired = scheduleStatus === 'access_period_ended';
  const isAlreadySubmitted = scheduleStatus === 'already_submitted';

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <button
        onClick={onBack}
        className="btn btn-secondary btn-sm"
        style={{ alignSelf: 'flex-start' }}
      >
        <ArrowLeft size={15} /> Back to Dashboard
      </button>

      {/* Main Examination Directive Card */}
      <div className="card" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{
          borderBottom: '1px solid var(--border-prominent)',
          paddingBottom: '1.25rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--color-action)' }}>
              Examination Directive • Confidential Assessment Session
            </span>
            <Badge type="live">Live Session</Badge>
          </div>
          <h1 className="serif-title" style={{ fontSize: '1.6rem', color: 'var(--color-brand-primary)' }}>
            {exam.title}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            {exam.description}
          </p>
        </div>

        {/* Candidate & Assessment Metadata Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-surface-secondary)',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1.5rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Candidate Name</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{user?.name}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>University Roll No.</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{user?.rollNumber || 'UG/SOET/30/24/043'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Allotted Duration</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-action)' }}>
              <Clock size={14} /> {exam.duration_minutes} Minutes
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Maximum Marks</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-success)' }}>
              <Award size={14} /> {exam.total_marks} Marks
            </div>
          </div>
        </div>

        {/* Status Alerts if applicable */}
        {isScheduleLocked && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning-border)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-warning)',
            marginBottom: '1.25rem',
            fontSize: '0.84rem'
          }}>
            <Clock size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Schedule Lockout Active (BR-02):</strong> This examination window opens on <strong>{new Date(exam.start_time).toLocaleString()}</strong>.
            </div>
          </div>
        )}

        {isExpired && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-danger)',
            marginBottom: '1.25rem',
            fontSize: '0.84rem'
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Access Window Terminated (BR-03):</strong> The cutoff for this examination closed on <strong>{new Date(exam.end_time).toLocaleString()}</strong>.
            </div>
          </div>
        )}

        {isAlreadySubmitted && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            color: '#1e40af',
            marginBottom: '1.25rem',
            fontSize: '0.84rem'
          }}>
            <FileCheck size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Submission Recorded:</strong> You have previously submitted your answers for this paper (BR-09).
            </div>
          </div>
        )}

        {/* Numbered Rules and Guidelines */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--color-brand-primary)' }}>
            Institutional Candidate Guidelines
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-main)', fontSize: '0.84rem', lineHeight: 1.55 }}>
            {rules.map((rule, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-action)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginTop: '0.05rem' }}>
                  [{idx + 1}]
                </span>
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: '1.25rem' }} role="alert">{error}</div>}

        {/* Formal Attestation Box */}
        <div style={{
          border: '1px solid var(--border-prominent)',
          backgroundColor: '#fafaf9',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1.5rem'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            cursor: isScheduleLocked || isExpired || isAlreadySubmitted ? 'not-allowed' : 'pointer',
            fontSize: '0.8125rem',
            color: 'var(--text-main)',
            lineHeight: 1.5
          }}>
            <input
              type="checkbox"
              checked={confirmedDeclaration}
              disabled={isScheduleLocked || isExpired || isAlreadySubmitted}
              onChange={e => setConfirmedDeclaration(e.target.checked)}
              style={{ marginTop: '0.15rem', width: '1rem', height: '1rem', accentColor: 'var(--color-action)' }}
            />
            <span>
              <strong>Candidate Attestation:</strong> I hereby declare that I am <strong>{user?.name}</strong> (Roll: <strong>{user?.rollNumber || 'UG/SOET/30/24/043'}</strong>). I confirm that I will attempt this assessment independently without unauthorized aids, adhering strictly to university code of academic conduct.
            </span>
          </label>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button onClick={onBack} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleStartExam}
            disabled={!confirmedDeclaration || starting || isScheduleLocked || isExpired || isAlreadySubmitted}
            className="btn btn-success btn-lg"
          >
            {starting ? (
              <>
                <span className="spinner spinner-sm" style={{ borderTopColor: '#ffffff', borderColor: 'rgba(255,255,255,0.35)' }} />
                Initializing Exam Session...
              </>
            ) : (
              <>
                <Play size={16} /> Enter Examination Interface
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
