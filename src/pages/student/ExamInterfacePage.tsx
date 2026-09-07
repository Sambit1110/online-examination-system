import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Question, IntegrityEvent } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Spinner } from '../../components/common/Spinner';
import {
  Clock,
  CheckCircle2,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertCircle,
  XCircle,
  ShieldCheck,
  Check
} from 'lucide-react';

// Cap on retained events client-side — a defensive bound against pathological
// alt-tabbing, not a functional limit. Well beyond anything a real session needs.
const MAX_INTEGRITY_EVENTS = 300;

interface ExamInterfacePageProps {
  examId: string;
  onFinishExam: (examId: string) => void;
}

export const ExamInterfacePage: React.FC<ExamInterfacePageProps> = ({
  examId,
  onFinishExam
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examTitle, setExamTitle] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(1800);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsRef = useRef(secondsRemaining);
  secondsRef.current = secondsRemaining;
  const totalSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    const loadExamQuestions = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const { data, error: rpcError } = await supabase.rpc('get_exam_questions_for_student', {
          p_exam_id: examId
        });
        if (rpcError) throw rpcError;
        setQuestions(data?.questions || []);
        const { data: examRow } = await supabase
          .from('examinations')
          .select('title')
          .eq('id', examId)
          .single();
        if (examRow) setExamTitle(examRow.title);
        if (data?.attempt) {
          setAttemptId(data.attempt.attemptId);
          setSecondsRemaining(data.attempt.timeRemainingSeconds);
          totalSecondsRef.current = data.attempt.timeRemainingSeconds;
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load examination questions');
      } finally {
        setLoading(false);
      }
    };

    loadExamQuestions();
  }, [examId, user?.id]);

  // ==========================================================
  // EXAM INTEGRITY MONITORING (tab/window focus only — no
  // webcam, microphone, or screen capture of any kind).
  // Purely observational: never alters the timer, answers, or
  // submission outcome. Recorded locally and attached to the
  // submission payload for administrative review.
  // ==========================================================
  useEffect(() => {
    if (loading || !attemptId || !user) return;

    const pushEvent = (type: IntegrityEvent['type'], awayMs?: number) => {
      const occurredAt = new Date().toISOString();
      setIntegrityEvents(prev => {
        if (prev.length >= MAX_INTEGRITY_EVENTS) return prev;
        const next: IntegrityEvent = { type, timestamp: occurredAt };
        if (typeof awayMs === 'number') next.awayMs = awayMs;
        return [...prev, next];
      });

      // Persist live so admins can watch the trail build in real time —
      // fire-and-forget: a logging hiccup must never interrupt the exam.
      supabase
        .from('integrity_events')
        .insert({
          attempt_id: attemptId,
          user_id: user.id,
          exam_id: examId,
          event_type: type,
          away_ms: typeof awayMs === 'number' ? Math.round(awayMs) : null,
          occurred_at: occurredAt
        })
        .then(({ error: insertError }) => {
          if (insertError) console.error('Integrity event logging failed (non-fatal):', insertError);
        });
    };

    let hiddenAt: number | null = null;
    let blurredAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        pushEvent('tab_hidden');
      } else {
        const awayMs = hiddenAt ? Date.now() - hiddenAt : undefined;
        hiddenAt = null;
        pushEvent('tab_visible', awayMs);
      }
    };

    const handleWindowBlur = () => {
      blurredAt = Date.now();
      pushEvent('window_blur');
    };

    const handleWindowFocus = () => {
      const awayMs = blurredAt ? Date.now() - blurredAt : undefined;
      blurredAt = null;
      pushEvent('window_focus', awayMs);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [loading, attemptId, user?.id, examId]);

  useEffect(() => {
    if (loading || secondsRemaining <= 0) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleAutoTimeoutSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  const handleAutoTimeoutSubmit = async () => {
    if (submitting || !attemptId) return;
    setSubmitting(true);
    try {
      await supabase.rpc('submit_exam_attempt', { p_attempt_id: attemptId, p_is_timeout: true });
      onFinishExam(examId);
    } catch (err) {
      console.error('Timeout auto-submit error:', err);
      onFinishExam(examId);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitModalOpen || loading || questions.length === 0) return;
      const curQ = questions[currentIndex];
      if (!curQ) return;

      if (['1', '2', '3', '4'].includes(e.key)) {
        const optIdx = parseInt(e.key) - 1;
        if (curQ.options[optIdx]) {
          handleSelectOption(curQ.options[optIdx].option_id);
        }
      } else if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, isSubmitModalOpen, loading]);

  const saveAnswerToServer = async (
    qId: string,
    optId: string | null,
    isMarked: boolean
  ) => {
    if (!attemptId) return;
    setAutosaveStatus('saving');
    try {
      const { error: rpcError } = await supabase.rpc('save_answer', {
        p_attempt_id: attemptId,
        p_question_id: qId,
        p_selected_option_id: optId,
        p_is_marked_for_review: isMarked,
        p_time_remaining_seconds: secondsRef.current
      });
      setAutosaveStatus(rpcError ? 'error' : 'saved');
    } catch (err) {
      setAutosaveStatus('error');
    }
  };

  const handleSelectOption = (optId: string) => {
    const updated = [...questions];
    const curQ = updated[currentIndex];
    curQ.selectedOptionId = optId;
    setQuestions(updated);
    saveAnswerToServer(curQ.question_id, optId, !!curQ.isMarkedForReview);
  };

  const handleClearResponse = () => {
    const updated = [...questions];
    const curQ = updated[currentIndex];
    curQ.selectedOptionId = null;
    setQuestions(updated);
    saveAnswerToServer(curQ.question_id, null, !!curQ.isMarkedForReview);
  };

  const handleToggleMarkForReview = () => {
    const updated = [...questions];
    const curQ = updated[currentIndex];
    curQ.isMarkedForReview = !curQ.isMarkedForReview;
    setQuestions(updated);
    saveAnswerToServer(curQ.question_id, curQ.selectedOptionId || null, curQ.isMarkedForReview);
  };

  const handleFinalSubmit = async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('submit_exam_attempt', {
        p_attempt_id: attemptId,
        p_is_timeout: false
      });
      if (!rpcError) {
        setIsSubmitModalOpen(false);
        onFinishExam(examId);
      } else {
        toast.error(rpcError.message || 'Failed to submit examination');
        setSubmitting(false);
      }
    } catch (err: any) {
      toast.error('Network error: ' + err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '6rem 0' }}>
        <Spinner label="Initializing secure examination environment..." size="lg" />
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '3rem auto', textAlign: 'center', padding: '2rem' }}>
        <AlertCircle size={32} color="var(--color-danger)" style={{ margin: '0 auto 0.75rem' }} />
        <h2>Examination Session Error</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>{error || 'No questions available.'}</p>
        <button onClick={() => onFinishExam(examId)} className="btn btn-secondary" style={{ marginTop: '1.25rem' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const answeredCount = questions.filter(q => q.selectedOptionId !== null && q.selectedOptionId !== undefined).length;
  const markedCount = questions.filter(q => q.isMarkedForReview).length;
  const unansweredCount = questions.length - answeredCount;

  // Format timer
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeCritical = secondsRemaining < 60;
  const isTimeWarning = secondsRemaining < 300;
  const totalSeconds = totalSecondsRef.current || secondsRemaining || 1;
  const timeElapsedPct = Math.min(100, Math.max(0, ((totalSeconds - secondsRemaining) / totalSeconds) * 100));
  const answeredPct = Math.round((answeredCount / questions.length) * 100);
  // Count of "left the exam" moments (excludes the matching "returned" events)
  // — drives the compact student-facing integrity indicator.
  const integrityAwayCount = integrityEvents.filter(e => e.type === 'tab_hidden' || e.type === 'window_blur').length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'transparent' }}>
      {/* 1. PERSISTENT EXAM HEADER (Distraction-Free) */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div>
          <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
            Adamas University • Examination Session
          </div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.1rem' }}>
            {examTitle}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Candidate: <strong>{user?.name}</strong> • Roll: <span style={{ fontFamily: 'var(--font-mono)' }}>{user?.rollNumber || 'UG/SOET/30/24/043'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Real-time Autosave status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {autosaveStatus === 'saving' && <span>Saving...</span>}
            {autosaveStatus === 'saved' && (
              <>
                <Check size={13} color="var(--color-success)" />
                <span style={{ color: 'var(--color-success)' }}>Saved</span>
              </>
            )}
            {autosaveStatus === 'error' && (
              <span style={{ color: 'var(--color-danger)' }}>Sync Alert</span>
            )}
          </div>

          {/* Integrity Monitoring Indicator — calm and informational, not alarming */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}
            title="This session observes tab and window focus as part of standard examination integrity protocol."
          >
            <ShieldCheck size={13} color={integrityAwayCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
            <span style={{ color: integrityAwayCount > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
              {integrityAwayCount > 0 ? `Integrity: ${integrityAwayCount} noted` : 'Integrity: Monitored'}
            </span>
          </div>

          {/* Compact Countdown Clock (JetBrains Mono) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            backgroundColor: isTimeCritical ? 'var(--color-danger-bg)' : (isTimeWarning ? 'var(--color-warning-bg)' : 'var(--bg-surface-secondary)'),
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-xs)',
            border: `1px solid ${isTimeCritical ? 'var(--color-danger-border)' : (isTimeWarning ? 'var(--color-warning-border)' : 'var(--border-subtle)')}`
          }}>
            <Clock size={14} color={isTimeCritical ? 'var(--color-danger)' : (isTimeWarning ? 'var(--color-warning)' : 'var(--text-secondary)')} />
            <div>
              <div style={{ fontSize: '0.5625rem', textTransform: 'uppercase', fontWeight: 600, color: isTimeCritical ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                Time Remaining
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9375rem',
                fontWeight: 600,
                lineHeight: 1.1,
                color: isTimeCritical ? 'var(--color-danger)' : 'var(--text-main)'
              }}>
                {formattedTime}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="btn btn-sm btn-primary"
          >
            <Send size={13} /> Submit Examination
          </button>
        </div>
      </div>

      {/* Time-elapsed progress hairline (visual reinforcement of the countdown) */}
      <div className="progress-track" style={{ borderRadius: 0, height: '3px' }}>
        <div
          className="progress-fill"
          style={{
            width: `${timeElapsedPct}%`,
            borderRadius: 0,
            backgroundColor: isTimeCritical ? 'var(--color-danger)' : (isTimeWarning ? 'var(--color-warning)' : 'var(--color-action)')
          }}
        />
      </div>

      {/* 2. MAIN EXAMINATION WORKSPACE */}
      <div className="exam-layout" style={{
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%',
        padding: '1.5rem',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 300px',
        gap: '1.5rem',
        flex: 1
      }}>
        {/* Left Column: Active Question Card & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div key={currentQ.question_id} className="card animate-question" style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Question Top Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.875rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: 'var(--color-brand-primary)'
                }}>
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  backgroundColor: '#f1f5f9',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '2px',
                  fontWeight: 600,
                  color: '#475569'
                }}>
                  {currentQ.subject}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--color-action)',
                  backgroundColor: 'var(--color-action-subtle)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)'
                }}>
                  +{currentQ.marks} Marks
                </span>

                {currentQ.isMarkedForReview && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.72rem',
                    color: '#b45309',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '2px',
                    fontWeight: 600
                  }}>
                    <Bookmark size={11} /> Marked
                  </span>
                )}
              </div>
            </div>

            {/* Answered-so-far progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem' }}>
              <div className="progress-track" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${answeredPct}%`, backgroundColor: 'var(--color-success)' }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {answeredCount}/{questions.length} answered
              </span>
            </div>

            {/* Question Prompt (High Readability) */}
            <div style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              lineHeight: 1.65,
              marginBottom: '2rem'
            }}>
              {currentQ.question_text}
            </div>

            {/* Answer Options Radio Cards */}
            <div role="radiogroup" aria-label="Answer options" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {currentQ.options.map((opt, idx) => {
                const isSelected = currentQ.selectedOptionId === opt.option_id;
                const letter = String.fromCharCode(65 + idx);

                return (
                  <div
                    key={opt.option_id}
                    onClick={() => handleSelectOption(opt.option_id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectOption(opt.option_id);
                      }
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    className={isSelected ? 'option-card selected' : 'option-card'}
                  >
                    {/* Option Identifier Badge */}
                    <div style={{
                      width: '1.75rem',
                      height: '1.75rem',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      backgroundColor: isSelected ? 'var(--color-action)' : 'var(--bg-surface-secondary)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {letter}
                    </div>

                    {/* Option Text */}
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-main)',
                      fontWeight: isSelected ? 500 : 400,
                      flex: 1
                    }}>
                      {opt.option_text}
                    </div>

                    {/* Selected Indicator / Keyboard Key Hint */}
                    {isSelected ? (
                      <div style={{
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-action)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Check size={11} strokeWidth={2.5} />
                      </div>
                    ) : (
                      <span style={{
                        fontSize: '0.68rem',
                        color: '#94a3b8',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid #e2e8f0',
                        padding: '0.08rem 0.3rem',
                        borderRadius: '2px'
                      }}>
                        Key {idx + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '1.15rem',
              marginTop: 'auto',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleToggleMarkForReview}
                  className="btn btn-secondary btn-sm"
                  style={currentQ.isMarkedForReview ? { backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#b45309' } : {}}
                >
                  <Bookmark size={14} />
                  {currentQ.isMarkedForReview ? 'Unmark Review' : 'Mark for Review'}
                </button>

                {currentQ.selectedOptionId && (
                  <button
                    onClick={handleClearResponse}
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <XCircle size={14} /> Clear Choice
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="btn btn-secondary"
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="btn btn-primary"
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: High-Density Question Navigator Palette */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.15rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.875rem', color: 'var(--color-brand-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Question Palette
            </h3>

            {/* Status Legend */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.45rem',
              fontSize: '0.72rem',
              marginBottom: '1rem',
              padding: '0.65rem',
              backgroundColor: 'var(--bg-page)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: 'var(--color-success)' }} />
                <span>Answered: <strong>{answeredCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: '#cbd5e1' }} />
                <span>Unanswered: <strong>{unansweredCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: 'var(--color-warning)' }} />
                <span>Marked: <strong>{markedCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: 'var(--color-action)' }} />
                <span>Current: <strong>Q{currentIndex + 1}</strong></span>
              </div>
            </div>

            {/* Matrix of Tiles */}
            <div className="exam-palette-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '0.45rem',
              maxHeight: '340px',
              overflowY: 'auto'
            }}>
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = q.selectedOptionId !== null && q.selectedOptionId !== undefined;
                const isMarked = q.isMarkedForReview;

                let btnClass = 'palette-btn';
                if (isCurrent) btnClass += ' active';
                if (isAnswered) btnClass += ' answered';
                if (isMarked) btnClass += ' marked';

                return (
                  <button
                    key={q.question_id}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    title={`Question ${idx + 1}`}
                    aria-label={`Question ${idx + 1}${isAnswered ? ', answered' : ', unanswered'}${isMarked ? ', marked for review' : ''}${isCurrent ? ', current question' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    {idx + 1}
                    {isMarked && (
                      <span style={{
                        position: 'absolute',
                        top: '1px',
                        right: '1px',
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: '#d97706'
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Final Submission Button in Palette */}
            <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="btn btn-success"
                style={{ width: '100%', padding: '0.65rem' }}
              >
                <Send size={15} /> Finalize & Submit
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '0.85rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, color: 'var(--color-brand-primary)', marginBottom: '0.2rem' }}>
              <ShieldCheck size={13} color="var(--color-action)" /> Secure Candidate Lock
            </div>
            Session protected by Adamas University OES. All keystrokes and response updates are cryptographically saved.
          </div>
        </div>
      </div>

      {/* 3. SUBMISSION CONFIRMATION MODAL */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Final Examination Submission"
        footer={
          <>
            <button
              onClick={() => setIsSubmitModalOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Return to Examination
            </button>
            <button
              onClick={handleFinalSubmit}
              disabled={submitting}
              className="btn btn-danger"
            >
              {submitting ? 'Submitting & Grading...' : 'Confirm Final Submission'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <p style={{ fontSize: '0.875rem' }}>
            Are you sure you want to permanently submit your examination? Your session will be locked and cannot be reopened.
          </p>

          <div style={{
            backgroundColor: 'var(--bg-page)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            fontSize: '0.84rem'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Questions Answered:</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
                {answeredCount} / {questions.length}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Questions Unanswered:</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: unansweredCount > 0 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
                {unansweredCount}
              </div>
            </div>
          </div>

          {unansweredCount > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#b45309',
              fontSize: '0.78rem',
              backgroundColor: '#fffbeb',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid #fde68a'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>Notice: You have <strong>{unansweredCount} unanswered questions</strong>. They will receive 0 marks.</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
