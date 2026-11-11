import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import { AppState, type AppStateStatus } from 'react-native';
import {
  createSupabaseNotesRemote,
  getRetryBackoffMs,
  replayOutboxQueue,
  uploadPhotoToNoteBucket,
  type Note,
  type NoteRow,
} from '@messy-notes/shared';
import { cleanupUnreferencedPhotos } from '../lib/photoStorage';
import {
  applyRemoteBatchToCache,
  ensureActiveUser,
  finalizeDeletedNote,
  finalizeSyncedNote,
  getAllNotesLocal,
  getLastPulledAt,
  getOutboxMutations,
  getPhotoOutboxEntries,
  recordOutboxRetry,
  removePhotoOutboxEntry,
  removeRemoteHardDeletedNote,
  setLastPulledAt,
} from '../lib/mmkvStorage';
import { supabase } from '../lib/supabase';

export type EngineSyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncCallbacks {
  onNotesUpdated: (payload: {
    notes: Note[];
    dirtyIds: Set<string>;
    pendingCount: number;
  }) => void;
  onStatusChanged: (status: {
    syncState: EngineSyncState;
    isOnline: boolean;
    realtimeConnected: boolean;
    error: string | null;
  }) => void;
}

function isNetworkOnline(state: NetInfoState): boolean {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLen = Math.max(0, (clean.length * 3) / 4 - padding);
  const bytes = new Uint8Array(outputLen);
  let outIdx = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(clean[i] ?? 'A');
    const c2 = BASE64_CHARS.indexOf(clean[i + 1] ?? 'A');
    const c3 = BASE64_CHARS.indexOf(clean[i + 2] ?? 'A');
    const c4 = BASE64_CHARS.indexOf(clean[i + 3] ?? 'A');
    const chunk = (c1 << 18) | (c2 << 12) | ((c3 & 63) << 6) | (c4 & 63);
    if (outIdx < outputLen) bytes[outIdx++] = (chunk >> 16) & 255;
    if (outIdx < outputLen) bytes[outIdx++] = (chunk >> 8) & 255;
    if (outIdx < outputLen) bytes[outIdx++] = chunk & 255;
  }

  return bytes;
}

class OfflineSyncEngine {
  private userId: string | null = null;
  private callbacks: SyncCallbacks | null = null;
  private channel: RealtimeChannel | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private isOnline = true;
  private realtimeConnected = false;
  private syncInFlight = false;
  private resyncRequested = false;

  private readonly remote = createSupabaseNotesRemote(supabase);

