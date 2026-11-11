import Dexie, { type Table } from 'dexie';
import {
  coalesceOutboxMutation,
  compareIsoTimestamps,
  orderNotesNewestFirst,
  toDomainNote,
  type Note,
  type NoteRow,
  type OutboxMutation,
  type OutboxMutationType,
} from '@messy-notes/shared';

export type CachedWebNote = Note & {
  serverUpdatedAt: string | null;
};

export interface WebPhotoOutboxEntry {
  storagePath: string;
  noteId: string;
  mimeType: string;
  blob: Blob;
  retryCount: number;
}

interface WebMetaRecord {
  key: string;
  value: string;
}

class MessyNotesDexie extends Dexie {
  notes!: Table<CachedWebNote, string>;
  outbox!: Table<OutboxMutation, string>;
  photoOutbox!: Table<WebPhotoOutboxEntry, string>;
  meta!: Table<WebMetaRecord, string>;

  constructor() {
    super('messynotes_web_db');
    this.version(1).stores({
      notes: 'id, user_id, created_at, updated_at, deleted_at',
      outbox: 'noteId, userId, createdAt, updatedAt',
      photoOutbox: 'storagePath, noteId',
      meta: 'key',
    });
  }
}

export const webLocalDb = new MessyNotesDexie();

function stripCacheMeta(cached: CachedWebNote): Note {
  const { serverUpdatedAt: _ignored, ...note } = cached;
  return note as Note;
}

export async function ensureActiveWebUser(userId: string): Promise<void> {
  const active = await webLocalDb.meta.get('active_user_id');
  if (active && active.value !== userId) {
    await webLocalDb.transaction(
      'rw',
      webLocalDb.notes,
      webLocalDb.outbox,
      webLocalDb.photoOutbox,
      webLocalDb.meta,
      async () => {
        await webLocalDb.notes.clear();
        await webLocalDb.outbox.clear();
        await webLocalDb.photoOutbox.clear();
        await webLocalDb.meta.bulkDelete(['active_user_id', 'last_pulled_at']);
      }
    );
  }
  await webLocalDb.meta.put({ key: 'active_user_id', value: userId });
}

export async function clearWebLocalData(): Promise<void> {
  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    webLocalDb.photoOutbox,
    webLocalDb.meta,
    async () => {
      await webLocalDb.notes.clear();
      await webLocalDb.outbox.clear();
      await webLocalDb.photoOutbox.clear();
      await webLocalDb.meta.clear();
    }
  );
}

export async function getAllWebNotesLocal(userId: string): Promise<{
  notes: Note[];
  dirtyIds: Set<string>;
  pendingCount: number;
}> {
  const [cachedRows, outboxItems] = await Promise.all([
    webLocalDb.notes.where('user_id').equals(userId).toArray(),
    webLocalDb.outbox.where('userId').equals(userId).toArray(),
  ]);

  const dirtyIds = new Set<string>(outboxItems.map((item) => item.noteId));
  const notes = orderNotesNewestFirst(cachedRows.map(stripCacheMeta));

  return {
    notes,
    dirtyIds,
    pendingCount: outboxItems.length,
  };
}

export async function queueWebPhotoUpload(
  entry: Omit<WebPhotoOutboxEntry, 'retryCount'>
): Promise<void> {
  await webLocalDb.photoOutbox.put({ ...entry, retryCount: 0 });
}

export async function getWebPhotoOutboxEntries(): Promise<WebPhotoOutboxEntry[]> {
  return webLocalDb.photoOutbox.toArray();
}

export async function removeWebPhotoOutboxEntry(storagePath: string): Promise<void> {
  await webLocalDb.photoOutbox.delete(storagePath);
}

export async function saveLocalWebMutation(
  note: Note,
  operation: OutboxMutationType
): Promise<void> {
  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    async () => {
      const existingNote = await webLocalDb.notes.get(note.id);
      const existingOutbox = await webLocalDb.outbox.get(note.id);
      const serverUpdatedAt = existingNote?.serverUpdatedAt ?? null;

      await webLocalDb.notes.put({
        ...note,
        serverUpdatedAt,
      });

      const nextOutbox = coalesceOutboxMutation({
        existing: existingOutbox ?? null,
        noteId: note.id,
        userId: note.user_id,
        operation,
        payload: note,
        serverUpdatedAt,
      });

      if (nextOutbox) {
        await webLocalDb.outbox.put(nextOutbox);
      } else {
        await webLocalDb.outbox.delete(note.id);
      }
    }
  );
}

