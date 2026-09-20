/**
 * Shared display formatters. Centralised so a date or a duration reads the
 * same way on the student dashboard, the gradebook and the audit log.
 */

/** `mm:ss`, used for exam timers and elapsed-session readouts. */
export const formatClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** `h:mm:ss` for durations that can exceed an hour; falls back to mm:ss. */
export const formatLongClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  if (h === 0) return formatClock(safe);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
};

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
};

export const formatTime = (value: string | Date | null | undefined): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormatter.format(date);
};

/** "in 3 days" / "2 hours ago" — for schedule copy that benefits from context. */
export const formatRelative = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  return rtf.format(Math.round(diffMs / day), 'day');
};

/**
 * Turns a Supabase/Postgres error into something a person can act on.
 * RPC exceptions arrive with the `raise exception` text in `message`, which
 * is already written for humans; anything else gets a safe generic fallback.
 */
export const describeError = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const maybe = err as { message?: unknown; error_description?: unknown };
  if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message;
  if (typeof maybe.error_description === 'string' && maybe.error_description.trim()) {
    return maybe.error_description;
  }
  return fallback;
};
