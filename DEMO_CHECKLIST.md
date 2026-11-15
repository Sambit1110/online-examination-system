# Demo checklist

Do these the evening before. Each one takes a few minutes.

## 1. Put the new code live (do this first)
Commit and push to GitHub. Vercel redeploys on its own. Wait until the
Vercel dashboard shows the new deployment as **Ready**.

Why first: the updated result page works with both the old and new
database rules, but the old result page would show blank scores under the
new rules.

## 2. Turn on the new database rules
1. Open your project in the Supabase dashboard, then **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/0006_exam_integrity_hardening.sql`.
3. Click **Run**. It should say "Success. No rows returned".

Only this one file. The live database already has 0001–0005.
It is safe to run twice.

## 3. Change the admin password
The sample passwords are written in the public GitHub code, so anyone could
log in as admin. In Supabase: **Authentication** → **Users** → the admin
user → **⋯** → reset or set a new password. Write it down for the demo.

## 4. Make an exam that is open during the demo
The sample exam closed in September. Log in as admin on the live site →
**Exam Management** → create (or edit) an exam:
- start time: before the demo starts
- end time: a few hours after the demo
- status: not "draft"
- add some questions from the question bank

## 5. Do a full practice run
1. Log in as a student, start the exam, answer a few questions, submit.
2. The result page should say **Withheld** for marks.
3. Log in as admin, release results for that exam.
4. Back as the student, the full grade slip and answer review should now show.

## Things worth pointing out to your sir
- The time limit is enforced by the database, not just the on-screen
  timer. Answers sent after time is up are rejected.
- Each student gets the questions in a different order.
- Correct answers and marks are never sent to the student's browser until
  results are released.
- Tab switches are recorded for the admin to review (no webcam/mic).
- Every important admin action is recorded in an audit log.
