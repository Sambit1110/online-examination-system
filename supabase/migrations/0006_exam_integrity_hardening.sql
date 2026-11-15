-- ==========================================================
-- ADAMAS UNIVERSITY OES — EXAM INTEGRITY HARDENING
-- Migration 0006
-- ==========================================================
-- Closes four ways a student could get around the exam rules, and
-- shuffles question order per student:
--
--   1. Students could UPDATE their own exam_attempts row directly (RLS
--      allowed it while in_progress), e.g. move start_time forward to
--      reset their clock. They could also write submitted_answers
--      directly, skipping save_answer's validation. Every student write
--      now goes through the SECURITY DEFINER functions below; the
--      frontend already only uses those, so it needs no change.
--   2. The time limit was only enforced in the browser. save_answer now
--      rejects writes after the deadline (start_time + duration, plus a
--      short grace for network latency), and submit_exam_attempt records
--      a late submission as 'timed_out' whatever the client claims.
--   3. start_exam_attempt never checked the exam's status, so a draft
--      exam could be started by anyone who knew its id.
--   4. Marks were readable from the results table (and returned by the
--      RPCs) before the admin released results. Students now see their
--      own result row only after release; until then the RPCs return a
--      submission summary with the score fields withheld.
--   5. Question order is shuffled per attempt (stable across reloads,
--      different between students).
--
-- Safe to re-run: every statement is idempotent.
-- ==========================================================

-- ----------------------------------------------------------------
-- 1. RLS: remove direct student writes
-- ----------------------------------------------------------------
drop policy if exists "exam_attempts_update_own_in_progress" on public.exam_attempts;
drop policy if exists "submitted_answers_write_own_in_progress" on public.submitted_answers;

-- 4. RLS: results visible to the student only once released
drop policy if exists "results_select_own_or_admin" on public.results;
drop policy if exists "results_select_released_own_or_admin" on public.results;
create policy "results_select_released_own_or_admin" on public.results
  for select using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.examinations e
        where e.id = exam_id and e.results_released = true
      )
    )
  );

-- ----------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------

-- Seconds of slack after the deadline for an in-flight autosave or the
-- browser's own timeout submission to land on a slow connection.
create or replace function public.exam_grace_seconds()
returns integer
language sql
immutable
as $$ select 30 $$;

-- The moment an attempt's time runs out.
create or replace function public.attempt_deadline(p_start_time timestamptz, p_duration_minutes integer)
returns timestamptz
language sql
immutable
as $$ select p_start_time + make_interval(mins => p_duration_minutes) $$;

-- A student's view of a result: the full row once released, otherwise
-- only what says "your submission was received" with no score fields.
create or replace function public.result_to_student_jsonb(r public.results, p_released boolean)
returns jsonb
language sql
immutable
as $$
  select case
    when r.id is null then null
    when p_released then public.result_to_jsonb(r)
    else jsonb_build_object(
      'result_id', r.id,
      'attempt_id', r.attempt_id,
      'user_id', r.user_id,
      'exam_id', r.exam_id,
      'marks_obtained', null,
      'total_marks', r.total_marks,
      'percentage', null,
      'status', null,
      'total_questions', r.total_questions,
      'correct_count', null,
      'incorrect_count', null,
      'unanswered_count', r.unanswered_count,
      'evaluated_at', r.evaluated_at
    )
  end;
$$;

-- ----------------------------------------------------------------
-- 3. start_exam_attempt — now refuses draft exams
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
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_exam from examinations where id = p_exam_id;
  -- A draft is reported exactly like a missing exam, so its existence
  -- is not revealed either.
  if not found or v_exam.status = 'draft' then
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

    v_remaining := greatest(0, extract(epoch from (
      public.attempt_deadline(v_attempt.start_time, v_exam.duration_minutes) - v_now
    ))::integer);

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
-- 5. get_exam_questions_for_student — shuffled per attempt, and the
--    remaining time is computed from the deadline, not a stored counter
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
  v_exam record;
  v_questions jsonb;
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_attempt from exam_attempts where user_id = v_uid and exam_id = p_exam_id;
  if not found then
    raise exception 'No examination attempt found. Please start the exam first.';
  end if;

  select * into v_exam from examinations where id = p_exam_id;

  v_remaining := case when v_attempt.status = 'in_progress'
    then greatest(0, extract(epoch from (
      public.attempt_deadline(v_attempt.start_time, v_exam.duration_minutes) - now()
    ))::integer)
    else 0 end;

  -- md5(attempt id || question id) gives each student their own order
  -- that stays the same every time they reload the page.
  select coalesce(jsonb_agg(sub.q_row order by sub.sort_key), '[]'::jsonb) into v_questions
  from (
    select
      md5(v_attempt.id::text || q.id::text) as sort_key,
      jsonb_build_object(
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
      'timeRemainingSeconds', v_remaining,
      'startTime', v_attempt.start_time
    )
  );
