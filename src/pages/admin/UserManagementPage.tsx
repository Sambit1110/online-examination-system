import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { User } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { Spinner } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import {
  Users,
  UserPlus,
  Trash2,
  GraduationCap,
  Shield,
  Search,
  CheckCircle2,
  Mail,
  BookOpen
} from 'lucide-react';

export const UserManagementPage: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('Computer Science and Engineering');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id:id, name, email, role, roll_number, department')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (profilesError) throw profilesError;

      const { data: attempts } = await supabase.from('exam_attempts').select('user_id');
      const attemptsByUser = new Map<string, number>();
      for (const a of attempts || []) {
        attemptsByUser.set(a.user_id, (attemptsByUser.get(a.user_id) || 0) + 1);
      }

      setUsers((profiles || []).map((p: any) => ({
        ...p,
        attempts_count: attemptsByUser.get(p.user_id) || 0
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleCreateUser = async () => {
    setFormError(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      setFormError('Please fill in all mandatory fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          role,
          roll_number: role === 'student' ? rollNumber.trim() : null,
          department: department.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user account');

      setIsAddModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setRollNumber('');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin-users?id=${encodeURIComponent(deleteTarget.user_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.roll_number && u.roll_number.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="User Accounts & Candidate Registry"
        subtitle="Manage departmental student roster, rolls, and examination controller administrator accounts."
      >
        <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary">
          <UserPlus size={16} /> Enroll New Account
        </button>
      </PageHeader>

      {/* Filter Controls */}
      <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by candidate name, email, or roll..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>

        <select
          className="form-select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '160px' }}
        >
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="admin">Administrators</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner label="Loading user accounts..." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Role</th>
                  <th>Roll / Identifier</th>
                  <th>Department</th>
                  <th>Exam Attempts</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.user_id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-brand-primary)' }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {u.email}
                      </div>
                    </td>
                    <td>
                      <Badge type={u.role === 'admin' ? 'released' : 'live'}>
                        {u.role === 'admin' ? 'Administrator' : 'Student'}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {u.roll_number || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {u.department || 'Computer Science and Engineering'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.attempts_count || 0} Attempts</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {u.user_id !== currentUser?.id && (
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="btn btn-secondary btn-sm"
                          title="Remove user account"
                          aria-label={`Remove account for ${u.name}`}
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD USER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Enroll New Institutional User"
        footer={
          <>
            <button onClick={() => setIsAddModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleCreateUser} disabled={submitting} className="btn btn-primary">
              {submitting ? 'Enrolling...' : 'Create Account'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && <div className="error-banner" role="alert">{formError}</div>}

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Sambit Biswas"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Institutional Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="e.g. sambit.biswas@adamas.ac.in"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Initial Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Account Role</label>
              <select
                className="form-select"
                value={role}
                onChange={e => setRole(e.target.value as any)}
              >
                <option value="student">Student</option>
                <option value="admin">Administrator / Controller</option>
              </select>
            </div>

            {role === 'student' && (
              <div className="form-group">
                <label className="form-label">Roll Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. UG/SOET/30/24/043"
                  value={rollNumber}
                  onChange={e => setRollNumber(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* DELETE USER CONFIRMATION (SAFE-01) */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Account Removal"
        isDanger={true}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleDeleteUser} className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Removing...' : 'Delete Account'}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to remove user <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email})?
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          This will permanently delete the user's account credentials and access rights.
        </p>
      </Modal>
    </div>
  );
};
