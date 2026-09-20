import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Result, Examination, IntegritySummary, IntegrityEvent } from '../../types';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { PageHeader } from '../../components/common/PageHeader';
import { StatTile } from '../../components/common/StatTile';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination, clampPage } from '../../components/common/Pagination';
import { SkeletonTable } from '../../components/common/Skeleton';
import { Toolbar, SearchInput, FilterSelect } from '../../components/common/Toolbar';
import { formatDateTime, formatTime, describeError } from '../../lib/format';
import {
  Award,
  Users,
  Share2,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  Eye,
  LogOut,
  LogIn,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';

const PAGE_SIZE = 20;

const INTEGRITY_EVENT_LABELS: Record<IntegrityEvent['type'], { label: string; icon: React.ReactNode }> = {
  tab_hidden: { label: 'Left the exam tab', icon: <EyeOff size={14} color="var(--color-warning)" /> },
  tab_visible: { label: 'Returned to the exam tab', icon: <Eye size={14} color="var(--color-success)" /> },
  window_blur: { label: 'Window lost focus', icon: <LogOut size={14} color="var(--color-warning)" /> },
  window_focus: { label: 'Window regained focus', icon: <LogIn size={14} color="var(--color-success)" /> }
};

// Honest aggregation of the real percentages — no modelling, no estimation.
const BANDS = [
  { label: '0–39%', min: 0, max: 39.999, tone: 'var(--color-danger)' },
  { label: '40–59%', min: 40, max: 59.999, tone: 'var(--color-warning)' },
  { label: '60–79%', min: 60, max: 79.999, tone: 'var(--color-accent-cyan)' },
  { label: '80–100%', min: 80, max: 100, tone: 'var(--color-success)' }
];

export const AdminResultsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [exams, setExams] = useState<Examination[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [results, setResults] = useState<Result[]>([]);
  const [integrityByAttempt, setIntegrityByAttempt] = useState<Record<string, IntegritySummary>>({});
  const [trailFor, setTrailFor] = useState<{ summary: IntegritySummary; studentName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [examsLoading, setExamsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);

  const fetchExamList = useCallback(async () => {
    if (!user) return;
    setExamsLoading(true);
    setExamListError(null);
    try {
      const { data, error: listError } = await supabase
        .from('examinations')
        .select('exam_id:id, title, results_released')
        .order('start_time', { ascending: false });
      if (listError) throw listError;

      const list = (data || []) as unknown as Examination[];
      setExams(list);
      setSelectedExamId(prev => prev || list[0]?.exam_id || '');
    } catch (err) {
      setExamListError(describeError(err, 'Could not load the examination list.'));
    } finally {
      setExamsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchExamList();
  }, [fetchExamList]);

  const fetchExamResults = useCallback(async () => {
    if (!user || !selectedExamId) return;
    setLoading(true);
    setError(null);
    try {
      const [resultsRes, eventsRes] = await Promise.all([
        supabase
          .from('results')
          .select(
            `
            result_id:id, attempt_id, marks_obtained, total_marks, percentage, status,
            total_questions, correct_count, incorrect_count, unanswered_count, evaluated_at,
            profiles(name, roll_number, email)
          `
          )
          .eq('exam_id', selectedExamId)
          .order('marks_obtained', { ascending: false }),
        supabase
          .from('integrity_events')
          .select('attempt_id, event_type, away_ms, occurred_at')
          .eq('exam_id', selectedExamId)
          .order('occurred_at', { ascending: true })
      ]);

      if (resultsRes.error) throw resultsRes.error;

      setResults(
        (resultsRes.data || []).map((r: any) => ({
          result_id: r.result_id,
          attempt_id: r.attempt_id,
          user_id: '',
          exam_id: selectedExamId,
          marks_obtained: r.marks_obtained,
          total_marks: r.total_marks,
          percentage: r.percentage,
          status: r.status,
          total_questions: r.total_questions,
          correct_count: r.correct_count,
          incorrect_count: r.incorrect_count,
          unanswered_count: r.unanswered_count,
          evaluated_at: r.evaluated_at,
          student_name: r.profiles?.name,
          student_email: r.profiles?.email,
          roll_number: r.profiles?.roll_number
        }))
      );

      const examTitle = exams.find(e => e.exam_id === selectedExamId)?.title;
      const byAttempt: Record<string, IntegritySummary> = {};
      for (const evt of eventsRes.data || []) {
        if (!byAttempt[evt.attempt_id]) {
          byAttempt[evt.attempt_id] = {
            attemptId: evt.attempt_id,
            examId: selectedExamId,
            examTitle,
            totalEvents: 0,
            tabHiddenCount: 0,
            windowBlurCount: 0,
            totalAwayMs: 0,
            events: [],
            generatedAt: new Date().toISOString()
          };
        }
        const summary = byAttempt[evt.attempt_id];
        summary.totalEvents += 1;
        if (evt.event_type === 'tab_hidden') summary.tabHiddenCount += 1;
        if (evt.event_type === 'window_blur') summary.windowBlurCount += 1;
        summary.totalAwayMs += evt.away_ms || 0;
        summary.events.push({
          type: evt.event_type,
          timestamp: evt.occurred_at,
          awayMs: evt.away_ms ?? undefined
        });
      }
      setIntegrityByAttempt(byAttempt);
    } catch (err) {
      setError(describeError(err, 'Could not load the gradebook for this examination.'));
      setResults([]);
      setIntegrityByAttempt({});
    } finally {
      setLoading(false);
    }
  }, [user, selectedExamId, exams]);

  useEffect(() => {
    fetchExamResults();
  }, [fetchExamResults]);

  useEffect(() => {
    setPage(1);
  }, [selectedExamId, searchTerm, outcomeFilter]);

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return results.filter(r => {
      if (outcomeFilter && r.status !== outcomeFilter) return false;
      if (!term) return true;
      return (
        r.student_name?.toLowerCase().includes(term) ||
        r.roll_number?.toLowerCase().includes(term) ||
        r.student_email?.toLowerCase().includes(term)
      );
    });
  }, [results, searchTerm, outcomeFilter]);

  const stats = useMemo(() => {
    const total = results.length;
    if (total === 0) return null;
    const passed = results.filter(r => r.status === 'pass').length;
    const percentages = results.map(r => r.percentage);
    return {
      totalCandidates: total,
      passedCandidates: passed,
      passRate: Math.round((passed / total) * 100),
      averagePercentage: Math.round((percentages.reduce((a, b) => a + b, 0) / total) * 10) / 10,
      highestPercentage: Math.max(...percentages)
    };
  }, [results]);

  const distribution = useMemo(() => {
    if (results.length === 0) return [];
    return BANDS.map(band => {
      const count = results.filter(r => r.percentage >= band.min && r.percentage <= band.max).length;
      return { ...band, count, share: Math.round((count / results.length) * 100) };
    });
  }, [results]);

  const safePage = clampPage(page, PAGE_SIZE, filteredResults.length);
  const pagedResults = filteredResults.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const currentExam = exams.find(e => e.exam_id === selectedExamId);
  const isReleased = !!currentExam?.results_released;

  const handleConfirmRelease = async () => {
    if (!currentExam || !user) return;
    const nextState = !isReleased;
    setReleaseBusy(true);
    try {
      const { error: updateError } = await supabase
        .from('examinations')
        .update({ results_released: nextState, status: nextState ? 'released' : 'completed' })
        .eq('id', selectedExamId);
      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: nextState ? 'RELEASE_RESULTS' : 'UNRELEASE_RESULTS',
        details: { examId: selectedExamId, title: currentExam.title }
      });

      setExams(prev =>
        prev.map(e => (e.exam_id === selectedExamId ? { ...e, results_released: nextState } : e))
      );
      toast.success(
        nextState
          ? 'Results are now visible to candidates.'
          : 'Results have been withheld from candidates.'
      );
      setReleaseOpen(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to change the result release state.'));
    } finally {
      setReleaseBusy(false);
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Gradebook"
        subtitle="Review candidate scores for an examination, inspect session integrity trails, and control result publication."
      >
        {currentExam && (
          <button
            onClick={() => setReleaseOpen(true)}
            className={`btn ${isReleased ? 'btn-success' : 'btn-primary'}`}
          >
            <Share2 size={15} aria-hidden="true" />
            {isReleased ? 'Results released' : 'Release results'}
          </button>
        )}
      </PageHeader>

      {examListError && <ErrorBanner message={examListError} onRetry={fetchExamList} />}

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <Toolbar>
          <div className="toolbar__filter" style={{ flex: '1 1 280px' }}>
            <label className="sr-only" htmlFor="gradebook-exam">
              Select examination
            </label>
            <select
              id="gradebook-exam"
              className="form-select"
              style={{ width: '100%' }}
              value={selectedExamId}
              onChange={e => setSelectedExamId(e.target.value)}
              disabled={examsLoading || exams.length === 0}
            >
              {exams.length === 0 && <option value="">No examinations available</option>}
              {exams.map(ex => (
                <option key={ex.exam_id} value={ex.exam_id}>
                  {ex.title} {ex.results_released ? '— released' : '— withheld'}
                </option>
              ))}
            </select>
          </div>

          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search candidates by name, roll number or email"
            placeholder="Search candidates…"
          />

          <FilterSelect
            value={outcomeFilter}
            onChange={setOutcomeFilter}
            label="Filter by outcome"
            options={[
              { value: '', label: 'All outcomes' },
              { value: 'pass', label: 'Qualified' },
              { value: 'fail', label: 'Not qualified' }
            ]}
          />
        </Toolbar>
      </div>

      {stats && !loading && (
        <>
          <div className="stat-grid">
            <StatTile
              className="animate-slide-up stagger-1"
              label="Candidates"
              value={stats.totalCandidates}
              meta="Submissions graded"
              icon={<Users size={16} />}
            />
            <StatTile
              className="animate-slide-up stagger-2"
              label="Average score"
              value={`${stats.averagePercentage}%`}
              meta="Across all submissions"
              icon={<TrendingUp size={16} />}
            />
            <StatTile
              className="animate-slide-up stagger-3"
              label="Pass rate"
              value={`${stats.passRate}%`}
              meta={`${stats.passedCandidates} qualified`}
              valueColor="var(--color-success)"
              icon={<CheckCircle2 size={16} />}
            />
            <StatTile
              className="animate-slide-up stagger-4"
              label="Highest score"
              value={`${stats.highestPercentage}%`}
              meta="Top candidate"
              icon={<Award size={16} />}
            />
          </div>

          {/* Score spread, counted directly from the graded results. */}
          <div className="card">
            <div className="section-head" style={{ marginBottom: '0.75rem' }}>
              <h2 className="section-head__title" style={{ fontSize: '0.95rem' }}>
                Score distribution
              </h2>
              <span className="section-head__meta">{results.length} graded submissions</span>
            </div>
            <div className="distribution">
              {distribution.map(band => (
                <div className="distribution__row" key={band.label}>
                  <span className="distribution__label">{band.label}</span>
                  <div className="distribution__track">
                    <div
                      className="distribution__bar"
                      style={{ width: `${band.share}%`, backgroundColor: band.tone }}
                    />
                  </div>
                  <span className="distribution__count">
                    {band.count} <span style={{ color: 'var(--text-muted)' }}>({band.share}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        {error && <ErrorBanner message={error} onRetry={fetchExamResults} />}

        {loading ? (
          <SkeletonTable rows={6} columns={6} label="Loading gradebook" />
        ) : filteredResults.length === 0 ? (
          <EmptyState
            icon={<Award size={28} strokeWidth={1.5} />}
            title={
              results.length === 0
                ? 'No submissions for this examination yet'
                : 'No candidates match these filters'
            }
            description={
              results.length === 0
                ? 'Candidate results appear here as soon as papers are submitted and graded.'
                : 'Adjust the search or outcome filter to see more candidates.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Marks</th>
                    <th scope="col">Percentage</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Integrity</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedResults.map(res => {
                    const integrity = integrityByAttempt[res.attempt_id];
                    const awayCount = integrity
                      ? integrity.tabHiddenCount + integrity.windowBlurCount
                      : 0;

                    return (
                      <tr key={res.result_id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {res.student_name}
                          </div>
                          <div className="row-meta" style={{ fontFamily: 'var(--font-mono)' }}>
                            {res.roll_number || '—'}
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                            {res.marks_obtained}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {' '}
                            / {res.total_marks}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                res.status === 'pass' ? 'var(--color-success)' : 'var(--color-danger)'
                            }}
                          >
                            {res.percentage}%
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                            {res.correct_count}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}> / {res.total_questions}</span>
                        </td>
                        <td>
                          <Badge type={res.status === 'pass' ? 'pass' : 'fail'}>
                            {res.status === 'pass' ? 'Qualified' : 'Not qualified'}
                          </Badge>
                        </td>
                        <td>
                          {integrity ? (
                            <button
                              onClick={() =>
                                setTrailFor({
                                  summary: integrity,
                                  studentName: res.student_name || 'Candidate'
                                })
                              }
                              className={`btn btn-sm ${awayCount > 0 ? 'btn-secondary btn-secondary--warning' : 'btn-secondary'}`}
                              title="View the session integrity trail"
                              aria-label={`View integrity trail for ${res.student_name}`}
                            >
                              {awayCount > 0 ? (
                                <ShieldAlert size={14} aria-hidden="true" />
                              ) : (
                                <ShieldCheck size={14} aria-hidden="true" />
                              )}
                              {awayCount > 0 ? `${awayCount} noted` : 'Clean'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Not tracked
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {formatDateTime(res.evaluated_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safePage}
              pageSize={PAGE_SIZE}
              totalItems={filteredResults.length}
              onPageChange={setPage}
              itemLabel="candidates"
            />
          </>
        )}
      </div>

      {/* INTEGRITY TRAIL */}
      <Modal
        isOpen={!!trailFor}
        onClose={() => setTrailFor(null)}
        title="Session integrity trail"
        footer={
          <button onClick={() => setTrailFor(null)} className="btn btn-secondary">
            Close
          </button>
        }
      >
        {trailFor && (
          <div className="form-stack">
            <p style={{ fontSize: '0.84rem' }}>
              Candidate: <strong>{trailFor.studentName}</strong>
              {trailFor.summary.examTitle && <> · {trailFor.summary.examTitle}</>}
            </p>

            <div
              className={`confirm-callout${trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount > 0 ? '' : ' confirm-callout--success'}`}
            >
              {trailFor.summary.tabHiddenCount + trailFor.summary.windowBlurCount > 0 ? (
                <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
              ) : (
                <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
              )}
              <span>
                <strong>{trailFor.summary.tabHiddenCount}</strong> tab exit
                {trailFor.summary.tabHiddenCount === 1 ? '' : 's'} ·{' '}
                <strong>{trailFor.summary.windowBlurCount}</strong> focus loss
                {trailFor.summary.windowBlurCount === 1 ? '' : 'es'} ·{' '}
                <strong>{Math.round(trailFor.summary.totalAwayMs / 1000)}s</strong> total away
              </span>
            </div>

            <p className="muted-note">
              This is an observational trail only — it does not affect the candidate&apos;s score. A small
              number of brief events is common and expected; use judgement rather than treating any single
              event as proof of misconduct.
            </p>

            <div className="trail-list">
              {trailFor.summary.events.length === 0 ? (
                <p className="muted-note" style={{ textAlign: 'center', padding: '1rem' }}>
                  No focus-loss events were recorded during this session.
                </p>
              ) : (
                trailFor.summary.events.map((evt, idx) => (
                  <div key={idx} className="trail-list__row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {INTEGRITY_EVENT_LABELS[evt.type]?.icon}
                      <span>{INTEGRITY_EVENT_LABELS[evt.type]?.label || evt.type}</span>
                      {typeof evt.awayMs === 'number' && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          (away {Math.round(evt.awayMs / 1000)}s)
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0
                      }}
                    >
                      {formatTime(evt.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* RELEASE CONFIRMATION */}
      <ConfirmDialog
        isOpen={releaseOpen}
        onCancel={() => setReleaseOpen(false)}
        onConfirm={handleConfirmRelease}
        tone="primary"
        title={isReleased ? 'Withhold results' : 'Release results to candidates'}
        confirmLabel={isReleased ? 'Withhold results' : 'Release results'}
        busy={releaseBusy}
        busyLabel={isReleased ? 'Withholding…' : 'Releasing…'}
        message={
          isReleased ? (
            <>
              Marks and the answer key for <strong>{currentExam?.title}</strong> will be hidden from
              candidates again.
            </>
          ) : (
            <>
              All <strong>{results.length}</strong> candidate{results.length === 1 ? '' : 's'} who sat{' '}
              <strong>{currentExam?.title}</strong> will immediately see their marks, grade and the full
              answer key.
            </>
          )
        }
      />
    </div>
  );
};