export async function markWebNotesPermanentlyDeleted(
  noteIds: string[],
  userId: string
): Promise<void> {
  if (noteIds.length === 0) return;

  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    webLocalDb.photoOutbox,
    async () => {
      for (const noteId of noteIds) {
        const existingNote = await webLocalDb.notes.get(noteId);
        const existingOutbox = await webLocalDb.outbox.get(noteId);
        const serverUpdatedAt = existingNote?.serverUpdatedAt ?? null;

        await webLocalDb.photoOutbox.where('noteId').equals(noteId).delete();
        await webLocalDb.notes.delete(noteId);

        const nextOutbox = coalesceOutboxMutation({
          existing: existingOutbox ?? null,
          noteId,
          userId,
          operation: 'perm_delete',
          payload: null,
          serverUpdatedAt,
        });

        if (nextOutbox) {
          await webLocalDb.outbox.put(nextOutbox);
        } else {
          await webLocalDb.outbox.delete(noteId);
        }
      }
    }
  );
}

export async function getWebOutboxMutations(): Promise<OutboxMutation[]> {
  return webLocalDb.outbox.orderBy('createdAt').toArray();
}

export async function finalizeWebSyncedNote(
  noteId: string,
  snapshotUpdatedAt: string,
  serverRow: NoteRow
): Promise<void> {
  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    async () => {
      const current = await webLocalDb.notes.get(noteId);
      if (!current) {
        await webLocalDb.outbox.delete(noteId);
        return;
      }

      if (current.updated_at !== snapshotUpdatedAt) {
        await webLocalDb.notes.put({
          ...current,
          serverUpdatedAt: serverRow.updated_at,
        });
        const pending = await webLocalDb.outbox.get(noteId);
        if (pending) {
          await webLocalDb.outbox.put({
            ...pending,
            baseUpdatedAt: serverRow.updated_at,
            retryCount: 0,
            lastError: null,
          });
        }
        return;
      }

      await webLocalDb.outbox.delete(noteId);
      await webLocalDb.notes.put({
        ...toDomainNote(serverRow),
        serverUpdatedAt: serverRow.updated_at,
      });
    }
  );
}

export async function finalizeWebDeletedNote(noteId: string): Promise<void> {
  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    async () => {
      await webLocalDb.outbox.delete(noteId);
      await webLocalDb.notes.delete(noteId);
    }
  );
}

export async function recordWebOutboxRetry(updated: OutboxMutation): Promise<void> {
  await webLocalDb.outbox.put(updated);
}

export async function applyWebRemoteBatch(rows: NoteRow[]): Promise<void> {
  if (rows.length === 0) return;

  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    async () => {
      for (const row of rows) {
        const pending = await webLocalDb.outbox.get(row.id);
        if (pending) continue;

        const existing = await webLocalDb.notes.get(row.id);
        if (
          existing?.serverUpdatedAt &&
          compareIsoTimestamps(row.updated_at, existing.serverUpdatedAt) < 0
        ) {
          continue;
        }

        await webLocalDb.notes.put({
          ...toDomainNote(row),
          serverUpdatedAt: row.updated_at,
        });
      }
    }
  );
}

export async function removeWebRemoteHardDeleted(noteId: string): Promise<void> {
  const pending = await webLocalDb.outbox.get(noteId);
  if (pending) return;
  await webLocalDb.notes.delete(noteId);
}

export async function reconcileWebRemoteNoteIds(
  userId: string,
  remoteIds: ReadonlySet<string>
): Promise<void> {
  await webLocalDb.transaction(
    'rw',
    webLocalDb.notes,
    webLocalDb.outbox,
    async () => {
      const cached = await webLocalDb.notes.where('user_id').equals(userId).toArray();
      const staleIds: string[] = [];
      for (const record of cached) {
        if (record.serverUpdatedAt === null) continue;
        if (remoteIds.has(record.id)) continue;
        const pending = await webLocalDb.outbox.get(record.id);
        if (!pending) {
          staleIds.push(record.id);
        }
      }
      if (staleIds.length > 0) {
        await webLocalDb.notes.bulkDelete(staleIds);
      }
    }
  );
}

export async function getWebLastPulledAt(): Promise<string | null> {
  const record = await webLocalDb.meta.get('last_pulled_at');
  return record?.value ?? null;
}

export async function setWebLastPulledAt(timestampIso: string): Promise<void> {
  await webLocalDb.meta.put({ key: 'last_pulled_at', value: timestampIso });
}
