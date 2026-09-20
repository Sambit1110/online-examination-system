import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { PageHeader } from '../../components/common/PageHeader';
import { StatTile } from '../../components/common/StatTile';
import { Pagination, clampPage } from '../../components/common/Pagination';
import { SkeletonTable } from '../../components/common/Skeleton';
import { Toolbar, SearchInput, FilterSelect } from '../../components/common/Toolbar';
import { describeError } from '../../lib/format';
import { UserPlus, Trash2, Users, Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 20;
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_DEPARTMENT = 'Computer Science and Engineering';

interface UserRow {
  user_id: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  roll_number: string | null;
  department: string | null;
  attempts_count: number;
}

export const UserManagementPage: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id:id, name, email, role, roll_number, department, exam_attempts(count)')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (profilesError) throw profilesError;

      setUsers(
        (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          role: p.role,
          roll_number: p.roll_number,
          department: p.department,
          attempts_count: p.exam_attempts?.[0]?.count ?? 0
        }))
      );
    } catch (err) {
      setError(describeError(err, 'Could not load user accounts.'));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, roleFilter]);

  const departments = useMemo(() => {
    const set = new Set<string>([DEFAULT_DEPARTMENT]);
    users.forEach(u => u.department && set.add(u.department));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.roll_number || '').toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, roleFilter]);

  const counts = useMemo(
    () => ({
      students: users.filter(u => u.role === 'student').length,
      admins: users.filter(u => u.role === 'admin').length
    }),
    [users]
  );

  const safePage = clampPage(page, PAGE_SIZE, filteredUsers.length);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openAddModal = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setRole('student');
    setRollNumber('');
    setDepartment(DEFAULT_DEPARTMENT);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateUser = async () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError('Please enter the account holder’s full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`The initial password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (role === 'student' && !rollNumber.trim()) {
      setFormError('Students need a roll number — it is one of the two ways they can sign in.');
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
          password,
          role,
          roll_number: role === 'student' ? rollNumber.trim() : null,
          department: department.trim() || DEFAULT_DEPARTMENT
        })
      });

      // The endpoint is a serverless function; a non-JSON body means it is
      // not reachable (e.g. plain `vite dev`), which deserves a clearer
      // message than "Unexpected token <".
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          'The account service did not respond. It runs as a serverless function — use `vercel dev` locally, or try again on the deployed site.'
        );
      }

      if (!res.ok) throw new Error(data.error || 'Failed to create the account.');

      setIsAddModalOpen(false);
      toast.success(`${role === 'admin' ? 'Administrator' : 'Student'} account created for ${name.trim()}.`);
      fetchUsers();
    } catch (err) {
      setFormError(describeError(err, 'Failed to create the account.'));
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

      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('The account service did not respond. Please try again.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to delete the account.');

      toast.success(`Account for ${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(describeError(err, 'Failed to delete the account.'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasFilters = !!(searchTerm || roleFilter);

  return (
    <div className="section-stack">
      <PageHeader
        title="User accounts"
        subtitle="Manage the candidate roster and examination-staff accounts for the department."
      >
        <button onClick={openAddModal} className="btn btn-primary">
          <UserPlus size={16} aria-hidden="true" /> New account
        </button>
      </PageHeader>

      {!loading && users.length > 0 && (
        <div className="stat-grid">
          <StatTile
            className="animate-slide-up stagger-1"
            label="Students"
            value={counts.students}
            meta="Enrolled candidates"
            icon={<Users size={16} />}
          />
          <StatTile
            className="animate-slide-up stagger-2"
            label="Administrators"
            value={counts.admins}
            meta="Examination staff"
            icon={<Shield size={16} />}
          />
        </div>
      )}

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <Toolbar>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search accounts by name, email or roll number"
            placeholder="Search accounts…"
          />
          <FilterSelect
            value={roleFilter}
            onChange={setRoleFilter}
            label="Filter by role"
            options={[
              { value: '', label: 'All roles' },
              { value: 'student', label: 'Students' },
              { value: 'admin', label: 'Administrators' }
            ]}
          />
        </Toolbar>

        {error && <ErrorBanner message={error} onRetry={fetchUsers} />}

        {loading ? (
          <SkeletonTable rows={6} columns={5} label="Loading accounts" />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            title={hasFilters ? 'No accounts match these filters' : 'No accounts yet'}
            description={
              hasFilters
                ? 'Adjust the search or role filter to see more accounts.'
                : 'Create the first account to populate the registry.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Role</th>
                    <th scope="col">Roll number</th>
                    <th scope="col">Department</th>
                    <th scope="col">Attempts</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map(u => {
                    const isSelf = u.user_id === currentUser?.id;
                    return (
                      <tr key={u.user_id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {u.name}
                            {isSelf && <span className="self-tag">You</span>}
                          </div>
                          <div className="row-meta">{u.email}</div>
                        </td>
                        <td>
                          <Badge type={u.role === 'admin' ? 'released' : 'live'}>
                            {u.role === 'admin' ? 'Administrator' : 'Student'}
                          </Badge>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                          {u.roll_number || '—'}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {u.department || '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                          {u.attempts_count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row-actions">
                            {/* Disabled-with-reason beats hiding the control: the
                                admin can see the rule rather than wonder. */}
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="icon-btn icon-btn--danger"
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? 'You cannot delete your own account'
                                  : `Delete the account for ${u.name}`
                              }
                              aria-label={
                                isSelf
                                  ? 'You cannot delete your own account'
                                  : `Delete the account for ${u.name}`
                              }
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safePage}
              pageSize={PAGE_SIZE}
              totalItems={filteredUsers.length}
              onPageChange={setPage}
              itemLabel="accounts"
            />
          </>
        )}
      </div>

      {/* CREATE ACCOUNT */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => (submitting ? undefined : setIsAddModalOpen(false))}
        title="Create account"
        footer={
          <>
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button onClick={handleCreateUser} disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <>
                  <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </>
        }
      >
        <div className="form-stack">
          {formError && <ErrorBanner message={formError} />}

          <div className="form-group">
            <label className="form-label" htmlFor="u-name">
              Full name
            </label>
            <input
              id="u-name"
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="u-email">
              Institutional email
            </label>
            <input
              id="u-email"
              type="email"
              className="form-input"
              placeholder="name@adamasuniversity.ac.in"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="u-password">
              Initial password
            </label>
            <div className="input-affix">
              <input
                id="u-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input input-affix__field--trailing"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-affix__action"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
            </div>
            <p className="form-hint">
              At least {MIN_PASSWORD_LENGTH} characters. Share it with the account holder over a trusted
              channel and ask them to change it after their first sign-in.
            </p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="u-role">
                Role
              </label>
              <select
                id="u-role"
                className="form-select"
                value={role}
                onChange={e => setRole(e.target.value as 'student' | 'admin')}
              >
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            {role === 'student' && (
              <div className="form-group">
                <label className="form-label" htmlFor="u-roll">
                  Roll number
                </label>
                <input
                  id="u-roll"
                  type="text"
                  className="form-input"
                  placeholder="e.g. UG/SOET/30/24/043"
                  value={rollNumber}
                  onChange={e => setRollNumber(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="u-department">
              Department
            </label>
            <input
              id="u-department"
              type="text"
              className="form-input"
              list="u-department-options"
              value={department}
              onChange={e => setDepartment(e.target.value)}
            />
            <datalist id="u-department-options">
              {departments.map(d => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          {/* Granting administrator rights is materially different from
              adding a candidate, so it is called out explicitly. */}
          {role === 'admin' && (
            <div className="confirm-callout">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
              <span>
                Administrators can author questions, schedule examinations, view every candidate&apos;s
                results, release grades and export the full database. Only grant this to examination staff.
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* DELETE ACCOUNT */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Delete account"
        confirmLabel="Delete account"
        busy={submitting}
        busyLabel="Deleting…"
        message={
          <>
            <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) will be permanently removed and
            will no longer be able to sign in.
          </>
        }
      >
        {(deleteTarget?.attempts_count ?? 0) > 0 && (
          <div className="confirm-callout confirm-callout--danger">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
            <span>
              This candidate has <strong>{deleteTarget?.attempts_count}</strong> examination attempt
              {deleteTarget?.attempts_count === 1 ? '' : 's'}. Deleting the account also removes those
              attempts, their answers and their results. This cannot be undone.
            </span>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};
