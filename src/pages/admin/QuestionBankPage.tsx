import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Question } from '../../types';
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
import { describeError } from '../../lib/format';
import { Plus, Trash2, Edit2, Eye, FileQuestion, X, AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 15;

interface OptionDraft {
  option_id?: string;
  option_text: string;
  is_correct: boolean;
}

const emptyOptions = (): OptionDraft[] => [
  { option_text: '', is_correct: true },
  { option_text: '', is_correct: false },
  { option_text: '', is_correct: false },
  { option_text: '', is_correct: false }
];

export const QuestionBankPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  // Null while we are still asking the server whether this question has
  // submissions; the confirm copy waits so it can state the real outcome.
  const [deleteImpact, setDeleteImpact] = useState<{ willDeactivate: boolean; usageCount: number } | null>(null);

  // Form state
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formMarks, setFormMarks] = useState('2.0');
  const [formSubject, setFormSubject] = useState('');
  const [formDifficulty, setFormDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [formStatus, setFormStatus] = useState<'active' | 'deactivated'>('active');
  const [formOptions, setFormOptions] = useState<OptionDraft[]>(emptyOptions);
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setPage(1);
  }, [search, subjectFilter, difficultyFilter, statusFilter]);

  const fetchQuestions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * PAGE_SIZE;

      let query = supabase
        .from('questions')
        .select(
          `
          question_id:id, question_text, marks, question_type, subject, difficulty, status, created_at,
          question_options(option_id:id, question_id, option_text, is_correct, sort_order),
          exam_questions(count)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (search) query = query.ilike('question_text', `%${search}%`);
      if (subjectFilter) query = query.eq('subject', subjectFilter);
      if (difficultyFilter) query = query.eq('difficulty', difficultyFilter);
      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error: queryError, count } = await query;
      if (queryError) throw queryError;

      setQuestions(
        (data || []).map((q: any) => ({
          question_id: q.question_id,
          question_text: q.question_text,
          marks: q.marks,
          question_type: q.question_type,
          subject: q.subject,
          difficulty: q.difficulty,
          status: q.status,
          options: (q.question_options || []).sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          ),
          exam_count: q.exam_questions?.[0]?.count ?? 0
        }))
      );
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(describeError(err, 'Could not load the question bank.'));
      setQuestions([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [user, search, subjectFilter, difficultyFilter, statusFilter, page]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Subject filter options come from the data itself, so a question filed
  // under a new subject never becomes invisible to the filter.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('questions')
      .select('subject')
      .limit(1000)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const unique = Array.from(
          new Set(data.map((row: any) => row.subject).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        setSubjects(unique as string[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const subjectOptions = useMemo(
    () => [
      { value: '', label: 'All subjects' },
      ...subjects.map(s => ({ value: s, label: s }))
    ],
    [subjects]
  );

  const openAddModal = () => {
    setActiveEditingId(null);
    setIsEditing(false);
    setFormQuestionText('');
    setFormMarks('2.0');
    setFormSubject(subjects[0] || '');
    setFormDifficulty('medium');
    setFormStatus('active');
    setFormOptions(emptyOptions());
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (q: Question) => {
    setActiveEditingId(q.question_id);
    setIsEditing(true);
    setFormQuestionText(q.question_text);
    setFormMarks(String(q.marks));
    setFormSubject(q.subject);
    setFormDifficulty(q.difficulty);
    setFormStatus(q.status);
    setFormOptions(
      q.options && q.options.length >= 2
        ? q.options.map(o => ({
            option_id: o.option_id,
            option_text: o.option_text,
            is_correct: !!o.is_correct
          }))
        : emptyOptions().slice(0, 2)
    );
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  const handleOptionTextChange = (index: number, text: string) => {
    setFormOptions(prev => prev.map((opt, idx) => (idx === index ? { ...opt, option_text: text } : opt)));
  };

  const handleSetCorrectOption = (index: number) => {
    setFormOptions(prev => prev.map((opt, idx) => ({ ...opt, is_correct: idx === index })));
  };

  const handleAddOptionField = () => {
    setFormOptions(prev => (prev.length < 6 ? [...prev, { option_text: '', is_correct: false }] : prev));
  };

  const handleRemoveOptionField = (index: number) => {
    setFormOptions(prev => {
      if (prev.length <= 2) return prev;
      const removedWasCorrect = prev[index].is_correct;
      const next = prev.filter((_, idx) => idx !== index);
      if (removedWasCorrect) {
        // Never leave the question without a key; say so rather than
        // silently reassigning it.
        next[0] = { ...next[0], is_correct: true };
        toast.info(`Correct answer moved to option A — the previous key was removed.`);
      }
      return next;
    });
  };

  const handleSaveQuestion = async () => {
    setFormError(null);

    if (!formQuestionText.trim()) {
      setFormError('Question text cannot be empty.');
      return;
    }

    const marksNum = parseFloat(formMarks);
    if (Number.isNaN(marksNum) || marksNum <= 0) {
      setFormError('Marks must be a positive number.');
      return;
    }

    if (!formSubject.trim()) {
      setFormError('Please provide a subject.');
      return;
    }

    const validOptions = formOptions.filter(o => o.option_text.trim());
    if (validOptions.length < 2) {
      setFormError('Please enter at least two answer options.');
      return;
    }

    if (!validOptions.some(o => o.is_correct)) {
      setFormError('The correct answer must be one of the options that has text.');
      return;
    }

    setSubmitting(true);
    try {
      let questionId = activeEditingId;

      if (isEditing && questionId) {
        const { error: updateError } = await supabase
          .from('questions')
          .update({
            question_text: formQuestionText.trim(),
            marks: marksNum,
            subject: formSubject.trim(),
            difficulty: formDifficulty,
            status: formStatus
          })
          .eq('id', questionId);
        if (updateError) throw updateError;

        // Replace options wholesale — keeps them in sync with the form and
        // matches the edit semantics this app has always had.
        const { error: deleteOptsError } = await supabase
          .from('question_options')
          .delete()
          .eq('question_id', questionId);
        if (deleteOptsError) throw deleteOptsError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('questions')
          .insert({
            question_text: formQuestionText.trim(),
            marks: marksNum,
            subject: formSubject.trim(),
            difficulty: formDifficulty,
            status: 'active',
            created_by: user?.id
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        questionId = inserted.id;
      }

      const { error: optsInsertError } = await supabase.from('question_options').insert(
        validOptions.map((o, idx) => ({
          question_id: questionId,
          option_text: o.option_text.trim(),
          is_correct: o.is_correct,
          sort_order: idx
        }))
      );
      if (optsInsertError) throw optsInsertError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: isEditing ? 'UPDATE_QUESTION' : 'ADD_QUESTION',
          details: { questionId, marks: marksNum, subject: formSubject.trim() }
        });
      }

      setIsFormOpen(false);
      toast.success(isEditing ? 'Question updated.' : 'Question added to the bank.');
      fetchQuestions();
    } catch (err) {
      setFormError(describeError(err, 'Failed to save the question.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Work out, before asking, whether this is a reversible deactivation or a
  // true delete — the admin should know which one they are approving.
  const requestDelete = async (q: Question) => {
    setDeleteTarget(q);
    setDeleteImpact(null);
    const { count, error: countError } = await supabase
      .from('submitted_answers')
      .select('id', { count: 'exact', head: true })
      .eq('question_id', q.question_id);

    if (countError) {
      // Fall back to the safe assumption: treat it as a deactivation.
      setDeleteImpact({ willDeactivate: true, usageCount: 0 });
      return;
    }
    setDeleteImpact({ willDeactivate: (count ?? 0) > 0, usageCount: count ?? 0 });
  };

  const handleDeleteOrDeactivate = async () => {
    if (!deleteTarget || !deleteImpact) return;
    setSubmitting(true);
    try {
      if (deleteImpact.willDeactivate) {
        const { error: deactivateError } = await supabase
          .from('questions')
          .update({ status: 'deactivated' })
          .eq('id', deleteTarget.question_id);
        if (deactivateError) throw deactivateError;
      } else {
        const { error: deleteError } = await supabase
          .from('questions')
          .delete()
          .eq('id', deleteTarget.question_id);
        if (deleteError) throw deleteError;
      }

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: deleteImpact.willDeactivate ? 'DEACTIVATE_QUESTION' : 'DELETE_QUESTION',
          details: { questionId: deleteTarget.question_id, submissions: deleteImpact.usageCount }
        });
      }

      toast.success(
        deleteImpact.willDeactivate
          ? 'Question deactivated. Historical submissions are preserved.'
          : 'Question permanently deleted.'
      );
      setDeleteTarget(null);
      setDeleteImpact(null);
      fetchQuestions();
    } catch (err) {
      toast.error(describeError(err, 'Failed to remove the question.'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasFilters = !!(searchInput || subjectFilter || difficultyFilter || statusFilter);

  return (
    <div className="section-stack">
      <PageHeader
        title="Question bank"
        subtitle="Author, categorise and calibrate the objective questions available to examinations."
      >
        <button onClick={openAddModal} className="btn btn-primary">
          <Plus size={16} aria-hidden="true" /> New question
        </button>
      </PageHeader>

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <Toolbar>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            label="Search questions by keyword"
            placeholder="Search question text…"
          />
          <FilterSelect
            value={subjectFilter}
            onChange={setSubjectFilter}
            label="Filter by subject"
            options={subjectOptions}
          />
          <FilterSelect
            value={difficultyFilter}
            onChange={setDifficultyFilter}
            label="Filter by difficulty"
            options={[
              { value: '', label: 'All difficulties' },
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' }
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="Filter by status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'deactivated', label: 'Deactivated' }
            ]}
          />
        </Toolbar>

        {error && <ErrorBanner message={error} onRetry={fetchQuestions} />}

        {loading ? (
          <SkeletonTable rows={6} columns={6} label="Loading questions" />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<FileQuestion size={28} strokeWidth={1.5} />}
            title={hasFilters ? 'No questions match these filters' : 'The question bank is empty'}
            description={
              hasFilters
                ? 'Adjust or clear the filters to see more of the bank.'
                : 'Create your first question to start building examinations.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Difficulty</th>
                    <th scope="col">Marks</th>
                    <th scope="col">Status</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map(q => (
                    <tr key={q.question_id}>
                      <td style={{ maxWidth: '420px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                          {q.question_text}
                        </div>
                        <div className="row-meta">
                          <span>
                            {q.options.length} option{q.options.length === 1 ? '' : 's'}
                          </span>
                          {(q.exam_count || 0) > 0 && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span style={{ color: 'var(--color-action-hover)' }}>
                                In {q.exam_count} exam{q.exam_count === 1 ? '' : 's'}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{q.subject}</td>
                      <td>
                        <span className={`difficulty-tag difficulty-tag--${q.difficulty}`}>{q.difficulty}</span>
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{q.marks}</strong>
                      </td>
                      <td>
                        <Badge type={q.status === 'active' ? 'live' : 'draft'}>{q.status}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions">
                          <button
                            onClick={() => setPreviewQuestion(q)}
                            className="icon-btn"
                            title="Preview question"
                            aria-label={`Preview question: ${q.question_text.slice(0, 50)}`}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => openEditModal(q)}
                            className="icon-btn"
                            title="Edit question"
                            aria-label={`Edit question: ${q.question_text.slice(0, 50)}`}
                          >
                            <Edit2 size={14} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => requestDelete(q)}
                            className="icon-btn icon-btn--danger"
                            title="Remove question"
                            aria-label={`Remove question: ${q.question_text.slice(0, 50)}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalItems={totalCount}
              onPageChange={setPage}
              itemLabel="questions"
            />
          </>
        )}
      </div>

      {/* ADD / EDIT */}
      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={isEditing ? 'Edit question' : 'New question'}
        size="lg"
        footer={
          <>
            <button onClick={closeForm} className="btn btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button onClick={handleSaveQuestion} disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <>
                  <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                  Saving…
                </>
              ) : isEditing ? (
                'Save changes'
              ) : (
                'Create question'
              )}
            </button>
          </>
        }
      >
        <div className="form-stack">
          {formError && <ErrorBanner message={formError} />}

          <div className="form-group">
            <label className="form-label" htmlFor="q-text">
              Question text
            </label>
            <textarea
              id="q-text"
              className="form-textarea"
              rows={3}
              placeholder="State the question clearly…"
              value={formQuestionText}
              onChange={e => setFormQuestionText(e.target.value)}
              required
            />
          </div>

          <div className="form-row form-row--3">
            <div className="form-group">
              <label className="form-label" htmlFor="q-marks">
                Marks
              </label>
              <input
                id="q-marks"
                type="number"
                step="0.5"
                min="0.5"
                className="form-input"
                value={formMarks}
                onChange={e => setFormMarks(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="q-subject">
                Subject
              </label>
              <input
                id="q-subject"
                type="text"
                className="form-input"
                list="q-subject-options"
                value={formSubject}
                onChange={e => setFormSubject(e.target.value)}
                placeholder="e.g. Algorithms"
                required
              />
              <datalist id="q-subject-options">
                {subjects.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="q-difficulty">
                Difficulty
              </label>
              <select
                id="q-difficulty"
                className="form-select"
                value={formDifficulty}
                onChange={e => setFormDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {isEditing && (
            <div className="form-group">
              <label className="form-label" htmlFor="q-status">
                Status
              </label>
              <select
                id="q-status"
                className="form-select"
                value={formStatus}
                onChange={e => setFormStatus(e.target.value as 'active' | 'deactivated')}
              >
                <option value="active">Active — available to examinations</option>
                <option value="deactivated">Deactivated — hidden from new examinations</option>
              </select>
            </div>
          )}

          <fieldset className="options-builder">
            <div className="options-builder__head">
              <legend className="form-label" style={{ margin: 0 }}>
                Answer options
              </legend>
              {formOptions.length < 6 && (
                <button type="button" onClick={handleAddOptionField} className="btn btn-secondary btn-sm">
                  <Plus size={13} aria-hidden="true" /> Add option
                </button>
              )}
            </div>
            <p className="form-hint" style={{ marginBottom: '0.6rem' }}>
              Select the radio button next to the correct answer. Options left blank are discarded.
            </p>

            <div className="form-stack" style={{ gap: '0.5rem' }}>
              {formOptions.map((opt, idx) => (
                <div key={idx} className="option-row">
                  <label
                    className={`option-row__key${opt.is_correct ? ' is-correct' : ''}`}
                    title="Mark as the correct answer"
                  >
                    <input
                      type="radio"
                      name="correct_answer_choice"
                      checked={opt.is_correct}
                      onChange={() => handleSetCorrectOption(idx)}
                      aria-label={`Mark option ${String.fromCharCode(65 + idx)} as correct`}
                    />
                    <span aria-hidden="true">{String.fromCharCode(65 + idx)}</span>
                  </label>

                  <input
                    type="text"
                    className={`form-input${opt.is_correct ? ' form-input--correct' : ''}`}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    value={opt.option_text}
                    onChange={e => handleOptionTextChange(idx, e.target.value)}
                    aria-label={`Option ${String.fromCharCode(65 + idx)} text`}
                  />

                  {formOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionField(idx)}
                      className="icon-btn"
                      aria-label={`Remove option ${String.fromCharCode(65 + idx)}`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </Modal>

      {/* PREVIEW */}
      {previewQuestion && (
        <Modal
          isOpen
          onClose={() => setPreviewQuestion(null)}
          title="Question preview"
          footer={
            <button onClick={() => setPreviewQuestion(null)} className="btn btn-secondary">
              Close
            </button>
          }
        >
          <div className="form-stack">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge type="released">{previewQuestion.subject}</Badge>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {previewQuestion.marks} marks · {previewQuestion.difficulty}
              </span>
            </div>

            <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-main)', lineHeight: 1.6 }}>
              {previewQuestion.question_text}
            </p>

            <ul className="review-card__options">
              {previewQuestion.options.map((opt, idx) => (
                <li key={opt.option_id} className={`review-option${opt.is_correct ? ' is-key' : ''}`}>
                  <span className="review-option__text">
                    <strong>{String.fromCharCode(65 + idx)}.</strong> {opt.option_text}
                  </span>
                  {opt.is_correct && <span className="review-option__tag is-key">Correct answer</span>}
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}

      {/* DELETE / DEACTIVATE */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteImpact(null);
        }}
        onConfirm={handleDeleteOrDeactivate}
        title={deleteImpact?.willDeactivate ? 'Deactivate question' : 'Delete question'}
        confirmLabel={deleteImpact?.willDeactivate ? 'Deactivate question' : 'Delete permanently'}
        busy={submitting || !deleteImpact}
        busyLabel={deleteImpact ? 'Processing…' : 'Checking usage…'}
        message={
          deleteImpact === null ? (
            'Checking whether any candidate has already answered this question…'
          ) : deleteImpact.willDeactivate ? (
            <>
              This question has been answered in <strong>{deleteImpact.usageCount}</strong> submission
              {deleteImpact.usageCount === 1 ? '' : 's'}, so it will be <strong>deactivated</strong> rather
              than deleted.
            </>
          ) : (
            <>
              No candidate has answered this question, so it will be{' '}
              <strong>permanently deleted</strong> along with its options.
            </>
          )
        }
      >
        {deleteTarget && (
          <div className="confirm-callout confirm-callout--info">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
            <span>{deleteTarget.question_text}</span>
          </div>
        )}
        {deleteImpact?.willDeactivate && (
          <p className="muted-note">
            Deactivated questions stay attached to past attempts and graded results, but are excluded
            from new examinations.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
};
