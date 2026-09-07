import { Router } from 'express';
import { db, queryAll, queryGet, queryRun } from '../db/database.js';
import { authenticate, requireAdmin, logAudit } from '../middleware/auth.js';

const router = Router();

// GET /api/exams/student - Student view of available, upcoming, and completed examinations (REQ-26, REQ-27)
router.get('/student', authenticate, (req, res) => {
  const userId = req.user.user_id;
  const nowIso = new Date().toISOString();

  // All published exams (not draft)
  const exams = queryAll(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.exam_id AND q.status = 'active') as question_count,
      (SELECT a.status FROM exam_attempts a WHERE a.exam_id = e.exam_id AND a.user_id = ?) as attempt_status,
      (SELECT a.attempt_id FROM exam_attempts a WHERE a.exam_id = e.exam_id AND a.user_id = ?) as attempt_id,
      (SELECT r.result_id FROM results r WHERE r.exam_id = e.exam_id AND r.user_id = ?) as result_id,
      (SELECT r.marks_obtained FROM results r WHERE r.exam_id = e.exam_id AND r.user_id = ?) as marks_obtained,
      (SELECT r.percentage FROM results r WHERE r.exam_id = e.exam_id AND r.user_id = ?) as percentage,
      (SELECT r.status FROM results r WHERE r.exam_id = e.exam_id AND r.user_id = ?) as result_status
    FROM examinations e
    WHERE e.status != 'draft'
    ORDER BY e.start_time ASC
  `, [userId, userId, userId, userId, userId, userId]);

  // Compute dynamic eligibility and schedule status
  const processed = exams.map(e => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    const now = new Date();

    let accessState = 'unavailable'; // 'live', 'upcoming', 'expired', 'completed'
    let canStart = false;

    if (e.attempt_status === 'submitted' || e.attempt_status === 'timed_out') {
      accessState = 'completed';
    } else if (e.attempt_status === 'in_progress') {
      accessState = 'in_progress';
      canStart = true;
    } else if (now < start) {
      accessState = 'upcoming'; // BR-02
    } else if (now > end) {
      accessState = 'expired'; // BR-03
    } else {
      accessState = 'live'; // REQ-29
      canStart = true;
    }

    return {
      ...e,
      accessState,
      canStart,
      isReleased: e.results_released === 1
    };
  });

  return res.json({ examinations: processed });
});

// GET /api/exams/instructions/:id - Get official examination instructions before starting (REQ-28)
router.get('/instructions/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const exam = queryGet(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.exam_id AND q.status = 'active') as question_count
    FROM examinations e
    WHERE e.exam_id = ?
  `, [id]);

  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  // Check attempt status for student
  const attempt = queryGet('SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ?', [id, req.user.user_id]);

  const now = new Date();
  const start = new Date(exam.start_time);
  const end = new Date(exam.end_time);

  let scheduleStatus = 'permitted';
  if (attempt && (attempt.status === 'submitted' || attempt.status === 'timed_out')) {
    scheduleStatus = 'already_submitted';
  } else if (now < start) {
    scheduleStatus = 'not_started_yet';
  } else if (now > end) {
    scheduleStatus = 'access_period_ended';
  }

  return res.json({
    exam,
    scheduleStatus,
    attempt: attempt || null,
    rules: [
      `Total duration: ${exam.duration_minutes} minutes. Timer starts immediately upon clicking "Begin Examination".`,
      `The question palette allows free navigation between all ${exam.question_count} questions.`,
      `You may change your selected option at any time before final submission.`,
      exam.negative_marks_per_question > 0 
        ? `Negative marking is ACTIVE: -${exam.negative_marks_per_question} marks will be deducted for each incorrect answer.`
        : 'There is NO negative marking for incorrect responses.',
      'Unanswered questions receive zero marks.',
      'Automatic submission will be enforced once the countdown timer reaches 00:00:00.',
      'Do not refresh or close the browser tab. Your responses are continuously synchronized in real-time.',
      'Once submitted, your examination is permanently locked and cannot be reopened.'
    ]
  });
});

