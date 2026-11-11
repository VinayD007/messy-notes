export type SupabaseKeyFormat = 'publishable' | 'jwt' | 'custom' | 'none';

export interface SupabaseConfigCandidate {
  url?: string | null;
  anonKey?: string | null;
  source: string;
}

export interface ResolvedSupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  maskedUrl: string;
  keyFormat: SupabaseKeyFormat;
  source: string;
}

export interface ResilientFetchOptions {
  timeoutMs?: number;
  maxNetworkRetries?: number;
  retryDelayMs?: number;
  baseFetch?: typeof fetch;
}

export const SUPABASE_CONFIG_ERROR =
  'Missing or invalid Supabase environment variables. Configure EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (mobile) or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (web) before building.';

const PLACEHOLDER_URL = 'https://placeholder.supabase.invalid';
const PLACEHOLDER_KEY = 'placeholder-anon-key';
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD']);

/**
 * Strips whitespace, line breaks, and matching surrounding quotes from
 * environment variable values injected by Vite, Expo/Metro, or CI runners.
 */
export function normalizeEnvValue(raw: string | undefined | null): string {
  const cleaned = (raw ?? '').replace(/[\r\n\t\s]+/g, '');
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
}

export function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Masks the Supabase project reference while keeping enough prefix/suffix and
 * domain context to diagnose malformed URLs or stale builds in logs safely.
 */
export function maskSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '(empty)';
  try {
    const parsed = new URL(rawUrl);
    const parts = parsed.hostname.split('.');
    const first = parts[0] ?? '';
    const maskedFirst =
      first.length > 6
        ? `${first.slice(0, 3)}***${first.slice(-3)} (len=${first.length})`
        : first
          ? `*** (len=${first.length})`
          : '***';
    const rest = parts.slice(1).join('.');
    return `${parsed.protocol}//${maskedFirst}${rest ? `.${rest}` : ''}`;
  } catch {
    return `(invalid-url len=${rawUrl.length})`;
  }
}

/**
 * Classifies the Supabase client API key without enforcing strict JWT regex checks,
 * supporting both modern `sb_publishable_` keys and legacy `eyJ...` JWT keys.
 */
export function detectSupabaseKeyFormat(anonKey: string): SupabaseKeyFormat {
  if (!anonKey) return 'none';
  if (anonKey.startsWith('sb_publishable_')) return 'publishable';
  if (anonKey.startsWith('eyJ') && anonKey.split('.').length === 3) return 'jwt';
  return 'custom';
}

export function isValidSupabaseKey(anonKey: string): boolean {
  return (
    anonKey.length > 0 &&
    anonKey !== 'your-supabase-anon-key' &&
    anonKey !== PLACEHOLDER_KEY
  );
}

export function resolveSupabaseConfig(
  candidates: SupabaseConfigCandidate[]
): ResolvedSupabaseConfig {
  let firstNonEmptyUrl = '';

  for (const candidate of candidates) {
    const url = normalizeEnvValue(candidate.url).replace(/\/+$/, '');
    const anonKey = normalizeEnvValue(candidate.anonKey);
    if (url && !firstNonEmptyUrl) {
      firstNonEmptyUrl = url;
    }

    const isPlaceholderUrl =
      url.includes('your-project-ref.supabase.co') ||
      url.includes('placeholder.supabase.invalid');

    if (isValidHttpUrl(url) && !isPlaceholderUrl && isValidSupabaseKey(anonKey)) {
      return {
        url,
        anonKey,
        isConfigured: true,
        maskedUrl: maskSupabaseUrl(url),
        keyFormat: detectSupabaseKeyFormat(anonKey),
        source: candidate.source,
      };
    }
  }

  return {
    url: PLACEHOLDER_URL,
    anonKey: PLACEHOLDER_KEY,
    isConfigured: false,
    maskedUrl: firstNonEmptyUrl ? maskSupabaseUrl(firstNonEmptyUrl) : '(unconfigured)',
    keyFormat: 'none',
    source: 'none',
  };
}

export function logSupabaseDiagnostic(
  platform: 'web' | 'mobile',
  config: ResolvedSupabaseConfig,
  enabled: boolean
): void {
  if (!enabled) return;
  console.info(`[Supabase][${platform}] client initialized`, {
    configured: config.isConfigured,
    source: config.source,
    url: config.maskedUrl,
    keyFormat: config.keyFormat,
  });
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function getRequestUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isRetryableRequest(method: string, url: string, timedOut: boolean): boolean {
  if (SAFE_RETRY_METHODS.has(method.toUpperCase())) {
    return true;
  }
  // Password token exchange is safe to retry once on an immediate connection drop before timeout.
  return !timedOut && method.toUpperCase() === 'POST' && url.includes('/auth/v1/token');
}

/**
 * Wraps `fetch` with per-attempt AbortController timeouts and bounded retries for
 * transient transport drops so hung sockets or flaky mobile networks fail cleanly.
 */
export function createResilientFetch(options: ResilientFetchOptions = {}): typeof fetch {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxNetworkRetries = options.maxNetworkRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 350;

  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const baseFetch = options.baseFetch ?? globalThis.fetch;
    const method = (
      init?.method ??
      (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const targetUrl = getRequestUrl(input);
    const maxAttempts = SAFE_RETRY_METHODS.has(method)
      ? 1 + maxNetworkRetries
      : method === 'POST' && targetUrl.includes('/auth/v1/token')
        ? 2
        : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const callerSignal = init?.signal;
      if (callerSignal?.aborted) {
        return baseFetch(input, init);
      }

      const canAbort = typeof AbortController !== 'undefined';
      const controller = canAbort ? new AbortController() : null;
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let onCallerAbort: (() => void) | null = null;

      if (controller) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);

        if (callerSignal) {
          onCallerAbort = () => controller.abort();
          callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        }
      }

      try {
        const nextInit: FetchInit = controller
          ? { ...(init ?? {}), signal: controller.signal }
          : init;
        return await baseFetch(input, nextInit);
      } catch (err) {
        if (callerSignal?.aborted && !timedOut) {
          throw err;
        }

        const errToThrow = timedOut
          ? new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
          : err;

        const hasRemainingAttempts = attempt < maxAttempts - 1;
        if (!hasRemainingAttempts || !isRetryableRequest(method, targetUrl, timedOut)) {
          throw errToThrow;
        }

        const backoff = retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (callerSignal && onCallerAbort) {
          callerSignal.removeEventListener('abort', onCallerAbort);
        }
      }
    }

    throw new Error('Network request failed');
  };
}

export function formatSupabaseAuthError(
  err: unknown,
  fallback: string,
  maskedUrl?: string
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
        ? err.message
        : fallback;

  const targetHint = maskedUrl && maskedUrl !== '(unconfigured)' ? ` (${maskedUrl})` : '';

  if (/timed out|aborterror/i.test(raw)) {
    return `Network request timed out while connecting to Supabase${targetHint}. Check your internet connection and retry.`;
  }

  if (/network request failed|failed to fetch|load failed|networkerror/i.test(raw)) {
    return `Network request failed while connecting to Supabase${targetHint}. Verify the Supabase URL/DNS and network connectivity (if your ISP blocks supabase.co, try Private DNS or another network) and retry.`;
  }

  return raw;
}
