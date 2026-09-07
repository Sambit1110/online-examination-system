-- ==========================================================
-- Adamas University OES — Combined Supabase migration bundle
-- Paste this entire file into the Supabase SQL Editor and Run.
-- Generated from supabase/migrations/0001-0004 in order.
-- ==========================================================

-- ---------- 0001_schema.sql ----------
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

-- ---------- 0002_rls.sql ----------
-- ==========================================================
-- ADAMAS UNIVERSITY OES — ROW LEVEL SECURITY
-- Migration 0002: helper functions, profile-creation trigger, RLS policies
-- ==========================================================
-- Design summary:
--   * Students never get direct RLS access to `questions` / `question_options`
--     at all — every student-facing read of exam content goes through the
--     SECURITY DEFINER RPCs in 0003, which explicitly omit is_correct.
--   * Attempt creation and grading are RPC-only (SECURITY DEFINER) so a
--     client can never fabricate a score or bypass the exam time window.
--   * Everything else (own attempts, own answers, own results, own
--     integrity events; admin sees everything) is plain RLS.

-- ----------------------------------------------------------------
-- Helper: is the current session an admin? SECURITY DEFINER so it can
-- read profiles without re-triggering profiles' own RLS policy.
-- ----------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------
-- Auto-create a profile row whenever a new auth.users row appears.
-- Role/name/roll_number come from signUp()'s options.data (user metadata).
-- Defaults to 'student' if no role is supplied — admin accounts are
-- provisioned explicitly (see scripts/create-demo-users.mjs and
-- api/admin-users.js), never via public self-signup.
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, roll_number, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'roll_number',
    coalesce(new.raw_user_meta_data->>'department', 'Computer Science and Engineering')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================
-- ENABLE RLS
-- ==========================================================
alter table public.profiles enable row level security;
alter table public.examinations enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.submitted_answers enable row level security;
alter table public.results enable row level security;
alter table public.integrity_events enable row level security;
alter table public.audit_logs enable row level security;

-- ==========================================================
-- PROFILES
-- ==========================================================
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());
-- No client-side INSERT policy: rows are created only by the
-- handle_new_user trigger (SECURITY DEFINER, bypasses RLS).

-- ==========================================================
-- EXAMINATIONS
-- ==========================================================
create policy "examinations_select" on public.examinations
  for select using (status <> 'draft' or public.is_admin());

create policy "examinations_insert_admin" on public.examinations
  for insert with check (public.is_admin());

create policy "examinations_update_admin" on public.examinations
  for update using (public.is_admin()) with check (public.is_admin());

create policy "examinations_delete_admin" on public.examinations
  for delete using (public.is_admin());

-- ==========================================================
-- QUESTIONS — admin-only direct access; students reach question
-- content exclusively through the RPCs in 0003.
-- ==========================================================
create policy "questions_admin_all" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ==========================================================
-- QUESTION_OPTIONS — same rationale as questions.
-- ==========================================================
create policy "question_options_admin_all" on public.question_options
  for all using (public.is_admin()) with check (public.is_admin());

-- ==========================================================
-- EXAM_QUESTIONS — assignment pairs aren't sensitive by themselves;
-- visible wherever the parent exam is visible. Writes are admin-only.
-- ==========================================================
create policy "exam_questions_select" on public.exam_questions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.examinations e
      where e.id = exam_id and e.status <> 'draft'
    )
  );

create policy "exam_questions_admin_write" on public.exam_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ==========================================================
-- EXAM_ATTEMPTS
-- ==========================================================
create policy "exam_attempts_select_own_or_admin" on public.exam_attempts
  for select using (user_id = auth.uid() or public.is_admin());

-- Students may update only their OWN in-progress attempt, and only to
-- persist the ticking countdown during autosave. Creating an attempt
-- (with the BR-02/BR-03 time-window authority) and finalizing a
-- submission (with authoritative grading) are RPC-only — see 0003.
create policy "exam_attempts_update_own_in_progress" on public.exam_attempts
  for update using (user_id = auth.uid() and status = 'in_progress')
  with check (user_id = auth.uid());

