import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, queryAll, queryGet, queryRun, getDbBackup } from '../db/database.js';
import { authenticate, requireAdmin, logAudit } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireAdmin);

// GET /api/admin/metrics - High-level metrics for Administrator Dashboard
router.get('/metrics', (req, res) => {
  const totalStudents = queryGet("SELECT COUNT(*) as count FROM users WHERE role = 'student'")?.count || 0;
  const totalExams = queryGet('SELECT COUNT(*) as count FROM examinations')?.count || 0;
  const activeExams = queryGet("SELECT COUNT(*) as count FROM examinations WHERE status IN ('live', 'scheduled')")?.count || 0;
  const questionCount = queryGet("SELECT COUNT(*) as count FROM questions WHERE status = 'active'")?.count || 0;
  const totalSubmissions = queryGet('SELECT COUNT(*) as count FROM results')?.count || 0;

  const recentSubmissions = queryAll(`
    SELECT r.result_id, r.marks_obtained, r.total_marks, r.percentage, r.status, r.evaluated_at,
           u.name as student_name, u.roll_number,
           e.title as exam_title, e.exam_id
    FROM results r
    JOIN users u ON r.user_id = u.user_id
    JOIN examinations e ON r.exam_id = e.exam_id
    ORDER BY r.evaluated_at DESC
    LIMIT 6
  `);

  const recentActivity = queryAll(`
    SELECT l.*, u.name as user_name
    FROM audit_logs l
    LEFT JOIN users u ON l.user_id = u.user_id
    ORDER BY l.created_at DESC
    LIMIT 8
  `);

  const examPerformance = queryAll(`
    SELECT e.exam_id, e.title, e.total_marks, e.results_released,
           COUNT(r.result_id) as candidate_count,
           AVG(r.percentage) as avg_percentage,
           SUM(CASE WHEN r.status = 'pass' THEN 1 ELSE 0 END) as pass_count
    FROM examinations e
    LEFT JOIN results r ON e.exam_id = r.exam_id
    WHERE e.status != 'draft'
    GROUP BY e.exam_id
    ORDER BY e.start_time DESC
  `);

  return res.json({
    metrics: {
      totalStudents,
      totalExams,
      activeExams,
      questionCount,
      totalSubmissions
    },
    recentSubmissions,
    recentActivity,
    examPerformance
  });
});

// GET /api/admin/live-attempts - Real-time roster of exams currently in progress
router.get('/live-attempts', (req, res) => {
  const rows = queryAll(`
    SELECT a.attempt_id, a.user_id, a.exam_id, a.start_time,
           u.name as student_name, u.roll_number,
           e.title as exam_title, e.duration_minutes,
           (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.exam_id AND q.status = 'active') as total_questions,
           (SELECT COUNT(*) FROM answers ans WHERE ans.attempt_id = a.attempt_id AND ans.selected_option_id IS NOT NULL) as answered_count
    FROM exam_attempts a
    JOIN users u ON a.user_id = u.user_id
    JOIN examinations e ON a.exam_id = e.exam_id
    WHERE a.status = 'in_progress'
    ORDER BY a.start_time ASC
  `);

  const now = Date.now();
  const liveAttempts = rows.map(row => {
    const startMs = new Date(row.start_time).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1000));
    const totalSeconds = row.duration_minutes * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    return {
      attemptId: row.attempt_id,
      studentName: row.student_name,
      rollNumber: row.roll_number,
      examTitle: row.exam_title,
      examId: row.exam_id,
      elapsedSeconds,
      remainingSeconds,
      answeredCount: row.answered_count,
      totalQuestions: row.total_questions
    };
  });

  return res.json({ liveAttempts });
});

// GET /api/admin/users - User management
router.get('/users', (req, res) => {
  const users = queryAll(`
    SELECT user_id, name, email, role, roll_number, department, created_at,
      (SELECT COUNT(*) FROM exam_attempts a WHERE a.user_id = users.user_id) as attempts_count
    FROM users
    ORDER BY role ASC, name ASC
  `);
  return res.json({ users });
});

// POST /api/admin/users - Add user
router.post('/users', (req, res) => {
  const { name, email, password, role, roll_number, department } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  }

  if (role !== 'student' && role !== 'admin') {
    return res.status(400).json({ error: 'Role must be either student or admin.' });
  }

  const existing = queryGet('SELECT user_id FROM users WHERE LOWER(email) = ?', [email.trim().toLowerCase()]);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email address already exists.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = (role === 'admin' ? 'USR-ADMIN-' : 'USR-STU-') + Date.now().toString(36).toUpperCase();

  queryRun(`
    INSERT INTO users (user_id, name, email, password_hash, role, roll_number, department)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    name.trim(),
    email.trim().toLowerCase(),
    passwordHash,
    role,
    roll_number ? roll_number.trim() : null,
    department ? department.trim() : 'Computer Science and Engineering'
  ]);

  logAudit(req.user.user_id, 'CREATE_USER', `Created ${role} account for ${name} (${email}).`);

  return res.status(201).json({
    message: 'User created successfully.',
    user: { id: userId, name, email, role }
  });
});

// DELETE /api/admin/users/:id - Delete user (SAFE-01)
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  if (id === req.user.user_id) {
    return res.status(400).json({ error: 'You cannot delete your own administrative account.' });
  }

  const user = queryGet('SELECT * FROM users WHERE user_id = ?', [id]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  queryRun('DELETE FROM users WHERE user_id = ?', [id]);
  logAudit(req.user.user_id, 'DELETE_USER', `Deleted user ${user.name} (${user.email}).`);

  return res.json({ message: 'User deleted successfully.' });
});

// GET /api/admin/audit-logs - Audit trail
router.get('/audit-logs', (req, res) => {
  const logs = queryAll(`
    SELECT l.*, u.name as user_name, u.role as user_role
    FROM audit_logs l
    LEFT JOIN users u ON l.user_id = u.user_id
    ORDER BY l.created_at DESC
    LIMIT 150
  `);
  return res.json({ logs });
});

// GET /api/admin/backup - Database JSON snapshot export (SAFE-03)
router.get('/backup', (req, res) => {
  const backup = getDbBackup();
  logAudit(req.user.user_id, 'SYSTEM_BACKUP', 'Exported complete database backup snapshot.');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="adamas_oes_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  return res.send(JSON.stringify(backup, null, 2));
});

export default router;
