// Vercel serverless function — the one piece of this app that genuinely
// cannot run purely client-side: creating/deleting a Supabase Auth user
// requires the service_role key, which must never ship to the browser.
//
// Required server-only environment variables (set in the Vercel project,
// NOT prefixed with VITE_ so they are never bundled into client code):
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

export default async function handler(req, res) {
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: 'Server misconfiguration: SUPABASE_URL / SUPABASE_SECRET_KEY are not set.'
    });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  // A dedicated client per request, holding the service_role key server-side
  // only. Never persists a session — this function is stateless.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .single();

  if (profileError || callerProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrative authorization required.' });
  }

  if (req.method === 'POST') {
    const { name, email, password, role, roll_number, department } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }
    if (role !== 'student' && role !== 'admin') {
      return res.status(400).json({ error: 'Role must be either student or admin.' });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role,
        roll_number: role === 'student' && roll_number ? roll_number.trim() : null,
        department: department ? department.trim() : 'Computer Science and Engineering'
      }
    });

    if (createError) {
      return res.status(400).json({ error: createError.message || 'Failed to create user account.' });
    }

    await admin.from('audit_logs').insert({
      user_id: callerData.user.id,
      action: 'CREATE_USER',
      details: { newUserId: created.user.id, role, email: email.trim().toLowerCase() }
    });

    return res.status(201).json({
      message: 'User created successfully.',
      user: { id: created.user.id, name, email, role }
    });
  }

  if (req.method === 'DELETE') {
    const targetId = req.query?.id;
    if (!targetId) {
      return res.status(400).json({ error: 'User id is required.' });
    }
    if (targetId === callerData.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own administrative account.' });
    }

    // Deleting the auth user cascades to profiles (ON DELETE CASCADE),
    // which cascades to everything that references it in turn.
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
    if (deleteError) {
      return res.status(400).json({ error: deleteError.message || 'Failed to delete user.' });
    }

    await admin.from('audit_logs').insert({
      user_id: callerData.user.id,
      action: 'DELETE_USER',
      details: { deletedUserId: targetId }
    });

    return res.status(200).json({ message: 'User deleted successfully.' });
  }

  res.setHeader('Allow', ['POST', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} not allowed.` });
}