-- ==========================================================
-- SUBMITTED_ANSWERS
-- ==========================================================
create policy "submitted_answers_select_own_or_admin" on public.submitted_answers
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid()
    )
  );

create policy "submitted_answers_write_own_in_progress" on public.submitted_answers
  for all using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid() and a.status = 'in_progress'
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid() and a.status = 'in_progress'
    )
  );

-- ==========================================================
-- RESULTS — the summary score is visible to the student immediately;
-- only the detailed per-question review is gated on results_released,
-- and that gate is enforced inside get_result_review() (0003), not here.
-- ==========================================================
create policy "results_select_own_or_admin" on public.results
  for select using (user_id = auth.uid() or public.is_admin());
-- No client-side write policy: rows are created only by
-- submit_exam_attempt() (SECURITY DEFINER).

-- ==========================================================
-- INTEGRITY_EVENTS
-- ==========================================================
create policy "integrity_events_select_own_or_admin" on public.integrity_events
  for select using (user_id = auth.uid() or public.is_admin());

create policy "integrity_events_insert_own_in_progress" on public.integrity_events
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id and a.user_id = auth.uid() and a.status = 'in_progress'
    )
  );

-- ==========================================================
-- AUDIT_LOGS — admin-only read; admins may also write their own
-- action entries directly (exam-taking events are logged authoritatively
-- by the RPCs instead, via SECURITY DEFINER).
-- ==========================================================
create policy "audit_logs_select_admin" on public.audit_logs
  for select using (public.is_admin());

create policy "audit_logs_insert_admin_own" on public.audit_logs
  for insert with check (public.is_admin() and user_id = auth.uid());

-- ---------- 0003_functions.sql ----------
-- ==========================================================
-- ADAMAS UNIVERSITY OES — TRUSTED SERVER-SIDE LOGIC
-- Migration 0003: RPC functions (SECURITY DEFINER)
-- ==========================================================
-- These four functions are the "genuinely necessary" trusted backend for
-- this app, now living in Postgres instead of Express. Each one manually
-- re-checks auth.uid() ownership before doing anything, since
-- SECURITY DEFINER bypasses RLS for the function body.

-- ----------------------------------------------------------------
-- result_to_jsonb — maps a `results` row to the shape the frontend's
-- Result type expects (id -> result_id), so every RPC that returns a
-- result uses one consistent mapping instead of a raw to_jsonb() dump.
-- ----------------------------------------------------------------
create or replace function public.result_to_jsonb(r public.results)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'result_id', r.id,
    'attempt_id', r.attempt_id,
    'user_id', r.user_id,
    'exam_id', r.exam_id,
    'marks_obtained', r.marks_obtained,
    'total_marks', r.total_marks,
    'percentage', r.percentage,
    'status', r.status,
    'total_questions', r.total_questions,
    'correct_count', r.correct_count,
    'incorrect_count', r.incorrect_count,
    'unanswered_count', r.unanswered_count,
    'evaluated_at', r.evaluated_at
  );
$$;

