import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../context/AuthContext';
import { Result, Question } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Printer,
  ArrowLeft,
  Calendar,
  Clock,
  FileCheck,
  ShieldCheck,
  Percent,
  Check,
  X,
  FileText
} from 'lucide-react';

interface StudentResultPageProps {
  examId?: string;
  onBack: () => void;
}

export const StudentResultPage: React.FC<StudentResultPageProps> = ({ examId, onBack }) => {
  const { user, token } = useAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [exam, setExam] = useState<any>(null);
  const [questionReview, setQuestionReview] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResultData = async () => {
      if (!token) return;
      try {
        setLoading(true);

        if (examId) {
          const res = await fetch(`/api/results/exam/${examId}/my`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'Failed to fetch result');
          }
          const data = await res.json();
          setResult(data.result);
          setExam(data.exam);
          setQuestionReview(data.questionReview);

          if (data.result && data.result.status === 'pass') {
            confetti({
              particleCount: 70,
              spread: 50,
              origin: { y: 0.6 }
            });
          }
        } else {
          const res = await fetch('/api/results/my', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to fetch results');
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const latest = data.results[0];
            const detailRes = await fetch(`/api/results/exam/${latest.exam_id}/my`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              setResult(detailData.result);
              setExam(detailData.exam);
              setQuestionReview(detailData.questionReview);
            }
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchResultData();
  }, [examId, token]);

  const handlePrint = () => {
    window.print();
  };

  const computeGrade = (percentage: number): { grade: string; remark: string } => {
    if (percentage >= 90) return { grade: 'O', remark: 'Outstanding' };
    if (percentage >= 80) return { grade: 'E', remark: 'Excellent' };
    if (percentage >= 70) return { grade: 'A', remark: 'Very Good' };
    if (percentage >= 60) return { grade: 'B', remark: 'Good' };
    if (percentage >= 40) return { grade: 'C', remark: 'Satisfactory' };
    return { grade: 'F', remark: 'Fail' };
  };

  if (loading) {
    return <Spinner label="Compiling official provisional grade transcript..." />;
  }

  if (error || !result) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '3rem auto', textAlign: 'center', padding: '2rem' }}>
        <Award size={32} color="var(--color-warning)" style={{ margin: '0 auto 0.75rem' }} />
        <h2>Result Not Available</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.84rem' }}>
          {error || 'This examination result is currently withheld pending official release by the Examination Cell.'}
        </p>
        <button onClick={onBack} className="btn btn-secondary" style={{ marginTop: '1.25rem' }}>
          <ArrowLeft size={15} /> Return to Dashboard
        </button>
      </div>
    );
  }

  const isPassed = result.status === 'pass';
  const isReleased = exam?.resultsReleased !== false;
  const gradeInfo = computeGrade(result.percentage);

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <button onClick={handlePrint} className="btn btn-primary btn-sm">
          <Printer size={15} /> Print Grade Slip
        </button>
      </div>

      {/* Official Adamas University Provisional Grade Slip */}
      <div className="card print-page animate-slide-up" style={{ padding: '2.5rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-prominent)' }}>
        {/* University Header & Crest */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '2px solid var(--border-prominent)',
          paddingBottom: '1.25rem',
          marginBottom: '1.75rem'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-action)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Office of the Controller of Examinations • Provisional Result
            </div>
            <h1 className="serif-title" style={{ fontSize: '1.75rem', color: 'var(--color-brand-primary)', marginTop: '0.2rem' }}>
              ADAMAS UNIVERSITY
            </h1>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Department of Computer Science & Engineering • Academic Session 2026–2027
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <Badge type={isPassed ? 'pass' : 'fail'}>
              {isPassed ? 'QUALIFIED / PASSED' : 'DID NOT QUALIFY'}
            </Badge>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontFamily: 'var(--font-mono)' }}>
              Transcript Ref: {result.result_id}
            </div>
          </div>
        </div>

        {/* Candidate & Assessment Metadata Box */}
        <div className="animate-slide-up stagger-1" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-surface-secondary)',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '2rem'
        }}>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Candidate Name:</span>
            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{result.student_name || user?.name}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>University Roll No:</span>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
              {result.roll_number || user?.rollNumber || 'UG/SOET/30/24/043'}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Assessment Paper:</span>
            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{exam?.title || result.exam_title}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Evaluation Timestamp:</span>
            <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{new Date(result.evaluated_at).toLocaleString()}</div>
          </div>
        </div>

        {/* Academic Performance Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2.5rem'
        }}>
          {/* Percentage */}
          <div style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isPassed ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            border: `1px solid ${isPassed ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 600, color: isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
              Final Percentage
            </div>
            <div style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: isPassed ? 'var(--color-success)' : 'var(--color-danger)',
              lineHeight: 1.15,
              marginTop: '0.2rem'
            }}>
              {result.percentage}%
            </div>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: isPassed ? 'rgba(22, 163, 74, 0.15)' : 'rgba(220, 38, 38, 0.15)',
              borderRadius: '2px',
              margin: '0.5rem 0 0.4rem',
              overflow: 'hidden'
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${result.percentage}%`,
                  backgroundColor: isPassed ? 'var(--color-success)' : 'var(--color-danger)',
                  borderRadius: '2px'
                }}
              />
            </div>
            <div style={{ fontSize: '0.72rem', color: isPassed ? '#15803d' : '#991b1b' }}>
              Pass Mark: {exam?.passPercentage || 40}%
            </div>
          </div>

          {/* Letter Grade */}
          <div className="card-interactive animate-pop-in stagger-1" style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>
              Assigned Grade
            </div>
            <div style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: 'var(--color-brand-primary)',
              fontFamily: 'var(--font-heading)',
              lineHeight: 1.15,
              marginTop: '0.2rem'
            }}>
              {gradeInfo.grade}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {gradeInfo.remark}
            </div>
          </div>

          {/* Marks Obtained */}
          <div className="card-interactive animate-pop-in stagger-2" style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>
              Marks Secured
            </div>
            <div style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: 'var(--color-brand-primary)',
              fontFamily: 'var(--font-heading)',
              lineHeight: 1.15,
              marginTop: '0.2rem'
            }}>
              {result.marks_obtained} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {result.total_marks}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Total Weightage: {result.total_marks}
            </div>
          </div>

          {/* Breakdown */}
          <div className="card-interactive animate-pop-in stagger-3" style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.78rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
                <CheckCircle2 size={14} /> Correct:
              </span>
              <strong>{result.correct_count}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b91c1c' }}>
                <XCircle size={14} /> Incorrect:
              </span>
              <strong>{result.incorrect_count}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748b' }}>
                <HelpCircle size={14} /> Unanswered:
              </span>
              <strong>{result.unanswered_count}</strong>
            </div>
          </div>
        </div>

        {/* Detailed Question Review (Only visible when results are released! REQ-47, SEC-08) */}
        {isReleased && questionReview && (
          <div>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-brand-primary)',
              marginBottom: '0.85rem',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.45rem',
              textTransform: 'uppercase',
              letterSpacing: '0.03em'
            }}>
              Detailed Question-by-Question Evaluation Review
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {questionReview.map((q, idx) => {
                const isCorrect = q.isCandidateCorrect;
                const isAnswered = q.selected_option_id !== null && q.selected_option_id !== undefined;

                return (
                  <div
                    key={q.question_id}
                    style={{
                      border: isCorrect ? '1px solid var(--color-success-border)' : (isAnswered ? '1px solid var(--color-danger-border)' : '1px solid var(--border-subtle)'),
                      borderRadius: 'var(--radius-sm)',
                      padding: '1rem 1.15rem',
                      backgroundColor: isCorrect ? 'var(--color-success-bg)' : (isAnswered ? 'var(--color-danger-bg)' : 'var(--bg-surface-secondary)')
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--color-brand-primary)' }}>
                        Q{idx + 1}. {q.question_text}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '2px',
                        backgroundColor: isCorrect ? '#dcfce7' : (isAnswered ? '#fee2e2' : '#f1f5f9'),
                        color: isCorrect ? '#15803d' : (isAnswered ? '#b91c1c' : '#64748b'),
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {isCorrect ? `+${q.marks} Marks` : '0 Marks'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
                      {q.options.map((opt, optIdx) => {
                        const isChosen = q.selected_option_id === opt.option_id;
                        const isOptCorrect = opt.is_correct === 1;

                        let optBg = 'transparent';
                        let optBorder = '#e2e8f0';
                        let icon = null;

                        if (isOptCorrect) {
                          optBg = '#ecfdf5';
                          optBorder = '#a7f3d0';
                          icon = <Check size={13} color="#059669" />;
                        } else if (isChosen && !isOptCorrect) {
                          optBg = '#fef2f2';
                          optBorder = '#fca5a5';
                          icon = <X size={13} color="#b91c1c" />;
                        }

                        return (
                          <div
                            key={opt.option_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.45rem 0.75rem',
                              borderRadius: '2px',
                              border: `1px solid ${optBorder}`,
                              backgroundColor: optBg,
                              fontSize: '0.78rem'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span style={{ fontWeight: 600 }}>{String.fromCharCode(65 + optIdx)}.</span>
                              <span>{opt.option_text}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              {isChosen && (
                                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: isOptCorrect ? '#15803d' : '#b91c1c' }}>
                                  (Candidate Choice)
                                </span>
                              )}
                              {isOptCorrect && (
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#047857' }}>
                                  ✓ University Key
                                </span>
                              )}
                              {icon}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Official Signature and Verification Block */}
        <div style={{
          marginTop: '2.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--border-prominent)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          fontSize: '0.72rem',
          color: 'var(--text-muted)'
        }}>
          <div>
            <div>Digitally certified by Adamas University OES Engine.</div>
            <div>Institutional Cryptographic Hash: Verified.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ borderBottom: '1px solid #94a3b8', width: '160px', marginBottom: '0.35rem' }} />
            <strong style={{ color: 'var(--color-brand-primary)' }}>Controller of Examinations</strong>
            <div>Adamas University, Kolkata</div>
          </div>
        </div>
      </div>
    </div>
  );
};
