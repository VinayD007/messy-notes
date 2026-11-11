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
  reconcileRemoteNoteIds,
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
  private channelGeneration = 0;
  private unsubscribeNetInfo: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

  private isOnline = true;
  private realtimeConnected = false;
  private syncInFlight = false;
  private resyncRequested = false;

  private readonly remote = createSupabaseNotesRemote(supabase);

  private async authenticateRealtime(): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
    } catch {
      // Realtime auth falls back to current client session when refreshed.
    }
  }

  async start(userId: string, callbacks: SyncCallbacks): Promise<void> {
    this.stop();
    const startGen = this.channelGeneration;
    this.userId = userId;
    this.callbacks = callbacks;

    await ensureActiveUser(userId);
    if (this.userId !== userId || startGen !== this.channelGeneration) return;
    await this.emitLocalSnapshot();
    if (this.userId !== userId || startGen !== this.channelGeneration) return;

    const netState = await NetInfo.fetch();
    if (this.userId !== userId || startGen !== this.channelGeneration) return;
    this.isOnline = isNetworkOnline(netState);
    this.emitStatus(this.isOnline ? 'idle' : 'offline', null);

    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const nextOnline = isNetworkOnline(state);
      const becameOnline = !this.isOnline && nextOnline;
      this.isOnline = nextOnline;

      if (!nextOnline) {
        this.clearRetryTimer();
        this.clearRealtimeTimers();
        this.realtimeConnected = false;
        this.emitStatus('offline', null);
        return;
      }

      if (becameOnline || !this.realtimeConnected) {
        void this.ensureRealtimeSubscribed();
      }
      if (becameOnline) {
        void this.syncNow();
      }
    });

    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && this.isOnline) {
          if (!this.realtimeConnected) {
            void this.ensureRealtimeSubscribed();
          }
          void this.syncNow();
        }
      }
    );

    if (this.isOnline) {
      await this.authenticateRealtime();
      if (this.userId !== userId || startGen !== this.channelGeneration) return;
      this.subscribeRealtime(userId);
      this.ensureFallbackPoll();
      void this.syncNow();
    }
  }

  stop(): void {
    this.channelGeneration += 1;
    this.clearRetryTimer();
    this.clearRealtimeTimers();
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

  private async ensureRealtimeSubscribed(): Promise<void> {
    if (!this.userId || !this.isOnline) return;
    await this.authenticateRealtime();
    if (!this.userId || !this.isOnline) return;
    this.subscribeRealtime(this.userId);
  }

  private subscribeRealtime(userId: string): void {
    const generation = ++this.channelGeneration;
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }

    const onChange = (payload: {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      if (generation !== this.channelGeneration || this.userId !== userId) return;
      void this.handleRealtimePayload(payload);
    };

    const channel = supabase
      .channel(`notes:user:${userId}:${generation}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${userId}`,
        },
        onChange
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notes',
        },
        onChange
      )
      .subscribe((status) => {
        if (generation !== this.channelGeneration || this.userId !== userId) return;

        if (status === 'SUBSCRIBED') {
          this.realtimeConnected = true;
          this.clearRealtimeReconnectTimer();
          this.clearFallbackPollTimer();
          this.emitStatus(this.syncInFlight ? 'syncing' : 'synced', null);
          void this.syncNow();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.realtimeConnected = false;
          this.emitStatus(this.isOnline ? 'idle' : 'offline', null);
          if (this.isOnline) {
            this.ensureFallbackPoll();
            this.scheduleRealtimeReconnect(userId, generation);
          }
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

    const { data: remoteIds, error: idsError } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', userId);
    if (!idsError && remoteIds) {
      await reconcileRemoteNoteIds(
        userId,
        new Set(remoteIds.map((row) => row.id))
      );
    }
  }

  private clearRealtimeReconnectTimer(): void {
    if (this.realtimeReconnectTimer) {
      clearTimeout(this.realtimeReconnectTimer);
      this.realtimeReconnectTimer = null;
    }
  }

  private clearFallbackPollTimer(): void {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  private clearRealtimeTimers(): void {
    this.clearRealtimeReconnectTimer();
    this.clearFallbackPollTimer();
  }

  private ensureFallbackPoll(): void {
    if (this.fallbackPollTimer || !this.isOnline) return;
    this.fallbackPollTimer = setInterval(() => {
      if (this.userId && this.isOnline && !this.realtimeConnected) {
        void this.syncNow();
      }
    }, 25_000);
  }

  private scheduleRealtimeReconnect(userId: string, generation: number): void {
    this.clearRealtimeReconnectTimer();
    this.realtimeReconnectTimer = setTimeout(() => {
      this.realtimeReconnectTimer = null;
      if (
        this.userId === userId &&
        this.isOnline &&
        generation === this.channelGeneration &&
        !this.realtimeConnected
      ) {
        void this.ensureRealtimeSubscribed();
      }
    }, 3_000);
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
