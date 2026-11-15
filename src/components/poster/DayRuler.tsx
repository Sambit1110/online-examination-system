import React, { useEffect, useState } from 'react';

const HOURS = Array.from({ length: 25 }, (_, h) => h);

const formatClock = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Today drawn to scale: a 24-hour rule with the elapsed part of the day as
 * a solid bar. The bar's length is the real time of day, so the graphic is
 * a fact, not decoration. Updates once a minute.
 */
export const DayRuler: React.FC<{ className?: string }> = ({ className }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = now.getHours() * 60 + now.getMinutes();
  const fraction = minutes / (24 * 60);

  return (
    <figure className={`day-ruler${className ? ` ${className}` : ''}`} aria-label={`Today, ${formatClock(now)}`}>
      <p className="day-ruler__clock" aria-hidden="true">
        {formatClock(now)}
      </p>
      <div className="day-ruler__track">
        <div className="day-ruler__elapsed" style={{ '--fraction': fraction } as React.CSSProperties} />
        <div className="day-ruler__now" style={{ left: `${fraction * 100}%` }}>
          <span
            className={`day-ruler__now-label${fraction > 0.85 ? ' is-end' : fraction < 0.15 ? ' is-start' : ''}`}
          >
            Now {formatClock(now)}
          </span>
        </div>
      </div>
      <div className="day-ruler__ticks" aria-hidden="true">
        {HOURS.map(h => (
          <span
            key={h}
            className={`day-ruler__tick${h % 6 === 0 ? ' is-major' : ''}`}
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h % 6 === 0 && <span className="day-ruler__hour">{String(h).padStart(2, '0')}</span>}
          </span>
        ))}
      </div>
    </figure>
  );
};
