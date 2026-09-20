import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { describeError } from '../lib/format';
import { User } from '../types';

/**
 * Why a sign-in attempt failed. The distinction matters: a misapplied
 * migration or a bad deployment key is an operations problem, and telling
 * the user "invalid password" for it sends them off to reset a password
 * that was never wrong.
 */
export type LoginFailureKind =
  | 'credentials'
  | 'configuration'
  | 'network'
  | 'rate_limit'
  | 'unconfirmed';

export interface LoginResult {
  success: boolean;
  error?: string;
  kind?: LoginFailureKind;
}

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
  login: (identifier: string, pass: string) => Promise<LoginResult>;
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

  const login = async (identifier: string, password: string): Promise<LoginResult> => {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        kind: 'configuration',
        error:
          'This deployment is missing its Supabase credentials, so sign-in cannot run. This is a configuration problem, not a password problem.'
      };
    }

    const trimmed = identifier.trim();
    const looksLikeEmail = trimmed.includes('@');

    try {
      // Students may sign in with either their email or roll number, so the
      // identifier is resolved to an email first.
      const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
        p_identifier: trimmed
      });

      if (resolveError) {
        // PGRST202 = no such function; 42883 = undefined_function. Both mean
        // the login migration has not been applied to this database, which
        // is an operations problem and must not be reported as a bad password.
        const code = (resolveError as { code?: string }).code;
        if (code === 'PGRST202' || code === '42883') {
          return {
            success: false,
            kind: 'configuration',
            error:
              'The sign-in service is unavailable: the database is missing the resolve_login_email function. Apply the migrations in supabase/migrations/ and try again.'
          };
        }
        return {
          success: false,
          kind: 'configuration',
          error: `The sign-in service could not be reached (${describeError(resolveError, 'unknown error')}).`
        };
      }

      if (!resolvedEmail) {
        // The identifier resolved to nothing. For an email this cannot
        // happen (it passes straight through), so this is always a roll
        // number we could not map — historically because profiles.email was
        // never backfilled. Point at the workaround without confirming
        // whether the roll number exists.
        return {
          success: false,
          kind: 'credentials',
          error: looksLikeEmail
            ? 'Incorrect email or password.'
            : 'We could not sign you in with that roll number. Please try your university email address instead.'
        };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail as string,
        password
      });

      if (error) {
        const code = (error as { code?: string }).code || '';
        const message = error.message || '';

        if (code === 'email_not_confirmed' || /not confirmed/i.test(message)) {
          return {
            success: false,
            kind: 'unconfirmed',
            error:
              'This account’s email address has not been confirmed yet. Ask the Examination Cell to confirm it before signing in.'
          };
        }

        if (error.status === 429 || /rate limit/i.test(message)) {
          return {
            success: false,
            kind: 'rate_limit',
            error: 'Too many sign-in attempts. Please wait a moment and try again.'
          };
        }

        // Anything that is not a recognised auth rejection is far more
        // likely to be a broken deployment than a wrong password.
        if (error.status && error.status >= 500) {
          return {
            success: false,
            kind: 'configuration',
            error: `The authentication service returned an error (${error.status}). This is a server-side problem, not your password.`
          };
        }

        return { success: false, kind: 'credentials', error: 'Incorrect email or password.' };
      }

      return { success: true };
    } catch (err) {
      // A thrown error here is a transport failure — DNS, CORS, offline, or
      // a URL pointing at a project that no longer exists.
      return {
        success: false,
        kind: 'network',
        error: `Could not reach the authentication service. Check your connection and that the portal is configured correctly (${describeError(err, 'network error')}).`
      };
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
