import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GraduationCap,
  LogOut,
  LayoutDashboard,
  FileQuestion,
  CalendarDays,
  Award,
  Users,
  DatabaseBackup,
  Menu,
  X
} from 'lucide-react';

interface AdminRailProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

const SECTIONS: Array<{
  label: string;
  items: Array<{ view: string; label: string; icon: React.ReactNode }>;
}> = [
  {
    label: 'Overview',
    items: [{ view: 'admin-dashboard', label: 'Console', icon: <LayoutDashboard size={15} /> }]
  },
  {
    label: 'Assessment',
    items: [
      { view: 'admin-exams', label: 'Examinations', icon: <CalendarDays size={15} /> },
      { view: 'admin-questions', label: 'Question bank', icon: <FileQuestion size={15} /> },
      { view: 'admin-results', label: 'Gradebook', icon: <Award size={15} /> }
    ]
  },
  {
    label: 'Administration',
    items: [
      { view: 'admin-users', label: 'Accounts', icon: <Users size={15} /> },
      { view: 'admin-backup', label: 'Backup & audit', icon: <DatabaseBackup size={15} /> }
    ]
  }
];

const isActive = (item: { view: string }, currentView: string) =>
  currentView === item.view || (item.view === 'admin-dashboard' && currentView === 'default');

/**
 * Persistent left rail for the administrative console. A console has a
 * stable set of destinations that operators move between constantly, so
 * they stay visible rather than hiding behind a menu.
 */
export const AdminRail: React.FC<AdminRailProps> = ({ currentView, setCurrentView }) => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user) return null;

  const initials =
    user.name
      .split(' ')
      .map(p => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A';

  const go = (view: string) => {
    setCurrentView(view);
    setOpen(false);
  };

  return (
    <>
      {/* Compact bar that only exists once the rail collapses. */}
      <div className="rail-topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="admin-rail"
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
        <span className="rail-topbar__title">Examination console</span>
      </div>

      {open && <div className="rail-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="admin-rail" className="rail" data-open={open} aria-label="Console navigation">
        <button type="button" className="rail__brand" onClick={() => go('admin-dashboard')}>
          <span className="rail__mark" aria-hidden="true">
            <GraduationCap size={16} />
          </span>
          <span className="rail__brand-text">
            <span className="rail__brand-name">Adamas University</span>
            <span className="rail__brand-sub">Examination console</span>
          </span>
        </button>

        <nav className="rail__nav">
          {SECTIONS.map(section => (
            <div className="rail__section" key={section.label}>
              <div className="rail__section-label">{section.label}</div>
              {section.items.map(item => {
                const active = isActive(item, currentView);
                return (
                  <button
                    key={item.view}
                    type="button"
                    className="rail__item"
                    data-active={active}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(item.view)}
                  >
                    <span className="rail__item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="rail__footer">
          <div className="rail__user">
            <span className="rail__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="rail__user-text">
              <span className="rail__user-name">{user.name}</span>
              <span className="rail__user-role">Administrator</span>
            </span>
          </div>
          <button type="button" onClick={logout} className="btn btn-secondary btn-sm rail__signout">
            <LogOut size={13} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
};
