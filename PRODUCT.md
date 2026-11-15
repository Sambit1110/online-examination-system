# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Students** of the Department of Computer Science & Engineering, Adamas University. They sign in (email or university roll number), see which exams are open, upcoming or finished, sit timed MCQ exams, and later read their grade slip. The exam itself is high-stakes and timed; everything around it is quick, occasional use.
- **Administrators** (Examination Cell / faculty). They author the question bank, schedule and publish exams, watch live attempts, release results, manage accounts and review the audit trail.
- **Evaluators**: the project is currently graded by the student's professor, who judges it from a live demo.

## Product Purpose
A departmental online examination platform: timed MCQ exams with autosave, automatic and tamper-proof grading, results released on the administrator's decision, and an administrator console. It is both a graded academic project and a candidate for real use by the department, so it must work and read as a credible institutional tool, not a prototype.

## Positioning
Integrity is enforced by the server, not the browser: the time limit, answer validation, grading and result release all live in the database, and students never receive correct answers or scores before release. Monitoring is light-touch: tab and focus changes are recorded for administrators, with no webcam, microphone or screen recording.

## Operating Context
- Students use personal laptops and phones, often on campus Wi-Fi of uneven quality.
- Exams are scheduled windows (start/end time) with a per-attempt duration; each student gets their own question order.
- Results move through: submitted → under evaluation (score withheld) → released (grade slip and per-question review).
- Live deployment: static SPA on Vercel, Supabase (Postgres, Auth, Row Level Security) behind it.

## Capabilities and Constraints
- Stack is fixed: React 18 + TypeScript + Vite, hand-written CSS (no UI framework), Supabase.
- Separate student and admin sign-in portals; roles verified server-side.
- Exam screen: question navigator, mark-for-review, autosave queue with unsaved-count indicator, wall-clock countdown, integrity status indicator.
- The exam screen must stay calm and legible during an attempt: no scroll effects or decorative motion while a student is answering.
- Must respect `prefers-reduced-motion` and work at phone width.

## Brand Commitments
- The name "Adamas University" and "Department of Computer Science & Engineering" are used. No official logo, colours or typeface are required; the visual identity is free.

## Evidence on Hand
- Real product content: exam titles, schedules, durations, marks, pass percentage, negative marking, result breakdowns, audit events, all from the live database and seed script (`scripts/supabase-seed.mjs`).
- No testimonials, adoption figures, student counts or accreditation claims exist; none may be invented.

## Product Principles
1. The server is the authority; the interface should make that trust visible without theatre.
2. The exam moment is sacred: nothing on screen competes with the question and the clock.
3. Every state is explicit: open, upcoming, closed, submitted, under evaluation, released.
4. Light-touch integrity: monitoring is disclosed plainly, never threatening.

## Accessibility & Inclusion
Reduced-motion support throughout, keyboard-operable exam navigation, focus-trapped dialogs, readable on low-end phones and slow networks.
