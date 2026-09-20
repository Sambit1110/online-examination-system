import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { AuditLog } from '../../types';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorState';
import { PageHeader } from '../../components/common/PageHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination, clampPage } from '../../components/common/Pagination';
import { SkeletonTable } from '../../components/common/Skeleton';
import { Toolbar, SearchInput, FilterSelect } from '../../components/common/Toolbar';
import { formatDateTime, describeError } from '../../lib/format';
import { Download, Activity, HardDrive, ShieldAlert } from 'lucide-react';

const PAGE_SIZE = 25;
const LOG_LIMIT = 500;

const BACKUP_TABLES = [
  'profiles',
  'examinations',
  'questions',
  'question_options',
  'exam_questions',
  'exam_attempts',
  'submitted_answers',
  'results',
  'integrity_events',
  'audit_logs'
];

export const SystemBackupPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [confirmExportOpen, setConfirmExportOpen] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: logError } = await supabase
        .from('audit_logs')
        .select('log_id:id, action, details, created_at, profiles(name, role)')
        .order('created_at', { ascending: false })
        .limit(LOG_LIMIT);
      if (logError) throw logError;

      setLogs(
        (data || []).map((l: any) => ({
          log_id: l.log_id,
          action: l.action,
          details: typeof l.details === 'string' ? l.details : JSON.stringify(l.details),
          created_at: l.created_at,
          user_id: '',
          user_name: l.profiles?.name,
          user_role: l.profiles?.role
        }))
      );
    } catch (err) {
      setError(describeError(err, 'Could not load the audit trail.'));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, actionFilter]);

  // Filter choices come from the records themselves — a hardcoded list goes
  // stale the moment a new audit action is introduced anywhere in the app.
  const actionOptions = useMemo(() => {
    const unique = Array.from(new Set(logs.map(l => l.action))).sort((a, b) => a.localeCompare(b));
    return [
      { value: '', label: 'All actions' },
      ...unique.map(a => ({ value: a, label: a.replace(/_/g, ' ').toLowerCase() }))
    ];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return logs.filter(l => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (!term) return true;
      return (
        l.action.toLowerCase().includes(term) ||
        l.details.toLowerCase().includes(term) ||
        (l.user_name || '').toLowerCase().includes(term)
      );
    });
  }, [logs, searchTerm, actionFilter]);

  const safePage = clampPage(page, PAGE_SIZE, filteredLogs.length);
  const pagedLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleDownloadBackup = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const results = await Promise.all(BACKUP_TABLES.map(table => supabase.from(table).select('*')));
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

      const rowCount = results.reduce((sum, r) => sum + (r.data?.length || 0), 0);
      toast.success(`Snapshot downloaded — ${rowCount.toLocaleString()} rows across ${BACKUP_TABLES.length} tables.`);
      setConfirmExportOpen(false);
      fetchAuditLogs();
    } catch (err) {
      toast.error(describeError(err, 'Backup generation failed.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Backup &amp; audit trail"
        subtitle="Export a full snapshot of the examination database and review the record of administrative activity."
      />

      <div className="card backup-card">
        <div>
          <div className="backup-card__eyebrow">
            <HardDrive size={15} aria-hidden="true" /> Data recovery
          </div>
          <h2 className="backup-card__title">Export database snapshot</h2>
          <p className="backup-card__desc">
            Downloads every table — accounts, examinations, questions and answer keys, candidate attempts,
            answers, results and audit records — as a single JSON file.
          </p>
          {/* The export is plain JSON. Saying otherwise would give an operator
              a false sense of how safely it can be stored or shared. */}
          <p className="backup-card__warning">
            <ShieldAlert size={13} aria-hidden="true" /> The file is unencrypted and contains personal data
            and answer keys. Store it somewhere access-controlled.
          </p>
        </div>

        <button
          onClick={() => setConfirmExportOpen(true)}
          disabled={downloading}
          className="btn btn-success btn-lg"
        >
          {downloading ? (
            <>
              <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
              Exporting…
            </>
          ) : (
            <>
              <Download size={17} aria-hidden="true" /> Export snapshot
            </>
          )}
        </button>
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <div className="section-head">
          <h2 className="section-head__title" style={{ fontSize: '0.95rem' }}>
            <Activity size={16} color="var(--color-action-hover)" aria-hidden="true" /> Audit trail
          </h2>
          <span className="section-head__meta">
            {loading
              ? 'Loading…'
              : `${filteredLogs.length} of ${logs.length} records${logs.length >= LOG_LIMIT ? ` (most recent ${LOG_LIMIT})` : ''}`}
          </span>
        </div>

        <Toolbar>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search the audit trail"
            placeholder="Search actions, users or details…"
          />
          <FilterSelect
            value={actionFilter}
            onChange={setActionFilter}
            label="Filter by action"
            options={actionOptions}
          />
        </Toolbar>

        {error && <ErrorBanner message={error} onRetry={fetchAuditLogs} />}

        {loading ? (
          <SkeletonTable rows={8} columns={4} label="Loading audit records" />
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={<Activity size={28} strokeWidth={1.5} />}
            title={logs.length === 0 ? 'No audit records yet' : 'No records match these filters'}
            description={
              logs.length === 0
                ? 'Administrative actions are recorded here as they happen.'
                : 'Adjust the search or action filter to see more records.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="academic-table">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">User</th>
                    <th scope="col">Action</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLogs.map(l => (
                    <tr key={l.log_id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {formatDateTime(l.created_at)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{l.user_name || 'System'}</div>
                        <div className="row-meta">{l.user_role || '—'}</div>
                      </td>
                      <td>
                        <span className="action-tag">{l.action}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                        {l.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safePage}
              pageSize={PAGE_SIZE}
              totalItems={filteredLogs.length}
              onPageChange={setPage}
              itemLabel="records"
            />
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmExportOpen}
        onCancel={() => setConfirmExportOpen(false)}
        onConfirm={handleDownloadBackup}
        tone="primary"
        title="Export the full database?"
        confirmLabel="Download snapshot"
        busy={downloading}
        busyLabel="Exporting…"
        message="This downloads a complete copy of the examination database to this computer."
      >
        <div className="confirm-callout">
          <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true" />
          <span>
            The file is <strong>not encrypted</strong>. It includes every candidate&apos;s name, email and
            roll number, all submitted answers, and the correct answer key for every question.
          </span>
        </div>
        <p className="muted-note">
          The export is recorded in the audit trail against your account.
        </p>
      </ConfirmDialog>
    </div>
  );
};
