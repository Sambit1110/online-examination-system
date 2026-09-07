import bcrypt from 'bcryptjs';
import { db, queryRun, queryGet } from './database.js';

export function seedDatabase() {
  console.log('--- Starting Adamas University OES Database Seeding ---');

  // Clear existing data cleanly in reverse FK order
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DELETE FROM audit_logs;');
  db.exec('DELETE FROM results;');
  db.exec('DELETE FROM answers;');
  db.exec('DELETE FROM exam_attempts;');
  db.exec('DELETE FROM options;');
  db.exec('DELETE FROM questions;');
  db.exec('DELETE FROM examinations;');
  db.exec('DELETE FROM users;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Seed Users (SEC-07: Passwords hashed with bcrypt)
  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('Admin@12345', salt);
  const studentPasswordHash = bcrypt.hashSync('Student@12345', salt);

  const users = [
    {
      id: 'USR-ADMIN-01',
      name: 'Prof. Anirban Mukherjee',
      email: 'admin@adamas.ac.in',
      passwordHash: adminPasswordHash,
      role: 'admin',
      rollNumber: null,
      department: 'Department of Computer Science and Engineering'
    },
    {
      id: 'USR-STU-01',
      name: 'Sambit Biswas',
      email: 'sambit.biswas@adamas.ac.in',
      passwordHash: studentPasswordHash,
      role: 'student',
      rollNumber: 'UG/SOET/30/24/043',
      department: 'Computer Science and Engineering'
    },
    {
      id: 'USR-STU-02',
      name: 'Ananya Sen',
      email: 'ananya.sen@adamas.ac.in',
      passwordHash: studentPasswordHash,
      role: 'student',
      rollNumber: 'UG/SOET/30/24/044',
      department: 'Computer Science and Engineering'
    },
    {
      id: 'USR-STU-03',
      name: 'Rohit Das',
      email: 'rohit.das@adamas.ac.in',
      passwordHash: studentPasswordHash,
      role: 'student',
      rollNumber: 'UG/SOET/30/24/045',
      department: 'Computer Science and Engineering'
    }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (user_id, name, email, password_hash, role, roll_number, department)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    insertUser.run(u.id, u.name, u.email, u.passwordHash, u.role, u.rollNumber, u.department);
  }
  console.log(`Seeded ${users.length} institutional user accounts.`);

  // 2. Seed Examinations
  const now = new Date();
  
  // Live Exam: started 1 hour ago, ends 5 hours from now
  const liveStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const liveEnd = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();

  // Upcoming Exam: starts tomorrow, ends tomorrow + 2 hrs
  const scheduledStart = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const scheduledEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

  // Completed & Released Exam: happened 3 days ago
  const completedStart = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const completedEnd = new Date(now.getTime() - 70 * 60 * 60 * 1000).toISOString();

  // Draft Exam
  const draftStart = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const draftEnd = new Date(now.getTime() + 50 * 60 * 60 * 1000).toISOString();

  const exams = [
    {
      id: 'EXAM-CS301',
      title: 'CS301: Design and Analysis of Algorithms - Mid Semester Examination',
      description: 'Formal Mid-Semester Examination covering Asymptotic Notations, Divide & Conquer, Greedy Algorithms, Dynamic Programming, and Graph Traversals.',
      duration: 30, // 30 minutes
      startTime: liveStart,
      endTime: liveEnd,
      totalMarks: 20.0,
      passPercentage: 40.0,
      negativeMarks: 0.0,
      status: 'live',
      resultsReleased: 0,
      createdBy: 'USR-ADMIN-01'
    },
    {
      id: 'EXAM-CS302',
      title: 'CS302: Database Management Systems - Unit Assessment',
      description: 'Covers Relational Algebra, SQL Queries, Normalization up to BCNF, and ACID Transaction Properties.',
      duration: 45,
      startTime: scheduledStart,
      endTime: scheduledEnd,
      totalMarks: 20.0,
      passPercentage: 40.0,
      negativeMarks: 0.25,
      status: 'scheduled',
      resultsReleased: 0,
      createdBy: 'USR-ADMIN-01'
    },
    {
      id: 'EXAM-CS201',
      title: 'CS201: Discrete Structures & Logic - End-Semester',
      description: 'Completed departmental examination covering Propositional Calculus, Set Theory, Combinatorics, and Recurrence Relations.',
      duration: 40,
      startTime: completedStart,
      endTime: completedEnd,
      totalMarks: 20.0,
      passPercentage: 40.0,
      negativeMarks: 0.0,
      status: 'released',
      resultsReleased: 1,
      createdBy: 'USR-ADMIN-01'
    },
    {
      id: 'EXAM-CS401',
      title: 'CS401: Artificial Intelligence & Machine Learning (Draft)',
      description: 'Under review by Department Board of Studies. Unscheduled draft examination.',
      duration: 60,
      startTime: draftStart,
      endTime: draftEnd,
      totalMarks: 20.0,
      passPercentage: 50.0,
      negativeMarks: 0.0,
      status: 'draft',
      resultsReleased: 0,
      createdBy: 'USR-ADMIN-01'
    }
  ];

  const insertExam = db.prepare(`
    INSERT INTO examinations (
      exam_id, title, description, duration_minutes, start_time, end_time,
      total_marks, pass_percentage, negative_marks_per_question, status,
      results_released, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const ex of exams) {
    insertExam.run(
      ex.id, ex.title, ex.description, ex.duration, ex.startTime, ex.endTime,
      ex.totalMarks, ex.passPercentage, ex.negativeMarks, ex.status,
      ex.resultsReleased, ex.createdBy
    );
  }
  console.log(`Seeded ${exams.length} examinations across all lifecycle stages.`);

  // 3. Seed Questions & Options
  const insertQuestion = db.prepare(`
    INSERT INTO questions (question_id, exam_id, question_text, marks, question_type, subject, difficulty, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOption = db.prepare(`
    INSERT INTO options (option_id, question_id, option_text, is_correct)
    VALUES (?, ?, ?, ?)
  `);

  // Questions for CS301 (Live Exam - 10 questions, 2 marks each = 20 marks total)
  const cs301Questions = [
    {
      id: 'Q-CS301-01',
      text: 'What is the worst-case time complexity of the randomized QuickSort algorithm when selecting pivot uniformly at random?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'medium',
      options: [
        { text: 'O(n log n)', isCorrect: false },
        { text: 'O(n²)', isCorrect: true },
        { text: 'O(n)', isCorrect: false },
        { text: 'O(log n)', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-02',
      text: 'Which algorithmic paradigm does Dijkstra’s Single Source Shortest Path algorithm adhere to?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'easy',
      options: [
        { text: 'Dynamic Programming', isCorrect: false },
        { text: 'Greedy Approach', isCorrect: true },
        { text: 'Divide and Conquer', isCorrect: false },
        { text: 'Branch and Bound', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-03',
      text: 'What is the optimal recurrence relation solution for the 0/1 Knapsack problem with n items and capacity W using Dynamic Programming?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'hard',
      options: [
        { text: 'O(n × W) pseudo-polynomial time', isCorrect: true },
        { text: 'O(2ⁿ) strictly polynomial time', isCorrect: false },
        { text: 'O(n log W) sub-linear time', isCorrect: false },
        { text: 'O(W²) polynomial time', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-04',
      text: 'According to the Master Theorem, what is the asymptotic bound for the recurrence T(n) = 2T(n/2) + O(n)?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'medium',
      options: [
        { text: 'Θ(n)', isCorrect: false },
        { text: 'Θ(n log n)', isCorrect: true },
        { text: 'Θ(n²)', isCorrect: false },
        { text: 'Θ(log n)', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-05',
      text: 'In Kruskal’s Minimum Spanning Tree algorithm, which data structure is essentially used to detect cycles efficiently?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'medium',
      options: [
        { text: 'Min-Heap / Priority Queue', isCorrect: false },
        { text: 'Disjoint Set Union (DSU) with Path Compression', isCorrect: true },
        { text: 'Red-Black Balanced Search Tree', isCorrect: false },
        { text: 'Breadth First Search Queue', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-06',
      text: 'What is the tight lower bound for comparison-based sorting algorithms for an arbitrary sequence of n elements?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'easy',
      options: [
        { text: 'Ω(n)', isCorrect: false },
        { text: 'Ω(n log n)', isCorrect: true },
        { text: 'Ω(n²)', isCorrect: false },
        { text: 'Ω(log n)', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-07',
      text: 'Which graph traversal algorithm uses a First-In-First-Out (FIFO) queue and computes the shortest path on unweighted graphs?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'easy',
      options: [
        { text: 'Depth First Search (DFS)', isCorrect: false },
        { text: 'Breadth First Search (BFS)', isCorrect: true },
        { text: 'Bellman-Ford Algorithm', isCorrect: false },
        { text: 'Floyd-Warshall Algorithm', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-08',
      text: 'In Huffman Coding for lossless data compression, what optimal strategy is employed to construct the prefix tree?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'medium',
      options: [
        { text: 'Greedy choice combining the two least frequent nodes', isCorrect: true },
        { text: 'Dynamic programming matrix memoization', isCorrect: false },
        { text: 'Divide and conquer binary partitioning', isCorrect: false },
        { text: 'Linear randomized selection', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-09',
      text: 'What is the worst-case running time of Floyd-Warshall all-pairs shortest path algorithm for a graph with V vertices?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'easy',
      options: [
        { text: 'O(V²)', isCorrect: false },
        { text: 'O(V³)', isCorrect: true },
        { text: 'O(V log V)', isCorrect: false },
        { text: 'O(V × E log V)', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS301-10',
      text: 'Which algorithmic technique does Strassen’s Matrix Multiplication employ to reduce multiplication operations from 8 to 7?',
      marks: 2.0,
      subject: 'Algorithms',
      difficulty: 'medium',
      options: [
        { text: 'Dynamic Programming', isCorrect: false },
        { text: 'Divide and Conquer', isCorrect: true },
        { text: 'Backtracking', isCorrect: false },
        { text: 'Greedy Heuristics', isCorrect: false }
      ]
    }
  ];

  for (const q of cs301Questions) {
    insertQuestion.run(q.id, 'EXAM-CS301', q.text, q.marks, 'mcq_single', q.subject, q.difficulty, 'active');
    let optIdx = 1;
    for (const opt of q.options) {
      insertOption.run(`${q.id}-OPT${optIdx}`, q.id, opt.text, opt.isCorrect ? 1 : 0);
      optIdx++;
    }
  }

  // Questions for CS201 (Completed & Released Exam - 5 questions, 4 marks each = 20 marks total)
  const cs201Questions = [
    {
      id: 'Q-CS201-01',
      text: 'Which of the following logical expressions is equivalent to the conditional statement (p → q)?',
      marks: 4.0,
      subject: 'Discrete Mathematics',
      difficulty: 'easy',
      options: [
        { text: '¬p ∨ q', isCorrect: true },
        { text: 'p ∧ ¬q', isCorrect: false },
        { text: '¬p ∧ ¬q', isCorrect: false },
        { text: 'p ∨ q', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS201-02',
      text: 'How many edges are present in a complete undirected graph Kₙ with n vertices?',
      marks: 4.0,
      subject: 'Discrete Mathematics',
      difficulty: 'easy',
      options: [
        { text: 'n(n - 1) / 2', isCorrect: true },
        { text: 'n²', isCorrect: false },
        { text: '2ⁿ - 1', isCorrect: false },
        { text: 'n(n + 1) / 2', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS201-03',
      text: 'A relation R on a set A is an equivalence relation if and only if it is:',
      marks: 4.0,
      subject: 'Discrete Mathematics',
      difficulty: 'easy',
      options: [
        { text: 'Reflexive, Symmetric, and Transitive', isCorrect: true },
        { text: 'Reflexive, Antisymmetric, and Transitive', isCorrect: false },
        { text: 'Irreflexive, Symmetric, and Transitive', isCorrect: false },
        { text: 'Symmetric and Asymmetric', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS201-04',
      text: 'By the Pigeonhole Principle, what is the minimum number of students needed to guarantee that at least two share the same birth month?',
      marks: 4.0,
      subject: 'Discrete Mathematics',
      difficulty: 'easy',
      options: [
        { text: '12', isCorrect: false },
        { text: '13', isCorrect: true },
        { text: '24', isCorrect: false },
        { text: '366', isCorrect: false }
      ]
    },
    {
      id: 'Q-CS201-05',
      text: 'What is the sum of the degrees of all vertices in any undirected finite graph with E edges (Euler’s Handshaking Lemma)?',
      marks: 4.0,
      subject: 'Discrete Mathematics',
      difficulty: 'easy',
      options: [
        { text: '2E', isCorrect: true },
        { text: 'E', isCorrect: false },
        { text: 'E²', isCorrect: false },
        { text: 'E / 2', isCorrect: false }
      ]
    }
  ];

  for (const q of cs201Questions) {
    insertQuestion.run(q.id, 'EXAM-CS201', q.text, q.marks, 'mcq_single', q.subject, q.difficulty, 'active');
    let optIdx = 1;
    for (const opt of q.options) {
      insertOption.run(`${q.id}-OPT${optIdx}`, q.id, opt.text, opt.isCorrect ? 1 : 0);
      optIdx++;
    }
  }

  // Standalone Question Bank items (General Pool)
  const bankQuestions = [
    {
      id: 'Q-BANK-01',
      text: 'In Relational Database Design, which Normal Form strictly eliminates transitive functional dependencies?',
      marks: 2.0,
      subject: 'Database Systems',
      difficulty: 'medium',
      options: [
        { text: 'First Normal Form (1NF)', isCorrect: false },
        { text: 'Second Normal Form (2NF)', isCorrect: false },
        { text: 'Third Normal Form (3NF)', isCorrect: true },
        { text: 'Boyce-Codd Normal Form (BCNF)', isCorrect: false }
      ]
    },
    {
      id: 'Q-BANK-02',
      text: 'Which property of ACID transactions guarantees that database modifications survive permanent power interruptions?',
      marks: 2.0,
      subject: 'Database Systems',
      difficulty: 'easy',
      options: [
        { text: 'Atomicity', isCorrect: false },
        { text: 'Consistency', isCorrect: false },
        { text: 'Isolation', isCorrect: false },
        { text: 'Durability', isCorrect: true }
      ]
    }
  ];

  for (const q of bankQuestions) {
    insertQuestion.run(q.id, null, q.text, q.marks, 'mcq_single', q.subject, q.difficulty, 'active');
    let optIdx = 1;
    for (const opt of q.options) {
      insertOption.run(`${q.id}-OPT${optIdx}`, q.id, opt.text, opt.isCorrect ? 1 : 0);
      optIdx++;
    }
  }
  console.log('Seeded Question Bank with questions and options.');

  // 4. Seed Completed Attempt & Released Result for Sambit Biswas on CS201
  const attemptId = 'ATT-SAMBIT-CS201';
  db.prepare(`
    INSERT INTO exam_attempts (attempt_id, user_id, exam_id, start_time, end_time, time_remaining_seconds, status, submitted_at, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attemptId,
    'USR-STU-01',
    'EXAM-CS201',
    completedStart,
    new Date(new Date(completedStart).getTime() + 25 * 60 * 1000).toISOString(),
    0,
    'submitted',
    new Date(new Date(completedStart).getTime() + 25 * 60 * 1000).toISOString(),
    new Date(new Date(completedStart).getTime() + 25 * 60 * 1000 + 1000).toISOString()
  );

  // Sambit answered questions 1, 2, 3, 5 correctly; question 4 incorrectly
  const sambitAnswers = [
    { qId: 'Q-CS201-01', optId: 'Q-CS201-01-OPT1' }, // correct
    { qId: 'Q-CS201-02', optId: 'Q-CS201-02-OPT1' }, // correct
    { qId: 'Q-CS201-03', optId: 'Q-CS201-03-OPT1' }, // correct
    { qId: 'Q-CS201-04', optId: 'Q-CS201-04-OPT1' }, // selected option 1 (12), which is incorrect!
    { qId: 'Q-CS201-05', optId: 'Q-CS201-05-OPT1' }  // correct
  ];

  const insertAns = db.prepare(`
    INSERT INTO answers (answer_id, attempt_id, user_id, question_id, selected_option_id, is_marked_for_review)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < sambitAnswers.length; i++) {
    insertAns.run(`ANS-${attemptId}-${i+1}`, attemptId, 'USR-STU-01', sambitAnswers[i].qId, sambitAnswers[i].optId, 0);
  }

  // 4 correct out of 5 = 16.0 / 20.0 (80%) -> Pass
  db.prepare(`
    INSERT INTO results (
      result_id, attempt_id, user_id, exam_id, marks_obtained, total_marks,
      percentage, status, total_questions, correct_count, incorrect_count,
      unanswered_count, evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'RES-SAMBIT-CS201',
    attemptId,
    'USR-STU-01',
    'EXAM-CS201',
    16.0,
    20.0,
    80.0,
    'pass',
    5,
    4,
    1,
    0,
    new Date(new Date(completedStart).getTime() + 25 * 60 * 1000 + 1000).toISOString()
  );

  // Seed Ananya Sen attempt on CS201 (All 5 correct = 20/20, 100%)
  const attemptId2 = 'ATT-ANANYA-CS201';
  db.prepare(`
    INSERT INTO exam_attempts (attempt_id, user_id, exam_id, start_time, end_time, time_remaining_seconds, status, submitted_at, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attemptId2,
    'USR-STU-02',
    'EXAM-CS201',
    completedStart,
    new Date(new Date(completedStart).getTime() + 28 * 60 * 1000).toISOString(),
    0,
    'submitted',
    new Date(new Date(completedStart).getTime() + 28 * 60 * 1000).toISOString(),
    new Date(new Date(completedStart).getTime() + 28 * 60 * 1000 + 1000).toISOString()
  );

  for (let i = 0; i < 5; i++) {
    insertAns.run(`ANS-${attemptId2}-${i+1}`, attemptId2, 'USR-STU-02', cs201Questions[i].id, `${cs201Questions[i].id}-OPT1`, 0);
  }

  db.prepare(`
    INSERT INTO results (
      result_id, attempt_id, user_id, exam_id, marks_obtained, total_marks,
      percentage, status, total_questions, correct_count, incorrect_count,
      unanswered_count, evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'RES-ANANYA-CS201',
    attemptId2,
    'USR-STU-02',
    'EXAM-CS201',
    20.0,
    20.0,
    100.0,
    'pass',
    5,
    5,
    0,
    0,
    new Date(new Date(completedStart).getTime() + 28 * 60 * 1000 + 1000).toISOString()
  );

  // 5. Seed Initial Audit Logs
  db.prepare(`
    INSERT INTO audit_logs (log_id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).run('LOG-INIT-01', 'USR-ADMIN-01', 'SYSTEM_INITIALIZATION', 'Institutional examination system database initialized and baseline seeds applied.');

  console.log('--- Seeding Completed Successfully ---');
}

// Execute directly if run via node
seedDatabase();
