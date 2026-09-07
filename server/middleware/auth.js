import jwt from 'jsonwebtoken';
import { queryGet, queryRun } from '../db/database.js';

export const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Set it in your environment or in a .env file before starting the server.'
  );
}

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists in database
    const user = queryGet('SELECT user_id, name, email, role, roll_number, department FROM users WHERE user_id = ?', [decoded.userId]);
    if (!user) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrative authorization required.' });
  }
  next();
};

export const requireStudent = (req, res, next) => {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Student account required.' });
  }
  next();
};

export const logAudit = (userId, action, details) => {
  try {
    const logId = 'LOG-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    queryRun(
      'INSERT INTO audit_logs (log_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [logId, userId, action, typeof details === 'object' ? JSON.stringify(details) : String(details)]
    );
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};
