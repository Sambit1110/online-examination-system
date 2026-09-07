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
