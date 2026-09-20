import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isDanger?: boolean;
  /** Wider shell for content-heavy forms such as the exam scheduler. */
  size?: 'md' | 'lg';
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  isDanger = false,
  size = 'md'
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const focusables = useCallback((): HTMLElement[] => {
    if (!cardRef.current) return [];
    return Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => el.offsetParent !== null || el === document.activeElement
    );
  }, []);

  // Escape to dismiss, and Tab cycling kept inside the dialog so keyboard
  // focus can never wander onto the inert page behind the overlay.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !cardRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, focusables]);

  // Move focus in on open, hand it back to the trigger on close, and stop
  // the page behind from scrolling while the overlay is up.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const items = focusables();
      (items[0] ?? cardRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, focusables]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        ref={cardRef}
        className={`modal-card${size === 'lg' ? ' modal-card--lg' : ''}`}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-card__header">
          <div className="modal-card__heading">
            {isDanger && (
              <AlertTriangle size={20} color="var(--color-danger)" aria-hidden="true" style={{ flexShrink: 0 }} />
            )}
            <h2
              id={titleId}
              className="modal-card__title"
              style={{ color: isDanger ? 'var(--color-danger)' : 'var(--text-main)' }}
            >
              {title}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="icon-btn icon-btn--ghost" type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-card__body">{children}</div>

        {footer && <div className="modal-card__footer">{footer}</div>}
      </div>
    </div>
  );
};
