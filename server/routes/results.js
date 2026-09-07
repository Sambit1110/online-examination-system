import { Router } from 'express';
import { db, queryAll, queryGet, queryRun } from '../db/database.js';
import { authenticate, requireAdmin, logAudit } from '../middleware/auth.js';

const router = Router();

// ==========================================
// CORE EVALUATION LOGIC (REQ-36 to REQ-44)
// ==========================================
export function evaluateAttempt(attemptId, userId, examId) {
  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [examId]);
  if (!exam) throw new Error('Examination not found during evaluation.');

  // REQ-36 & REQ-37: Retrieve questions and correct options
  const questions = queryAll(`
    SELECT q.question_id, q.marks, q.question_type,
           o.option_id as correct_option_id
    FROM questions q
    JOIN options o ON q.question_id = o.question_id AND o.is_correct = 1
    WHERE q.exam_id = ? AND q.status = 'active'
  `, [examId]);

  // Retrieve submitted answers
  const answers = queryAll(`
    SELECT question_id, selected_option_id
    FROM answers
    WHERE attempt_id = ?
  `, [attemptId]);

  const answerMap = new Map();
  for (const ans of answers) {
    answerMap.set(ans.question_id, ans.selected_option_id);
  }

  let marksObtained = 0.0;
  let totalMarks = 0.0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const q of questions) {
    totalMarks += q.marks;
    const selectedOptId = answerMap.get(q.question_id);

    if (!selectedOptId) {
      // REQ-40: Assign zero marks to unanswered questions
      unansweredCount++;
    } else if (selectedOptId === q.correct_option_id) {
      // REQ-38, REQ-39: Correct answer -> award marks
      marksObtained += q.marks;
      correctCount++;
    } else {
      // Incorrect answer -> handle negative marks if configured
      incorrectCount++;
      if (exam.negative_marks_per_question > 0) {
        marksObtained -= exam.negative_marks_per_question;
      }
    }
  }

  // Ensure marks obtained doesn't drop below 0
  marksObtained = Math.max(0, Math.round(marksObtained * 100) / 100);
  const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 10000) / 100 : 0.0;
  const passPercentage = exam.pass_percentage || 40.0;
  const status = percentage >= passPercentage ? 'pass' : 'fail';

  const resultId = `RES-${attemptId}`;

  // REQ-44, REQ-45: Store evaluation result
  db.prepare(`
    INSERT INTO results (
      result_id, attempt_id, user_id, exam_id, marks_obtained, total_marks,
      percentage, status, total_questions, correct_count, incorrect_count,
      unanswered_count, evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(attempt_id) DO UPDATE SET
      marks_obtained = excluded.marks_obtained,
      total_marks = excluded.total_marks,
      percentage = excluded.percentage,
      status = excluded.status,
      total_questions = excluded.total_questions,
      correct_count = excluded.correct_count,
      incorrect_count = excluded.incorrect_count,
      unanswered_count = excluded.unanswered_count,
      evaluated_at = CURRENT_TIMESTAMP
  `).run(
    resultId, attemptId, userId, examId, marksObtained, totalMarks,
    percentage, status, questions.length, correctCount, incorrectCount, unansweredCount
  );

  queryRun('UPDATE exam_attempts SET evaluated_at = CURRENT_TIMESTAMP WHERE attempt_id = ?', [attemptId]);

  return {
    result_id: resultId,
    attempt_id: attemptId,
    user_id: userId,
    exam_id: examId,
    marks_obtained: marksObtained,
    total_marks: totalMarks,
    percentage,
    status,
    total_questions: questions.length,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    unanswered_count: unansweredCount
  };
}

// GET /api/results/my - Student view of all their own examination results (REQ-47, BR-07, REQ-50)
router.get('/my', authenticate, (req, res) => {
  const userId = req.user.user_id;

  const results = queryAll(`
    SELECT r.*, e.title as exam_title, e.results_released, e.pass_percentage, e.duration_minutes,
           a.start_time, a.submitted_at
    FROM results r
    JOIN examinations e ON r.exam_id = e.exam_id
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    WHERE r.user_id = ?
    ORDER BY r.evaluated_at DESC
  `, [userId]);

  return res.json({ results });
});

