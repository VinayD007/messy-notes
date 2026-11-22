import type { Session, User } from '@supabase/supabase-js';
import { formatSupabaseAuthError } from '@messy-notes/shared';
import { create } from 'zustand';
import { clearAllLocalData, getCachedUser, setCachedUser } from '../lib/mmkvStorage';
import {
  isSupabaseConfigured,
  registerSupabaseAppStateRefresh,
  supabase,
  supabaseConfig,
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
  continueOffline: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  initialized: false,
  loading: false,
  error: null,

  initialize: () => {
    // If we have an existing local cached user, immediately restore them so the app opens instantly offline
    const cached = getCachedUser();
    if (cached) {
      set({
        session: null,
        user: cached as unknown as User,
        initialized: true,
        error: null,
      });
    }

    if (!isSupabaseConfigured) {
      set({
        session: null,
        user: cached ? (cached as unknown as User) : null,
        initialized: true,
        error: cached ? null : SUPABASE_CONFIG_ERROR,
      });
      return () => {};
    }

    let active = true;
    const stopAppStateRefresh = registerSupabaseAppStateRefresh();

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (data.session?.access_token) {
          void supabase.realtime.setAuth(data.session.access_token);
        }
        if (data.session?.user) {
          setCachedUser(data.session.user);
        }
        set({
          session: data.session ?? null,
          user: data.session?.user ?? (get().user ?? (cached as unknown as User) ?? null),
          initialized: true,
          error: error
            ? formatSupabaseAuthError(error, 'Failed to initialize session', supabaseConfig.maskedUrl)
            : null,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        // Never lock an offline user out if we already have local session / cached profile
        const fallbackUser = get().user ?? (cached as unknown as User) ?? null;
        set({
          session: null,
          user: fallbackUser,
          initialized: true,
          error: fallbackUser
            ? null
            : formatSupabaseAuthError(
                err,
                'Failed to initialize session',
                supabaseConfig.maskedUrl
              ),
        });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
      if (session?.user) {
        setCachedUser(session.user);
      }
      set({
        session: session ?? null,
        user: session?.user ?? (get().user ?? (cached as unknown as User) ?? null),
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
        const message = formatSupabaseAuthError(
          error,
          'Sign-in failed',
          supabaseConfig.maskedUrl
        );
        set({ loading: false, error: message });
        throw error;
      }

      if (data.user) {
        setCachedUser(data.user);
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
        const message = formatSupabaseAuthError(
          error,
          'Sign-up failed',
          supabaseConfig.maskedUrl
        );
        set({ loading: false, error: message });
        throw error;
      }

      if (data.user) {
        setCachedUser(data.user);
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
    syncEngine.stop();
    setCachedUser(null);
    await clearAllLocalData();

    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({ session: null, user: null, loading: false, error: null });
  },

  continueOffline: () => {
    const offlineUser = {
      id: 'offline-local-user',
      email: 'offline@messynotes.local',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;
    setCachedUser(offlineUser);
    set({
      session: null,
      user: offlineUser,
      initialized: true,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
