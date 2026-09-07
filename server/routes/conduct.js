import { Router } from 'express';
import { db, queryAll, queryGet, queryRun } from '../db/database.js';
import { authenticate, requireStudent, logAudit } from '../middleware/auth.js';
import { evaluateAttempt } from './results.js';

const router = Router();

// All conduct routes require student authentication (BR-01)
router.use(authenticate, requireStudent);

// POST /api/conduct/start/:examId - Start or resume examination attempt (REQ-27, REQ-29, BR-02, BR-03)
router.post('/start/:examId', (req, res) => {
  const { examId } = req.params;
  const userId = req.user.user_id;

  const exam = queryGet('SELECT * FROM examinations WHERE exam_id = ?', [examId]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  const now = new Date();
  const start = new Date(exam.start_time);
  const end = new Date(exam.end_time);

  // BR-02: A student shall not be permitted to start an examination before its configured start time
  if (now < start) {
    return res.status(403).json({
      error: `Examination has not started yet. Permitted start time: ${start.toLocaleString()}.`
    });
  }

  // BR-03 & REQ-34: A student shall not be permitted to start an examination after its configured access period has ended
  if (now > end) {
    return res.status(403).json({
      error: `The examination access window ended at ${end.toLocaleString()}. Access is no longer permitted.`
    });
  }

  // Check if attempt already exists
  let attempt = queryGet('SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ?', [examId, userId]);

  if (attempt) {
    if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
      return res.status(400).json({
        error: 'You have already submitted this examination. Re-attempts are not permitted (BR-09).',
        attempt
      });
    }

    // Existing in_progress attempt: calculate real remaining time
    const elapsedSeconds = Math.floor((now.getTime() - new Date(attempt.start_time).getTime()) / 1000);
    const totalAllowedSeconds = exam.duration_minutes * 60;
    const remaining = Math.max(0, totalAllowedSeconds - elapsedSeconds);

    if (remaining <= 0) {
      // Auto-submit expired attempt
      return finalizeSubmission(attempt.attempt_id, userId, examId, 'timed_out', res);
    }

    queryRun('UPDATE exam_attempts SET time_remaining_seconds = ? WHERE attempt_id = ?', [remaining, attempt.attempt_id]);
    attempt.time_remaining_seconds = remaining;

    return res.json({
      message: 'Resuming active examination attempt.',
      attempt,
      exam: {
        id: exam.exam_id,
        title: exam.title,
        durationMinutes: exam.duration_minutes,
        negativeMarks: exam.negative_marks_per_question
      }
    });
  }

  // Create new attempt (REQ-29)
  const attemptId = 'ATT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const initialRemainingSeconds = exam.duration_minutes * 60;

  queryRun(`
    INSERT INTO exam_attempts (attempt_id, user_id, exam_id, start_time, time_remaining_seconds, status)
    VALUES (?, ?, ?, ?, ?, 'in_progress')
  `, [attemptId, userId, examId, now.toISOString(), initialRemainingSeconds]);

  logAudit(userId, 'START_EXAM', `Started attempt ${attemptId} for examination ${examId}.`);

  const createdAttempt = queryGet('SELECT * FROM exam_attempts WHERE attempt_id = ?', [attemptId]);

  return res.status(201).json({
    message: 'Examination attempt started successfully.',
    attempt: createdAttempt,
    exam: {
      id: exam.exam_id,
      title: exam.title,
      durationMinutes: exam.duration_minutes,
      negativeMarks: exam.negative_marks_per_question
    }
  });
});

// GET /api/conduct/questions/:examId - Fetch questions for student in exam
// CRITICAL: REQ-16 & SEC-08: Strictest data isolation - Correct answers MUST NOT be transmitted to students!
router.get('/questions/:examId', (req, res) => {
  const { examId } = req.params;
  const userId = req.user.user_id;

  const attempt = queryGet('SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ?', [examId, userId]);
  if (!attempt) {
    return res.status(403).json({ error: 'No examination attempt found. Please start the exam first.' });
  }

  const exam = queryGet('SELECT exam_id, title FROM examinations WHERE exam_id = ?', [examId]);
  if (!exam) {
    return res.status(404).json({ error: 'Examination not found.' });
  }

  // Fetch active questions assigned to this exam
  const questions = queryAll(`
    SELECT question_id, exam_id, question_text, marks, question_type, subject
    FROM questions
    WHERE exam_id = ? AND status = 'active'
    ORDER BY question_id ASC
  `, [examId]);

  if (questions.length === 0) {
    return res.status(404).json({ error: 'No active questions found for this examination.' });
  }

  // Fetch student's existing answers for this attempt
  const savedAnswers = queryAll(`
    SELECT question_id, selected_option_id, is_marked_for_review
    FROM answers
    WHERE attempt_id = ?
  `, [attempt.attempt_id]);

  const answerMap = new Map();
  for (const ans of savedAnswers) {
    answerMap.set(ans.question_id, ans);
  }

  // Attach options (WITHOUT is_correct field!) and user's saved answer
  for (const q of questions) {
    // Explicitly omit `is_correct` (REQ-16, SEC-08)
    q.options = queryAll(`
      SELECT option_id, question_id, option_text
      FROM options
      WHERE question_id = ?
      ORDER BY option_id ASC
    `, [q.question_id]);

    const userAns = answerMap.get(q.question_id);
    q.selectedOptionId = userAns ? userAns.selected_option_id : null;
    q.isMarkedForReview = userAns ? userAns.is_marked_for_review === 1 : false;
  }

  return res.json({
    questions,
    exam: {
      examId: exam.exam_id,
      title: exam.title
    },
    attempt: {
      attemptId: attempt.attempt_id,
      status: attempt.status,
      timeRemainingSeconds: attempt.time_remaining_seconds,
      startTime: attempt.start_time
    }
  });
});

