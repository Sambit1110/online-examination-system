# Adamas University — Online Examination System (OES)

A departmental online examination platform for the Department of Computer
Science & Engineering — student login, timed MCQ exams with autosave and
tab/focus integrity monitoring, automatic grading, and an administrator
console for authoring questions, scheduling exams, and reviewing results.

---

## Architecture

The application runs in one of two modes:

### Supabase mode (primary / production)
- **Frontend**: React 18 + TypeScript + Vite, talking directly to Supabase.
- **Database**: Postgres via Supabase (`supabase/migrations/`).
- **Auth**: Supabase Auth (email + password). No password ever touches an
  application table — Supabase's own `auth.users` table owns that entirely.
- **Authorization**: Row Level Security on every table — the database
  itself enforces who can read/write what, not application code.
- **Trusted server logic** (grading, exam-start timing rules, hiding correct
  answers from students) lives in **Postgres RPC functions**
  (`supabase/migrations/0003_functions.sql`), not a separate API server.
- **The one exception**: creating/deleting a user account needs Supabase's
  secret key, which must never reach the browser. That one operation
  is a small Vercel serverless function, [api/admin-users.js](api/admin-users.js).
- **Deployment**: a static SPA + one serverless function. No backend process
  to keep alive, no port to conflict with.

### Legacy local mode (optional, no Supabase account needed)
The original self-contained backend — Express + native `node:sqlite`, JWT
auth — is kept fully intact under [server/](server/) for offline development
or quick local testing without setting up a Supabase project. It is **not**
part of the default Vercel deployment (see `vercel.json`), but every command
below (`npm run server`, `npm run seed`, `npm run verify`) still works exactly
as before.

Which one is "live" at any moment depends only on which env vars you've set
and which dev command you run — the two modes don't interfere with each other.

---

## Features

- Student login (email **or** university roll number) with secure sessions
- Role-based access control — students can never reach admin functionality
- Timed exams with question navigation, mark-for-review, and live autosave
- Tab/window focus integrity monitoring during exams (see below) — no
  webcam, microphone, or screen recording of any kind
- Automatic, tamper-proof grading — correct answers are never sent to the
  browser until results are officially released
- Admin console: create/edit/publish exams, author questions, assign
  questions to exams, release results, manage user accounts, live
  "who's taking an exam right now" monitor, audit trail
- Responsive, accessible UI with loading/empty/error states throughout

---

## Technology stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Data & Auth (primary) | Supabase (Postgres, Auth, Row Level Security) |
| Trusted server logic | Postgres RPC functions (`SECURITY DEFINER`) |
| Admin user management | One Vercel serverless function (`api/admin-users.js`) |
| Legacy backend (optional) | Node.js, Express, native `node:sqlite`, JWT |
| Styling | Hand-written CSS design-token system (no UI framework) |
| Deployment | Vercel (static SPA + serverless function) |

---

## Local setup — Supabase mode

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a project, and open
**Settings → API**. You'll need:
- **Project URL**
- **anon / public key**
- **secret key** (keep this one secret — server-only)

### 3. Run the database migrations
Open your project's **SQL Editor** in the Supabase dashboard and run these
four files, in order (or use the Supabase CLI — see below):
1. `supabase/migrations/0001_schema.sql` — tables, constraints, indexes
2. `supabase/migrations/0002_rls.sql` — Row Level Security policies
3. `supabase/migrations/0003_functions.sql` — grading/attempt RPC functions
4. `supabase/migrations/0004_login_identifier.sql` — login-by-roll-number support

Using the CLI instead:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### 4. Configure environment variables
```bash
cp .env.example .env
```
Fill in:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SECRET_KEY=eyJ...          # server-only — see below
```

### 5. Create demo accounts and sample data
```bash
npm run supabase:seed
```
This creates one admin account, two student accounts, a live exam with
questions, and a second exam with an already-graded result — using the
Supabase **Admin API** with your `SUPABASE_SECRET_KEY`. The script
runs locally on your machine only; the key is never sent anywhere else and
never appears in any file that gets committed or shipped to the browser.
It prints the exact demo credentials it created when it finishes, and it's
safe to re-run (existing accounts/data are detected and skipped).

### 6. Run it
```bash
npm run dev
```
Open `http://localhost:5173`. Everything works end-to-end under plain
`npm run dev` — login, exams, grading, results, the live monitor — **except**
the admin "Enroll New Account" / "Delete Account" actions, which call the
`api/admin-users.js` serverless function. Plain `vite dev` doesn't serve
`/api/*` functions; test those either with `npx vercel dev` instead, or
after deploying. Every other admin feature (exams, questions, results,
audit trail) works normally under plain `npm run dev`.

---

