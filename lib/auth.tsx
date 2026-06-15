import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setSentryUser } from '@/lib/sentry';
import type { User as Profile } from '@/types';

type AuthState = {
  session: Session | null;
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] loadProfile error', error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Tie Sentry events to the current user (id only — no PII) so production
  // errors are attributable. Cleared automatically on sign-out.
  useEffect(() => {
    setSentryUser(session?.user?.id ?? null);
  }, [session?.user?.id]);

  const fetchProfileWithRetry = async (userId: string) => {
    let p = await loadProfile(userId);
    if (!p) {
      // The handle_new_user trigger occasionally lags right after signup.
      await new Promise((r) => setTimeout(r, 600));
      p = await loadProfile(userId);
    }
    if (mounted.current) setProfile(p);
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        if (data.session?.user?.id) {
          await fetchProfileWithRetry(data.session.user.id);
        }
      })
      .catch((err) => {
        console.warn('[auth] getSession failed', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return;
      setSession(next ?? null);
      if (next?.user?.id) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          // Defer to avoid deadlocking on Supabase's internal auth lock.
          const uid = next.user.id;
          setTimeout(() => {
            if (mounted.current) fetchProfileWithRetry(uid).catch(() => {});
          }, 0);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile: async () => {
        if (session?.user?.id) await fetchProfileWithRetry(session.user.id);
      },
      signOut: async () => {
        // Clear local state first so the UI updates immediately. On web,
        // supabase.auth.signOut()'s default global scope calls the server's
        // /logout endpoint, which can hang under Chrome (extensions/SW/CORS)
        // and leave the spinner stuck even though the session is gone.
        if (mounted.current) {
          setSession(null);
          setProfile(null);
        }
        // scope: 'local' wipes the AsyncStorage/localStorage session without
        // a network round-trip. Race with a short timeout as a final safety
        // net so the caller's await never blocks the UI.
        try {
          await Promise.race([
            supabase.auth.signOut({ scope: 'local' }),
            new Promise<void>((resolve) => setTimeout(resolve, 1500)),
          ]);
        } catch (e) {
          console.warn('[auth] signOut error', e);
        }
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
