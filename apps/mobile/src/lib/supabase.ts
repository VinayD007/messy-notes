import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import {
  createResilientFetch,
  logSupabaseDiagnostic,
  resolveSupabaseConfig,
  SUPABASE_CONFIG_ERROR,
  type Database,
} from '@messy-notes/shared';

const CHUNK_SIZE = 1800;

/**
 * Expo SecureStore enforces a 2048-byte limit per key on Android
 * environments, whereas Supabase JWT sessions can exceed 2 KB. Splitting values
 * across indexed chunks guarantees reliable encrypted session persistence.
 */
const ChunkedSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(`${key}__chunks`);
    if (!countRaw) {
      return SecureStore.getItemAsync(key);
    }

    const chunkCount = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(chunkCount) || chunkCount <= 0) {
      return null;
    }

    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
      if (chunk === null) {
        return null;
      }
      parts.push(chunk);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await ChunkedSecureStoreAdapter.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${key}__chunk_${index}`, chunk)
      )
    );
    await SecureStore.setItemAsync(`${key}__chunks`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(`${key}__chunks`);
    if (countRaw) {
      const chunkCount = Number.parseInt(countRaw, 10);
      if (Number.isFinite(chunkCount) && chunkCount > 0) {
        await Promise.all(
          Array.from({ length: chunkCount }, (_, i) =>
            SecureStore.deleteItemAsync(`${key}__chunk_${i}`)
          )
        );
      }
      await SecureStore.deleteItemAsync(`${key}__chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface ExtraSupabaseConfig {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

const expoExtra = (Constants.expoConfig?.extra ??
  (Constants.manifest2?.extra as { expoClient?: { extra?: ExtraSupabaseConfig } } | undefined)
    ?.expoClient?.extra) as ExtraSupabaseConfig | undefined;

const runtimeGlobal = (
  globalThis as { __MESSY_NOTES_CONFIG__?: ExtraSupabaseConfig }
).__MESSY_NOTES_CONFIG__;

// Keep static process.env.EXPO_PUBLIC_* accesses direct so babel-preset-expo inlines them at bundle time.
export const supabaseConfig = resolveSupabaseConfig([
  {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    source: 'process.env',
  },
  {
    url: expoExtra?.EXPO_PUBLIC_SUPABASE_URL ?? expoExtra?.supabaseUrl,
    anonKey: expoExtra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? expoExtra?.supabaseAnonKey,
    source: 'expo-constants.extra',
  },
  {
    url: runtimeGlobal?.EXPO_PUBLIC_SUPABASE_URL ?? runtimeGlobal?.supabaseUrl,
    anonKey: runtimeGlobal?.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? runtimeGlobal?.supabaseAnonKey,
    source: 'globalThis.__MESSY_NOTES_CONFIG__',
  },
]);

export const isSupabaseConfigured = supabaseConfig.isConfigured;
export { SUPABASE_CONFIG_ERROR };

const isDiagEnabled =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_APP_ENV === 'staging' ||
  process.env.NODE_ENV !== 'production';

logSupabaseDiagnostic('mobile', supabaseConfig, isDiagEnabled);

if (!isSupabaseConfigured) {
  console.warn(SUPABASE_CONFIG_ERROR);
}

// Keep module import non-fatal when CI or offline builds lack .env; authStore surfaces SUPABASE_CONFIG_ERROR in UI.
export const supabase = createClient<Database>(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    global: {
      fetch: createResilientFetch({ timeoutMs: 15_000 }),
    },
    auth: {
      storage: ChunkedSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

/**
 * Suspends background JWT refresh timers while the mobile app is inactive and
 * resumes token refresh immediately when foregrounded.
 */
export function registerSupabaseAppStateRefresh(): () => void {
  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}