// POST /api/conduct/save-answer - Real-time autosave response (REQ-32, REQ-33, SAFE-05)
router.post('/save-answer', (req, res) => {
  const { attemptId, questionId, selectedOptionId, isMarkedForReview, timeRemainingSeconds } = req.body;
  const userId = req.user.user_id;

  if (!attemptId || !questionId) {
    return res.status(400).json({ error: 'attemptId and questionId are required.' });
  }

  const attempt = queryGet('SELECT * FROM exam_attempts WHERE attempt_id = ? AND user_id = ?', [attemptId, userId]);
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt record not found.' });
  }

  // REQ-43 & BR-09: Prevent modifying answers after final submission
  if (attempt.status !== 'in_progress') {
    return res.status(403).json({ error: 'Examination has already been submitted or locked.' });
  }

  // Verify option belongs to question if provided
  if (selectedOptionId) {
    const validOpt = queryGet('SELECT option_id FROM options WHERE option_id = ? AND question_id = ?', [selectedOptionId, questionId]);
    if (!validOpt) {
      return res.status(400).json({ error: 'Invalid answer option selected.' });
    }
  }

  const answerId = `ANS-${attemptId}-${questionId}`;
  const reviewFlag = isMarkedForReview ? 1 : 0;

  db.prepare(`
    INSERT INTO answers (answer_id, attempt_id, user_id, question_id, selected_option_id, is_marked_for_review, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
      selected_option_id = excluded.selected_option_id,
      is_marked_for_review = excluded.is_marked_for_review,
      updated_at = CURRENT_TIMESTAMP
  `).run(answerId, attemptId, userId, questionId, selectedOptionId || null, reviewFlag);

  if (typeof timeRemainingSeconds === 'number' && timeRemainingSeconds >= 0) {
    queryRun('UPDATE exam_attempts SET time_remaining_seconds = ? WHERE attempt_id = ?', [
      Math.floor(timeRemainingSeconds),
      attemptId
    ]);
  }

  return res.json({ success: true, message: 'Answer recorded.' });
});

// POST /api/conduct/submit - Final submission by student or timeout (REQ-35, BR-09, SAFE-02, SAFE-05)
router.post('/submit', (req, res) => {
  const { attemptId, isTimeout, integritySummary } = req.body;
  const userId = req.user.user_id;

  if (!attemptId) {
    return res.status(400).json({ error: 'attemptId is required.' });
  }

  const attempt = queryGet('SELECT * FROM exam_attempts WHERE attempt_id = ? AND user_id = ?', [attemptId, userId]);
  if (!attempt) {
    return res.status(404).json({ error: 'Examination attempt not found.' });
  }

  if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
    // Already finalized
    const existingResult = queryGet('SELECT * FROM results WHERE attempt_id = ?', [attemptId]);
    return res.json({
      message: 'Examination was already submitted.',
      attempt,
      result: existingResult
    });
  }

  const finalStatus = isTimeout ? 'timed_out' : 'submitted';
  return finalizeSubmission(attemptId, userId, attempt.exam_id, finalStatus, res, integritySummary);
});

// Non-fatal bridge to the existing audit log (SEC-integrity, informational only).
// Never affects grading, submission outcome, or attempt status — failures here
// are swallowed so a logging hiccup can never block a real submission.
function logIntegritySummary(userId, attemptId, examId, integritySummary) {
  if (!integritySummary || typeof integritySummary !== 'object') return;
  try {
    const events = Array.isArray(integritySummary.events) ? integritySummary.events.slice(0, 200) : [];
    logAudit(userId, 'INTEGRITY_SUMMARY', {
      attemptId,
      examId,
      examTitle: integritySummary.examTitle,
      totalEvents: Number(integritySummary.totalEvents) || 0,
      tabHiddenCount: Number(integritySummary.tabHiddenCount) || 0,
      windowBlurCount: Number(integritySummary.windowBlurCount) || 0,
      totalAwayMs: Number(integritySummary.totalAwayMs) || 0,
      events
    });
  } catch (err) {
    console.error('Integrity summary logging failed (non-fatal):', err);
  }
}

// Helper to lock attempt and trigger automatic objective evaluation
function finalizeSubmission(attemptId, userId, examId, finalStatus, res, integritySummary) {
  const nowIso = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    queryRun(`
      UPDATE exam_attempts
      SET status = ?, submitted_at = ?, time_remaining_seconds = 0
      WHERE attempt_id = ?
    `, [finalStatus, nowIso, attemptId]);

    // Automatic evaluation (REQ-36 to REQ-44)
    const result = evaluateAttempt(attemptId, userId, examId);

    db.exec('COMMIT;');
    logAudit(userId, 'SUBMIT_EXAM', `Finalized exam attempt ${attemptId} with status ${finalStatus}. Score: ${result.marks_obtained}/${result.total_marks}`);
    logIntegritySummary(userId, attemptId, examId, integritySummary);

    const exam = queryGet('SELECT results_released FROM examinations WHERE exam_id = ?', [examId]);

    return res.json({
      message: finalStatus === 'timed_out'
        ? 'Time expired. Your examination has been automatically submitted and locked.'
        : 'Examination submitted successfully.',
      status: finalStatus,
      attemptId,
      resultsReleased: exam.results_released === 1,
      result: exam.results_released === 1 ? result : {
        marksObtained: result.marks_obtained,
        totalMarks: result.total_marks,
        percentage: result.percentage,
        status: result.status,
        note: 'Comprehensive question analysis will be visible once the department releases official results.'
      }
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Finalize submission failed:', err);
    return res.status(500).json({ error: 'Failed to process final submission: ' + err.message });
  }
}

export default router;
