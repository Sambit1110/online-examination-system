import React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** The consequence, stated plainly. Shown above any extra children. */
  message: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for deletions, `primary` for high-impact but non-destructive publishes. */
  tone?: 'danger' | 'primary';
  busy?: boolean;
  busyLabel?: string;
}

/**
 * One confirmation surface for every action that is hard to undo — record
 * deletion, publishing grades to a cohort, exporting the database. Keeping
 * them on a single component means they all get the same focus handling,
 * the same busy state and the same visual weight.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  busyLabel
}) => (
  <Modal
    isOpen={isOpen}
    onClose={busy ? () => undefined : onCancel}
    title={title}
    isDanger={tone === 'danger'}
    footer={
      <>
        <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="spinner spinner-sm spinner-on-solid" aria-hidden="true" />
              {busyLabel || 'Working…'}
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </>
    }
  >
    <div className="confirm-dialog">
      <p className="confirm-dialog__message">{message}</p>
      {children}
    </div>
  </Modal>
);