-- ----------------------------------------------------------------
-- start_exam_attempt — enforces BR-02/BR-03 (schedule window) and
-- resumes an in-progress attempt with a freshly recomputed remaining
-- time rather than trusting whatever the client last saved.
-- ----------------------------------------------------------------
create or replace function public.start_exam_attempt(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_attempt record;
  v_now timestamptz := now();
  v_elapsed_seconds integer;
  v_total_seconds integer;
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_exam from examinations where id = p_exam_id;
  if not found then
    raise exception 'Examination not found.';
  end if;

  if v_now < v_exam.start_time then
    raise exception 'Examination has not started yet. Permitted start time: %.', v_exam.start_time;
  end if;

  if v_now > v_exam.end_time then
    raise exception 'The examination access window ended at %. Access is no longer permitted.', v_exam.end_time;
  end if;

  select * into v_attempt from exam_attempts where user_id = v_uid and exam_id = p_exam_id;

  if found then
    if v_attempt.status in ('submitted', 'timed_out') then
      raise exception 'You have already submitted this examination. Re-attempts are not permitted.';
    end if;

    v_elapsed_seconds := greatest(0, extract(epoch from (v_now - v_attempt.start_time))::integer);
    v_total_seconds := v_exam.duration_minutes * 60;
    v_remaining := greatest(0, v_total_seconds - v_elapsed_seconds);

    if v_remaining <= 0 then
      -- Time already ran out while the student was away; auto-finalize.
      return public.submit_exam_attempt(v_attempt.id, true);
    end if;

    update exam_attempts set time_remaining_seconds = v_remaining where id = v_attempt.id;

    return jsonb_build_object(
      'attemptId', v_attempt.id,
      'status', v_attempt.status,
      'timeRemainingSeconds', v_remaining,
      'startTime', v_attempt.start_time,
      'exam', jsonb_build_object(
        'id', v_exam.id, 'title', v_exam.title,
        'durationMinutes', v_exam.duration_minutes,
        'negativeMarks', v_exam.negative_marks_per_question
      )
    );
  end if;

  insert into exam_attempts (user_id, exam_id, start_time, time_remaining_seconds, status)
  values (v_uid, p_exam_id, v_now, v_exam.duration_minutes * 60, 'in_progress')
  returning * into v_attempt;

  insert into audit_logs (user_id, action, details)
  values (v_uid, 'START_EXAM', jsonb_build_object('attemptId', v_attempt.id, 'examId', p_exam_id));

  return jsonb_build_object(
    'attemptId', v_attempt.id,
    'status', v_attempt.status,
    'timeRemainingSeconds', v_attempt.time_remaining_seconds,
    'startTime', v_attempt.start_time,
    'exam', jsonb_build_object(
      'id', v_exam.id, 'title', v_exam.title,
      'durationMinutes', v_exam.duration_minutes,
      'negativeMarks', v_exam.negative_marks_per_question
    )
  );
end;
$$;

-- ----------------------------------------------------------------
-- get_exam_questions_for_student — the ONLY way a student ever sees
-- exam content. Explicitly never selects is_correct.
-- ----------------------------------------------------------------
create or replace function public.get_exam_questions_for_student(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt record;
  v_questions jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_attempt from exam_attempts where user_id = v_uid and exam_id = p_exam_id;
  if not found then
    raise exception 'No examination attempt found. Please start the exam first.';
  end if;

  select coalesce(jsonb_agg(q_row order by q_row->>'question_id'), '[]'::jsonb) into v_questions
  from (
    select jsonb_build_object(
      'question_id', q.id,
      'question_text', q.question_text,
      'marks', q.marks,
      'subject', q.subject,
      'selectedOptionId', sa.selected_option_id,
      'isMarkedForReview', coalesce(sa.is_marked_for_review, false),
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'option_id', o.id, 'option_text', o.option_text
        ) order by o.sort_order, o.id), '[]'::jsonb)
        from question_options o
        where o.question_id = q.id
      )
    ) as q_row
    from exam_questions eq
    join questions q on q.id = eq.question_id and q.status = 'active'
    left join submitted_answers sa on sa.attempt_id = v_attempt.id and sa.question_id = q.id
    where eq.exam_id = p_exam_id
  ) sub;

  return jsonb_build_object(
    'questions', v_questions,
    'attempt', jsonb_build_object(
      'attemptId', v_attempt.id,
      'status', v_attempt.status,
      'timeRemainingSeconds', v_attempt.time_remaining_seconds,
      'startTime', v_attempt.start_time
    )
  );
end;
$$;

-- ----------------------------------------------------------------
-- save_answer — atomic autosave: one round trip updates both the
-- answer and the ticking time-remaining counter. Only while in_progress.
-- ----------------------------------------------------------------
create or replace function public.save_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid,
  p_is_marked_for_review boolean,
  p_time_remaining_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt record;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_attempt from exam_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Attempt record not found.';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'Examination has already been submitted or locked.';
  end if;

  if p_selected_option_id is not null and not exists (
    select 1 from question_options where id = p_selected_option_id and question_id = p_question_id
  ) then
    raise exception 'Invalid answer option selected.';
  end if;

  insert into submitted_answers (attempt_id, question_id, selected_option_id, is_marked_for_review, updated_at)
  values (p_attempt_id, p_question_id, p_selected_option_id, coalesce(p_is_marked_for_review, false), now())
  on conflict (attempt_id, question_id) do update set
    selected_option_id = excluded.selected_option_id,
    is_marked_for_review = excluded.is_marked_for_review,
    updated_at = now();

  if p_time_remaining_seconds is not null and p_time_remaining_seconds >= 0 then
    update exam_attempts set time_remaining_seconds = p_time_remaining_seconds where id = p_attempt_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- ----------------------------------------------------------------
