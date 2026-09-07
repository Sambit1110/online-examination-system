import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DB_PATH;
if (process.env.VERCEL) {
  const TMP_DIR = '/tmp';
  DB_PATH = path.join(TMP_DIR, 'examination.db');
  const bundledDb = path.resolve(__dirname, '../../data/examination.db');
  if (!fs.existsSync(DB_PATH) && fs.existsSync(bundledDb)) {
    try {
      fs.copyFileSync(bundledDb, DB_PATH);
    } catch (e) {
      console.warn('Could not copy bundled DB to /tmp:', e);
    }
  }
} else {
  const DB_DIR = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  DB_PATH = path.join(DB_DIR, 'examination.db');
}

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('PRAGMA notice:', e);
}

// Initialize schema
try {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schemaSql);
  }
} catch (err) {
  console.warn('Schema check notice:', err);
}

// Auto-seed if tables are empty
try {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (!userCount || userCount.count === 0) {
    const { seedDatabase } = await import('./seed.js');
    seedDatabase();
  }
} catch (err) {
  // users table might be empty or being initialized
}

// Helper wrapper functions
export const queryAll = (sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
};

export const queryGet = (sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
};

export const queryRun = (sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
};

export const getDbBackup = () => {
  // Export database data as structured JSON for backup (SAFE-03)
  const tables = ['users', 'examinations', 'questions', 'options', 'exam_attempts', 'answers', 'results', 'audit_logs'];
  const backup = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    institution: 'Adamas University',
    data: {}
  };
  for (const table of tables) {
    backup.data[table] = queryAll(`SELECT * FROM ${table}`);
  }
  return backup;
};

export default db;
