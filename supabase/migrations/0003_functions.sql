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
  v_result record;
  v_existing_result record;
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
  for v_result in
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
    v_total_marks := v_total_marks + v_result.marks;

    if v_result.selected_option_id is null then
      v_unanswered_count := v_unanswered_count + 1;
    elsif v_result.selected_option_id = v_result.correct_option_id then
      v_marks_obtained := v_marks_obtained + v_result.marks;
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
  returning * into v_result;

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
    'result', public.result_to_jsonb(v_result)
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
  v_result record;
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
