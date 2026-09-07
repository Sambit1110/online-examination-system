-- ==========================================================
-- ADAMAS UNIVERSITY - ONLINE EXAMINATION SYSTEM
-- Database Schema conforming to SRS v1.0 Section B.3 ER Model
-- ==========================================================

PRAGMA foreign_keys = ON;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
    roll_number TEXT,
    department TEXT DEFAULT 'Computer Science and Engineering',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. EXAMINATIONS TABLE
CREATE TABLE IF NOT EXISTS examinations (
    exam_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    total_marks REAL NOT NULL DEFAULT 0,
    pass_percentage REAL NOT NULL DEFAULT 40.0,
    negative_marks_per_question REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'live', 'completed', 'released')),
    results_released INTEGER NOT NULL DEFAULT 0 CHECK(results_released IN (0, 1)),
    created_by TEXT REFERENCES users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. QUESTIONS TABLE (Question Bank)
CREATE TABLE IF NOT EXISTS questions (
    question_id TEXT PRIMARY KEY,
    exam_id TEXT REFERENCES examinations(exam_id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    marks REAL NOT NULL DEFAULT 1.0 CHECK(marks > 0),
    question_type TEXT NOT NULL DEFAULT 'mcq_single',
    subject TEXT NOT NULL DEFAULT 'Computer Science',
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deactivated')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. OPTIONS TABLE
CREATE TABLE IF NOT EXISTS options (
    option_id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0, 1))
);

-- 5. EXAM ATTEMPTS TABLE (Session and Duration Tracker)
CREATE TABLE IF NOT EXISTS exam_attempts (
    attempt_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    time_remaining_seconds INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'submitted', 'timed_out')),
    submitted_at DATETIME,
    evaluated_at DATETIME,
    UNIQUE(user_id, exam_id)
);

-- 6. ANSWERS TABLE (Recorded Student Responses)
CREATE TABLE IF NOT EXISTS answers (
    answer_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option_id TEXT REFERENCES options(option_id) ON DELETE SET NULL,
    is_marked_for_review INTEGER NOT NULL DEFAULT 0 CHECK(is_marked_for_review IN (0, 1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(attempt_id, question_id)
);

-- 7. RESULTS TABLE
CREATE TABLE IF NOT EXISTS results (
    result_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    marks_obtained REAL NOT NULL,
    total_marks REAL NOT NULL,
    percentage REAL NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pass', 'fail')),
    total_questions INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    unanswered_count INTEGER NOT NULL,
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(attempt_id)
);

-- 8. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(user_id),
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
