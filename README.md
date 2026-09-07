# Adamas University — Online Examination System (OES)

Official Departmental Examination Platform for the Department of Computer Science & Engineering, School of Engineering & Technology (SOET). Built to strict university SRS v1.0 specifications with a clean, human-designed, minimal SaaS user interface.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and set a `JWT_SECRET` (a ready-to-use `.env` is
already included for local development, so this step is only needed if you
delete it or deploy elsewhere):
```bash
cp .env.example .env
```

### 3. Launch the Application
Start the fullstack server (Express + SQLite backend + built static frontend):
```bash
node server/index.js
```
The application will be live at:
**[http://localhost:5000](http://localhost:5000)**

### 4. Frontend Development Server (Optional)
To run the Vite hot-reloading dev server (serves the UI at `http://localhost:5173`
and proxies `/api` requests to the Express backend on port 5000):
```bash
npm run dev
```
This only starts the frontend. Run `npm run server` in a separate terminal
first (or alongside it) so `/api` requests have a backend to reach.

### 5. Build Production Assets
```bash
npm run build
```

### 6. Run Verification Test Suite
```bash
node scripts/verify-all.mjs
```

---

## 🔑 Local Development Accounts

Running `npm run seed` (or first server start, which auto-seeds an empty database)
creates a demo student account and a demo administrator account so you can log
in locally right away. See [server/db/seed.js](server/db/seed.js) for the exact
email addresses and passwords it creates.

These seeded credentials are for local development only — do not reuse them,
and do not rely on them, in any shared or public deployment.

---

## 🏗️ Architecture & Features

- **Backend**: Node.js & Express with native `node:sqlite` (zero external C++ bindings, WAL journaling enabled).
- **Security & Integrity**: JWT authentication, role-based route guard, client-side answer key quarantine, automated timeout auto-submit, post-submission lock.
- **Frontend**: React 18 with TypeScript, Vite, Vanilla CSS design tokens (`Inter` & `Plus Jakarta Sans`), minimal SaaS layout.
- **Data Persistence**: `data/examination.db` with full backup export capability (`SAFE-03`).