end;
$$;

-- ----------------------------------------------------------------
-- 2. save_answer — rejected after the deadline; the question must
--    belong to this exam; the stored time is computed, not trusted
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
  v_duration integer;
  v_deadline timestamptz;
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

  select duration_minutes into v_duration from examinations where id = v_attempt.exam_id;
  v_deadline := public.attempt_deadline(v_attempt.start_time, v_duration);

  if now() > v_deadline + make_interval(secs => public.exam_grace_seconds()) then
    raise exception 'Time is up for this examination. No further answers can be saved.';
  end if;

  if not exists (
    select 1 from exam_questions where exam_id = v_attempt.exam_id and question_id = p_question_id
  ) then
    raise exception 'This question is not part of the examination.';
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

  -- p_time_remaining_seconds is kept in the signature so existing clients
  -- keep working, but the stored value now comes from the server clock.
  update exam_attempts
  set time_remaining_seconds = greatest(0, extract(epoch from (v_deadline - now()))::integer)
  where id = p_attempt_id;

  return jsonb_build_object('success', true);
end;
$$;

-- ----------------------------------------------------------------
-- 2 + 4. submit_exam_attempt — late submissions are 'timed_out' no
--        matter what the client says; score withheld until release
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
  v_is_late boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_attempt from exam_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Examination attempt not found.';
  end if;

  select * into v_exam from examinations where id = v_attempt.exam_id;

  if v_attempt.status in ('submitted', 'timed_out') then
    select * into v_existing_result from results where attempt_id = p_attempt_id;
    return jsonb_build_object(
      'message', 'Examination was already submitted.',
      'status', v_attempt.status,
      'attemptId', p_attempt_id,
      'resultsReleased', coalesce(v_exam.results_released, false),
      'result', public.result_to_student_jsonb(v_existing_result, coalesce(v_exam.results_released, false))
    );
  end if;

  v_is_late := now() > public.attempt_deadline(v_attempt.start_time, v_exam.duration_minutes)
    + make_interval(secs => public.exam_grace_seconds());
  v_final_status := case when p_is_timeout or v_is_late then 'timed_out' else 'submitted' end;

  update exam_attempts
  set status = v_final_status, submitted_at = now(), time_remaining_seconds = 0
  where id = p_attempt_id;

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
    'marksObtained', v_marks_obtained, 'totalMarks', v_total_marks,
    'late', v_is_late
  ));

  return jsonb_build_object(
    'message', case when v_final_status = 'timed_out'
      then 'Time expired. Your examination has been automatically submitted and locked.'
      else 'Examination submitted successfully.' end,
    'status', v_final_status,
    'attemptId', p_attempt_id,
    'resultsReleased', coalesce(v_exam.results_released, false),
    'result', public.result_to_student_jsonb(v_result_row, coalesce(v_exam.results_released, false))
  );
end;
$$;

-- ----------------------------------------------------------------
-- 4. get_result_review — score withheld until release
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
    select coalesce(jsonb_agg(sub.q_row order by sub.sort_key), '[]'::jsonb) into v_review
    from (
      select
        md5(v_result.attempt_id::text || q.id::text) as sort_key,
        jsonb_build_object(
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
    'result', public.result_to_student_jsonb(v_result, v_is_released),
    'questionReview', v_review
  );
end;
$$;

grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.get_exam_questions_for_student(uuid) to authenticated;
grant execute on function public.save_answer(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function public.submit_exam_attempt(uuid, boolean) to authenticated;
grant execute on function public.get_result_review(uuid) to authenticated;
