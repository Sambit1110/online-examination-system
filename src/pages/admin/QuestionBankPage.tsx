import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Question } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Eye,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  FileQuestion,
  X
} from 'lucide-react';

export const QuestionBankPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  // Form State
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formMarks, setFormMarks] = useState('2.0');
  const [formSubject, setFormSubject] = useState('Algorithms');
  const [formDifficulty, setFormDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [formStatus, setFormStatus] = useState<'active' | 'deactivated'>('active');
  const [formOptions, setFormOptions] = useState<Array<{ option_id?: string; option_text: string; is_correct: number }>>([
    { option_text: '', is_correct: 1 },
    { option_text: '', is_correct: 0 },
    { option_text: '', is_correct: 0 },
    { option_text: '', is_correct: 0 }
  ]);
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchQuestions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      let query = supabase
        .from('questions')
        .select(`
          question_id:id, question_text, marks, question_type, subject, difficulty, status, created_at,
          question_options(option_id:id, question_id, option_text, is_correct, sort_order),
          exam_questions(count)
        `)
        .order('created_at', { ascending: false });

      if (search) query = query.ilike('question_text', `%${search}%`);
      if (subjectFilter) query = query.eq('subject', subjectFilter);
      if (difficultyFilter) query = query.eq('difficulty', difficultyFilter);
      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const mapped: Question[] = (data || []).map((q: any) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        marks: q.marks,
        question_type: q.question_type,
        subject: q.subject,
        difficulty: q.difficulty,
        status: q.status,
        options: q.question_options || [],
        exam_count: q.exam_questions?.[0]?.count ?? 0
      }));

      setQuestions(mapped);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [user?.id, search, subjectFilter, difficultyFilter, statusFilter]);

  const openAddModal = () => {
    setFormQuestionText('');
    setFormMarks('2.0');
    setFormSubject('Algorithms');
    setFormDifficulty('medium');
    setFormStatus('active');
    setFormOptions([
      { option_text: '', is_correct: 1 },
      { option_text: '', is_correct: 0 },
      { option_text: '', is_correct: 0 },
      { option_text: '', is_correct: 0 }
    ]);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (q: Question) => {
    setActiveEditingId(q.question_id);
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
            is_correct: o.is_correct ? 1 : 0
          }))
        : [
            { option_text: '', is_correct: 1 },
            { option_text: '', is_correct: 0 }
          ]
    );
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleOptionTextChange = (index: number, text: string) => {
    const updated = [...formOptions];
    updated[index].option_text = text;
    setFormOptions(updated);
  };

  const handleSetCorrectOption = (index: number) => {
    const updated = formOptions.map((opt, idx) => ({
      ...opt,
      is_correct: idx === index ? 1 : 0
    }));
    setFormOptions(updated);
  };

  const handleAddOptionField = () => {
    if (formOptions.length < 6) {
      setFormOptions([...formOptions, { option_text: '', is_correct: 0 }]);
    }
  };

  const handleRemoveOptionField = (index: number) => {
    if (formOptions.length <= 2) return;
    const updated = formOptions.filter((_, idx) => idx !== index);
    if (!updated.some(o => o.is_correct === 1)) {
      updated[0].is_correct = 1;
    }
    setFormOptions(updated);
  };

  const handleSaveQuestion = async (isEdit: boolean) => {
    setFormError(null);

    // REQ-15: Validation
    if (!formQuestionText.trim()) {
      setFormError('Question text cannot be empty.');
      return;
    }

    const marksNum = parseFloat(formMarks);
    if (isNaN(marksNum) || marksNum <= 0) {
      setFormError('Marks must be a positive number.');
      return;
    }

    const validOptions = formOptions.filter(o => o.option_text.trim());
    if (validOptions.length < 2) {
      setFormError('Please enter at least two valid options.');
      return;
    }

    const hasCorrect = formOptions.some(o => o.is_correct === 1);
    if (!hasCorrect) {
      setFormError('Please designate one option as the correct answer.');
      return;
    }

    setSubmitting(true);
    try {
      const validOpts = formOptions.filter(o => o.option_text.trim());

      let questionId = activeEditingId;
      if (isEdit && questionId) {
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

        // Replace options wholesale — simplest way to keep them in sync
        // with the form, matching the original app's edit semantics.
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

      const { error: optsInsertError } = await supabase
        .from('question_options')
        .insert(
          validOpts.map((o, idx) => ({
            question_id: questionId,
            option_text: o.option_text.trim(),
            is_correct: o.is_correct === 1,
            sort_order: idx
          }))
        );
      if (optsInsertError) throw optsInsertError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: isEdit ? 'UPDATE_QUESTION' : 'ADD_QUESTION',
          details: { questionId, marks: marksNum }
        });
      }

      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      fetchQuestions();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrDeactivate = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const { count } = await supabase
        .from('submitted_answers')
        .select('id', { count: 'exact', head: true })
        .eq('question_id', deleteTarget.question_id);

      if (count && count > 0) {
        // Student submissions already reference this question — deactivate
        // rather than hard-delete, preserving historical records (SAFE-01).
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
          action: 'DEACTIVATE_QUESTION',
          details: { questionId: deleteTarget.question_id }
        });
      }

      setDeleteTarget(null);
      fetchQuestions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete question');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Question Bank Repository"
        subtitle="Author, categorize, calibrate marks, and assign objective questions to university examinations (REQ-09 to REQ-16)."
      >
        <button onClick={openAddModal} className="btn btn-primary">
          <Plus size={16} /> Create New Question
        </button>
      </PageHeader>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search questions by keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        <select
          className="form-select"
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '160px' }}
        >
          <option value="">All Subjects</option>
          <option value="Algorithms">Algorithms</option>
          <option value="Database Systems">Database Systems</option>
          <option value="Discrete Mathematics">Discrete Mathematics</option>
        </select>

        <select
          className="form-select"
          value={difficultyFilter}
          onChange={e => setDifficultyFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px' }}
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '130px' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {/* Questions Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner label="Loading question records..." />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<FileQuestion size={30} strokeWidth={1.5} />}
            title="No questions matching the selected filter criteria."
            description="Try adjusting your search or filters, or create a new question."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Question & Options</th>
                  <th>Subject</th>
                  <th>Difficulty</th>
                  <th>Weightage</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map(q => (
                  <tr key={q.question_id}>
                    <td style={{ maxWidth: '440px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-brand-primary)', marginBottom: '0.25rem' }}>
                        {q.question_text}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{q.question_id}</span>
                        <span>•</span>
                        <span>{q.options?.length || 4} Options</span>
                        {(q.exam_count || 0) > 0 && (
                          <>
                            <span>•</span>
                            <span style={{ color: 'var(--color-action)' }}>
                              Assigned to {q.exam_count} exam{q.exam_count === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{q.subject}</span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        color: q.difficulty === 'easy' ? '#15803d' : (q.difficulty === 'medium' ? '#b45309' : '#b91c1c')
                      }}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-action)' }}>
                        {q.marks} Marks
                      </strong>
                    </td>
                    <td>
                      <Badge type={q.status === 'active' ? 'live' : 'draft'}>
                        {q.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          onClick={() => setPreviewQuestion(q)}
                          className="btn btn-secondary btn-sm"
                          title="Preview Question"
                          aria-label={`Preview question ${q.question_id}`}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => openEditModal(q)}
                          className="btn btn-secondary btn-sm"
                          title="Edit Question"
                          aria-label={`Edit question ${q.question_id}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(q)}
                          className="btn btn-secondary btn-sm"
                          title="Deactivate or Remove"
                          aria-label={`Deactivate question ${q.question_id}`}
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT QUESTION MODAL (REQ-09 to REQ-13, REQ-15) */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
        title={isEditModalOpen ? 'Edit Examination Question' : 'Author New Objective Question'}
        footer={
          <>
            <button
              onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSaveQuestion(isEditModalOpen)}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? 'Saving...' : (isEditModalOpen ? 'Save Changes' : 'Create Question')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && <div className="error-banner" role="alert">{formError}</div>}

          <div className="form-group">
            <label className="form-label">Question Text</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="State the examination question clearly..."
              value={formQuestionText}
              onChange={e => setFormQuestionText(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Marks</label>
              <input
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
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={formSubject}
                onChange={e => setFormSubject(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select
                className="form-select"
                value={formDifficulty}
                onChange={e => setFormDifficulty(e.target.value as any)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Options Builder */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Answer Options (Select the correct answer)</label>
              {formOptions.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOptionField}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                >
                  + Add Option
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {formOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Radio button for Correct Answer */}
                  <label
                    title="Designate as Correct Answer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: opt.is_correct === 1 ? '#047857' : 'var(--text-muted)'
                    }}
                  >
                    <input
                      type="radio"
                      name="correct_answer_choice"
                      checked={opt.is_correct === 1}
                      onChange={() => handleSetCorrectOption(idx)}
                      style={{ accentColor: '#059669', width: '1.1rem', height: '1.1rem' }}
                    />
                    <span>{String.fromCharCode(65 + idx)}</span>
                  </label>

                  <input
                    type="text"
                    className="form-input"
                    placeholder={`Option ${String.fromCharCode(65 + idx)} content`}
                    value={opt.option_text}
                    onChange={e => handleOptionTextChange(idx, e.target.value)}
                    style={{
                      borderColor: opt.is_correct === 1 ? '#86efac' : 'var(--border-subtle)',
                      backgroundColor: opt.is_correct === 1 ? '#f0fdf4' : '#ffffff'
                    }}
                  />

                  {formOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionField(idx)}
                      className="btn btn-secondary btn-sm"
                      style={{ color: 'var(--text-muted)', padding: '0.4rem' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* QUESTION PREVIEW DRAWER/MODAL */}
      {previewQuestion && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewQuestion(null)}
          title="Question Preview (Admin View)"
          footer={
            <button onClick={() => setPreviewQuestion(null)} className="btn btn-secondary">
              Close Preview
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge type="live">{previewQuestion.subject}</Badge>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {previewQuestion.marks} Marks • Difficulty: {previewQuestion.difficulty}
              </span>
            </div>

            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>
              {previewQuestion.question_text}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {previewQuestion.options?.map((opt, idx) => (
                <div
                  key={opt.option_id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    border: opt.is_correct ? '1px solid #a7f3d0' : '1px solid var(--border-subtle)',
                    backgroundColor: opt.is_correct ? '#f0fdf4' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.875rem'
                  }}
                >
                  <div>
                    <strong>{String.fromCharCode(65 + idx)}.</strong> {opt.option_text}
                  </div>
                  {opt.is_correct ? (
                    <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700 }}>
                      ✓ Correct Answer
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* SAFE DELETE/DEACTIVATE CONFIRMATION (SAFE-01) */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Question Deactivation"
        isDanger={true}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleDeleteOrDeactivate} className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Processing...' : 'Safely Deactivate Question'}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to deactivate question <strong>{deleteTarget?.question_id}</strong>?
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Deactivating this question preserves historical attempts and submitted records while preventing it from appearing in upcoming examinations.
        </p>
      </Modal>
    </div>
  );
};
