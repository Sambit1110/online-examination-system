import { Router } from 'express';
import { db, queryAll, queryGet, queryRun } from '../db/database.js';
import { authenticate, requireAdmin, logAudit } from '../middleware/auth.js';

const router = Router();

// All question management routes require administrator authorization (SEC-04, BR-05)
router.use(authenticate, requireAdmin);

// GET /api/questions - List question bank with search & filters
router.get('/', (req, res) => {
  const { search, subject, difficulty, status, examId } = req.query;
  
  let sql = `
    SELECT q.*, e.title as exam_title,
      (SELECT COUNT(*) FROM options o WHERE o.question_id = q.question_id) as option_count
    FROM questions q
    LEFT JOIN examinations e ON q.exam_id = e.exam_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    sql += ` AND q.question_text LIKE ?`;
    params.push(`%${search}%`);
  }
  if (subject) {
    sql += ` AND q.subject = ?`;
    params.push(subject);
  }
  if (difficulty) {
    sql += ` AND q.difficulty = ?`;
    params.push(difficulty);
  }
  if (status) {
    sql += ` AND q.status = ?`;
    params.push(status);
  }
  if (examId) {
    sql += ` AND q.exam_id = ?`;
    params.push(examId);
  }

  sql += ` ORDER BY q.created_at DESC`;

  const questions = queryAll(sql, params);

  // Fetch options for all returned questions
  for (const q of questions) {
    q.options = queryAll('SELECT * FROM options WHERE question_id = ? ORDER BY option_id ASC', [q.question_id]);
  }

  return res.json({ questions });
});

// GET /api/questions/:id - Get single question preview with options
router.get('/:id', (req, res) => {
  const question = queryGet(`
    SELECT q.*, e.title as exam_title
    FROM questions q
    LEFT JOIN examinations e ON q.exam_id = e.exam_id
    WHERE q.question_id = ?
  `, [req.params.id]);

  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }

  question.options = queryAll('SELECT * FROM options WHERE question_id = ? ORDER BY option_id ASC', [question.question_id]);
  return res.json({ question });
});

// POST /api/questions - Add new question (REQ-09 to REQ-12, REQ-15)
router.post('/', (req, res) => {
  const { question_text, marks, subject, difficulty, exam_id, options } = req.body;

  // REQ-15: Validation
  if (!question_text || !question_text.trim()) {
    return res.status(400).json({ error: 'Question text cannot be empty.' });
  }

  const parsedMarks = parseFloat(marks);
  if (isNaN(parsedMarks) || parsedMarks <= 0) {
    return res.status(400).json({ error: 'Question marks must be a positive number.' });
  }

  if (!options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'At least two answer options are required.' });
  }

  const validOptions = options.filter(o => o.option_text && o.option_text.trim());
  if (validOptions.length < 2) {
    return res.status(400).json({ error: 'At least two non-empty answer options are required.' });
  }

  const correctCount = options.filter(o => o.is_correct === 1 || o.is_correct === true).length;
  if (correctCount === 0) {
    return res.status(400).json({ error: 'You must designate at least one option as the correct answer.' });
  }

  const questionId = 'Q-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      INSERT INTO questions (question_id, exam_id, question_text, marks, question_type, subject, difficulty, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      questionId,
      exam_id || null,
      question_text.trim(),
      parsedMarks,
      'mcq_single',
      subject ? subject.trim() : 'Computer Science',
      difficulty || 'medium',
      'active'
    );

    let optNum = 1;
    for (const opt of options) {
      if (!opt.option_text || !opt.option_text.trim()) continue;
      const optId = `${questionId}-OPT${optNum++}`;
      db.prepare(`
        INSERT INTO options (option_id, question_id, option_text, is_correct)
        VALUES (?, ?, ?, ?)
      `).run(optId, questionId, opt.option_text.trim(), opt.is_correct ? 1 : 0);
    }

    // If associated with an exam, recalculate exam's total marks
    if (exam_id) {
      const sumResult = queryGet('SELECT SUM(marks) as total FROM questions WHERE exam_id = ? AND status = "active"', [exam_id]);
      const newTotal = sumResult?.total || 0;
      queryRun('UPDATE examinations SET total_marks = ? WHERE exam_id = ?', [newTotal, exam_id]);
    }

    db.exec('COMMIT;');
    logAudit(req.user.user_id, 'ADD_QUESTION', `Created question ${questionId} (${parsedMarks} marks).`);

    return res.status(201).json({
      message: 'Question added successfully',
      question_id: questionId
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Error adding question:', err);
    return res.status(500).json({ error: 'Failed to create question: ' + err.message });
  }
});

// PUT /api/questions/:id - Update question (REQ-13)
router.put('/:id', (req, res) => {
  const { question_id } = req.params;
  const { question_text, marks, subject, difficulty, exam_id, status, options } = req.body;

  const existing = queryGet('SELECT * FROM questions WHERE question_id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Question not found' });
  }

  // REQ-15: Validation
  if (!question_text || !question_text.trim()) {
    return res.status(400).json({ error: 'Question text cannot be empty.' });
  }

  const parsedMarks = parseFloat(marks);
  if (isNaN(parsedMarks) || parsedMarks <= 0) {
    return res.status(400).json({ error: 'Question marks must be a positive number.' });
  }

  if (options && Array.isArray(options)) {
    const validOptions = options.filter(o => o.option_text && o.option_text.trim());
    if (validOptions.length < 2) {
      return res.status(400).json({ error: 'At least two non-empty answer options are required.' });
    }
    const correctCount = options.filter(o => o.is_correct === 1 || o.is_correct === true).length;
    if (correctCount === 0) {
      return res.status(400).json({ error: 'You must designate at least one option as the correct answer.' });
    }
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE questions
      SET question_text = ?, marks = ?, subject = ?, difficulty = ?, exam_id = ?, status = ?
      WHERE question_id = ?
    `).run(
      question_text.trim(),
      parsedMarks,
      subject || existing.subject,
      difficulty || existing.difficulty,
      exam_id !== undefined ? (exam_id || null) : existing.exam_id,
      status || existing.status,
      req.params.id
    );

    if (options && Array.isArray(options)) {
      // Re-create options
      db.prepare('DELETE FROM options WHERE question_id = ?').run(req.params.id);
      let optNum = 1;
      for (const opt of options) {
        if (!opt.option_text || !opt.option_text.trim()) continue;
        const optId = opt.option_id || `${req.params.id}-OPT${optNum++}`;
        db.prepare(`
          INSERT INTO options (option_id, question_id, option_text, is_correct)
          VALUES (?, ?, ?, ?)
        `).run(optId, req.params.id, opt.option_text.trim(), opt.is_correct ? 1 : 0);
      }
    }

    // Update affected exam total marks
    const targetExamId = exam_id !== undefined ? exam_id : existing.exam_id;
    if (targetExamId) {
      const sumResult = queryGet('SELECT SUM(marks) as total FROM questions WHERE exam_id = ? AND status = "active"', [targetExamId]);
      queryRun('UPDATE examinations SET total_marks = ? WHERE exam_id = ?', [sumResult?.total || 0, targetExamId]);
    }

    db.exec('COMMIT;');
    logAudit(req.user.user_id, 'UPDATE_QUESTION', `Updated question ${req.params.id}.`);

    return res.json({ message: 'Question updated successfully' });
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Failed to update question: ' + err.message });
  }
});

