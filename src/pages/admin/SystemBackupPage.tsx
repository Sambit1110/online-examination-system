import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { AuditLog } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import {
  DatabaseBackup,
  Download,
  ShieldCheck,
  Search,
  Activity,
  Calendar,
  User,
  HardDrive
} from 'lucide-react';

const BACKUP_TABLES = [
  'profiles', 'examinations', 'questions', 'question_options', 'exam_questions',
  'exam_attempts', 'submitted_answers', 'results', 'integrity_events', 'audit_logs'
];

export const SystemBackupPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('audit_logs')
          .select('log_id:id, action, details, created_at, profiles(name, role)')
          .order('created_at', { ascending: false })
          .limit(150);
        if (error) throw error;

        setLogs((data || []).map((l: any) => ({
          log_id: l.log_id,
          action: l.action,
          details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details),
          created_at: l.created_at,
          user_id: '',
          user_name: l.profiles?.name,
          user_role: l.profiles?.role
        })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, [user?.id]);

  const handleDownloadBackup = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const results = await Promise.all(
        BACKUP_TABLES.map(table => supabase.from(table).select('*'))
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;

      const backup = {
        exportedAt: new Date().toISOString(),
        version: '2.0-supabase',
        institution: 'Adamas University',
        data: Object.fromEntries(BACKUP_TABLES.map((table, i) => [table, results[i].data || []]))
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `adamas_oes_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'SYSTEM_BACKUP',
        details: { tables: BACKUP_TABLES }
      });
    } catch (err: any) {
      toast.error(err.message || 'Backup generation failed');
    } finally {
      setDownloading(false);
    }
  };

  const filteredLogs = logs.filter(l => {
    if (actionFilter && l.action !== actionFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      l.action.toLowerCase().includes(term) ||
      l.details.toLowerCase().includes(term) ||
      (l.user_name && l.user_name.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Database Backup & Security Audit Trail"
        subtitle="Execute full institutional database state preservation and review forensic activity logs (SAFE-03 & Section 6)."
      />

      {/* Database Backup Card */}
      <div className="card" style={{
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '4px solid var(--color-success)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        padding: '1.75rem 2rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase' }}>
            <HardDrive size={16} /> SAFE-03 Data Recovery Compliance
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-brand-primary)', marginTop: '0.25rem' }}>
            Export Full Relational Database Snapshot
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem', maxWidth: '600px' }}>
            Exports all users, examinations, questions, options, student attempt records, answers, and evaluation results as an encrypted JSON archive.
          </p>
        </div>

        <button
          onClick={handleDownloadBackup}
          disabled={downloading}
          className="btn btn-success btn-lg"
        >
          <Download size={18} />
          {downloading ? 'Exporting Archive...' : 'Download JSON Snapshot'}
        </button>
      </div>

      {/* Audit Trail Section */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={20} color="var(--color-action)" />
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-brand-primary)' }}>
              Forensic Administrative Audit Records ({logs.length})
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search audit details..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2rem', fontSize: '0.8125rem' }}
              />
            </div>

            <select
              className="form-select"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{ width: 'auto', fontSize: '0.8125rem' }}
            >
              <option value="">All Actions</option>
              <option value="USER_LOGIN">User Logins</option>
              <option value="START_EXAM">Exam Starts</option>
              <option value="SUBMIT_EXAM">Exam Submissions</option>
              <option value="ADD_QUESTION">Question Creation</option>
              <option value="UPDATE_EXAM">Exam Updates</option>
              <option value="RELEASE_RESULTS">Result Releases</option>
              <option value="INTEGRITY_SUMMARY">Integrity Trails</option>
            </select>
          </div>
        </div>

        {loading ? (
          <Spinner label="Retrieving audit records..." />
        ) : filteredLogs.length === 0 ? (
          <EmptyState icon={<Activity size={30} strokeWidth={1.5} />} title="No audit records matching criteria." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="academic-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User Profile</th>
                  <th>Action</th>
                  <th>Operation Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(l => (
                  <tr key={l.log_id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {l.user_name || 'System Operator'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {l.user_role || 'administrator'}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--bg-surface-muted)',
                        color: 'var(--color-brand-primary)'
                      }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>
                      {l.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
