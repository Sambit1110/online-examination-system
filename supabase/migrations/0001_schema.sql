-- ==========================================================
-- ADAMAS UNIVERSITY OES — SUPABASE / POSTGRES SCHEMA
-- Migration 0001: tables, constraints, indexes
-- ==========================================================
-- Redesigned (not a mechanical port) from the original SQLite schema:
--   * UUID primary keys throughout (gen_random_uuid())
--   * profiles is 1:1 with auth.users — Supabase Auth owns credentials;
--     no password ever touches an application table
--   * questions is a genuine reusable bank; exam_questions is a real
--     many-to-many join (the original schema tied a question to at most
--     one exam via a single FK)
--   * a dedicated integrity_events table (previously bridged through a
--     JSON blob in audit_logs purely to avoid a SQLite migration)
--   * jsonb for structured log/event payloads instead of stringified JSON

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------
-- 1. PROFILES — extends auth.users (created by the trigger in 0003)
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'admin')),
  roll_number text,
  department text default 'Computer Science and Engineering',
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- ----------------------------------------------------------------
-- 2. EXAMINATIONS
-- ----------------------------------------------------------------
create table if not exists public.examinations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  duration_minutes integer not null check (duration_minutes > 0),
  start_time timestamptz not null,
  end_time timestamptz not null,
  total_marks numeric not null default 0,
  pass_percentage numeric not null default 40.0,
  negative_marks_per_question numeric not null default 0.0,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'live', 'completed', 'released')),
  results_released boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_exam_window check (end_time > start_time)
);

create index if not exists idx_examinations_status on public.examinations(status);
create index if not exists idx_examinations_window on public.examinations(start_time, end_time);

-- ----------------------------------------------------------------
-- 3. QUESTIONS — a reusable bank, not tied to a single exam
-- ----------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  marks numeric not null default 1.0 check (marks > 0),
  question_type text not null default 'mcq_single',
  subject text not null default 'Computer Science',
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'active' check (status in ('active', 'deactivated')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_status on public.questions(status);

-- ----------------------------------------------------------------
-- 4. QUESTION OPTIONS
-- ----------------------------------------------------------------
create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists idx_question_options_question on public.question_options(question_id);

-- ----------------------------------------------------------------
-- 5. EXAM_QUESTIONS — many-to-many assignment of bank questions to exams
-- ----------------------------------------------------------------
create table if not exists public.exam_questions (
  exam_id uuid not null references public.examinations(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  primary key (exam_id, question_id)
);

create index if not exists idx_exam_questions_question on public.exam_questions(question_id);

-- ----------------------------------------------------------------
-- 6. EXAM_ATTEMPTS
-- ----------------------------------------------------------------
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.examinations(id) on delete cascade,
  start_time timestamptz not null default now(),
  submitted_at timestamptz,
  time_remaining_seconds integer not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'timed_out')),
  evaluated_at timestamptz,
  unique (user_id, exam_id)
);

create index if not exists idx_exam_attempts_user on public.exam_attempts(user_id);
create index if not exists idx_exam_attempts_exam on public.exam_attempts(exam_id);
create index if not exists idx_exam_attempts_status on public.exam_attempts(status);

-- ----------------------------------------------------------------
-- 7. SUBMITTED_ANSWERS
-- ----------------------------------------------------------------
create table if not exists public.submitted_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id) on delete set null,
  is_marked_for_review boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_submitted_answers_attempt on public.submitted_answers(attempt_id);

-- ----------------------------------------------------------------
-- 8. RESULTS
-- ----------------------------------------------------------------
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.exam_attempts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.examinations(id) on delete cascade,
  marks_obtained numeric not null,
  total_marks numeric not null,
  percentage numeric not null,
  status text not null check (status in ('pass', 'fail')),
  total_questions integer not null,
  correct_count integer not null,
  incorrect_count integer not null,
  unanswered_count integer not null,
  evaluated_at timestamptz not null default now()
);

create index if not exists idx_results_user on public.results(user_id);
create index if not exists idx_results_exam on public.results(exam_id);

-- ----------------------------------------------------------------
-- 9. INTEGRITY_EVENTS — dedicated table (see migration note above)
-- ----------------------------------------------------------------
create table if not exists public.integrity_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.examinations(id) on delete cascade,
  event_type text not null
    check (event_type in ('tab_hidden', 'tab_visible', 'window_blur', 'window_focus')),
  away_ms integer,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_integrity_events_attempt on public.integrity_events(attempt_id);
create index if not exists idx_integrity_events_exam on public.integrity_events(exam_id);

-- ----------------------------------------------------------------
-- 10. AUDIT_LOGS — general admin/system action trail
-- ----------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