  async start(userId: string, callbacks: SyncCallbacks): Promise<void> {
    this.stop();
    this.userId = userId;
    this.callbacks = callbacks;

    await ensureActiveUser(userId);
    await this.emitLocalSnapshot();

    const netState = await NetInfo.fetch();
    this.isOnline = isNetworkOnline(netState);
    this.emitStatus(this.isOnline ? 'idle' : 'offline', null);

    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const nextOnline = isNetworkOnline(state);
      const becameOnline = !this.isOnline && nextOnline;
      this.isOnline = nextOnline;

      if (!nextOnline) {
        this.clearRetryTimer();
        this.emitStatus('offline', null);
        return;
      }

      if (becameOnline) {
        void this.syncNow();
      }
    });

    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && this.isOnline) {
          void this.syncNow();
        }
      }
    );

    this.subscribeRealtime(userId);

    if (this.isOnline) {
      void this.syncNow();
    }
  }

  stop(): void {
    this.clearRetryTimer();
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.userId = null;
    this.callbacks = null;
    this.realtimeConnected = false;
    this.syncInFlight = false;
    this.resyncRequested = false;
  }

  async refreshFromCache(): Promise<void> {
    await this.emitLocalSnapshot();
  }

  async syncNow(): Promise<void> {
    if (!this.userId) return;
    if (!this.isOnline) {
      this.emitStatus('offline', null);
      return;
    }

    if (this.syncInFlight) {
      this.resyncRequested = true;
      return;
    }

    this.clearRetryTimer();
    this.syncInFlight = true;
    this.emitStatus('syncing', null);

    let syncError: string | null = null;
    let maxRetryCount = 0;

    try {
      const activeUserId = this.userId;
      let photoError: string | null = null;
      try {
        await this.flushPhotoOutbox();
      } catch (err) {
        photoError = err instanceof Error ? err.message : 'Photo upload failed';
      }

      const mutations = await getOutboxMutations();
      const replayResult = await replayOutboxQueue(
        mutations,
        activeUserId,
        this.remote,
        {
          onSynced: async (mutation, serverRow) => {
            const snapshotTs =
              mutation.payload?.updated_at ?? mutation.updatedAt;
            await finalizeSyncedNote(mutation.noteId, snapshotTs, serverRow);
          },
          onDeleted: async (mutation) => {
            await finalizeDeletedNote(mutation.noteId);
          },
          onRetry: async (updatedMutation) => {
            maxRetryCount = Math.max(maxRetryCount, updatedMutation.retryCount);
            await recordOutboxRetry(updatedMutation);
          },
        }
      );

      if (replayResult.failedCount > 0) {
        syncError = replayResult.lastError;
      } else {
        await this.pullDeltas(activeUserId);
        if (photoError) {
          syncError = photoError;
        }
      }

      const snapshot = await this.emitLocalSnapshot();
      if (snapshot && !syncError) {
        const referenced = new Set<string>();
        for (const note of snapshot.notes) {
          for (const photo of note.photo_attachments) {
            referenced.add(photo.fileName);
          }
        }
        await cleanupUnreferencedPhotos(referenced);
      }

      this.emitStatus(syncError ? 'error' : 'synced', syncError);
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Sync failed';
      this.emitStatus('error', syncError);
    } finally {
      this.syncInFlight = false;
      if (this.resyncRequested) {
        this.resyncRequested = false;
        void this.syncNow();
      } else if (syncError && this.isOnline) {
        this.scheduleRetry(maxRetryCount);
      }
    }
  }

  private subscribeRealtime(userId: string): void {
    let hasSubscribedOnce = false;

    const channel = supabase
      .channel(`notes:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          void this.handleRealtimePayload(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.realtimeConnected = true;
          this.emitStatus(this.syncInFlight ? 'syncing' : 'synced', null);
          if (hasSubscribedOnce) {
            void this.syncNow();
          }
          hasSubscribedOnce = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.realtimeConnected = false;
          this.emitStatus(this.isOnline ? 'error' : 'offline', null);
        } else if (status === 'CLOSED') {
          this.realtimeConnected = false;
        }
      });

    this.channel = channel;
  }

  private async handleRealtimePayload(payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }): Promise<void> {
    if (!this.userId) return;

    if (payload.eventType === 'DELETE') {
      const deletedId = (payload.old as Partial<NoteRow>)?.id;
      if (deletedId) {
        await removeRemoteHardDeletedNote(deletedId);
        await this.emitLocalSnapshot();
      }
      return;
    }

    const row = payload.new as Partial<NoteRow>;
    if (!row?.id || !row?.type) return;

    await applyRemoteBatchToCache([row as NoteRow]);
    await this.emitLocalSnapshot();
  }

  private async flushPhotoOutbox(): Promise<void> {
    const entries = await getPhotoOutboxEntries();
    for (const entry of entries) {
      const base64 = await FileSystem.readAsStringAsync(entry.local_uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = decodeBase64ToBytes(base64);
      await uploadPhotoToNoteBucket(
        supabase,
        entry.storage_path,
        bytes,
        entry.mime_type
      );
      await removePhotoOutboxEntry(entry.storage_path);
    }
  }

  private async pullDeltas(userId: string): Promise<void> {
    const lastPulledAt = await getLastPulledAt();

    let query = supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });

    if (lastPulledAt) {
      query = query.gte('updated_at', lastPulledAt);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    if (rows.length > 0) {
      await applyRemoteBatchToCache(rows);
      const newestTimestamp = rows[rows.length - 1]!.updated_at;
      await setLastPulledAt(newestTimestamp);
    } else if (!lastPulledAt) {
      await setLastPulledAt(new Date().toISOString());
    }
  }

  private async emitLocalSnapshot() {
    if (!this.userId || !this.callbacks) return null;
    const snapshot = await getAllNotesLocal(this.userId);
    this.callbacks.onNotesUpdated(snapshot);
    return snapshot;
  }

  private emitStatus(syncState: EngineSyncState, error: string | null): void {
    this.callbacks?.onStatusChanged({
      syncState,
      isOnline: this.isOnline,
      realtimeConnected: this.realtimeConnected,
      error,
    });
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private scheduleRetry(retryCount: number): void {
    this.clearRetryTimer();
    const delayMs = getRetryBackoffMs(retryCount);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.userId && this.isOnline) {
        void this.syncNow();
      }
    }, delayMs);
  }
}

export const syncEngine = new OfflineSyncEngine();
