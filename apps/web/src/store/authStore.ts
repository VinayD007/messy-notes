import type { Session, User } from '@supabase/supabase-js';
import { formatSupabaseAuthError } from '@messy-notes/shared';
import { create } from 'zustand';
import { clearWebLocalData } from '../lib/localDb';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfig,
  SUPABASE_CONFIG_ERROR,
} from '../lib/supabase';
import { webSyncEngine } from '../sync/webSyncEngine';

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

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (data.session?.access_token) {
          void supabase.realtime.setAuth(data.session.access_token);
        }
        set({
          session: data.session ?? null,
          user: data.session?.user ?? null,
          initialized: true,
          error: error
            ? formatSupabaseAuthError(error, 'Session restore failed', supabaseConfig.maskedUrl)
            : null,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        set({
          session: null,
          user: null,
          initialized: true,
          error: formatSupabaseAuthError(err, 'Session restore failed', supabaseConfig.maskedUrl),
        });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
      set({
        session: session ?? null,
        user: session?.user ?? null,
        initialized: true,
      });
    });

    return () => {
      active = false;
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
        set({
          loading: false,
          error: formatSupabaseAuthError(error, 'Sign-in failed', supabaseConfig.maskedUrl),
        });
        throw error;
      }

      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: formatSupabaseAuthError(err, 'Sign-in failed', supabaseConfig.maskedUrl),
      });
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
        set({
          loading: false,
          error: formatSupabaseAuthError(error, 'Sign-up failed', supabaseConfig.maskedUrl),
        });
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
      set({
        loading: false,
        error: formatSupabaseAuthError(err, 'Sign-up failed', supabaseConfig.maskedUrl),
      });
      throw err;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    webSyncEngine.stop();
    await clearWebLocalData();
    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ session: null, user: null, loading: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
