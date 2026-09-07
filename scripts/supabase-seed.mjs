// ==========================================================
// Supabase demo data seeder
// ==========================================================
// Creates demo accounts (via the Supabase Admin API — this is the ONLY
// place in this project that legitimately needs the service_role key,
// and it is read from a local .env file, never shipped to the browser)
// plus sample exams/questions, and simulates one completed, graded
// attempt so the results/review UI has real data to show immediately.
//
// Usage:
//   1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local .env
//      (find both in your Supabase project's Settings -> API page).
//   2. Run the schema/RLS/function migrations first (see README.md).
//   3. node scripts/supabase-seed.mjs
//
// Safe to re-run: existing demo accounts are detected and skipped rather
// than duplicated; exam/question content is only inserted if missing.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in your environment (.env).');
  console.error('These are project-admin credentials — do NOT reuse the anon key here, and never commit them.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_ADMIN = {
  email: 'admin@adamas.ac.in',
  password: 'Admin@12345',
  name: 'Prof. Anirban Mukherjee',
  role: 'admin'
};

const DEMO_STUDENTS = [
  { email: 'sambit.biswas@adamas.ac.in', password: 'Student@12345', name: 'Sambit Biswas', role: 'student', roll_number: 'UG/SOET/30/24/043' },
  { email: 'ananya.sen@adamas.ac.in', password: 'Student@12345', name: 'Ananya Sen', role: 'student', roll_number: 'UG/SOET/30/24/044' }
];

async function findUserByEmail(email) {
  // Admin API lists in pages; fine for a small demo project's user count.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(account) {
  const existing = await findUserByEmail(account.email);
  if (existing) {
    console.log(`  [skip] ${account.role} ${account.email} already exists`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      name: account.name,
      role: account.role,
      roll_number: account.roll_number || null,
      department: 'Computer Science and Engineering'
    }
  });
  if (error) throw error;
  console.log(`  [created] ${account.role} ${account.email}`);
  return data.user.id;
}

