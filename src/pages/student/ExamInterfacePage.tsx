import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Question, IntegrityEvent } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Spinner } from '../../components/common/Spinner';
import { ErrorState } from '../../components/common/ErrorState';
import { formatClock, describeError } from '../../lib/format';
import {
  Clock,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertCircle,
  XCircle,
  ShieldCheck,
  Check,
  CloudOff,
  RefreshCw
} from 'lucide-react';

// Cap on retained events client-side — a defensive bound against pathological
// alt-tabbing, not a functional limit. Well beyond anything a real session needs.
const MAX_INTEGRITY_EVENTS = 300;

// Autosave retry backoff. Capped so a candidate on a flaky connection keeps
// getting attempts for the whole paper rather than backing off into silence.
const RETRY_BASE_MS = 1200;
const RETRY_MAX_MS = 15000;

type AutosaveStatus = 'saved' | 'saving' | 'retrying';

interface PendingAnswer {
  optionId: string | null;
  isMarked: boolean;
}

interface ExamInterfacePageProps {
  examId: string;
  onFinishExam: (examId: string) => void;
}

export const ExamInterfacePage: React.FC<ExamInterfacePageProps> = ({ examId, onFinishExam }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [examTitle, setExamTitle] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('saved');
  const [pendingCount, setPendingCount] = useState(0);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);

  // The exam ends at a fixed wall-clock instant, derived once from the
  // server's authoritative remaining time. Ticking a counter down by one
  // each second drifts badly whenever the tab is throttled or the machine
  // sleeps — which would hand a candidate extra minutes.
  const deadlineRef = useRef<number | null>(null);
  const totalSecondsRef = useRef<number | null>(null);
  const secondsRef = useRef<number>(0);
  const attemptIdRef = useRef<string | null>(null);
  const timedOutRef = useRef(false);

  // Autosave queue: latest desired state per question, drained serially so
  // two quick edits can never land out of order.
  const pendingRef = useRef<Map<string, PendingAnswer>>(new Map());
  const flushPromiseRef = useRef<Promise<boolean> | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  attemptIdRef.current = attemptId;

  // ==========================================================
  // LOAD
  // ==========================================================
  const loadExam = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
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
        const remaining = Math.max(0, Number(data.attempt.timeRemainingSeconds) || 0);
        setAttemptId(data.attempt.attemptId);
        attemptIdRef.current = data.attempt.attemptId;
        deadlineRef.current = Date.now() + remaining * 1000;
        totalSecondsRef.current = remaining;
        secondsRef.current = remaining;
        setSecondsRemaining(remaining);
      }
    } catch (err) {
      setError(describeError(err, 'Failed to load examination questions.'));
    } finally {
      setLoading(false);
    }
  }, [examId, user]);

  useEffect(() => {
    loadExam();
  }, [loadExam]);

  // ==========================================================
  // AUTOSAVE QUEUE
  // ==========================================================
  const runFlush = useCallback(async (): Promise<boolean> => {
    const currentAttemptId = attemptIdRef.current;
    if (!currentAttemptId) return false;

    setAutosaveStatus('saving');

    try {
      while (pendingRef.current.size > 0) {
        const [questionId, payload] = pendingRef.current.entries().next().value as [string, PendingAnswer];

        const { error: rpcError } = await supabase.rpc('save_answer', {
          p_attempt_id: currentAttemptId,
          p_question_id: questionId,
          p_selected_option_id: payload.optionId,
          p_is_marked_for_review: payload.isMarked,
          p_time_remaining_seconds: secondsRef.current
        });
        if (rpcError) throw rpcError;

        // Only clear the entry if it still matches what we just sent; a
        // newer edit arriving mid-flight must survive to the next pass.
        const latest = pendingRef.current.get(questionId);
        if (latest && latest.optionId === payload.optionId && latest.isMarked === payload.isMarked) {
          pendingRef.current.delete(questionId);
        }
        setPendingCount(pendingRef.current.size);
      }

      retryCountRef.current = 0;
      setAutosaveStatus('saved');
      return true;
    } catch {
      // The edit stays queued and a retry is scheduled.
      setAutosaveStatus('retrying');
      const delay = Math.min(RETRY_BASE_MS * 2 ** retryCountRef.current, RETRY_MAX_MS);
      retryCountRef.current += 1;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        void flushQueue();
      }, delay);
      return false;
    }
  }, []);

  /**
   * Callers join an in-flight drain rather than being turned away. Returning
   * early while a save was already running made a submit-during-save look
   * like a failure and cancelled the submission.
   */
  const flushQueue = useCallback((): Promise<boolean> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (pendingRef.current.size === 0) {
      setAutosaveStatus('saved');
      return Promise.resolve(true);
    }
    const promise = runFlush().finally(() => {
      flushPromiseRef.current = null;
    });
    flushPromiseRef.current = promise;
    return promise;
  }, [runFlush]);

  const queueSave = useCallback(
    (questionId: string, optionId: string | null, isMarked: boolean) => {
      pendingRef.current.set(questionId, { optionId, isMarked });
      setPendingCount(pendingRef.current.size);
      void flushQueue();
    },
    [flushQueue]
  );

  useEffect(
    () => () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    },
    []
  );

  // A queued answer that never reached the server would be graded as blank.
  // Warn before the tab closes while anything is still outstanding.
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount]);

  // ==========================================================
  // SUBMISSION
  // ==========================================================
  const submitAttempt = useCallback(
    async (isTimeout: boolean) => {
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;

      setSubmitting(true);

      // Drain anything still queued first — grading reads submitted_answers,
      // so an unflushed selection would silently score zero.
      if (pendingRef.current.size > 0) {
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        await flushQueue();
      }

      // The authoritative check is whether the queue actually emptied, not
      // what the flush returned — a concurrent drain may have finished it.
      if (pendingRef.current.size > 0 && !isTimeout) {
        setSubmitting(false);
        toast.error(
          'Some answers have not reached the server yet. Check your connection — submission was cancelled so none of your responses are lost.'
        );
        return;
      }

      try {
        const { error: rpcError } = await supabase.rpc('submit_exam_attempt', {
          p_attempt_id: currentAttemptId,
          p_is_timeout: isTimeout
        });
        if (rpcError && !isTimeout) {
          toast.error(describeError(rpcError, 'Failed to submit examination.'));
          setSubmitting(false);
          return;
        }
        setIsSubmitModalOpen(false);
        pendingRef.current.clear();
        setPendingCount(0);
        onFinishExam(examId);
      } catch (err) {
        if (isTimeout) {
          // Time is up regardless; the server closes the attempt on the next
          // start/submit call, so move the candidate on rather than trapping
          // them on a dead screen.
          onFinishExam(examId);
          return;
        }
        toast.error(describeError(err, 'Network error while submitting.'));
        setSubmitting(false);
      }
    },
    [examId, flushQueue, onFinishExam, toast]
  );

  const handleTimeout = useCallback(() => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    void submitAttempt(true);
  }, [submitAttempt]);

  // ==========================================================
  // TIMER — recomputed from the deadline, never decremented
  // ==========================================================
  useEffect(() => {
    if (loading || deadlineRef.current === null) return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      secondsRef.current = remaining;
      setSecondsRemaining(remaining);
      if (remaining <= 0) handleTimeout();
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    // Returning from a throttled background tab snaps the clock straight to
    // the truth instead of waiting out the next interval.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loading, handleTimeout]);

  // ==========================================================
  // EXAM INTEGRITY MONITORING (tab/window focus only — no
  // webcam, microphone, or screen capture of any kind).
  // Purely observational: never alters the timer, answers, or
  // submission outcome.
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
        // Coming back is also the moment to retry anything that failed while away.
        void flushQueue();
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
  }, [loading, attemptId, user, examId, flushQueue]);

  // Retry queued answers as soon as the browser reports connectivity is back.
  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushQueue]);

  // ==========================================================
  // ANSWER ACTIONS
  // ==========================================================
  const updateQuestion = useCallback((index: number, patch: Partial<Question>) => {
    setQuestions(prev => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }, []);

  const handleSelectOption = useCallback(
    (optionId: string) => {
      const question = questions[currentIndex];
      if (!question) return;
      updateQuestion(currentIndex, { selectedOptionId: optionId });
      queueSave(question.question_id, optionId, !!question.isMarkedForReview);
    },
    [questions, currentIndex, updateQuestion, queueSave]
  );

  const handleClearResponse = useCallback(() => {
    const question = questions[currentIndex];
    if (!question) return;
    updateQuestion(currentIndex, { selectedOptionId: null });
    queueSave(question.question_id, null, !!question.isMarkedForReview);
  }, [questions, currentIndex, updateQuestion, queueSave]);

  const handleToggleMarkForReview = useCallback(() => {
    const question = questions[currentIndex];
    if (!question) return;
    const nextMarked = !question.isMarkedForReview;
    updateQuestion(currentIndex, { isMarkedForReview: nextMarked });
    queueSave(question.question_id, question.selectedOptionId || null, nextMarked);
  }, [questions, currentIndex, updateQuestion, queueSave]);

  // ==========================================================
  // KEYBOARD SHORTCUTS (question-level; option keys are 1–4)
  // ==========================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitModalOpen || loading || questions.length === 0) return;

      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const question = questions[currentIndex];
      if (!question) return;

      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const option = question.options[Number(e.key) - 1];
        if (option) handleSelectOption(option.option_id);
      } else if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, isSubmitModalOpen, loading, handleSelectOption]);

  // Arrow-key movement *within* the answer list, per the ARIA radiogroup
  // pattern. Vertical keys only, so they never collide with the horizontal
  // keys that move between questions.
  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    const question = questions[currentIndex];
    if (!question) return;
    const count = question.options.length;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelectOption(question.options[index].option_id);
      return;
    }

    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') nextIndex = (index + 1) % count;
    else if (e.key === 'ArrowUp') nextIndex = (index - 1 + count) % count;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = count - 1;
    if (nextIndex === null) return;

    e.preventDefault();
    const option = question.options[nextIndex];
    handleSelectOption(option.option_id);
    document.getElementById(`exam-option-${option.option_id}`)?.focus();
  };

  // ==========================================================
  // RENDER
  // ==========================================================
  if (loading) {
    return (
      <div style={{ padding: '6rem 0' }}>
        <Spinner label="Preparing your examination session…" size="lg" />
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '3rem auto' }}>
        <ErrorState
          title="Examination session error"
          message={
            error ||
            'No questions are currently assigned to this examination. Please contact the Examination Cell.'
          }
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
          {error && (
            <button onClick={loadExam} className="btn btn-secondary">
              <RefreshCw size={14} aria-hidden="true" /> Retry
            </button>
          )}
          <button onClick={() => onFinishExam(examId)} className="btn btn-primary">
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const answeredCount = questions.filter(q => q.selectedOptionId).length;
  const markedCount = questions.filter(q => q.isMarkedForReview).length;
  const unansweredCount = questions.length - answeredCount;

  const displaySeconds = secondsRemaining ?? 0;
  const formattedTime = formatClock(displaySeconds);
  const isTimeCritical = displaySeconds < 60;
  const isTimeWarning = displaySeconds < 300;
  const totalSeconds = totalSecondsRef.current || displaySeconds || 1;
  const timeElapsedPct = Math.min(100, Math.max(0, ((totalSeconds - displaySeconds) / totalSeconds) * 100));
  const answeredPct = Math.round((answeredCount / questions.length) * 100);
  const integrityAwayCount = integrityEvents.filter(
    e => e.type === 'tab_hidden' || e.type === 'window_blur'
  ).length;

  return (
    <div className="exam-shell">
      {/* 1. PERSISTENT EXAM HEADER (distraction-free) */}
      <header className="exam-header">
        <div className="exam-header__identity">
          <h1 className="exam-header__title">{examTitle}</h1>
          <div className="exam-header__candidate">
            Candidate: <strong>{user?.name}</strong>
            {user?.rollNumber && (
              <>
                {' • '}Roll: <span style={{ fontFamily: 'var(--font-mono)' }}>{user.rollNumber}</span>
              </>
            )}
          </div>
        </div>

        <div className="exam-header__status">
          {/* Autosave state — announced politely so a screen-reader user is
              told when a response fails to save without being interrupted. */}
          <div className="exam-status-chip" role="status" aria-live="polite">
            {autosaveStatus === 'saving' && (
              <>
                <span className="spinner spinner-sm" aria-hidden="true" />
                <span>Saving…</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <Check size={13} color="var(--color-success)" aria-hidden="true" />
                <span style={{ color: 'var(--color-success)' }}>All responses saved</span>
              </>
            )}
            {autosaveStatus === 'retrying' && (
              <>
                <CloudOff size={13} color="var(--color-warning)" aria-hidden="true" />
                <span style={{ color: 'var(--color-warning)' }}>
                  Reconnecting — {pendingCount} unsaved
                </span>
              </>
            )}
          </div>

          <div
            className="exam-status-chip"
            title="This session observes tab and window focus as part of standard examination integrity protocol."
          >
            <ShieldCheck
              size={13}
              color={integrityAwayCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
              aria-hidden="true"
            />
            <span style={{ color: integrityAwayCount > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
              {integrityAwayCount > 0 ? `Integrity: ${integrityAwayCount} noted` : 'Integrity: Monitored'}
            </span>
          </div>

          <div
            className={`exam-timer${isTimeCritical ? ' exam-timer--critical timer-critical-pulse' : isTimeWarning ? ' exam-timer--warning' : ''}`}
            role="timer"
            aria-live="off"
          >
            <Clock size={15} aria-hidden="true" />
            <div>
              <div className="exam-timer__label">Time remaining</div>
              <div className="exam-timer__value">{formattedTime}</div>
            </div>
            <span className="sr-only">
              {Math.floor(displaySeconds / 60)} minutes remaining in this examination.
            </span>
          </div>

          <button onClick={() => setIsSubmitModalOpen(true)} className="btn btn-sm btn-primary">
            <Send size={13} aria-hidden="true" /> Submit examination
          </button>
        </div>
      </header>

      {/* Time-elapsed hairline */}
      <div className="progress-track exam-progress-rail">
        <div
          className="progress-fill"
          style={
            {
              '--fill': timeElapsedPct / 100,
              borderRadius: 0,
              background: isTimeCritical
                ? 'var(--color-danger)'
                : isTimeWarning
                  ? 'var(--color-warning)'
                  : 'var(--color-action)'
            } as React.CSSProperties
          }
        />
      </div>

      {/* 2. MAIN EXAMINATION WORKSPACE */}
      <div className="exam-layout">
        <div className="exam-layout__main">
          <div key={currentQ.question_id} className="card animate-question exam-question-card">
            <div className="exam-question-card__top">
              <div className="exam-question-card__meta">
                <span className="exam-question-card__counter">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="exam-chip">{currentQ.subject}</span>
              </div>

              <div className="exam-question-card__meta">
                <span className="exam-chip exam-chip--marks">+{currentQ.marks} marks</span>
                {currentQ.isMarkedForReview && (
                  <span className="exam-chip exam-chip--marked">
                    <Bookmark size={11} aria-hidden="true" /> Marked
                  </span>
                )}
              </div>
            </div>

            <div className="exam-answered-rail">
              <div className="progress-track" style={{ flex: 1 }}>
                <div
                  className="progress-fill"
                  style={
                    { '--fill': answeredPct / 100, background: 'var(--color-success)' } as React.CSSProperties
                  }
                />
              </div>
              <span className="exam-answered-rail__count">
                {answeredCount}/{questions.length} answered
              </span>
            </div>

            <h2 className="exam-question-card__prompt">{currentQ.question_text}</h2>

            <div
              role="radiogroup"
              aria-label={`Answer options for question ${currentIndex + 1}`}
              aria-orientation="vertical"
              className="exam-options"
            >
              {currentQ.options.map((opt, idx) => {
                const isSelected = currentQ.selectedOptionId === opt.option_id;
                const letter = String.fromCharCode(65 + idx);

                return (
                  <div
                    key={opt.option_id}
                    id={`exam-option-${opt.option_id}`}
                    onClick={() => handleSelectOption(opt.option_id)}
                    onKeyDown={e => handleOptionKeyDown(e, idx)}
                    role="radio"
                    aria-checked={isSelected}
                    // Roving tabindex: one stop for the whole group, as the
                    // ARIA radiogroup pattern requires.
                    tabIndex={isSelected || (!currentQ.selectedOptionId && idx === 0) ? 0 : -1}
                    className={isSelected ? 'option-card selected' : 'option-card'}
                  >
                    <div className={`option-card__letter${isSelected ? ' is-selected' : ''}`} aria-hidden="true">
                      {letter}
                    </div>

                    <div className="option-card__text">{opt.option_text}</div>

                    {isSelected ? (
                      <div className="option-card__check" aria-hidden="true">
                        <Check size={11} strokeWidth={2.5} />
                      </div>
                    ) : (
                      <span className="option-card__hint" aria-hidden="true">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="exam-question-card__actions">
              <div className="exam-question-card__actions-group">
                <button
                  onClick={handleToggleMarkForReview}
                  className={`btn btn-secondary btn-sm${currentQ.isMarkedForReview ? ' btn-secondary--warning' : ''}`}
                  aria-pressed={!!currentQ.isMarkedForReview}
                >
                  <Bookmark size={14} aria-hidden="true" />
                  {currentQ.isMarkedForReview ? 'Unmark review' : 'Mark for review'}
                </button>

                {currentQ.selectedOptionId && (
                  <button onClick={handleClearResponse} className="btn btn-secondary btn-sm btn-secondary--danger">
                    <XCircle size={14} aria-hidden="true" /> Clear choice
                  </button>
                )}
              </div>

              <div className="exam-question-card__actions-group">
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="btn btn-secondary"
                >
                  <ChevronLeft size={15} aria-hidden="true" /> Previous
                </button>
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="btn btn-primary"
                >
                  Next <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. QUESTION NAVIGATOR */}
        <aside className="exam-layout__palette" aria-label="Question navigator">
          <div className="card exam-palette">
            <h3 className="exam-palette__title">Question palette</h3>

            <div className="exam-palette__legend">
              <div className="exam-palette__legend-item">
                <span className="legend-swatch" style={{ backgroundColor: 'var(--color-success)' }} />
                <span>
                  Answered: <strong>{answeredCount}</strong>
                </span>
              </div>
              <div className="exam-palette__legend-item">
                <span className="legend-swatch" style={{ backgroundColor: 'var(--border-strong)' }} />
                <span>
                  Unanswered: <strong>{unansweredCount}</strong>
                </span>
              </div>
              <div className="exam-palette__legend-item">
                <span className="legend-swatch" style={{ backgroundColor: 'var(--color-warning)' }} />
                <span>
                  Marked: <strong>{markedCount}</strong>
                </span>
              </div>
              <div className="exam-palette__legend-item">
                <span className="legend-swatch" style={{ backgroundColor: 'var(--color-action)' }} />
                <span>
                  Current: <strong>Q{currentIndex + 1}</strong>
                </span>
              </div>
            </div>

            <div className="exam-palette-grid">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!q.selectedOptionId;
                const isMarked = !!q.isMarkedForReview;

                let btnClass = 'palette-btn';
                if (isCurrent) btnClass += ' active';
                if (isAnswered) btnClass += ' answered';
                if (isMarked) btnClass += ' marked';

                return (
                  <button
                    key={q.question_id}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    aria-label={`Question ${idx + 1}${isAnswered ? ', answered' : ', unanswered'}${isMarked ? ', marked for review' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    {idx + 1}
                    {isMarked && <span className="palette-btn__flag" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div className="exam-palette__footer">
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="btn btn-success"
                style={{ width: '100%' }}
              >
                <Send size={15} aria-hidden="true" /> Finalise &amp; submit
              </button>
            </div>
          </div>

          <div className="card exam-help">
            <div className="exam-help__title">
              <ShieldCheck size={13} color="var(--color-action)" aria-hidden="true" /> Session protection
            </div>
            <p className="muted-note">
              Responses are saved to the university server as you answer them. Keys{' '}
              <kbd className="kbd">1</kbd>–<kbd className="kbd">4</kbd> select an option;{' '}
              <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> move between questions.
            </p>
          </div>
        </aside>
      </div>

      {/* 4. SUBMISSION CONFIRMATION */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => (submitting ? undefined : setIsSubmitModalOpen(false))}
        title="Submit your examination"
        footer={
          <>
            <button
              onClick={() => setIsSubmitModalOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Return to examination
            </button>
            <button onClick={() => submitAttempt(false)} disabled={submitting} className="btn btn-danger">
              {submitting ? (
                <>
                  <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                  Submitting &amp; grading…
                </>
              ) : (
                'Confirm final submission'
              )}
            </button>
          </>
        }
      >
        <div className="confirm-dialog">
          <p className="confirm-dialog__message">
            Once submitted, your paper is locked and cannot be reopened.
          </p>

          <div className="submit-summary">
            <div>
              <span className="submit-summary__label">Answered</span>
              <div className="submit-summary__value" style={{ color: 'var(--color-success)' }}>
                {answeredCount} / {questions.length}
              </div>
            </div>
            <div>
              <span className="submit-summary__label">Unanswered</span>
              <div
                className="submit-summary__value"
                style={{ color: unansweredCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
              >
                {unansweredCount}
              </div>
            </div>
          </div>

          {unansweredCount > 0 && (
            <div className="confirm-callout">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
              <span>
                <strong>
                  {unansweredCount} question{unansweredCount === 1 ? '' : 's'}
                </strong>{' '}
                will be submitted blank and receive zero marks.
              </span>
            </div>
          )}

          {pendingCount > 0 && (
            <div className="confirm-callout confirm-callout--danger">
              <CloudOff size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
              <span>
                {pendingCount} response{pendingCount === 1 ? '' : 's'} still syncing. Submission will wait
                for them to save first.
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
