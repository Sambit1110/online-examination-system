import React from 'react';

const clock = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

const span = (ms: number) => {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

interface Props {
  start: string;
  end: string;
  /** 'open' draws elapsed time and what remains; 'upcoming' shows the wait. */
  state: 'open' | 'upcoming';
}

/**
 * An exam's access window drawn to scale: the bar's full length is the
 * window, the solid part is the time already gone. Length is the fact.
 */
export const ExamWindowBar: React.FC<Props> = ({ start, end, state }) => {
  const now = Date.now();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const total = Math.max(1, endMs - startMs);
  const fraction = state === 'open' ? Math.min(1, Math.max(0, (now - startMs) / total)) : 0;

  const caption =
    state === 'open' ? `Closes in ${span(endMs - now)}` : `Opens in ${span(startMs - now)}`;

  return (
    <div className={`window-bar window-bar--${state}`}>
      <div className="window-bar__caption">{caption}</div>
      <div
        className="window-bar__track"
        role="img"
        aria-label={`Window ${clock(start)} to ${clock(end)}. ${caption}.`}
      >
        <div className="window-bar__elapsed" style={{ '--fraction': fraction } as React.CSSProperties} />
      </div>
      <div className="window-bar__ends" aria-hidden="true">
        <span>{clock(start)}</span>
        <span>{clock(end)}</span>
      </div>
    </div>
  );
};
