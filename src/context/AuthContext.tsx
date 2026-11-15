import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, isSupabaseReachable } from '../lib/supabaseClient';
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
  | 'unconfirmed'
  | 'role';

/** The portal a sign-in attempt was made through. */
export type PortalRole = 'student' | 'admin';

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
  /**
   * True when the Supabase project could not be reached at all on boot
   * (paused project, DNS failure, offline). The login screen says so up
   * front instead of letting someone type a password into a dead service.
   */
  serviceUnreachable: boolean;
  /** Re-checks the connection; clears `serviceUnreachable` when it is back. */
  recheckService: () => Promise<boolean>;
  login:(identifier: string, pass: string, expectedRole: PortalRole) => Promise<LoginResult>;
  /**
   * True while a sign-in is mid role-verification. The auth listener fires
   * as soon as Supabase accepts the password, so without this the app would
   * flash the dashboard for a moment before a wrong-portal sign-in is undone.
   */
  portalCheckPending: boolean;
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
  const [portalCheckPending, setPortalCheckPending] = useState(false);
  const [serviceUnreachable, setServiceUnreachable] = useState(false);

  const recheckService = async () => {
    const reachable = await isSupabaseReachable();
    setServiceUnreachable(!reachable);
    return reachable;
  };

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

    // Checked in parallel with session restore so a dead backend is
    // reported within seconds rather than after auth's own retries.
    isSupabaseReachable().then(reachable => {
      if (!mounted) return;
      setServiceUnreachable(!reachable);
      if (!reachable) setLoading(false);
    });

    // Restoring a stored session can stall while auth retries a token
    // refresh against an unreachable server. Never hold the boot screen
    // longer than this; the login page then explains what is wrong.
    const bootTimeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8_000);

    // Restore any existing session on first load (page refresh, new tab, etc.)
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        if (session) await applySession(session);
      })
      .catch(err => {
        console.error('Session restore failed:', err);
      })
      .finally(() => {
        window.clearTimeout(bootTimeout);
        if (mounted) setLoading(false);
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

  const login = async (
    identifier: string,
    password: string,
    expectedRole: PortalRole
  ): Promise<LoginResult> => {
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

      setPortalCheckPending(true);

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail as string,
        password
      });

      if (error) {
        setPortalCheckPending(false);
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

      // ------------------------------------------------------------------
      // Portal authorisation.
      //
      // The password was correct, so the caller is who they say they are —
      // but that does not mean they may use *this* portal. The role is read
      // back from the profiles table under RLS (a session may only read its
      // own row), never from anything the client supplied. A mismatch ends
      // the session immediately rather than leaving a half-signed-in state.
      // ------------------------------------------------------------------
      const signedInId = signInData.user?.id;
      const { data: profileRow, error: roleError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signedInId)
        .single();

      if (roleError || !profileRow) {
        await supabase.auth.signOut();
        setPortalCheckPending(false);
        return {
          success: false,
          kind: 'configuration',
          error:
            'Signed in, but your portal profile could not be read, so access could not be authorised. Please contact the Examination Cell.'
        };
      }

      const actualRole = profileRow.role as PortalRole;
      if (actualRole !== expectedRole) {
        await supabase.auth.signOut();
        setPortalCheckPending(false);
        return {
          success: false,
          kind: 'role',
          error:
            expectedRole === 'student'
              ? 'This account belongs to an administrator. Please use Admin Login.'
              : 'This account is not authorized for administrator access.'
        };
      }

      setPortalCheckPending(false);
      return { success: true };
    } catch (err) {
      setPortalCheckPending(false);
      // A thrown error here is a transport failure — DNS, CORS, offline, or
      // a URL pointing at a project that no longer exists. The raw browser
      // message ("TypeError: Failed to fetch") means nothing to a student,
      // so it goes to the console and the screen gets plain words.
      console.error('Sign-in request failed:', describeError(err, 'network error'));
      return {
        success: false,
        kind: 'network',
        error:
          "The exam server can't be reached right now, so you can't sign in yet. Check your internet connection and try again in a minute."
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
        serviceUnreachable,
        recheckService,
        portalCheckPending,
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
