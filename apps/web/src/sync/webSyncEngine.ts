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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private removeListeners: (() => void) | null = null;

  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private realtimeStatus: WebRealtimeStatus = 'idle';
  private syncInFlight = false;
  private resyncRequested = false;

  private readonly remote = createSupabaseNotesRemote(supabase);

  async start(userId: string, callbacks: WebSyncCallbacks): Promise<void> {
    this.stop();
    this.userId = userId;
    this.callbacks = callbacks;
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    await ensureActiveWebUser(userId);
    await this.emitLocalSnapshot();

    const handleOnline = () => {
      this.isOnline = true;
      this.emitStatus(false, null);
      void this.syncNow();
    };

    const handleOffline = () => {
      this.isOnline = false;
      this.realtimeStatus = 'offline';
      this.clearRetryTimer();
      this.emitStatus(false, null);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.isOnline) {
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

    this.subscribeRealtime(userId);

    if (this.isOnline) {
      void this.syncNow();
    } else {
      this.realtimeStatus = 'offline';
      this.emitStatus(false, null);
    }
  }

  stop(): void {
    this.clearRetryTimer();
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

  private subscribeRealtime(userId: string): void {
    let hasSubscribedOnce = false;
    this.realtimeStatus = this.isOnline ? 'connecting' : 'offline';
    this.emitStatus(this.syncInFlight, null);

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
          this.realtimeStatus = 'connected';
          this.emitStatus(this.syncInFlight, null);
          if (hasSubscribedOnce) {
            void this.syncNow();
          }
          hasSubscribedOnce = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.realtimeStatus = this.isOnline ? 'reconnecting' : 'offline';
          this.emitStatus(this.syncInFlight, null);
        } else if (status === 'CLOSED') {
          this.realtimeStatus = this.isOnline ? 'idle' : 'offline';
          this.emitStatus(this.syncInFlight, null);
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
