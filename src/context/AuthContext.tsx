import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  /**
   * Set when Supabase Auth accepted the session but the matching `profiles`
   * row could not be read. Without this the app silently renders the login
   * screen for an already-signed-in user, who then logs in again into the
   * same dead end.
   */
  profileError: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type ProfileLoad = { user: User; error: null } | { user: null; error: string };

const loadProfile = async (session: Session): Promise<ProfileLoad> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, roll_number, department')
    .eq('id', session.user.id)
    .single();

  if (error || !data) {
    console.error('Failed to load user profile:', error);
    return {
      user: null,
      error:
        'Your account is signed in, but its portal profile could not be loaded. Please contact the Examination Cell so your record can be verified.'
    };
  }

  return {
    user: {
      id: data.id,
      name: data.name,
      email: session.user.email || '',
      role: data.role,
      rollNumber: data.roll_number,
      department: data.department
    },
    error: null
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    // Without credentials every call would fail against a placeholder host;
    // App renders the configuration screen instead.
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const applySession = async (session: Session) => {
      const { user: profile, error } = await loadProfile(session);
      if (!mounted) return;
      setUser(profile);
      setProfileError(error);
      setToken(session.access_token);
    };

    // Restore any existing session on first load (page refresh, new tab, etc.)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session) await applySession(session);
      if (!mounted) return;
      setLoading(false);
    });

    // Keep the session in sync across tabs, token refreshes, and sign-outs.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // A silent token refresh carries the same identity we already resolved;
      // re-querying `profiles` on every refresh would add a request per hour
      // per open tab for no new information.
      if (event === 'TOKEN_REFRESHED' && session) {
        setToken(session.access_token);
        return;
      }

      if (session) {
        await applySession(session);
      } else {
        setUser(null);
        setToken(null);
        setProfileError(null);
      }
      if (!mounted) return;
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

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
    setProfileError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        profileError,
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
