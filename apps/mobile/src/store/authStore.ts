import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { clearAllLocalData } from '../lib/mmkvStorage';
import {
  isSupabaseConfigured,
  registerSupabaseAppStateRefresh,
  supabase,
  SUPABASE_CONFIG_ERROR,
} from '../lib/supabase';
import { syncEngine } from '../sync/syncEngine';

interface AuthState {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

function formatAuthErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
        ? err.message
        : fallback;

  if (/network request failed/i.test(raw)) {
    return 'Network request failed while connecting to Supabase. Check your internet/DNS connection (if your ISP blocks supabase.co, try Private DNS or another network) and retry.';
  }
  return raw;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,
  loading: false,
  error: null,

  initialize: () => {
    if (!isSupabaseConfigured) {
      set({
        session: null,
        user: null,
        initialized: true,
        error: SUPABASE_CONFIG_ERROR,
      });
      return () => {};
    }

    let active = true;
    const stopAppStateRefresh = registerSupabaseAppStateRefresh();

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        set({
          session: data.session ?? null,
          user: data.session?.user ?? null,
          initialized: true,
          error: error ? error.message : null,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        set({
          session: null,
          user: null,
          initialized: true,
          error: err instanceof Error ? err.message : 'Failed to initialize session',
        });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      set({
        session: session ?? null,
        user: session?.user ?? null,
        initialized: true,
      });
    });

    return () => {
      active = false;
      stopAppStateRefresh();
      subscription.unsubscribe();
    };
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) {
      set({ loading: false, error: SUPABASE_CONFIG_ERROR });
      throw new Error(SUPABASE_CONFIG_ERROR);
    }

    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const message = formatAuthErrorMessage(error, 'Sign-in failed');
        set({ loading: false, error: message });
        throw error;
      }

      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: formatAuthErrorMessage(err, 'Sign-in failed') });
      throw err;
    }
  },

  signUp: async (email, password) => {
    if (!isSupabaseConfigured) {
      set({ loading: false, error: SUPABASE_CONFIG_ERROR });
      throw new Error(SUPABASE_CONFIG_ERROR);
    }

    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        const message = formatAuthErrorMessage(error, 'Sign-up failed');
        set({ loading: false, error: message });
        throw error;
      }

      set({
        session: data.session ?? null,
        user: data.user ?? null,
        loading: false,
        error: null,
      });

      return { needsEmailConfirmation: !data.session };
    } catch (err) {
      set({ loading: false, error: formatAuthErrorMessage(err, 'Sign-up failed') });
      throw err;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    syncEngine.stop();
    await clearAllLocalData();

    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({ session: null, user: null, loading: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