## Local setup — Legacy mode (no Supabase account needed)

```bash
npm install
cp .env.example .env      # only JWT_SECRET is required for this mode
npm run server             # terminal 1 — Express + SQLite backend, port 5050
npm run dev                 # terminal 2 — Vite frontend, port 5173, proxies /api to the backend
```
`npm run seed` resets the local SQLite database to a known demo state; see
[server/db/seed.js](server/db/seed.js) for those (separate, SQLite-only)
demo credentials.

---

## Environment variables

| Variable | Used by | Required for |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | Supabase mode |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Supabase mode |
| `SUPABASE_URL` | `api/admin-users.js`, `scripts/supabase-seed.mjs` | Admin user management, seeding |
| `SUPABASE_SECRET_KEY` | `api/admin-users.js`, `scripts/supabase-seed.mjs` | Admin user management, seeding |
| `SUPABASE_DB_PASSWORD` | `supabase` CLI only | Optional — only if pushing migrations via the CLI (`supabase db push`) |
| `SUPABASE_ACCESS_TOKEN` | `supabase` CLI only | Optional — a Personal Access Token, alternative migration path over HTTPS when the CLI's direct Postgres connection isn't reachable (e.g. sandboxed/CI networks that only permit HTTPS egress). Generate one at your [Supabase account tokens page](https://supabase.com/dashboard/account/tokens) and use it with `supabase login --token` or the Management API directly |
| `JWT_SECRET` | Legacy `server/` | Legacy mode only |
| `PORT` | Legacy `server/` | Legacy mode only (default 5050) |

**Never commit `.env`.** It's already in `.gitignore`. The `VITE_`-prefixed
variables are safe to expose to the browser by design (Supabase's anon key
identifies the project, not a privileged user — real authorization is Row
Level Security). The two `SUPABASE_*` variables without the `VITE_` prefix
are **server-only secrets** — never prefix them with `VITE_`, or Vite will
bundle them straight into client-side JavaScript.

---

## Database

See [supabase/migrations/](supabase/migrations/) for the full schema. Tables:
`profiles`, `examinations`, `questions`, `question_options`, `exam_questions`
(many-to-many bank-question ↔ exam assignment), `exam_attempts`,
`submitted_answers`, `results`, `integrity_events`, `audit_logs`. Every
table has Row Level Security enabled; students only ever see their own
attempts/answers/results, and never see `is_correct` on an option directly —
that's only ever returned by the grading/review RPC functions, and only
after results are released.

---

## Exam integrity monitoring

While a student is in an active exam, the browser observes
`document.visibilitychange` and `window` `blur`/`focus` events — nothing
else. No webcam, microphone, or screen capture of any kind. Events are
written live to the `integrity_events` table and shown to the student as a
small, calm status indicator ("Integrity: Monitored" / "Integrity: N
noted") — never a threat, never an auto-submit or auto-fail. Administrators
can view the full chronological trail for any attempt from the gradebook.

---

## Development commands

```bash
npm run dev             # Vite dev server (Supabase mode by default)
npm run build            # Production build -> dist/
npm run preview           # Preview the production build locally
npx tsc --noEmit           # Type-check

npm run supabase:seed       # Create Supabase demo accounts + sample data

npm run server              # Legacy Express backend (SQLite)
npm run seed                 # Reset the legacy SQLite demo database
npm run verify                 # Automated check suite against the legacy backend
```

---

## Production build & Vercel deployment

1. Push this repository to GitHub.
2. In Vercel, **Import Project** from that repo.
3. Vercel auto-detects the build (`npm run build`, output `dist/`) from
   `vercel.json`.
4. Add the four Supabase environment variables from the table above in
   **Project Settings → Environment Variables** (all four — the `VITE_`
   ones for the build, the plain ones for the serverless function).
5. Deploy. The SPA is served statically; `/api/admin-users` runs as a
   serverless function automatically (no server process to manage, no port
   to configure).
6. Run the migrations and `npm run supabase:seed` against your Supabase
   project (from your own machine, using the steps above) before or after
   deploying — they don't depend on Vercel at all.

No localhost-only assumptions remain in the Supabase path: there's no
hardcoded port, no CORS concern (Supabase handles its own CORS), and no
server process for Vercel to keep warm.

---

## Repository hygiene / GitHub readiness

- `.env`, `data/*.db*`, `dist/`, and `node_modules/` are all gitignored —
  verified before every commit in this project's history.
- No secrets, database files, or credentials are committed. The only
  credentials anywhere in this repo are clearly-labeled **local demo**
  values in seed scripts, never real ones.
- `SUPABASE_SECRET_KEY` exists only in your local `.env` and in
  Vercel's environment variable settings — never in source.
