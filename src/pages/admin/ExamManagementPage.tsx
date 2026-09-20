import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination, Question } from '../../types';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { PageHeader } from '../../components/common/PageHeader';
import { Pagination } from '../../components/common/Pagination';
import { SkeletonTable } from '../../components/common/Skeleton';
import { Toolbar, SearchInput, FilterSelect } from '../../components/common/Toolbar';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatDateTime, describeError } from '../../lib/format';
import { Clock, Plus, Edit2, Trash2, Share2, Lock, CalendarDays, Search } from 'lucide-react';

const PAGE_SIZE = 12;

// datetime-local inputs expect wall-clock time with no timezone info, but
// Date.toISOString() always prints UTC — converting a Date straight through
// silently swaps in the UTC clock reading wherever the browser isn't in
// UTC, shifting the exam window by the local offset. Subtract the offset
// first so the printed digits match what the browser's clock actually shows.
const toLocalInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

interface ExamRow extends Examination {
  attempt_count: number;
}

interface BankQuestion extends Question {
  isInactive?: boolean;
}

type ReleaseTarget = { exam: ExamRow; next: boolean } | null;

export const ExamManagementPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [availableQuestions, setAvailableQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExamRow | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ReleaseTarget>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [passPercentage, setPassPercentage] = useState('40');
  const [negativeMarks, setNegativeMarks] = useState('0');
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'live' | 'completed'>('scheduled');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [questionSearch, setQuestionSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const fetchExams = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;
      let query = supabase
        .from('examinations')
        .select(
          `
          exam_id:id, title, description, duration_minutes, start_time, end_time,
          total_marks, pass_percentage, negative_marks_per_question, status, results_released,
          exam_questions(count), exam_attempts(count)
        `,
          { count: 'exact' }
        )
        .order('start_time', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (search) query = query.ilike('title', `%${search}%`);
      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error: queryError, count } = await query;
      if (queryError) throw queryError;

      setExams(
        (data || []).map((e: any) => ({
          ...e,
          question_count: e.exam_questions?.[0]?.count ?? 0,
          attempt_count: e.exam_attempts?.[0]?.count ?? 0
        }))
      );
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(describeError(err, 'Could not load examinations.'));
      setExams([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [user, search, statusFilter, page]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  /**
   * Only `active` questions are graded (the grading RPC joins on
   * `status = 'active'`), so the picker offers active questions plus any
   * already-assigned question that has since been deactivated — flagged, so
   * the admin can see why an assigned question would not be scored.
   */
  const loadQuestionBank = useCallback(
    async (assignedIds: string[]) => {
      const { data: activeRows } = await supabase
        .from('questions')
        .select('question_id:id, question_text, marks, subject, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(500);

      const list: BankQuestion[] = ((activeRows || []) as any[]).map(q => ({ ...q, isInactive: false }));

      const missing = assignedIds.filter(id => !list.some(q => q.question_id === id));
      if (missing.length > 0) {
        const { data: inactiveRows } = await supabase
          .from('questions')
          .select('question_id:id, question_text, marks, subject, status')
          .in('id', missing);
        for (const q of (inactiveRows || []) as any[]) {
          list.push({ ...q, isInactive: true });
        }
      }

      setAvailableQuestions(list);
    },
    []
  );

  const openCreateModal = async () => {
    setEditingExamId(null);
    setTitle('');
    setDescription('');
    setDurationMinutes('30');

    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    setStartTime(toLocalInputValue(now));
    setEndTime(toLocalInputValue(fourHoursLater));

    setPassPercentage('40');
    setNegativeMarks('0');
    setStatus('scheduled');
    setSelectedQuestionIds([]);
    setQuestionSearch('');
    setFormError(null);
    setIsModalOpen(true);
    await loadQuestionBank([]);
  };

  const openEditModal = async (exam: ExamRow) => {
    setEditingExamId(exam.exam_id);
    setTitle(exam.title);
    setDescription(exam.description || '');
    setDurationMinutes(String(exam.duration_minutes));
    setStartTime(exam.start_time ? toLocalInputValue(new Date(exam.start_time)) : '');
    setEndTime(exam.end_time ? toLocalInputValue(new Date(exam.end_time)) : '');
    setPassPercentage(String(exam.pass_percentage ?? 40));
    setNegativeMarks(String(exam.negative_marks_per_question ?? 0));
    setStatus((exam.status === 'released' ? 'completed' : exam.status) as typeof status);
    setQuestionSearch('');
    setFormError(null);
    setIsModalOpen(true);

    const { data } = await supabase
      .from('exam_questions')
      .select('question_id')
      .eq('exam_id', exam.exam_id);
    const assigned = (data || []).map((row: any) => row.question_id);
    setSelectedQuestionIds(assigned);
    await loadQuestionBank(assigned);
  };

  const toggleQuestionSelection = (qId: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const selectedTotalMarks = useMemo(
    () =>
      availableQuestions
        .filter(q => selectedQuestionIds.includes(q.question_id))
        .reduce((sum, q) => sum + Number(q.marks || 0), 0),
    [availableQuestions, selectedQuestionIds]
  );

  const visibleQuestions = useMemo(() => {
    const term = questionSearch.trim().toLowerCase();
    if (!term) return availableQuestions;
    return availableQuestions.filter(
      q =>
        q.question_text.toLowerCase().includes(term) ||
        (q.subject || '').toLowerCase().includes(term)
    );
  }, [availableQuestions, questionSearch]);

  const handleSaveExam = async () => {
    setFormError(null);

    if (!title.trim()) {
      setFormError('Examination title cannot be empty.');
      return;
    }

    const duration = parseInt(durationMinutes, 10);
    if (Number.isNaN(duration) || duration <= 0) {
      setFormError('Duration must be a positive number of minutes.');
      return;
    }

    if (!startTime || !endTime) {
      setFormError('Both a start and an end date/time are required.');
      return;
    }

    if (new Date(endTime) <= new Date(startTime)) {
      setFormError('The end time must be after the start time.');
      return;
    }

    const pass = parseFloat(passPercentage);
    if (Number.isNaN(pass) || pass < 0 || pass > 100) {
      setFormError('Pass percentage must be between 0 and 100.');
      return;
    }

    const negative = parseFloat(negativeMarks);
    if (Number.isNaN(negative) || negative < 0) {
      setFormError('Negative marks cannot be a negative number.');
      return;
    }

    // The access window must be long enough for the paper to be sat at all.
    const windowMinutes = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
    if (windowMinutes < duration) {
      setFormError(
        `The access window is ${Math.round(windowMinutes)} minutes but the paper runs for ${duration} minutes. Widen the window or shorten the duration.`
      );
      return;
    }

    if (selectedQuestionIds.length === 0) {
      setFormError('Assign at least one question to this examination.');
      return;
    }

    setSubmitting(true);
    try {
      let examId = editingExamId;

      if (examId) {
        // REQ-23: schedule/questions are locked once candidates have attempted.
        const { count: attemptsCount } = await supabase
          .from('exam_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', examId);

        if (attemptsCount && attemptsCount > 0) {
          throw new Error(
            'This examination already has candidate attempts, so its schedule and questions can no longer be changed.'
          );
        }

        const { error: updateError } = await supabase
          .from('examinations')
          .update({
            title: title.trim(),
            description: description.trim(),
            duration_minutes: duration,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pass_percentage: pass,
            negative_marks_per_question: negative,
            status,
            total_marks: selectedTotalMarks
          })
          .eq('id', examId);
        if (updateError) throw updateError;

        const { error: clearError } = await supabase
          .from('exam_questions')
          .delete()
          .eq('exam_id', examId);
        if (clearError) throw clearError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('examinations')
          .insert({
            title: title.trim(),
            description: description.trim(),
            duration_minutes: duration,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pass_percentage: pass,
            negative_marks_per_question: negative,
            status,
            total_marks: selectedTotalMarks,
            results_released: false,
            created_by: user?.id
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        examId = inserted.id;
      }

      const { error: assignError } = await supabase
        .from('exam_questions')
        .insert(selectedQuestionIds.map(qId => ({ exam_id: examId, question_id: qId })));
      if (assignError) throw assignError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: editingExamId ? 'UPDATE_EXAM' : 'CREATE_EXAM',
          details: { examId, title: title.trim(), questions: selectedQuestionIds.length }
        });
      }

      setIsModalOpen(false);
      toast.success(editingExamId ? 'Examination updated.' : 'Examination scheduled.');
      fetchExams();
    } catch (err) {
      setFormError(describeError(err, 'Failed to save the examination.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (!releaseTarget) return;
    const { exam, next } = releaseTarget;
    setReleaseBusy(true);
    try {
      const { error: updateError } = await supabase
        .from('examinations')
        .update({ results_released: next, status: next ? 'released' : 'completed' })
        .eq('id', exam.exam_id);
      if (updateError) throw updateError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: next ? 'RELEASE_RESULTS' : 'UNRELEASE_RESULTS',
          details: { examId: exam.exam_id, title: exam.title }
        });
      }

      toast.success(
        next
          ? `Results for “${exam.title}” are now visible to candidates.`
          : `Results for “${exam.title}” have been withheld again.`
      );
      setReleaseTarget(null);
      fetchExams();
    } catch (err) {
      toast.error(describeError(err, 'Failed to change the result release state.'));
    } finally {
      setReleaseBusy(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const { count: attemptsCount } = await supabase
        .from('exam_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', deleteTarget.exam_id);

      if (attemptsCount && attemptsCount > 0) {
        throw new Error(
          'This examination cannot be deleted because candidate attempts exist. Mark it completed instead.'
        );
      }

      const { error: deleteError } = await supabase
        .from('examinations')
        .delete()
        .eq('id', deleteTarget.exam_id);
      if (deleteError) throw deleteError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'DELETE_EXAM',
          details: { examId: deleteTarget.exam_id, title: deleteTarget.title }
        });
      }

      toast.success('Examination deleted.');
      setDeleteTarget(null);
      fetchExams();
    } catch (err) {
      toast.error(describeError(err, 'Failed to delete the examination.'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasFilters = !!(searchInput || statusFilter);

  return (
    <div className="section-stack">
      <PageHeader
        title="Examinations"
        subtitle="Schedule papers, assign questions from the bank, and control when results become visible to candidates."
      >
        <button onClick={openCreateModal} className="btn btn-primary">
          <Plus size={16} aria-hidden="true" /> Schedule examination
        </button>
      </PageHeader>

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <Toolbar>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            label="Search examinations by title"
            placeholder="Search examinations…"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="Filter by status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'live', label: 'Live' },
              { value: 'completed', label: 'Completed' },
              { value: 'released', label: 'Released' }
            ]}
          />
        </Toolbar>

        {error && <ErrorBanner message={error} onRetry={fetchExams} />}

        {loading ? (
          <SkeletonTable rows={5} columns={6} label="Loading examinations" />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={28} strokeWidth={1.5} />}
            title={hasFilters ? 'No examinations match these filters' : 'No examinations yet'}
            description={
              hasFilters
                ? 'Adjust or clear the filters to see more.'
                : 'Schedule your first examination to get started.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Examination</th>
                    <th scope="col">Window</th>
                    <th scope="col">Paper</th>
                    <th scope="col">Status</th>
                    <th scope="col">Results</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map(exam => {
                    const isReleased = !!exam.results_released;
                    const isLocked = exam.attempt_count > 0;

                    return (
                      <tr key={exam.exam_id}>
                        <td style={{ maxWidth: '280px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{exam.title}</div>
                          <div className="row-meta">
                            <Clock size={11} aria-hidden="true" /> {exam.duration_minutes} min
                            {isLocked && (
                              <>
                                <span aria-hidden="true">•</span>
                                <span
                                  style={{
                                    color: 'var(--color-warning)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}
                                >
                                  <Lock size={10} aria-hidden="true" /> {exam.attempt_count} attempt
                                  {exam.attempt_count === 1 ? '' : 's'}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
                          <div>{formatDateTime(exam.start_time)}</div>
                          <div style={{ color: 'var(--text-muted)' }}>to {formatDateTime(exam.end_time)}</div>
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          <strong>{exam.question_count ?? 0}</strong> questions
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            {exam.total_marks} marks · pass {exam.pass_percentage}%
                          </div>
                        </td>
                        <td>
                          <Badge type={exam.status}>{exam.status}</Badge>
                        </td>
                        <td>
                          <button
                            onClick={() => setReleaseTarget({ exam, next: !isReleased })}
                            className={`btn btn-sm ${isReleased ? 'btn-success' : 'btn-secondary'}`}
                            title={
                              isReleased
                                ? 'Results are visible to candidates'
                                : 'Results are withheld from candidates'
                            }
                          >
                            <Share2 size={13} aria-hidden="true" />
                            {isReleased ? 'Released' : 'Withheld'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row-actions">
                            <button
                              onClick={() => openEditModal(exam)}
                              className="icon-btn"
                              title={
                                isLocked
                                  ? 'Candidate attempts exist — schedule and questions are locked'
                                  : 'Edit examination'
                              }
                              aria-label={`Edit ${exam.title}`}
                            >
                              <Edit2 size={14} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(exam)}
                              className="icon-btn icon-btn--danger"
                              disabled={isLocked}
                              title={
                                isLocked
                                  ? 'Cannot delete — candidate attempts exist'
                                  : 'Delete examination'
                              }
                              aria-label={`Delete ${exam.title}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalItems={totalCount}
              onPageChange={setPage}
              itemLabel="examinations"
            />
          </>
        )}
      </div>

      {/* CREATE / EDIT */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => (submitting ? undefined : setIsModalOpen(false))}
        title={editingExamId ? 'Edit examination' : 'Schedule examination'}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setIsModalOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button onClick={handleSaveExam} disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <>
                  <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                  Saving…
                </>
              ) : editingExamId ? (
                'Save changes'
              ) : (
                'Schedule examination'
              )}
            </button>
          </>
        }
      >
        <div className="form-stack">
          {formError && <ErrorBanner message={formError} />}

          <div className="form-group">
            <label className="form-label" htmlFor="ex-title">
              Title
            </label>
            <input
              id="ex-title"
              type="text"
              className="form-input"
              placeholder="e.g. CS301 — Design and Analysis of Algorithms, Mid-Semester"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="ex-desc">
              Description
            </label>
            <textarea
              id="ex-desc"
              className="form-textarea"
              rows={2}
              placeholder="Syllabus coverage and any paper-specific notes…"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="ex-duration">
                Duration (minutes)
              </label>
              <input
                id="ex-duration"
                type="number"
                min="1"
                className="form-input"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ex-status">
                Status
              </label>
              <select
                id="ex-status"
                className="form-select"
                value={status}
                onChange={e => setStatus(e.target.value as typeof status)}
              >
                <option value="draft">Draft — not published</option>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
              </select>
              <p className="form-hint">
                Result release is controlled separately, from the Results column.
              </p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="ex-start">
                Opens
              </label>
              <input
                id="ex-start"
                type="datetime-local"
                className="form-input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ex-end">
                Closes
              </label>
              <input
                id="ex-end"
                type="datetime-local"
                className="form-input"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="ex-pass">
                Pass percentage
              </label>
              <input
                id="ex-pass"
                type="number"
                min="0"
                max="100"
                step="1"
                className="form-input"
                value={passPercentage}
                onChange={e => setPassPercentage(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ex-negative">
                Negative marks per wrong answer
              </label>
              <input
                id="ex-negative"
                type="number"
                min="0"
                max="5"
                step="0.25"
                className="form-input"
                value={negativeMarks}
                onChange={e => setNegativeMarks(e.target.value)}
              />
              <p className="form-hint">Set to 0 to disable negative marking.</p>
            </div>
          </div>

          {/* Question assignment */}
          <div>
            <div className="options-builder__head" style={{ marginBottom: '0.5rem' }}>
              <span className="form-label" style={{ margin: 0 }}>
                Questions ({selectedQuestionIds.length} selected)
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-action-hover)', fontWeight: 600 }}>
                Total: {selectedTotalMarks} marks
              </span>
            </div>

            <div className="input-affix" style={{ marginBottom: '0.5rem' }}>
              <Search size={15} className="input-affix__icon" aria-hidden="true" />
              <input
                type="search"
                className="form-input input-affix__field"
                placeholder="Filter the question bank…"
                value={questionSearch}
                onChange={e => setQuestionSearch(e.target.value)}
                aria-label="Filter the question bank"
              />
            </div>

            <div className="question-picker">
              {visibleQuestions.length === 0 ? (
                <p className="muted-note" style={{ padding: '0.75rem', textAlign: 'center' }}>
                  {availableQuestions.length === 0
                    ? 'No active questions in the bank. Add questions first.'
                    : 'No questions match that filter.'}
                </p>
              ) : (
                visibleQuestions.map(q => {
                  const isSelected = selectedQuestionIds.includes(q.question_id);
                  return (
                    <label
                      key={q.question_id}
                      className={`question-picker__row${isSelected ? ' is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleQuestionSelection(q.question_id)}
                      />
                      <span className="question-picker__marks">+{q.marks}</span>
                      <span className="question-picker__text">{q.question_text}</span>
                      {q.isInactive && (
                        <span className="question-picker__flag" title="Deactivated — will not be graded">
                          deactivated
                        </span>
                      )}
                      <span className="question-picker__subject">{q.subject}</span>
                    </label>
                  );
                })
              )}
            </div>

            {availableQuestions.some(q => q.isInactive && selectedQuestionIds.includes(q.question_id)) && (
              <div className="confirm-callout" style={{ marginTop: '0.6rem' }}>
                <Lock size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
                <span>
                  One or more assigned questions are deactivated. Deactivated questions are not shown to
                  candidates and are not graded — remove them or reactivate them in the question bank.
                </span>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* RESULT RELEASE — high blast radius, so it is confirmed like a deletion */}
      <ConfirmDialog
        isOpen={!!releaseTarget}
        onCancel={() => setReleaseTarget(null)}
        onConfirm={handleConfirmRelease}
        tone="primary"
        title={releaseTarget?.next ? 'Release results to candidates' : 'Withhold results'}
        confirmLabel={releaseTarget?.next ? 'Release results' : 'Withhold results'}
        busy={releaseBusy}
        busyLabel={releaseTarget?.next ? 'Releasing…' : 'Withholding…'}
        message={
          releaseTarget?.next ? (
            <>
              Every candidate who sat <strong>{releaseTarget?.exam.title}</strong> will immediately be able
              to see their marks, their grade and the full answer key.
            </>
          ) : (
            <>
              Marks and the answer key for <strong>{releaseTarget?.exam.title}</strong> will be hidden from
              candidates again.
            </>
          )
        }
      >
        <div className="confirm-callout confirm-callout--info">
          <Share2 size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
          <span>
            {releaseTarget?.next
              ? 'This is reversible, but candidates who look before you reverse it will have seen the answer key.'
              : 'Candidates who already viewed their result may retain what they saw.'}
          </span>
        </div>
      </ConfirmDialog>

      {/* DELETE */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteExam}
        title="Delete examination"
        confirmLabel="Delete examination"
        busy={submitting}
        busyLabel="Deleting…"
        message={
          <>
            <strong>{deleteTarget?.title}</strong> will be permanently deleted and its questions returned
            to the bank.
          </>
        }
      >
        <p className="muted-note">
          Questions themselves are not deleted. If any candidate has attempted this examination, deletion
          is blocked to preserve the record.
        </p>
      </ConfirmDialog>
    </div>
  );
};
