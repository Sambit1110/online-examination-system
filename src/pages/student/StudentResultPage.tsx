import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Result, Question } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { formatDateTime, describeError } from '../../lib/format';
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Printer,
  ArrowLeft,
  Lock,
  Check,
  X
} from 'lucide-react';

interface StudentResultPageProps {
  examId?: string;
  onBack: () => void;
}

interface ExamSummary {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  passPercentage: number;
  negativeMarks: number;
  resultsReleased: boolean;
}

const computeGrade = (percentage: number): { grade: string; remark: string } => {
  if (percentage >= 90) return { grade: 'O', remark: 'Outstanding' };
  if (percentage >= 80) return { grade: 'E', remark: 'Excellent' };
  if (percentage >= 70) return { grade: 'A', remark: 'Very good' };
  if (percentage >= 60) return { grade: 'B', remark: 'Good' };
  if (percentage >= 40) return { grade: 'C', remark: 'Satisfactory' };
  return { grade: 'F', remark: 'Not qualified' };
};

export const StudentResultPage: React.FC<StudentResultPageProps> = ({ examId, onBack }) => {
  const { user } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [result, setResult] = useState<Result | null>(null);
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [questionReview, setQuestionReview] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNoResults, setHasNoResults] = useState(false);

  const fetchResultData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setHasNoResults(false);

    try {
      let targetExamId = examId;
      if (!targetExamId) {
        // Read from attempts, not results: a student's result row is only
        // visible to them once results are released, but their latest
        // submission should still open here as a provisional summary.
        const { data: latest } = await supabase
          .from('exam_attempts')
          .select('exam_id')
          .eq('user_id', user.id)
          .in('status', ['submitted', 'timed_out'])
          .order('submitted_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        targetExamId = latest?.exam_id;
      }

      if (!targetExamId) {
        setHasNoResults(true);
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_result_review', {
        p_exam_id: targetExamId
      });
      if (rpcError) throw rpcError;

      setResult(data.result);
      setExam(data.exam);
      setQuestionReview(
        data.questionReview
          ? (data.questionReview as Question[]).map(q => ({
              ...q,
              isCandidateCorrect: q.selected_option_id === q.correctOptionId
            }))
          : null
      );

      // Celebrate a pass, but never for someone who asked for less motion.
      // Loaded on demand so the confetti library stays out of the bundle
      // for every other screen.
      if (data.result?.status === 'pass' && data.exam?.resultsReleased && !reducedMotion) {
        const { default: confetti } = await import('canvas-confetti');
        confetti({ particleCount: 70, spread: 50, origin: { y: 0.6 }, disableForReducedMotion: true });
      }
    } catch (err) {
      setError(describeError(err, 'This result could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [examId, user, reducedMotion]);

  useEffect(() => {
    fetchResultData();
  }, [fetchResultData]);

  if (loading) {
    return <Spinner label="Loading your grade slip…" />;
  }

  if (hasNoResults) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '3rem auto' }}>
        <EmptyState
          icon={<Award size={28} strokeWidth={1.5} />}
          title="No results yet"
          description="Grade slips appear here once you have submitted a paper and the Examination Cell has released its results."
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onBack} className="btn btn-secondary">
            <ArrowLeft size={15} aria-hidden="true" /> Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '3rem auto' }}>
        <ErrorState
          title="Result not available"
          message={
            error ||
            'This result is currently withheld pending official release by the Examination Cell.'
          }
          onRetry={fetchResultData}
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onBack} className="btn btn-secondary">
            <ArrowLeft size={15} aria-hidden="true" /> Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const isPassed = result.status === 'pass';
  const isReleased = exam?.resultsReleased === true;
  // Before release the server withholds every score field (they arrive as
  // null), so a grade is only computed once results are official.
  const gradeInfo = isReleased ? computeGrade(result.percentage) : null;
  const answeredCount = Math.max(0, result.total_questions - result.unanswered_count);

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto' }} className="section-stack">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button onClick={onBack} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} aria-hidden="true" /> Back to dashboard
        </button>
        {isReleased && (
          <button onClick={() => window.print()} className="btn btn-primary btn-sm">
            <Printer size={15} aria-hidden="true" /> Print grade slip
          </button>
        )}
      </div>

      {/* Provisional results are visible to the candidate, but the fact that
          they are not yet official must be unmissable. */}
      {!isReleased && (
        <div className="confirm-callout confirm-callout--info no-print" role="status">
          <Lock size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
          <span>
            <strong>Results not yet released.</strong> This is your provisional submission summary. The
            per-question review and official grade slip become available once the Examination Cell
            releases results for this paper.
          </span>
        </div>
      )}

      <div
        className="card print-page animate-slide-up"
        style={{ padding: '2.5rem', border: '1px solid var(--border-prominent)' }}
      >
        <header className="grade-slip__header">
          <div>
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--color-action-hover)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em'
              }}
            >
              Office of the Controller of Examinations
            </div>
            <h1 className="serif-title" style={{ fontSize: '1.65rem', marginTop: '0.25rem' }}>
              Adamas University
            </h1>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Department of Computer Science &amp; Engineering
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            {isReleased ? (
              <Badge type={isPassed ? 'pass' : 'fail'}>{isPassed ? 'Qualified' : 'Not qualified'}</Badge>
            ) : (
              <Badge type="completed">Provisional</Badge>
            )}
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                marginTop: '0.45rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              Ref #{result.result_id.slice(0, 8).toUpperCase()}
            </div>
          </div>
        </header>

        <div
          className="meta-grid animate-slide-up stagger-1"
          style={{
            backgroundColor: 'var(--bg-surface-secondary)',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '2rem'
          }}
        >
          <div>
            <div className="meta-grid__label">Candidate</div>
            <div className="meta-grid__value">{result.student_name || user?.name}</div>
          </div>
          {(result.roll_number || user?.rollNumber) && (
            <div>
              <div className="meta-grid__label">Roll number</div>
              <div className="meta-grid__value" style={{ fontFamily: 'var(--font-mono)' }}>
                {result.roll_number || user?.rollNumber}
              </div>
            </div>
          )}
          <div>
            <div className="meta-grid__label">Examination</div>
            <div className="meta-grid__value">{exam?.title || result.exam_title}</div>
          </div>
          <div>
            <div className="meta-grid__label">Evaluated</div>
            <div className="meta-grid__value">{formatDateTime(result.evaluated_at)}</div>
          </div>
        </div>

        {/* Before release: confirm what was submitted, never the score. */}
        {!isReleased && (
          <div className="grade-summary">
            <div className="grade-summary__tile">
              <div className="grade-summary__label">Questions answered</div>
              <div className="grade-summary__big">
                {answeredCount}
                <span className="grade-summary__denominator">/ {result.total_questions}</span>
              </div>
              <div className="grade-summary__foot">{result.unanswered_count} left unanswered</div>
            </div>

            <div className="grade-summary__tile">
              <div className="grade-summary__label">Marks secured</div>
              <div className="grade-summary__big" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={22} aria-hidden="true" /> Withheld
              </div>
              <div className="grade-summary__foot">Shown once results are released</div>
            </div>
          </div>
        )}

        {/* Performance summary */}
        {isReleased && gradeInfo && (
        <div className="grade-summary">
          <div className={`grade-summary__score ${isPassed ? 'is-pass' : 'is-fail'}`}>
            <div className="grade-summary__label">Final percentage</div>
            <div className="grade-summary__value">{result.percentage}%</div>
            <div className="grade-summary__bar" aria-hidden="true">
              <div className="grade-summary__bar-fill" style={{ width: `${Math.min(100, result.percentage)}%` }} />
            </div>
            {typeof exam?.passPercentage === 'number' && (
              <div className="grade-summary__foot">Pass mark: {exam.passPercentage}%</div>
            )}
          </div>

          <div className="grade-summary__tile">
            <div className="grade-summary__label">Grade</div>
            <div className="grade-summary__big">{gradeInfo.grade}</div>
            <div className="grade-summary__foot">{gradeInfo.remark}</div>
          </div>

          <div className="grade-summary__tile">
            <div className="grade-summary__label">Marks secured</div>
            <div className="grade-summary__big">
              {result.marks_obtained}
              <span className="grade-summary__denominator">/ {result.total_marks}</span>
            </div>
            <div className="grade-summary__foot">{result.total_questions} questions</div>
          </div>

          <div className="grade-summary__tile grade-summary__tile--breakdown">
            <div className="detail-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-success)' }}>
                <CheckCircle2 size={14} aria-hidden="true" /> Correct
              </span>
              <strong>{result.correct_count}</strong>
            </div>
            <div className="detail-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-danger)' }}>
                <XCircle size={14} aria-hidden="true" /> Incorrect
              </span>
              <strong>{result.incorrect_count}</strong>
            </div>
            <div className="detail-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
                <HelpCircle size={14} aria-hidden="true" /> Unanswered
              </span>
              <strong>{result.unanswered_count}</strong>
            </div>
          </div>
        </div>
        )}

        {/* Per-question review — only ever present once results are released;
            the RPC withholds the answer key entirely until then. */}
        {isReleased && questionReview && questionReview.length > 0 && (
          <section>
            <h2 className="review-heading">Question-by-question review</h2>

            <div className="section-stack">
              {questionReview.map((q, idx) => {
                const isCorrect = q.isCandidateCorrect;
                const isAnswered = !!q.selected_option_id;

                return (
                  <article
                    key={q.question_id}
                    className={`review-card ${isCorrect ? 'is-correct' : isAnswered ? 'is-incorrect' : 'is-skipped'}`}
                  >
                    <div className="review-card__head">
                      <h3 className="review-card__question">
                        <span className="review-card__index">Q{idx + 1}</span> {q.question_text}
                      </h3>
                      <span className="review-card__marks">
                        {isCorrect ? `+${q.marks}` : '0'} marks
                      </span>
                    </div>

                    <ul className="review-card__options">
                      {q.options.map((opt, optIdx) => {
                        const isChosen = q.selected_option_id === opt.option_id;
                        const isOptCorrect = opt.is_correct === true;

                        return (
                          <li
                            key={opt.option_id}
                            className={`review-option${isOptCorrect ? ' is-key' : ''}${isChosen && !isOptCorrect ? ' is-wrong' : ''}`}
                          >
                            <span className="review-option__text">
                              <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt.option_text}
                            </span>
                            <span className="review-option__tags">
                              {isChosen && <span className="review-option__tag">Your answer</span>}
                              {isOptCorrect && (
                                <span className="review-option__tag is-key">
                                  <Check size={11} aria-hidden="true" /> Correct
                                </span>
                              )}
                              {isChosen && !isOptCorrect && (
                                <X size={13} color="var(--color-danger)" aria-hidden="true" />
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="grade-slip__footer">
          <div>
            <div>Generated by the Adamas University Online Examination System.</div>
            <div>
              {isReleased
                ? 'Officially released provisional result.'
                : 'Provisional summary — not an official result.'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="grade-slip__signature-line" aria-hidden="true" />
            <strong style={{ color: 'var(--text-main)' }}>Controller of Examinations</strong>
            <div>Adamas University, Kolkata</div>
          </div>
        </footer>
      </div>
    </div>
  );
};
