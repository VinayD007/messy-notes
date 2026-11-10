import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { clearWebLocalData } from '../lib/localDb';
import { supabase } from '../lib/supabase';
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
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      set({
        session: data.session ?? null,
        user: data.session?.user ?? null,
        initialized: true,
        error: error ? error.message : null,
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
      subscription.unsubscribe();
    };
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({
      session: data.session,
      user: data.user,
      loading: false,
      error: null,
    });
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({
      session: data.session ?? null,
      user: data.user ?? null,
      loading: false,
      error: null,
    });

    return { needsEmailConfirmation: !data.session };
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