// DELETE /api/questions/:id - Deactivate or Delete question (REQ-14, SAFE-01)
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { force } = req.query; // If force=true, hard delete; otherwise deactivate

  const question = queryGet('SELECT * FROM questions WHERE question_id = ?', [id]);
  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }

  // Check if answers reference this question
  const answerCount = queryGet('SELECT COUNT(*) as count FROM answers WHERE question_id = ?', [id])?.count || 0;

  if (answerCount > 0 && force === 'true') {
    return res.status(400).json({
      error: 'Cannot permanently delete this question because student submissions exist for it. It will be deactivated instead.',
      canDeactivate: true
    });
  }

  if (force === 'true' && answerCount === 0) {
    queryRun('DELETE FROM questions WHERE question_id = ?', [id]);
    logAudit(req.user.user_id, 'DELETE_QUESTION', `Permanently deleted question ${id}.`);
    return res.json({ message: 'Question deleted permanently.' });
  } else {
    // REQ-14: Safe deactivation
    queryRun('UPDATE questions SET status = "deactivated" WHERE question_id = ?', [id]);
    logAudit(req.user.user_id, 'DEACTIVATE_QUESTION', `Deactivated question ${id}.`);
    return res.json({ message: 'Question has been safely deactivated.' });
  }
});

export default router;
