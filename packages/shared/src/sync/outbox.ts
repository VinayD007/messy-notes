import { compareIsoTimestamps, toDomainNote, type Note, type NoteRow } from '../types/note';
import { resolveNoteConflict } from './merge';

export type OutboxMutationType = 'create' | 'update' | 'delete' | 'perm_delete';

export interface OutboxMutation {
  noteId: string;
  userId: string;
  operation: OutboxMutationType;
  payload: Note | null;
  baseUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError: string | null;
}

export interface SyncRemoteAdapter {
  upsertNote: (note: Note) => Promise<NoteRow>;
  updateNoteIfUnmodified: (
    note: Note,
    expectedUpdatedAt: string
  ) => Promise<NoteRow | null>;
  fetchRemoteNote: (noteId: string, userId: string) => Promise<NoteRow | null>;
  forceUpdateNote: (note: Note) => Promise<NoteRow>;
  permanentDeleteNote: (noteId: string, userId: string) => Promise<void>;
}

export interface OutboxReplayHooks {
  onSynced: (mutation: OutboxMutation, serverRow: NoteRow) => Promise<void> | void;
  onDeleted: (mutation: OutboxMutation) => Promise<void> | void;
  onRetry: (
    updatedMutation: OutboxMutation,
    errorMessage: string
  ) => Promise<void> | void;
}

export interface OutboxReplayResult {
  syncedCount: number;
  failedCount: number;
  lastError: string | null;
}

/**
 * Coalesces sequential offline mutations targeting the same note so the outbox
 * replays only the minimal net state transition without duplicate network writes.
 * Returns `null` when an unsynced offline note is deleted before ever reaching Supabase.
 */
export function coalesceOutboxMutation(params: {
  existing: OutboxMutation | null;
  noteId: string;
  userId: string;
  operation: OutboxMutationType;
  payload: Note | null;
  serverUpdatedAt: string | null;
  nowIso?: string;
}): OutboxMutation | null {
  const now = params.nowIso ?? new Date().toISOString();
  const { existing, noteId, userId, operation, payload, serverUpdatedAt } = params;

  // An offline-created note deleted before any successful server sync requires no remote write.
  if (
    (operation === 'delete' || operation === 'perm_delete') &&
    serverUpdatedAt === null &&
    (!existing || existing.operation === 'create')
  ) {
    return null;
  }

  if (!existing) {
    return {
      noteId,
      userId,
      operation,
      payload,
      baseUpdatedAt: serverUpdatedAt,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      lastError: null,
    };
  }

  const baseUpdatedAt = existing.baseUpdatedAt ?? serverUpdatedAt;

  if (operation === 'perm_delete') {
    return {
      ...existing,
      operation: 'perm_delete',
      payload: null,
      baseUpdatedAt,
      updatedAt: now,
      lastError: null,
    };
  }

  const nextOperation: OutboxMutationType =
    existing.operation === 'create' && operation === 'update'
      ? 'create'
      : operation;

  return {
    ...existing,
    operation: nextOperation,
    payload,
    baseUpdatedAt,
    updatedAt: now,
    lastError: null,
  };
}

/**
 * Computes exponential retry delay (capped at 60 seconds) for failed outbox items.
 */
export function getRetryBackoffMs(retryCount: number): number {
  const exponent = Math.max(0, Math.min(retryCount, 6));
  return Math.min(60_000, 1_500 * Math.pow(2, exponent));
}

/**
 * Replays queued mutations sequentially against Supabase with optimistic
 * concurrency checks and Last-Write-Wins (updated_at) conflict resolution.
 */
export async function replayOutboxQueue(
  mutations: OutboxMutation[],
  userId: string,
  remote: SyncRemoteAdapter,
  hooks: OutboxReplayHooks
): Promise<OutboxReplayResult> {
  const ordered = [...mutations]
    .filter((m) => m.userId === userId)
    .sort((a, b) => compareIsoTimestamps(a.createdAt, b.createdAt));

  let syncedCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;

  for (const mutation of ordered) {
    try {
      if (mutation.operation === 'perm_delete') {
        await remote.permanentDeleteNote(mutation.noteId, userId);
        await hooks.onDeleted(mutation);
        syncedCount += 1;
        continue;
      }

      if (!mutation.payload) {
        await hooks.onDeleted(mutation);
        continue;
      }

      if (mutation.operation === 'create' || mutation.baseUpdatedAt === null) {
        const serverRow = await remote.upsertNote(mutation.payload);
        await hooks.onSynced(mutation, serverRow);
        syncedCount += 1;
        continue;
      }

      const matched = await remote.updateNoteIfUnmodified(
        mutation.payload,
        mutation.baseUpdatedAt
      );
      if (matched) {
        await hooks.onSynced(mutation, matched);
        syncedCount += 1;
        continue;
      }

      const remoteRow = await remote.fetchRemoteNote(mutation.noteId, userId);
      if (!remoteRow) {
        const recreated = await remote.upsertNote(mutation.payload);
        await hooks.onSynced(mutation, recreated);
        syncedCount += 1;
        continue;
      }

      const resolution = resolveNoteConflict(
        mutation.payload,
        toDomainNote(remoteRow)
      );

      if (resolution.winner === 'remote') {
        await hooks.onSynced(mutation, remoteRow);
      } else {
        const forced = await remote.forceUpdateNote(mutation.payload);
        await hooks.onSynced(mutation, forced);
      }
      syncedCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mutation sync failed';
      failedCount += 1;
      lastError = message;
      await hooks.onRetry(
        {
          ...mutation,
          retryCount: mutation.retryCount + 1,
          lastError: message,
          updatedAt: new Date().toISOString(),
        },
        message
      );
      // Abort remaining FIFO queue items on failure to preserve ordering and avoid hammering offline sockets.
      break;
    }
  }

  return { syncedCount, failedCount, lastError };
}
