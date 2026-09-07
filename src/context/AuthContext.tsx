import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const loadProfile = async (session: Session): Promise<User | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, roll_number, department')
    .eq('id', session.user.id)
    .single();

  if (error || !data) {
    console.error('Failed to load user profile:', error);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    email: session.user.email || '',
    role: data.role,
    rollNumber: data.roll_number,
    department: data.department
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    // Restore any existing session on first load (page refresh, new tab, etc.)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        const profile = await loadProfile(session);
        if (!mounted) return;
        setUser(profile);
        setToken(session.access_token);
      }
      setLoading(false);
    });

    // Keep the session in sync across tabs, token refreshes, and sign-outs.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session) {
        const profile = await loadProfile(session);
        if (!mounted) return;
        setUser(profile);
        setToken(session.access_token);
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      // Students may sign in with either their email or roll number.
      const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
        p_identifier: identifier.trim()
      });

      if (resolveError || !resolvedEmail) {
        return { success: false, error: 'Invalid email/roll number or password.' };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password
      });

      if (error) {
        return { success: false, error: 'Invalid email/roll number or password.' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network connection failed' };
    }
  };

  const logout = () => {
    supabase.auth.signOut();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        isStudent: user?.role === 'student'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