// GET /api/results/exam/:examId/my - Student view of specific examination result (REQ-47, REQ-50)
router.get('/exam/:examId/my', authenticate, (req, res) => {
  const { examId } = req.params;
  const userId = req.user.user_id;

  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [examId]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const result = queryGet(`
    SELECT r.*, a.start_time, a.submitted_at, a.status as attempt_status,
           u.name as student_name, u.roll_number, u.department, u.email
    FROM results r
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    JOIN users u ON r.user_id = u.user_id
    WHERE r.exam_id = ? AND r.user_id = ?
  `, [examId, userId]);

  if (!result) {
    return res.status(404).json({ error: 'No result found for this examination.' });
  }

  // REQ-47: Results can be viewed after they are released
  const isReleased = exam.results_released === 1;

  let questionReview = null;
  if (isReleased) {
    // Detailed question review with candidate's choice and correct answer
    questionReview = queryAll(`
      SELECT q.question_id, q.question_text, q.marks, q.subject,
             ans.selected_option_id, ans.is_marked_for_review
      FROM questions q
      LEFT JOIN answers ans ON q.question_id = ans.question_id AND ans.attempt_id = ?
      WHERE q.exam_id = ? AND q.status = 'active'
      ORDER BY q.question_id ASC
    `, [result.attempt_id, examId]);

    for (const q of questionReview) {
      q.options = queryAll('SELECT option_id, option_text, is_correct FROM options WHERE question_id = ? ORDER BY option_id ASC', [q.question_id]);
      const correctOpt = q.options.find(o => o.is_correct === 1);
      q.correctOptionId = correctOpt ? correctOpt.option_id : null;
      q.isCandidateCorrect = q.selected_option_id === q.correctOptionId;
    }
  }

  return res.json({
    exam: {
      id: exam.exam_id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.duration_minutes,
      passPercentage: exam.pass_percentage,
      negativeMarks: exam.negative_marks_per_question,
      resultsReleased: isReleased
    },
    result,
    questionReview
  });
});

// GET /api/results/admin/exam/:examId - Admin view all student results for an exam (REQ-48, REQ-49)
router.get('/admin/exam/:examId', authenticate, requireAdmin, (req, res) => {
  const { examId } = req.params;

  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [examId]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const results = queryAll(`
    SELECT r.*, u.name as student_name, u.email as student_email, u.roll_number, u.department,
           a.start_time, a.submitted_at, a.status as attempt_status
    FROM results r
    JOIN users u ON r.user_id = u.user_id
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    WHERE r.exam_id = ?
    ORDER BY r.marks_obtained DESC
  `, [examId]);

  // Aggregate statistics for the exam
  const stats = {
    totalCandidates: results.length,
    passedCandidates: results.filter(r => r.status === 'pass').length,
    failedCandidates: results.filter(r => r.status === 'fail').length,
    averagePercentage: results.length > 0
      ? Math.round((results.reduce((sum, r) => sum + r.percentage, 0) / results.length) * 100) / 100
      : 0,
    highestPercentage: results.length > 0 ? Math.max(...results.map(r => r.percentage)) : 0,
    lowestPercentage: results.length > 0 ? Math.min(...results.map(r => r.percentage)) : 0
  };

  // Exam integrity trail (SEC-integrity): bridged in via the existing audit
  // log rather than a dedicated table — see server/routes/conduct.js. Purely
  // informational; never factored into stats/grading above.
  const integrityByAttempt = {};
  const integrityLogs = queryAll(`SELECT * FROM audit_logs WHERE action = 'INTEGRITY_SUMMARY' ORDER BY created_at DESC`);
  for (const log of integrityLogs) {
    try {
      const parsed = JSON.parse(log.details);
      if (parsed && parsed.examId === examId && parsed.attemptId && !integrityByAttempt[parsed.attemptId]) {
        // ORDER BY created_at DESC above means the first match per attempt is the latest
        integrityByAttempt[parsed.attemptId] = parsed;
      }
    } catch (err) {
      // Malformed/legacy audit entry — skip it, never fail the request over it
    }
  }

  return res.json({ exam, results, stats, integrityByAttempt });
});

// GET /api/results/admin/overview - Admin global gradebook overview
router.get('/admin/overview', authenticate, requireAdmin, (req, res) => {
  const results = queryAll(`
    SELECT r.*, e.title as exam_title, e.results_released,
           u.name as student_name, u.email as student_email, u.roll_number,
           a.submitted_at
    FROM results r
    JOIN examinations e ON r.exam_id = e.exam_id
    JOIN users u ON r.user_id = u.user_id
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    ORDER BY r.evaluated_at DESC
    LIMIT 100
  `);

  return res.json({ results });
});

export default router;