async function main() {
  console.log('--- Adamas University OES — Supabase demo seed ---\n');

  console.log('1. Ensuring demo accounts exist...');
  const adminId = await ensureUser(DEMO_ADMIN);
  const studentIds = [];
  for (const s of DEMO_STUDENTS) {
    studentIds.push(await ensureUser(s));
  }

  console.log('\n2. Seeding sample exams and questions (as the admin account)...');

  const { data: existingExam } = await admin
    .from('examinations')
    .select('id')
    .eq('title', 'CS301: Design and Analysis of Algorithms — Mid Semester Examination')
    .maybeSingle();

  let liveExamId = existingExam?.id;

  if (!liveExamId) {
    const now = Date.now();
    const { data: liveExam, error: liveExamError } = await admin
      .from('examinations')
      .insert({
        title: 'CS301: Design and Analysis of Algorithms — Mid Semester Examination',
        description: 'Formal Mid-Semester Examination covering Asymptotic Notations, Divide & Conquer, Greedy Algorithms, and Dynamic Programming.',
        duration_minutes: 30,
        start_time: new Date(now - 60 * 60 * 1000).toISOString(),
        end_time: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
        pass_percentage: 40,
        negative_marks_per_question: 0,
        status: 'live',
        results_released: false,
        created_by: adminId
      })
      .select('id')
      .single();
    if (liveExamError) throw liveExamError;
    liveExamId = liveExam.id;

    const questions = [
      {
        text: 'What is the worst-case time complexity of randomized QuickSort?',
        subject: 'Algorithms', difficulty: 'medium',
        options: [['O(n log n)', false], ['O(n²)', true], ['O(n)', false], ['O(log n)', false]]
      },
      {
        text: 'Which paradigm does Dijkstra’s shortest path algorithm follow?',
        subject: 'Algorithms', difficulty: 'easy',
        options: [['Dynamic Programming', false], ['Greedy Approach', true], ['Divide and Conquer', false], ['Branch and Bound', false]]
      },
      {
        text: 'What is the time complexity of the 0/1 Knapsack DP solution (n items, capacity W)?',
        subject: 'Algorithms', difficulty: 'hard',
        options: [['O(n × W) pseudo-polynomial', true], ['O(2ⁿ)', false], ['O(n log W)', false], ['O(W²)', false]]
      },
      {
        text: 'By the Master Theorem, what is the bound for T(n) = 2T(n/2) + O(n)?',
        subject: 'Algorithms', difficulty: 'medium',
        options: [['Θ(n)', false], ['Θ(n log n)', true], ['Θ(n²)', false], ['Θ(log n)', false]]
      },
      {
        text: 'Which structure does Kruskal’s MST algorithm use to detect cycles efficiently?',
        subject: 'Algorithms', difficulty: 'medium',
        options: [['Min-Heap', false], ['Disjoint Set Union', true], ['Red-Black Tree', false], ['BFS Queue', false]]
      }
    ];

    for (const q of questions) {
      const { data: qRow, error: qError } = await admin
        .from('questions')
        .insert({ question_text: q.text, marks: 4, subject: q.subject, difficulty: q.difficulty, status: 'active', created_by: adminId })
        .select('id')
        .single();
      if (qError) throw qError;

      await admin.from('question_options').insert(
        q.options.map(([text, correct], idx) => ({ question_id: qRow.id, option_text: text, is_correct: correct, sort_order: idx }))
      );
      await admin.from('exam_questions').insert({ exam_id: liveExamId, question_id: qRow.id });
    }
    await admin.from('examinations').update({ total_marks: questions.length * 4 }).eq('id', liveExamId);
    console.log(`  [created] Live exam with ${questions.length} questions (20 marks)`);
  } else {
    console.log('  [skip] Sample exam already exists');
  }

  // A second, already-closed exam with a released result for the first
  // demo student, so the results/review page has real data on first login.
  const { data: existingReleased } = await admin
    .from('examinations')
    .select('id')
    .eq('title', 'CS201: Discrete Structures & Logic — End Semester (Released)')
    .maybeSingle();

  let releasedExamId = existingReleased?.id;

  if (!releasedExamId) {
    const now = Date.now();
    const { data: exam, error: examError } = await admin
      .from('examinations')
      .insert({
        title: 'CS201: Discrete Structures & Logic — End Semester (Released)',
        description: 'Completed departmental examination — results released.',
        duration_minutes: 20,
        start_time: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(now - 70 * 60 * 60 * 1000).toISOString(),
        pass_percentage: 40,
        negative_marks_per_question: 0,
        status: 'released',
        results_released: true,
        created_by: adminId
      })
      .select('id')
      .single();
    if (examError) throw examError;
    releasedExamId = exam.id;

    const questions = [
      { text: 'Which expression is equivalent to (p → q)?', options: [['¬p ∨ q', true], ['p ∧ ¬q', false], ['¬p ∧ ¬q', false], ['p ∨ q', false]] },
      { text: 'How many edges does a complete graph Kₙ have?', options: [['n(n-1)/2', true], ['n²', false], ['2ⁿ-1', false], ['n(n+1)/2', false]] },
      { text: 'An equivalence relation must be reflexive, symmetric, and:', options: [['Transitive', true], ['Antisymmetric', false], ['Irreflexive', false], ['Asymmetric', false]] },
      { text: 'By the Pigeonhole Principle, how many people guarantee a shared birth month?', options: [['12', false], ['13', true], ['24', false], ['366', false]] }
    ];

    const questionIds = [];
    for (const q of questions) {
      const { data: qRow, error: qError } = await admin
        .from('questions')
        .insert({ question_text: q.text, marks: 5, subject: 'Discrete Mathematics', difficulty: 'easy', status: 'active', created_by: adminId })
        .select('id')
        .single();
      if (qError) throw qError;
      questionIds.push({ id: qRow.id, options: q.options });

      const { data: optRows } = await admin
        .from('question_options')
        .insert(q.options.map(([text, correct], idx) => ({ question_id: qRow.id, option_text: text, is_correct: correct, sort_order: idx })))
        .select('id, is_correct');
      questionIds[questionIds.length - 1].optRows = optRows;
      await admin.from('exam_questions').insert({ exam_id: releasedExamId, question_id: qRow.id });
    }
    await admin.from('examinations').update({ total_marks: questions.length * 5 }).eq('id', releasedExamId);

    // Simulate a completed, graded attempt for the first demo student:
    // 3 correct, 1 wrong -> 15/20 (75%), pass.
    if (studentIds[0]) {
      const { data: attempt, error: attemptError } = await admin
        .from('exam_attempts')
        .insert({
          user_id: studentIds[0],
          exam_id: releasedExamId,
          start_time: new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString(),
          submitted_at: new Date(Date.now() - 70.5 * 60 * 60 * 1000).toISOString(),
          time_remaining_seconds: 0,
          status: 'submitted',
          evaluated_at: new Date().toISOString()
        })
        .select('id')
        .single();
      if (attemptError) throw attemptError;

      let correctCount = 0;
      for (let i = 0; i < questionIds.length; i++) {
        const q = questionIds[i];
        const correctOpt = q.optRows.find(o => o.is_correct);
        const wrongOpt = q.optRows.find(o => !o.is_correct);
        const answerIsCorrect = i !== 3; // miss the last one on purpose
        if (answerIsCorrect) correctCount++;
        await admin.from('submitted_answers').insert({
          attempt_id: attempt.id,
          question_id: q.id,
          selected_option_id: answerIsCorrect ? correctOpt.id : wrongOpt.id
        });
      }

      const marksObtained = correctCount * 5;
      const totalMarks = questions.length * 5;
      await admin.from('results').insert({
        attempt_id: attempt.id,
        user_id: studentIds[0],
        exam_id: releasedExamId,
        marks_obtained: marksObtained,
        total_marks: totalMarks,
        percentage: Math.round((marksObtained / totalMarks) * 10000) / 100,
        status: marksObtained / totalMarks >= 0.4 ? 'pass' : 'fail',
        total_questions: questions.length,
        correct_count: correctCount,
        incorrect_count: questions.length - correctCount,
        unanswered_count: 0
      });
      console.log(`  [created] Completed & graded attempt for ${DEMO_STUDENTS[0].email} (${marksObtained}/${totalMarks})`);
    }
  } else {
    console.log('  [skip] Sample released exam already exists');
  }

  console.log('\n--- Done ---');
  console.log('\nDemo credentials (local development only — do not reuse in production):');
  console.log(`  Admin:   ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  for (const s of DEMO_STUDENTS) {
    console.log(`  Student: ${s.email} / ${s.password}  (roll ${s.roll_number})`);
  }
}

main().catch(err => {
  console.error('\nSeed failed:', err.message || err);
  process.exit(1);
});