-- submit_exam_attempt — authoritative grading. A client can never
-- influence marks_obtained; it's computed here from is_correct, which
-- the client has never been able to see in the first place.
-- ----------------------------------------------------------------
create or replace function public.submit_exam_attempt(p_attempt_id uuid, p_is_timeout boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt record;
  v_exam record;
  v_final_status text;
  v_marks_obtained numeric := 0;
  v_total_marks numeric := 0;
  v_correct_count integer := 0;
  v_incorrect_count integer := 0;
  v_unanswered_count integer := 0;
  v_total_questions integer := 0;
  v_percentage numeric;
  v_status text;
  v_grade_row record;
  v_result_row results%rowtype;
  v_existing_result results%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_attempt from exam_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Examination attempt not found.';
  end if;

  if v_attempt.status in ('submitted', 'timed_out') then
    select * into v_existing_result from results where attempt_id = p_attempt_id;
    return jsonb_build_object(
      'message', 'Examination was already submitted.',
      'status', v_attempt.status,
      'attemptId', p_attempt_id,
      'result', public.result_to_jsonb(v_existing_result)
    );
  end if;

  select * into v_exam from examinations where id = v_attempt.exam_id;
  v_final_status := case when p_is_timeout then 'timed_out' else 'submitted' end;

  update exam_attempts
  set status = v_final_status, submitted_at = now(), time_remaining_seconds = 0
  where id = p_attempt_id;

  -- Grade: for each active question assigned to this exam, compare the
  -- student's selected option against the option flagged is_correct.
  for v_grade_row in
    select
      q.id as question_id,
      q.marks as marks,
      (
        select o.id from question_options o where o.question_id = q.id and o.is_correct = true limit 1
      ) as correct_option_id,
      sa.selected_option_id as selected_option_id
    from exam_questions eq
    join questions q on q.id = eq.question_id and q.status = 'active'
    left join submitted_answers sa on sa.attempt_id = p_attempt_id and sa.question_id = q.id
    where eq.exam_id = v_attempt.exam_id
  loop
    v_total_questions := v_total_questions + 1;
    v_total_marks := v_total_marks + v_grade_row.marks;

    if v_grade_row.selected_option_id is null then
      v_unanswered_count := v_unanswered_count + 1;
    elsif v_grade_row.selected_option_id = v_grade_row.correct_option_id then
      v_marks_obtained := v_marks_obtained + v_grade_row.marks;
      v_correct_count := v_correct_count + 1;
    else
      v_incorrect_count := v_incorrect_count + 1;
      if v_exam.negative_marks_per_question > 0 then
        v_marks_obtained := v_marks_obtained - v_exam.negative_marks_per_question;
      end if;
    end if;
  end loop;

  v_marks_obtained := greatest(0, round(v_marks_obtained, 2));
  v_percentage := case when v_total_marks > 0 then round((v_marks_obtained / v_total_marks) * 100, 2) else 0 end;
  v_status := case when v_percentage >= coalesce(v_exam.pass_percentage, 40.0) then 'pass' else 'fail' end;

  insert into results (
    attempt_id, user_id, exam_id, marks_obtained, total_marks, percentage,
    status, total_questions, correct_count, incorrect_count, unanswered_count, evaluated_at
  ) values (
    p_attempt_id, v_uid, v_attempt.exam_id, v_marks_obtained, v_total_marks, v_percentage,
    v_status, v_total_questions, v_correct_count, v_incorrect_count, v_unanswered_count, now()
  )
  on conflict (attempt_id) do update set
    marks_obtained = excluded.marks_obtained,
    total_marks = excluded.total_marks,
    percentage = excluded.percentage,
    status = excluded.status,
    total_questions = excluded.total_questions,
    correct_count = excluded.correct_count,
    incorrect_count = excluded.incorrect_count,
    unanswered_count = excluded.unanswered_count,
    evaluated_at = now()
  returning * into v_result_row;

  update exam_attempts set evaluated_at = now() where id = p_attempt_id;

  insert into audit_logs (user_id, action, details)
  values (v_uid, 'SUBMIT_EXAM', jsonb_build_object(
    'attemptId', p_attempt_id, 'status', v_final_status,
    'marksObtained', v_marks_obtained, 'totalMarks', v_total_marks
  ));

  return jsonb_build_object(
    'message', case when v_final_status = 'timed_out'
      then 'Time expired. Your examination has been automatically submitted and locked.'
      else 'Examination submitted successfully.' end,
    'status', v_final_status,
    'attemptId', p_attempt_id,
    'resultsReleased', coalesce(v_exam.results_released, false),
    'result', public.result_to_jsonb(v_result_row)
  );
end;
$$;

-- ----------------------------------------------------------------
-- get_result_review — own result summary always; the detailed
-- question-by-question review (with correct answers) only once the
-- exam's results_released flag is true. This is the single gate that
-- decides whether a student can ever see is_correct for their exam.
-- ----------------------------------------------------------------
create or replace function public.get_result_review(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exam record;
  v_result results%rowtype;
  v_is_released boolean;
  v_review jsonb := null;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_exam from examinations where id = p_exam_id;
  if not found then
    raise exception 'Examination not found.';
  end if;

  select r.* into v_result
  from results r
  join exam_attempts a on a.id = r.attempt_id
  where r.exam_id = p_exam_id and r.user_id = v_uid;

  if not found then
    raise exception 'No result found for this examination.';
  end if;

  v_is_released := coalesce(v_exam.results_released, false);

  if v_is_released then
    select coalesce(jsonb_agg(q_row order by q_row->>'question_id'), '[]'::jsonb) into v_review
    from (
      select jsonb_build_object(
        'question_id', q.id,
        'question_text', q.question_text,
        'marks', q.marks,
        'subject', q.subject,
        'selected_option_id', sa.selected_option_id,
        'correctOptionId', (
          select o.id from question_options o where o.question_id = q.id and o.is_correct = true limit 1
        ),
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'option_id', o.id, 'option_text', o.option_text, 'is_correct', o.is_correct
          ) order by o.sort_order, o.id), '[]'::jsonb)
          from question_options o where o.question_id = q.id
        )
      ) as q_row
      from exam_questions eq
      join questions q on q.id = eq.question_id and q.status = 'active'
      left join submitted_answers sa on sa.attempt_id = v_result.attempt_id and sa.question_id = q.id
      where eq.exam_id = p_exam_id
    ) sub;
  end if;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id, 'title', v_exam.title, 'description', v_exam.description,
      'durationMinutes', v_exam.duration_minutes, 'passPercentage', v_exam.pass_percentage,
      'negativeMarks', v_exam.negative_marks_per_question, 'resultsReleased', v_is_released
    ),
    'result', public.result_to_jsonb(v_result),
    'questionReview', v_review
  );
end;
$$;

grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.get_exam_questions_for_student(uuid) to authenticated;
grant execute on function public.save_answer(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.submit_exam_attempt(uuid, boolean) to authenticated;
grant execute on function public.get_result_review(uuid) to authenticated;

-- ---------- 0004_login_identifier.sql ----------
-- ==========================================================
-- Migration 0004: login by roll number (in addition to email)
-- ==========================================================
-- Supabase Auth only authenticates by email natively. The original app let
-- students sign in with either their email or their university roll number.
-- To preserve that without exposing profile data publicly, we keep a
-- denormalized copy of the email on profiles (populated by the signup
-- trigger) and expose a narrow, anonymous-callable RPC that resolves
-- "email or roll number" -> email, and nothing else about the account.

alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, roll_number, department, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'roll_number',
    coalesce(new.raw_user_meta_data->>'department', 'Computer Science and Engineering'),
    new.email
  );
  return new;
end;
$$;

create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_identifier ilike '%@%' then lower(p_identifier)
    else (select email from public.profiles where lower(roll_number) = lower(p_identifier) limit 1)
  end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

