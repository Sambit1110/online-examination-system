import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryGet } from '../db/database.js';
import { authenticate, JWT_SECRET, logAudit } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login (REQ-01 to REQ-07)
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // REQ-07: Validation message when login fields are empty
  if (!email || !password || !email.trim() || !password.trim()) {
    return res.status(400).json({ error: 'Please enter both username/email and password.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  
  // Find user by email or roll_number
  const user = queryGet(
    'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(roll_number) = ?',
    [cleanEmail, cleanEmail]
  );

  // REQ-06: Error message when invalid credentials are entered
  if (!user) {
    return res.status(401).json({ error: 'Invalid email/roll number or password.' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid email/roll number or password.' });
  }

  // REQ-03, REQ-04, REQ-05: Authenticate and issue token
  const token = jwt.sign(
    { userId: user.user_id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  logAudit(user.user_id, 'USER_LOGIN', `User ${user.name} (${user.role}) logged in successfully.`);

  return res.json({
    message: 'Authentication successful',
    token,
    user: {
      id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      rollNumber: user.roll_number,
      department: user.department
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  return res.json({
    user: {
      id: req.user.user_id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      rollNumber: req.user.roll_number,
      department: req.user.department
    }
  });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  logAudit(req.user.user_id, 'USER_LOGOUT', `User ${req.user.name} logged out.`);
  return res.json({ message: 'Logged out successfully' });
});

export default router;
