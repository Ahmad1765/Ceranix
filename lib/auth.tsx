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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session?.user?.id) {
        await fetchProfileWithRetry(data.session.user.id);
      }
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!mounted.current) return;
      setSession(next ?? null);
      if (next?.user?.id) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          await fetchProfileWithRetry(next.user.id);
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
        await supabase.auth.signOut();
        if (mounted.current) {
          setSession(null);
          setProfile(null);
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
