import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@messy-notes/shared';

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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const SUPABASE_CONFIG_ERROR =
  'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Configure environment variables before building.';

if (!isSupabaseConfigured) {
  console.warn(SUPABASE_CONFIG_ERROR);
}

// Keep module import non-fatal when CI or offline builds lack .env; authStore surfaces SUPABASE_CONFIG_ERROR in UI.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.invalid',
  supabaseAnonKey || 'placeholder-anon-key',
  {
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
});

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
