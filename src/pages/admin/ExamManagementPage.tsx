import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Examination, Question } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Share2,
  AlertCircle,
  FileText,
  Lock,
  Eye
} from 'lucide-react';

// datetime-local inputs expect wall-clock time with no timezone info, but
// Date.toISOString() always prints UTC — converting a Date straight through
// silently swaps in the UTC clock reading wherever the browser isn't in
// UTC, shifting the exam window by the local offset. Subtract the offset
// first so the printed digits match what the browser's clock actually shows.
const toLocalInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const ExamManagementPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [exams, setExams] = useState<Examination[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Examination | null>(null);
  const [detailExam, setDetailExam] = useState<any | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [passPercentage, setPassPercentage] = useState('40.0');
  const [negativeMarks, setNegativeMarks] = useState('0.0');
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'live' | 'completed' | 'released'>('scheduled');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchExams = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('examinations')
        .select(`
          exam_id:id, title, description, duration_minutes, start_time, end_time,
          total_marks, pass_percentage, negative_marks_per_question, status, results_released,
          exam_questions(count)
        `)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;

      setExams((data || []).map((e: any) => ({
        ...e,
        question_count: e.exam_questions?.[0]?.count ?? 0
      })));

      // Also fetch question bank for assignment
      const { data: qData, error: qError } = await supabase
        .from('questions')
        .select('question_id:id, question_text, marks, subject')
        .order('created_at', { ascending: false });
      if (!qError) setAvailableQuestions((qData || []) as Question[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, [user?.id]);

  const openCreateModal = () => {
    setEditingExamId(null);
    setTitle('');
    setDescription('');
    setDurationMinutes('30');

    // Default dates: start now, end in 4 hours
    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    setStartTime(toLocalInputValue(now));
    setEndTime(toLocalInputValue(fourHoursLater));

    setPassPercentage('40.0');
    setNegativeMarks('0.0');
    setStatus('scheduled');
    setSelectedQuestionIds([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = async (exam: Examination) => {
    setEditingExamId(exam.exam_id);
    setTitle(exam.title);
    setDescription(exam.description || '');
    setDurationMinutes(String(exam.duration_minutes));
    setStartTime(exam.start_time ? toLocalInputValue(new Date(exam.start_time)) : '');
    setEndTime(exam.end_time ? toLocalInputValue(new Date(exam.end_time)) : '');
    setPassPercentage(String(exam.pass_percentage || 40.0));
    setNegativeMarks(String(exam.negative_marks_per_question || 0.0));
    setStatus(exam.status);

    // Fetch assigned question IDs
    try {
      const { data } = await supabase
        .from('exam_questions')
        .select('question_id')
        .eq('exam_id', exam.exam_id);
      setSelectedQuestionIds((data || []).map((row: any) => row.question_id));
    } catch (err) {
      console.error(err);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  const toggleQuestionSelection = (qId: string) => {
    if (selectedQuestionIds.includes(qId)) {
      setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== qId));
    } else {
      setSelectedQuestionIds([...selectedQuestionIds, qId]);
    }
  };

  const handleSaveExam = async () => {
    setFormError(null);

    // Validation per REQ-18 to REQ-22
    if (!title.trim()) {
      setFormError('Examination title cannot be empty.');
      return;
    }

    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration <= 0) {
      setFormError('Duration must be a positive number of minutes.');
      return;
    }

    if (!startTime || !endTime) {
      setFormError('Both start date/time and end date/time are required.');
      return;
    }

    if (new Date(endTime) <= new Date(startTime)) {
      setFormError('End time must be after the start time.');
      return;
    }

    setSubmitting(true);
    try {
      const totalMarks = availableQuestions
        .filter(q => selectedQuestionIds.includes(q.question_id))
        .reduce((sum, q) => sum + q.marks, 0);

      let examId = editingExamId;

      if (examId) {
        // REQ-23: schedule/questions are locked once candidates have attempted
        const { count: attemptsCount } = await supabase
          .from('exam_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', examId);

        if (attemptsCount && attemptsCount > 0) {
          throw new Error('Cannot modify the schedule or questions of an examination with active/submitted student attempts (REQ-23).');
        }

        const { error: updateError } = await supabase
          .from('examinations')
          .update({
            title: title.trim(),
            description: description.trim(),
            duration_minutes: duration,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString(),
            pass_percentage: parseFloat(passPercentage),
            negative_marks_per_question: parseFloat(negativeMarks),
            status,
            total_marks: totalMarks
          })
          .eq('id', examId);
        if (updateError) throw updateError;

        const { error: clearError } = await supabase.from('exam_questions').delete().eq('exam_id', examId);
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
            pass_percentage: parseFloat(passPercentage),
            negative_marks_per_question: parseFloat(negativeMarks),
            status,
            total_marks: totalMarks,
            results_released: false,
            created_by: user?.id
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        examId = inserted.id;
      }

      if (selectedQuestionIds.length > 0) {
        const { error: assignError } = await supabase
          .from('exam_questions')
          .insert(selectedQuestionIds.map(qId => ({ exam_id: examId, question_id: qId })));
        if (assignError) throw assignError;
      }

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: editingExamId ? 'UPDATE_EXAM' : 'CREATE_EXAM',
          details: { examId, title: title.trim() }
        });
      }

      setIsModalOpen(false);
      fetchExams();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save examination.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReleaseResults = async (examId: string, currentReleased: boolean) => {
    try {
      const nextReleased = !currentReleased;
      const { error: updateError } = await supabase
        .from('examinations')
        .update({ results_released: nextReleased, status: nextReleased ? 'released' : 'completed' })
        .eq('id', examId);
      if (updateError) throw updateError;

      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: nextReleased ? 'RELEASE_RESULTS' : 'UNRELEASE_RESULTS',
          details: { examId }
        });
      }
      fetchExams();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle result release.');
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
        throw new Error('Cannot delete this examination because submitted student records exist. Mark it as completed instead.');
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

      setDeleteTarget(null);
      fetchExams();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete examination');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Examination Management & Scheduling"
        subtitle="Configure schedules, assign questions, oversee candidate attempts, and release evaluated results (REQ-17 to REQ-25)."
      >
        <button onClick={openCreateModal} className="btn btn-primary">
          <Plus size={16} /> Create & Schedule Examination
        </button>
      </PageHeader>

      {error && <div className="error-banner">{error}</div>}

      {/* Examinations Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner label="Loading examination schedules..." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Examination Details</th>
                  <th>Schedule Window</th>
                  <th>Duration</th>
                  <th>Questions & Marks</th>
                  <th>Lifecycle Status</th>
                  <th>Result Release</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map(exam => {
                  const isReleased = exam.results_released;
                  return (
                    <tr key={exam.exam_id}>
                      <td style={{ maxWidth: '320px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                          {exam.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {exam.exam_id}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          <div>From: <strong>{new Date(exam.start_time).toLocaleString()}</strong></div>
                          <div>To: <strong>{new Date(exam.end_time).toLocaleString()}</strong></div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={14} color="var(--color-action)" />
                          {exam.duration_minutes} Mins
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          <strong>{exam.question_count || 0} Questions</strong>
                          <div style={{ color: 'var(--text-muted)' }}>{exam.total_marks} Marks total</div>
                        </div>
                      </td>
                      <td>
                        <Badge type={exam.status as any}>
                          {exam.status}
                        </Badge>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleReleaseResults(exam.exam_id, isReleased)}
                          className={`btn btn-sm ${isReleased ? 'btn-success' : 'btn-secondary'}`}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          title="Toggle student visibility of final results"
                        >
                          <Share2 size={13} />
                          {isReleased ? 'Released' : 'Withheld'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            onClick={() => openEditModal(exam)}
                            className="btn btn-secondary btn-sm"
                            title="Edit Examination"
                            aria-label={`Edit examination ${exam.title}`}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(exam)}
                            className="btn btn-secondary btn-sm"
                            title="Delete Examination"
                            aria-label={`Delete examination ${exam.title}`}
                            style={{ color: 'var(--color-danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT EXAMINATION MODAL (REQ-17 to REQ-22) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExamId ? 'Edit Examination Configuration' : 'Schedule New Examination'}
        footer={
          <>
            <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleSaveExam} disabled={submitting} className="btn btn-primary">
              {submitting ? 'Saving...' : (editingExamId ? 'Save Configuration' : 'Schedule Examination')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {formError && <div className="error-banner" role="alert">{formError}</div>}

          <div className="form-group">
            <label className="form-label">Examination Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. CS301: Design and Analysis of Algorithms - Mid-Semester"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Instructions</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Provide syllabus coverage and instructions..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Duration (Minutes)</label>
              <input
                type="number"
                min="5"
                className="form-input"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lifecycle Status</label>
              <select
                className="form-select"
                value={status}
                onChange={e => setStatus(e.target.value as any)}
              >
                <option value="draft">Draft (Inactive)</option>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live (Active)</option>
                <option value="completed">Completed</option>
                <option value="released">Results Released</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Start Date & Time (Schedule)</label>
              <input
                type="datetime-local"
                className="form-input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">End Date & Time (Access Cutoff)</label>
              <input
                type="datetime-local"
                className="form-input"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Passing Percentage (%)</label>
              <input
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
              <label className="form-label">Negative Marks Per Wrong Answer</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.25"
                className="form-input"
                value={negativeMarks}
                onChange={e => setNegativeMarks(e.target.value)}
              />
            </div>
          </div>

          {/* Question Assignment Picker from Question Bank */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Assign Questions from Bank ({selectedQuestionIds.length} Selected)
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-action)', fontWeight: 600 }}>
                Total Marks: {
                  availableQuestions
                    .filter(q => selectedQuestionIds.includes(q.question_id))
                    .reduce((sum, q) => sum + q.marks, 0)
                }
              </span>
            </div>

            <div style={{
              maxHeight: '180px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              backgroundColor: 'var(--bg-page)'
            }}>
              {availableQuestions.map(q => {
                const isSelected = selectedQuestionIds.includes(q.question_id);
                return (
                  <label
                    key={q.question_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      border: isSelected ? '1px solid #bfdbfe' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleQuestionSelection(q.question_id)}
                      style={{ accentColor: 'var(--color-action)' }}
                    />
                    <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>+{q.marks}m</strong> • {q.question_text}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{q.subject}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION (SAFE-01) */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Examination Removal"
        isDanger={true}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleDeleteExam} className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Deleting...' : 'Delete Examination'}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to permanently delete <strong>{deleteTarget?.title}</strong>?
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          This operation will detach questions back to the Question Bank. If student submission attempts already exist for this exam, the system will prevent deletion to preserve data integrity (SAFE-01, SAFE-02).
        </p>
      </Modal>
    </div>
  );
};
