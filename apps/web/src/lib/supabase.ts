import { createClient } from '@supabase/supabase-js';
import {
  createResilientFetch,
  logSupabaseDiagnostic,
  resolveSupabaseConfig,
  SUPABASE_CONFIG_ERROR,
  type Database,
} from '@messy-notes/shared';

interface RuntimeSupabaseGlobal {
  __MESSY_NOTES_CONFIG__?: {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}

const runtimeConfig = (globalThis as RuntimeSupabaseGlobal).__MESSY_NOTES_CONFIG__;

export const supabaseConfig = resolveSupabaseConfig([
  {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    source: 'import.meta.env',
  },
  {
    url: runtimeConfig?.VITE_SUPABASE_URL ?? runtimeConfig?.supabaseUrl,
    anonKey: runtimeConfig?.VITE_SUPABASE_ANON_KEY ?? runtimeConfig?.supabaseAnonKey,
    source: 'window.__MESSY_NOTES_CONFIG__',
  },
]);

export const isSupabaseConfigured = supabaseConfig.isConfigured;
export { SUPABASE_CONFIG_ERROR };

logSupabaseDiagnostic(
  'web',
  supabaseConfig,
  Boolean(
    import.meta.env.DEV ||
      import.meta.env.MODE === 'staging' ||
      import.meta.env.VITE_APP_ENV === 'staging'
  )
);

if (!isSupabaseConfigured) {
  console.warn(SUPABASE_CONFIG_ERROR);
}

/**
 * Typed Supabase client for the Web application.
 * Passes the shared Database schema generic plus resilient fetch timeouts/retries
 * across PostgREST queries, Auth, Storage, and Realtime subscriptions.
 */
export const supabase = createClient<Database>(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    global: {
      fetch: createResilientFetch({ timeoutMs: 15_000 }),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