// ==========================================
// ADMINISTRATOR EXAM MANAGEMENT ROUTES (SEC-05, BR-06)
// ==========================================

// GET /api/exams/admin - Admin view of all exams with statistics
router.get('/admin', authenticate, requireAdmin, (req, res) => {
  const exams = queryAll(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.exam_id AND q.status = 'active') as question_count,
      (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id = e.exam_id) as total_attempts,
      (SELECT COUNT(*) FROM results r WHERE r.exam_id = e.exam_id) as completed_submissions,
      (SELECT AVG(r.percentage) FROM results r WHERE r.exam_id = e.exam_id) as avg_score
    FROM examinations e
    ORDER BY e.created_at DESC
  `);

  return res.json({ examinations: exams });
});

// GET /api/exams/admin/:id - Admin single exam detail with assigned questions
router.get('/admin/:id', authenticate, requireAdmin, (req, res) => {
  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [req.params.id]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const questions = queryAll(`
    SELECT q.*,
      (SELECT COUNT(*) FROM options o WHERE o.question_id = q.question_id) as option_count
    FROM questions q
    WHERE q.exam_id = ?
    ORDER BY q.created_at ASC
  `, [exam.exam_id]);

  for (const q of questions) {
    q.options = queryAll('SELECT * FROM options WHERE question_id = ? ORDER BY option_id ASC', [q.question_id]);
  }

  return res.json({ exam, questions });
});

// POST /api/exams - Create examination (REQ-17 to REQ-22)
router.post('/', authenticate, requireAdmin, (req, res) => {
  const {
    title,
    description,
    duration_minutes,
    start_time,
    end_time,
    pass_percentage,
    negative_marks_per_question,
    status,
    question_ids
  } = req.body;

  // Validation
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Examination title is required.' });
  }

  const duration = parseInt(duration_minutes);
  if (isNaN(duration) || duration <= 0) {
    return res.status(400).json({ error: 'A valid positive duration (in minutes) is required.' });
  }

  if (!start_time || !end_time) {
    return res.status(400).json({ error: 'Both start time and end time are required.' });
  }

  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date/time format.' });
  }

  if (endDate <= startDate) {
    return res.status(400).json({ error: 'End time must be after start time.' });
  }

  const examId = 'EXAM-' + Date.now().toString(36).toUpperCase();

  db.exec('BEGIN TRANSACTION;');
  try {
    let totalMarks = 0;
    if (question_ids && Array.isArray(question_ids) && question_ids.length > 0) {
      // Calculate total marks from assigned questions
      for (const qId of question_ids) {
        const q = queryGet('SELECT marks FROM questions WHERE question_id = ?', [qId]);
        if (q) totalMarks += q.marks;
      }
    }

    db.prepare(`
      INSERT INTO examinations (
        exam_id, title, description, duration_minutes, start_time, end_time,
        total_marks, pass_percentage, negative_marks_per_question, status,
        results_released, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      examId,
      title.trim(),
      description ? description.trim() : '',
      duration,
      startDate.toISOString(),
      endDate.toISOString(),
      totalMarks,
      pass_percentage ? parseFloat(pass_percentage) : 40.0,
      negative_marks_per_question ? parseFloat(negative_marks_per_question) : 0.0,
      status || 'draft',
      req.user.user_id
    );

    // Assign questions if provided
    if (question_ids && Array.isArray(question_ids)) {
      for (const qId of question_ids) {
        queryRun('UPDATE questions SET exam_id = ? WHERE question_id = ?', [examId, qId]);
      }
    }

    db.exec('COMMIT;');
    logAudit(req.user.user_id, 'CREATE_EXAM', `Created examination ${examId}: ${title}`);

    return res.status(201).json({
      message: 'Examination created successfully.',
      exam_id: examId
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Failed to create examination: ' + err.message });
  }
});

// PUT /api/exams/:id - Update examination (REQ-23: only before active/submitted)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  // REQ-23: Do not allow modification of an active/completed exam where attempts exist
  const attemptsCount = queryGet('SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = ?', [id])?.count || 0;
  if (attemptsCount > 0 && req.body.status !== 'released') {
    // We allow toggling status or results_released, but protect scheduling/questions
    if (req.body.start_time || req.body.end_time || req.body.duration_minutes || req.body.question_ids) {
      return res.status(400).json({
        error: 'Cannot modify core schedule or questions of an examination with active/submitted student attempts (REQ-23).'
      });
    }
  }

  const {
    title,
    description,
    duration_minutes,
    start_time,
    end_time,
    pass_percentage,
    negative_marks_per_question,
    status,
    results_released,
    question_ids
  } = req.body;

  let newStart = existing.start_time;
  let newEnd = existing.end_time;

  if (start_time) newStart = new Date(start_time).toISOString();
  if (end_time) newEnd = new Date(end_time).toISOString();

  if (new Date(newEnd) <= new Date(newStart)) {
    return res.status(400).json({ error: 'End time must be after start time.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // If question_ids updated
    if (question_ids && Array.isArray(question_ids)) {
      // Unassign existing questions
      queryRun('UPDATE questions SET exam_id = NULL WHERE exam_id = ?', [id]);
      // Assign new questions
      for (const qId of question_ids) {
        queryRun('UPDATE questions SET exam_id = ? WHERE question_id = ?', [id, qId]);
      }
    }

    // Recalculate total marks
    const sumResult = queryGet('SELECT SUM(marks) as total FROM questions WHERE exam_id = ? AND status = "active"', [id]);
    const totalMarks = sumResult?.total || existing.total_marks;

    queryRun(`
      UPDATE examinations
      SET title = ?, description = ?, duration_minutes = ?, start_time = ?, end_time = ?,
          total_marks = ?, pass_percentage = ?, negative_marks_per_question = ?,
          status = ?, results_released = ?
      WHERE exam_id = ?
    `, [
      title ? title.trim() : existing.title,
      description !== undefined ? description.trim() : existing.description,
      duration_minutes ? parseInt(duration_minutes) : existing.duration_minutes,
      newStart,
      newEnd,
      totalMarks,
      pass_percentage !== undefined ? parseFloat(pass_percentage) : existing.pass_percentage,
      negative_marks_per_question !== undefined ? parseFloat(negative_marks_per_question) : existing.negative_marks_per_question,
      status || existing.status,
      results_released !== undefined ? (results_released ? 1 : 0) : existing.results_released,
      id
    ]);

    db.exec('COMMIT;');
    logAudit(req.user.user_id, 'UPDATE_EXAM', `Updated examination ${id}.`);

    return res.json({ message: 'Examination updated successfully.' });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Failed to update examination: ' + err.message });
  }
});

// POST /api/exams/:id/release-results - Admin toggle to release results to students (REQ-47)
router.post('/:id/release-results', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { release } = req.body; // boolean

  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [id]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const isReleased = release !== false ? 1 : 0;
  queryRun('UPDATE examinations SET results_released = ?, status = ? WHERE exam_id = ?', [
    isReleased,
    isReleased ? 'released' : 'completed',
    id
  ]);

  logAudit(req.user.user_id, isReleased ? 'RELEASE_RESULTS' : 'UNRELEASE_RESULTS', `Toggled result release to ${isReleased} for exam ${id}.`);

  return res.json({
    message: isReleased ? 'Results have been released to students.' : 'Results have been withheld.',
    results_released: isReleased
  });
});

// DELETE /api/exams/:id - Delete examination (SAFE-01)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [id]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const attemptsCount = queryGet('SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = ?', [id])?.count || 0;
  if (attemptsCount > 0) {
    return res.status(400).json({
      error: 'Cannot delete examination because submitted student records exist. You may mark it as completed or draft instead.'
    });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // Detach questions so question bank doesn't lose them
    queryRun('UPDATE questions SET exam_id = NULL WHERE exam_id = ?', [id]);
    queryRun('DELETE FROM examinations WHERE exam_id = ?', [id]);
    db.exec('COMMIT;');

    logAudit(req.user.user_id, 'DELETE_EXAM', `Deleted examination ${id}.`);
    return res.json({ message: 'Examination deleted successfully.' });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Failed to delete examination: ' + err.message });
  }
});

export default router;
