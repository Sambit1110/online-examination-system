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

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

interface NavItem {
  view: string;
  label: string;
  icon: React.ReactNode;
  isActive: (view: string) => boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setCurrentView }) => {
  const { user, logout, isAdmin, isStudent } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the mobile menu, matching the dialog convention used
  // everywhere else in the app.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  if (!user) return null;

  const studentItems: NavItem[] = [
    {
      view: 'student-dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={14} aria-hidden="true" />,
      isActive: v => v === 'default' || v === 'student-dashboard'
    },
    {
      view: 'student-results',
      label: 'Results',
      icon: <Award size={14} aria-hidden="true" />,
      isActive: v => v === 'student-results'
    }
  ];

  const adminItems: NavItem[] = [
    {
      view: 'admin-dashboard',
      label: 'Overview',
      icon: <LayoutDashboard size={14} aria-hidden="true" />,
      isActive: v => v === 'default' || v === 'admin-dashboard'
    },
    {
      view: 'admin-questions',
      label: 'Questions',
      icon: <FileQuestion size={14} aria-hidden="true" />,
      isActive: v => v === 'admin-questions'
    },
    {
      view: 'admin-exams',
      label: 'Exams',
      icon: <CalendarDays size={14} aria-hidden="true" />,
      isActive: v => v === 'admin-exams'
    },
    {
      view: 'admin-results',
      label: 'Gradebook',
      icon: <Award size={14} aria-hidden="true" />,
      isActive: v => v === 'admin-results'
    },
    {
      view: 'admin-users',
      label: 'Users',
      icon: <Users size={14} aria-hidden="true" />,
      isActive: v => v === 'admin-users'
    },
    {
      view: 'admin-backup',
      label: 'Backup',
      icon: <DatabaseBackup size={14} aria-hidden="true" />,
      isActive: v => v === 'admin-backup'
    }
  ];

  const items = isStudent ? studentItems : isAdmin ? adminItems : [];

  const initials = user.name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    setMobileOpen(false);
  };

  return (
    <header className={`navbar-glass${scrolled ? ' is-scrolled' : ''}`}>
      <div className="navbar-inner">
        <button
          type="button"
          className="nav-brand"
          onClick={() => handleNavigate(isAdmin ? 'admin-dashboard' : 'student-dashboard')}
        >
          <span className="nav-brand__mark" aria-hidden="true">
            <GraduationCap size={15} />
          </span>
          <span className="nav-brand__text">
            <span className="nav-brand__name">Adamas University</span>
            <span className="nav-brand__sub">Online Examination System</span>
          </span>
        </button>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>

        <nav className="nav-links" id="primary-navigation" data-closed={!mobileOpen} aria-label="Primary">
          {items.map(item => {
            const active = item.isActive(currentView);
            return (
              <button
                key={item.view}
                type="button"
                className="nav-item"
                onClick={() => handleNavigate(item.view)}
                data-active={active}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon} {item.label}
              </button>
            );
          })}
        </nav>

        <div className="nav-user">
          <span className="nav-avatar" aria-hidden="true">
            {initials || 'U'}
          </span>
          <div className="nav-user-info">
            <div className="nav-user-info__name">{user.name}</div>
            <div className="nav-user-info__meta">
              {user.role === 'admin' ? 'Administrator' : user.rollNumber || 'Student'}
            </div>
          </div>

          <button onClick={logout} className="btn btn-secondary btn-sm" type="button">
            <LogOut size={13} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
