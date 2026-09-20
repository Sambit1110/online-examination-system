import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { ErrorBanner, ErrorState } from '../../components/common/ErrorState';
import { formatDateTime, describeError } from '../../lib/format';
import { Clock, Award, ArrowLeft, Play, AlertTriangle, FileCheck, FileQuestion } from 'lucide-react';

interface ExamInstructionsPageProps {
  examId: string;
  onProceedToExam: () => void;
  onBack: () => void;
}

type ScheduleStatus = 'permitted' | 'not_started_yet' | 'access_period_ended' | 'already_submitted';

export const ExamInstructionsPage: React.FC<ExamInstructionsPageProps> = ({
  examId,
  onProceedToExam,
  onBack
}) => {
  const { user } = useAuth();
  const [exam, setExam] = useState<Examination | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>('permitted');
  const [confirmedDeclaration, setConfirmedDeclaration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchInstructions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setLoadFailed(false);

    try {
      const [examRes, countRes, attemptRes] = await Promise.all([
        supabase
          .from('examinations')
          .select(
            'exam_id:id, title, description, duration_minutes, start_time, end_time, total_marks, pass_percentage, negative_marks_per_question, status, results_released'
          )
          .eq('id', examId)
          .single(),
        supabase
          .from('exam_questions')
          .select('question_id', { count: 'exact', head: true })
          .eq('exam_id', examId),
        supabase
          .from('exam_attempts')
          .select('status')
          .eq('exam_id', examId)
          .eq('user_id', user.id)
          .maybeSingle()
      ]);

      if (examRes.error) throw new Error('This examination could not be found.');

      const examData = examRes.data as unknown as Examination;
      setExam(examData);

      const now = new Date();
      const start = new Date(examData.start_time);
      const end = new Date(examData.end_time);

      let status: ScheduleStatus = 'permitted';
      if (attemptRes.data && (attemptRes.data.status === 'submitted' || attemptRes.data.status === 'timed_out')) {
        status = 'already_submitted';
      } else if (now < start) {
        status = 'not_started_yet';
      } else if (now > end) {
        status = 'access_period_ended';
      }
      setScheduleStatus(status);

      const questionCount = countRes.count || 0;
      setRules([
        `You have ${examData.duration_minutes} minutes. The timer starts the moment you enter the paper and does not pause.`,
        `All ${questionCount} questions are navigable at any time from the question palette.`,
        'You may change any answer until you submit.',
        examData.negative_marks_per_question > 0
          ? `Negative marking applies: ${examData.negative_marks_per_question} mark(s) are deducted for each incorrect answer.`
          : 'There is no negative marking for incorrect answers.',
        'Unanswered questions score zero.',
        'The paper is submitted automatically when the timer reaches 00:00.',
        'Answers are saved to the university server as you go. If your connection drops, the portal keeps retrying and warns you before you close the tab.',
        'Tab and window focus changes are recorded for examination integrity. No camera, microphone or screen recording is used.',
        'Once submitted, the paper is locked and cannot be reopened.'
      ]);
    } catch (err) {
      setError(describeError(err, 'Unable to load the examination instructions.'));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [examId, user]);

  useEffect(() => {
    fetchInstructions();
  }, [fetchInstructions]);

  const handleStartExam = async () => {
    if (!confirmedDeclaration) return;
    setStarting(true);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('start_exam_attempt', { p_exam_id: examId });
      if (rpcError) throw rpcError;
      onProceedToExam();
    } catch (err) {
      // The server is authoritative on the schedule window; if it refuses,
      // show exactly why and re-sync this screen's state.
      setError(describeError(err, 'Failed to start the examination.'));
      setStarting(false);
      fetchInstructions();
    }
  };

  if (loading) {
    return <Spinner label="Loading examination instructions…" />;
  }

  if (!exam) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '2rem auto' }}>
        <ErrorState
          title="Examination not found"
          message={error || 'This examination record could not be retrieved.'}
          onRetry={loadFailed ? fetchInstructions : undefined}
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onBack} className="btn btn-secondary">
            <ArrowLeft size={15} aria-hidden="true" /> Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const isScheduleLocked = scheduleStatus === 'not_started_yet';
  const isExpired = scheduleStatus === 'access_period_ended';
  const isAlreadySubmitted = scheduleStatus === 'already_submitted';
  const blocked = isScheduleLocked || isExpired || isAlreadySubmitted;

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }} className="section-stack">
      <button onClick={onBack} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} aria-hidden="true" /> Back to dashboard
      </button>

      <div className="card" style={{ padding: '2rem' }}>
        <header
          style={{
            borderBottom: '1px solid var(--border-prominent)',
            paddingBottom: '1.25rem',
            marginBottom: '1.5rem'
          }}
        >
          <div className="detail-row" style={{ marginBottom: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                fontWeight: 700,
                color: 'var(--color-action-hover)'
              }}
            >
              Examination briefing
            </span>
            {/* Reflects the real access state rather than always claiming "live". */}
            {isAlreadySubmitted ? (
              <Badge type="completed">Already submitted</Badge>
            ) : isExpired ? (
              <Badge type="draft">Window closed</Badge>
            ) : isScheduleLocked ? (
              <Badge type="scheduled">Not yet open</Badge>
            ) : (
              <Badge type="live">Open now</Badge>
            )}
          </div>
          <h1 className="serif-title" style={{ fontSize: '1.6rem' }}>
            {exam.title}
          </h1>
          {exam.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.4rem' }}>
              {exam.description}
            </p>
          )}
        </header>

        <div
          className="meta-grid"
          style={{
            backgroundColor: 'var(--bg-surface-secondary)',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <div>
            <div className="meta-grid__label">Candidate</div>
            <div className="meta-grid__value">{user?.name}</div>
          </div>
          {user?.rollNumber && (
            <div>
              <div className="meta-grid__label">Roll number</div>
              <div className="meta-grid__value" style={{ fontFamily: 'var(--font-mono)' }}>
                {user.rollNumber}
              </div>
            </div>
          )}
          <div>
            <div className="meta-grid__label">Duration</div>
            <div className="meta-grid__value" style={{ color: 'var(--color-action-hover)' }}>
              <Clock size={14} aria-hidden="true" /> {exam.duration_minutes} minutes
            </div>
          </div>
          <div>
            <div className="meta-grid__label">Maximum marks</div>
            <div className="meta-grid__value" style={{ color: 'var(--color-success)' }}>
              <Award size={14} aria-hidden="true" /> {exam.total_marks}
            </div>
          </div>
          <div>
            <div className="meta-grid__label">Pass mark</div>
            <div className="meta-grid__value">{exam.pass_percentage}%</div>
          </div>
          <div>
            <div className="meta-grid__label">Window closes</div>
            <div className="meta-grid__value">{formatDateTime(exam.end_time)}</div>
          </div>
        </div>

        {isScheduleLocked && (
          <div className="confirm-callout" style={{ marginBottom: '1.25rem' }} role="status">
            <Clock size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
            <div>
              <strong>Not open yet.</strong> This examination becomes available on{' '}
              <strong>{formatDateTime(exam.start_time)}</strong>.
            </div>
          </div>
        )}

        {isExpired && (
          <div className="confirm-callout confirm-callout--danger" style={{ marginBottom: '1.25rem' }} role="status">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
            <div>
              <strong>Access window closed.</strong> The deadline for this paper passed on{' '}
              <strong>{formatDateTime(exam.end_time)}</strong>.
            </div>
          </div>
        )}

        {isAlreadySubmitted && (
          <div className="confirm-callout confirm-callout--info" style={{ marginBottom: '1.25rem' }} role="status">
            <FileCheck size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
            <div>
              <strong>Submission recorded.</strong> You have already submitted this paper. Re-attempts are
              not permitted.
            </div>
          </div>
        )}

        <section style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              marginBottom: '0.85rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <FileQuestion size={14} aria-hidden="true" /> Before you begin
          </h2>
          <ol className="rule-list">
            {rules.map((rule, idx) => (
              <li key={idx} className="rule-list__item">
                <span className="rule-list__index" aria-hidden="true">
                  {idx + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        {error && (
          <div style={{ marginBottom: '1.25rem' }}>
            <ErrorBanner message={error} />
          </div>
        )}

        <div className="attestation">
          <label className="attestation__label" style={{ cursor: blocked ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmedDeclaration}
              disabled={blocked}
              onChange={e => setConfirmedDeclaration(e.target.checked)}
              className="attestation__checkbox"
            />
            <span>
              <strong>Declaration:</strong> I confirm I am <strong>{user?.name}</strong>
              {user?.rollNumber ? ` (Roll ${user.rollNumber})` : ''} and that I will attempt this
              assessment independently, without unauthorised assistance, in line with the university code
              of academic conduct.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={onBack} className="btn btn-secondary" disabled={starting}>
            Cancel
          </button>
          <button
            onClick={handleStartExam}
            disabled={!confirmedDeclaration || starting || blocked}
            className="btn btn-success btn-lg"
          >
            {starting ? (
              <>
                <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                Starting session…
              </>
            ) : (
              <>
                <Play size={16} aria-hidden="true" /> Begin examination
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
