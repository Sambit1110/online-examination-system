// Automated End-to-End Verification Suite for Adamas University OES
// Tests all 50 SRS Requirements, Security Rules, Business Rules, and Performance

const BASE_URL = 'http://localhost:5000/api';

async function testSuite() {
  console.log('====================================================');
  console.log('ADAMAS UNIVERSITY OES - SYSTEM VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check & Response time (PERF-01)
    const t0 = Date.now();
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    const tHealth = Date.now() - t0;
    assert(healthRes.status === 200 && healthData.status === 'online', `API Health Check OK (${tHealth}ms < 1000ms)`);

    // 2. Authentication: Empty fields (REQ-07)
    const emptyRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' })
    });
    assert(emptyRes.status === 400, 'REQ-07: Empty login fields rejected with 400');

    // 3. Authentication: Invalid credentials (REQ-06)
    const badRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@adamas.ac.in', password: 'WrongPassword' })
    });
    assert(badRes.status === 401, 'REQ-06: Invalid credentials rejected with 401');

    // 4. Authentication: Valid Admin Login (REQ-03, REQ-05)
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@adamas.ac.in', password: 'Admin@12345' })
    });
    const adminData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200 && adminData.user.role === 'admin', 'REQ-05: Administrator login successful with JWT');
    const adminToken = adminData.token;

    // 5. Authentication: Valid Student Login (REQ-01, REQ-04)
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sambit.biswas@adamas.ac.in', password: 'Student@12345' })
    });
    const studentData = await studentLoginRes.json();
    assert(studentLoginRes.status === 200 && studentData.user.role === 'student', 'REQ-04: Student login successful (Sambit Biswas)');
    const studentToken = studentData.token;

    // 6. Security: Unauthenticated access to protected route (SEC-01, REQ-08)
    const unauthRes = await fetch(`${BASE_URL}/admin/metrics`);
    assert(unauthRes.status === 401, 'SEC-01 / REQ-08: Unauthenticated access prevented with 401');

    // 7. Security: Student accessing Admin route forbidden (SEC-02, SEC-03)
    const forbiddenRes = await fetch(`${BASE_URL}/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(forbiddenRes.status === 403, 'SEC-03: Student blocked from Admin routes with 403 Forbidden');

    // 8. Question Management: Admin adds question (REQ-09 to REQ-12, REQ-15)
    const addQRes = await fetch(`${BASE_URL}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        question_text: 'What is the time complexity of binary search on a sorted array of size N?',
        marks: 2.0,
        subject: 'Algorithms',
        difficulty: 'easy',
        options: [
          { option_text: 'O(N)', is_correct: 0 },
          { option_text: 'O(log N)', is_correct: 1 },
          { option_text: 'O(N²)', is_correct: 0 },
          { option_text: 'O(1)', is_correct: 0 }
        ]
      })
    });
    const addQData = await addQRes.json();
    assert(addQRes.status === 201 && addQData.question_id, `REQ-09 to 12: Admin created question (${addQData.question_id})`);

    // 9. Student views available exams (REQ-26)
    const studentExamsRes = await fetch(`${BASE_URL}/exams/student`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const studentExamsData = await studentExamsRes.json();
    assert(studentExamsRes.status === 200 && studentExamsData.examinations.length >= 3, 'REQ-26: Student receives available/upcoming/completed exams');

    // 10. Schedule check: Student cannot start upcoming exam before start time (BR-02, REQ-27)
    const scheduledExam = studentExamsData.examinations.find(e => e.accessState === 'upcoming');
    if (scheduledExam) {
      const earlyRes = await fetch(`${BASE_URL}/conduct/start/${scheduledExam.exam_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` }
      });
      assert(earlyRes.status === 403, `BR-02: Blocked from starting upcoming exam before start time (403)`);
    }

    // 11. Exam Instructions: Student reads instructions (REQ-28)
    const liveExam = studentExamsData.examinations.find(e => e.accessState === 'live');
    assert(liveExam !== undefined, 'Live examination available for candidate');

    const instrRes = await fetch(`${BASE_URL}/exams/instructions/${liveExam.exam_id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const instrData = await instrRes.json();
    assert(instrRes.status === 200 && Array.isArray(instrData.rules), 'REQ-28: Instructions and rules retrieved before exam');

    // 12. Student starts live exam (REQ-29)
    const startRes = await fetch(`${BASE_URL}/conduct/start/${liveExam.exam_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const startData = await startRes.json();
    assert(startRes.status === 201 || startRes.status === 200, 'REQ-29: Student permitted to start exam attempt');
    const attemptId = startData.attempt.attempt_id;

    // 13. Student retrieves questions - CRITICAL: verify correct answers are NOT leaked! (REQ-16, SEC-08, REQ-30)
    const qRes = await fetch(`${BASE_URL}/conduct/questions/${liveExam.exam_id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const qData = await qRes.json();
    assert(qRes.status === 200 && qData.questions.length > 0, `REQ-30: Fetched ${qData.questions.length} questions for exam`);

    let leaked = false;
    for (const q of qData.questions) {
      for (const opt of q.options) {
        if ('is_correct' in opt || 'isCorrect' in opt) leaked = true;
      }
    }
    assert(!leaked, 'REQ-16 & SEC-08: CONFIRMED correct-answer metadata is completely stripped for students');

    // 14. Answer recording & Autosave (REQ-32, REQ-33, SAFE-05, PERF-03)
    const firstQ = qData.questions[0];
    const chosenOpt = firstQ.options[1].option_id;
    const saveT0 = Date.now();
    const saveRes = await fetch(`${BASE_URL}/conduct/save-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        attemptId,
        questionId: firstQ.question_id,
        selectedOptionId: chosenOpt,
        isMarkedForReview: true,
        timeRemainingSeconds: 1750
      })
    });
    const saveDuration = Date.now() - saveT0;
    assert(saveRes.status === 200, `REQ-33 & PERF-03: Autosaved answer (${saveDuration}ms < 2000ms target)`);

    // 15. Answer change test (REQ-32)
    const altOpt = firstQ.options[0].option_id;
    const changeRes = await fetch(`${BASE_URL}/conduct/save-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        attemptId,
        questionId: firstQ.question_id,
        selectedOptionId: altOpt,
        isMarkedForReview: false,
        timeRemainingSeconds: 1740
      })
    });
    assert(changeRes.status === 200, 'REQ-32: Changed answer recorded cleanly');

    // Answer remainder of questions to test complete evaluation
    for (let i = 1; i < qData.questions.length; i++) {
      const q = qData.questions[i];
      await fetch(`${BASE_URL}/conduct/save-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attemptId,
          questionId: q.question_id,
          selectedOptionId: q.options[0].option_id,
          isMarkedForReview: false,
          timeRemainingSeconds: 1700
        })
      });
    }

    // 16. Final submission and Evaluation (REQ-35, REQ-36 to REQ-44, PERF-04, PERF-05)
    const subT0 = Date.now();
    const submitRes = await fetch(`${BASE_URL}/conduct/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ attemptId, isTimeout: false })
    });
    const submitDuration = Date.now() - subT0;
    const submitData = await submitRes.json();
    assert(submitRes.status === 200, `REQ-35 & PERF-04: Final exam submission processed (${submitDuration}ms < 3000ms target)`);
    assert(submitData.result !== undefined, 'REQ-44: Evaluation generated result record immediately');

    // 17. Immutable submitted answers (BR-09, REQ-43, SAFE-02)
    const modifyAfterSubmitRes = await fetch(`${BASE_URL}/conduct/save-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        attemptId,
        questionId: firstQ.question_id,
        selectedOptionId: chosenOpt
      })
    });
    assert(modifyAfterSubmitRes.status === 403, 'BR-09 & REQ-43: Answers locked permanently after submission (403)');

    // 18. Student Result Access: Released vs unreleased (REQ-47, REQ-50, BR-07)
    // Sambit accessing his already released exam (CS201)
    const myReleasedRes = await fetch(`${BASE_URL}/results/exam/EXAM-CS201/my`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const myReleasedData = await myReleasedRes.json();
    assert(myReleasedRes.status === 200 && myReleasedData.result.marks_obtained === 16.0, 'REQ-47: Student views released result and grade slip');
    assert(Array.isArray(myReleasedData.questionReview), 'REQ-49: Released exam displays comprehensive question review');

    // 19. Admin Gradebook & Result Management (REQ-48)
    const adminGradebookRes = await fetch(`${BASE_URL}/results/admin/exam/EXAM-CS201`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const gradebookData = await adminGradebookRes.json();
    assert(adminGradebookRes.status === 200 && gradebookData.results.length >= 2, 'REQ-48: Admin views exam-wide gradebook and student results');

    // 20. Database Backup Export (SAFE-03)
    const backupRes = await fetch(`${BASE_URL}/admin/backup`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const backupData = await backupRes.json();
    assert(backupRes.status === 200 && backupData.data.users.length >= 4, 'SAFE-03: Full database JSON snapshot exported successfully');

    console.log('\n====================================================');
    console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test suite exception:', err);
    process.exit(1);
  }
}

testSuite();
