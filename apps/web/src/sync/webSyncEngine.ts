import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createSupabaseNotesRemote,
  getRetryBackoffMs,
  replayOutboxQueue,
  uploadPhotoToNoteBucket,
  type Note,
  type NoteRow,
} from '@messy-notes/shared';
import {
  applyWebRemoteBatch,
  ensureActiveWebUser,
  finalizeWebDeletedNote,
  finalizeWebSyncedNote,
  getAllWebNotesLocal,
  getWebLastPulledAt,
  getWebOutboxMutations,
  getWebPhotoOutboxEntries,
  reconcileWebRemoteNoteIds,
  recordWebOutboxRetry,
  removeWebPhotoOutboxEntry,
  removeWebRemoteHardDeleted,
  setWebLastPulledAt,
} from '../lib/localDb';
import { supabase } from '../lib/supabase';

export type WebRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';

export interface WebSyncCallbacks {
  onNotesUpdated: (snapshot: {
    notes: Note[];
    dirtyIds: Set<string>;
    pendingCount: number;
  }) => void;
  onStatusChanged: (status: {
    realtimeStatus: WebRealtimeStatus;
    isOnline: boolean;
    syncing: boolean;
    error: string | null;
  }) => void;
}

class WebOfflineSyncEngine {
  private userId: string | null = null;
  private callbacks: WebSyncCallbacks | null = null;
  private channel: RealtimeChannel | null = null;
  private channelGeneration = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
  private removeListeners: (() => void) | null = null;

  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private realtimeStatus: WebRealtimeStatus = 'idle';
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

  async start(userId: string, callbacks: WebSyncCallbacks): Promise<void> {
    this.stop();
    const startGen = this.channelGeneration;
    this.userId = userId;
    this.callbacks = callbacks;
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    await ensureActiveWebUser(userId);
    if (this.userId !== userId || startGen !== this.channelGeneration) return;
    await this.emitLocalSnapshot();
    if (this.userId !== userId || startGen !== this.channelGeneration) return;

    const handleOnline = () => {
      this.isOnline = true;
      this.emitStatus(false, null);
      if (this.realtimeStatus !== 'connected') {
        void this.ensureRealtimeSubscribed();
      }
      void this.syncNow();
    };

    const handleOffline = () => {
      this.isOnline = false;
      this.realtimeStatus = 'offline';
      this.clearRetryTimer();
      this.clearRealtimeTimers();
      this.emitStatus(false, null);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.isOnline) {
        if (this.realtimeStatus !== 'connected') {
          void this.ensureRealtimeSubscribed();
        }
        void this.syncNow();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.removeListeners = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    if (this.isOnline) {
      await this.authenticateRealtime();
      if (this.userId !== userId || startGen !== this.channelGeneration) return;
      this.subscribeRealtime(userId);
      this.ensureFallbackPoll();
      void this.syncNow();
    } else {
      this.realtimeStatus = 'offline';
      this.emitStatus(false, null);
    }
  }

  stop(): void {
    this.channelGeneration += 1;
    this.clearRetryTimer();
    this.clearRealtimeTimers();
    if (this.removeListeners) {
      this.removeListeners();
      this.removeListeners = null;
    }
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.userId = null;
    this.callbacks = null;
    this.realtimeStatus = 'idle';
    this.syncInFlight = false;
    this.resyncRequested = false;
  }

  async refreshFromCache(): Promise<void> {
    await this.emitLocalSnapshot();
  }

  async syncNow(): Promise<void> {
    if (!this.userId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnline = false;
      this.realtimeStatus = 'offline';
      this.emitStatus(false, null);
      return;
    }
    this.isOnline = true;

    if (this.syncInFlight) {
      this.resyncRequested = true;
      return;
    }

    this.clearRetryTimer();
    this.syncInFlight = true;
    this.emitStatus(true, null);

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

      const mutations = await getWebOutboxMutations();
      const replayResult = await replayOutboxQueue(
        mutations,
        activeUserId,
        this.remote,
        {
          onSynced: async (mutation, serverRow) => {
            const snapshotTs =
              mutation.payload?.updated_at ?? mutation.updatedAt;
            await finalizeWebSyncedNote(mutation.noteId, snapshotTs, serverRow);
          },
          onDeleted: async (mutation) => {
            await finalizeWebDeletedNote(mutation.noteId);
          },
          onRetry: async (updatedMutation) => {
            maxRetryCount = Math.max(maxRetryCount, updatedMutation.retryCount);
            await recordWebOutboxRetry(updatedMutation);
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

      await this.emitLocalSnapshot();
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Sync failed';
    } finally {
      this.syncInFlight = false;
      this.emitStatus(false, syncError);

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

    this.realtimeStatus = this.isOnline ? 'connecting' : 'offline';
    this.emitStatus(this.syncInFlight, null);

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
          this.realtimeStatus = 'connected';
          this.clearRealtimeReconnectTimer();
          this.clearFallbackPollTimer();
          this.emitStatus(this.syncInFlight, null);
          void this.syncNow();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.realtimeStatus = this.isOnline ? 'reconnecting' : 'offline';
          this.emitStatus(this.syncInFlight, null);
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
        await removeWebRemoteHardDeleted(deletedId);
        await this.emitLocalSnapshot();
      }
      return;
    }

    const row = payload.new as Partial<NoteRow>;
    if (!row?.id || !row?.type) return;

    await applyWebRemoteBatch([row as NoteRow]);
    await this.emitLocalSnapshot();
  }

  private async flushPhotoOutbox(): Promise<void> {
    const entries = await getWebPhotoOutboxEntries();
    for (const entry of entries) {
      await uploadPhotoToNoteBucket(
        supabase,
        entry.storagePath,
        entry.blob,
        entry.mimeType
      );
      await removeWebPhotoOutboxEntry(entry.storagePath);
    }
  }

  private async pullDeltas(userId: string): Promise<void> {
    const lastPulledAt = await getWebLastPulledAt();

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
      await applyWebRemoteBatch(rows);
      await setWebLastPulledAt(rows[rows.length - 1]!.updated_at);
    } else if (!lastPulledAt) {
      await setWebLastPulledAt(new Date().toISOString());
    }

    const { data: remoteIds, error: idsError } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', userId);
    if (!idsError && remoteIds) {
      await reconcileWebRemoteNoteIds(
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
      if (this.userId && this.isOnline && this.realtimeStatus !== 'connected') {
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
        this.realtimeStatus !== 'connected'
      ) {
        void this.ensureRealtimeSubscribed();
      }
    }, 3_000);
  }

  private async emitLocalSnapshot(): Promise<void> {
    if (!this.userId || !this.callbacks) return;
    const snapshot = await getAllWebNotesLocal(this.userId);
    this.callbacks.onNotesUpdated(snapshot);
  }

  private emitStatus(syncing: boolean, error: string | null): void {
    this.callbacks?.onStatusChanged({
      realtimeStatus: this.isOnline ? this.realtimeStatus : 'offline',
      isOnline: this.isOnline,
      syncing,
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

export const webSyncEngine = new WebOfflineSyncEngine();
