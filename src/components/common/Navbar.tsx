import React, { useState } from 'react';
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

  if (!user) return null;

  const studentItems: NavItem[] = [
    {
      view: 'student-dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={14} />,
      isActive: v => v === 'default' || v === 'student-dashboard'
    },
    {
      view: 'student-results',
      label: 'Results',
      icon: <Award size={14} />,
      isActive: v => v === 'student-results'
    }
  ];

  const adminItems: NavItem[] = [
    {
      view: 'admin-dashboard',
      label: 'Overview',
      icon: <LayoutDashboard size={14} />,
      isActive: v => v === 'default' || v === 'admin-dashboard'
    },
    {
      view: 'admin-questions',
      label: 'Questions',
      icon: <FileQuestion size={14} />,
      isActive: v => v === 'admin-questions'
    },
    {
      view: 'admin-exams',
      label: 'Exams',
      icon: <CalendarDays size={14} />,
      isActive: v => v === 'admin-exams'
    },
    {
      view: 'admin-results',
      label: 'Grades',
      icon: <Award size={14} />,
      isActive: v => v === 'admin-results'
    },
    {
      view: 'admin-users',
      label: 'Users',
      icon: <Users size={14} />,
      isActive: v => v === 'admin-users'
    },
    {
      view: 'admin-backup',
      label: 'Maintenance',
      icon: <DatabaseBackup size={14} />,
      isActive: v => v === 'admin-backup'
    }
  ];

  const items = isStudent ? studentItems : (isAdmin ? adminItems : []);

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
    <header style={{
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        minHeight: '54px',
        gap: '1rem'
      }}>
        {/* Brand Identity */}
        <div
          onClick={() => handleNavigate(isAdmin ? 'admin-dashboard' : 'student-dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}
        >
          <div style={{
            width: '1.75rem',
            height: '1.75rem',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'var(--color-action)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}>
            <GraduationCap size={15} />
          </div>
          <div>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              lineHeight: 1.2
            }}>
              Adamas University
            </div>
            <div style={{
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              lineHeight: 1.1
            }}>
              Online Examination Portal
            </div>
          </div>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="nav-toggle"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Navigation Links */}
        <nav className="nav-links" data-closed={!mobileOpen}>
          {items.map(item => {
            const active = item.isActive(currentView);
            return (
              <button
                key={item.view}
                onClick={() => handleNavigate(item.view)}
                data-active={active}
                style={{
                  height: '100%',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--color-action)' : '2px solid transparent',
                  color: active ? 'var(--text-main)' : 'var(--text-secondary)',
                  padding: '0 0.65rem',
                  fontSize: '0.8125rem',
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'color 0.12s ease'
                }}
              >
                {item.icon} {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Status & Sign Out */}
        <div className="nav-user">
          <div className="nav-avatar" title={user.name}>{initials || 'U'}</div>
          <div className="nav-user-info" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {user.role === 'admin' ? 'Administrator' : (user.rollNumber || 'Student')}
            </div>
          </div>

          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            title="Sign out of portal"
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
