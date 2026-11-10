import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';
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

type CachedMobileNote = Note & {
  serverUpdatedAt: string | null;
};

export interface PhotoOutboxEntry {
  storage_path: string;
  local_uri: string;
  mime_type: string;
  note_id: string;
  retry_count: number;
}

const NOTE_PREFIX = 'note:';
const OUTBOX_PREFIX = 'outbox:';
const PHOTO_OUTBOX_PREFIX = 'photo_outbox:';
const META_ACTIVE_USER = 'meta:active_user_id';
const META_LAST_PULLED_AT = 'meta:last_pulled_at';
const MMKV_KEY_ALIAS = 'messynotes_mmkv_aes_key_v1';

// Unauthenticated UI preferences (such as theme_mode) live in a dedicated
// synchronous MMKV instance so initial render never blocks on SecureStore.
const prefsStorage = new MMKV({ id: 'messynotes-prefs' });

let secureDataStorage: MMKV | null = null;
let initPromise: Promise<MMKV> | null = null;

async function getDataStorage(): Promise<MMKV> {
  if (secureDataStorage) {
    return secureDataStorage;
  }

  if (!initPromise) {
    initPromise = (async () => {
      let key = await SecureStore.getItemAsync(MMKV_KEY_ALIAS);
      if (!key || key.length > 16) {
        // MMKV enforces a maximum 16-byte encryptionKey.
        key = Crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        await SecureStore.setItemAsync(MMKV_KEY_ALIAS, key);
      }
      secureDataStorage = new MMKV({
        id: 'messynotes-data-v1',
        encryptionKey: key,
      });
      return secureDataStorage;
    })();
  }

  return initPromise;
}

function stripCacheMeta(cached: CachedMobileNote): Note {
  const { serverUpdatedAt: _ignored, ...note } = cached;
  return toDomainNote(note as NoteRow);
}

function readJson<T>(storage: MMKV, key: string): T | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getPreference(key: string): string | null {
  return prefsStorage.getString(key) ?? null;
}

export function setPreference(key: string, value: string): void {
  prefsStorage.set(key, value);
}

/**
 * Ensures cached notes and queued mutations belong strictly to the active
 * authenticated user, preventing data leakage on shared devices.
 */
export async function ensureActiveUser(userId: string): Promise<void> {
  const storage = await getDataStorage();
  const prevUser = storage.getString(META_ACTIVE_USER);
  if (prevUser && prevUser !== userId) {
    storage.clearAll();
  }
  storage.set(META_ACTIVE_USER, userId);
}

export async function clearAllLocalData(): Promise<void> {
  const storage = await getDataStorage();
  storage.clearAll();
}

export async function getAllNotesLocal(userId: string): Promise<{
  notes: Note[];
  dirtyIds: Set<string>;
  pendingCount: number;
}> {
  const storage = await getDataStorage();
  const keys = storage.getAllKeys();
  const cachedNotes: Note[] = [];
  const dirtyIds = new Set<string>();
  let pendingCount = 0;

  for (const key of keys) {
    if (key.startsWith(NOTE_PREFIX)) {
      const record = readJson<CachedMobileNote>(storage, key);
      if (record && record.user_id === userId) {
        cachedNotes.push(stripCacheMeta(record));
      }
    } else if (key.startsWith(OUTBOX_PREFIX)) {
      const mutation = readJson<OutboxMutation>(storage, key);
      if (mutation && mutation.userId === userId) {
        dirtyIds.add(mutation.noteId);
        pendingCount += 1;
      }
    }
  }

  return {
    notes: orderNotesNewestFirst(cachedNotes),
    dirtyIds,
    pendingCount,
  };
}

export async function queuePhotoUpload(
  entry: Omit<PhotoOutboxEntry, 'retry_count'>
): Promise<void> {
  const storage = await getDataStorage();
  const key = `${PHOTO_OUTBOX_PREFIX}${entry.storage_path}`;
  if (!storage.contains(key)) {
    storage.set(key, JSON.stringify({ ...entry, retry_count: 0 }));
  }
}

export async function getPhotoOutboxEntries(): Promise<PhotoOutboxEntry[]> {
  const storage = await getDataStorage();
  const results: PhotoOutboxEntry[] = [];
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(PHOTO_OUTBOX_PREFIX)) continue;
    const entry = readJson<PhotoOutboxEntry>(storage, key);
    if (entry) results.push(entry);
  }
  return results;
}

export async function removePhotoOutboxEntry(storagePath: string): Promise<void> {
  const storage = await getDataStorage();
  storage.delete(`${PHOTO_OUTBOX_PREFIX}${storagePath}`);
}

export async function saveLocalNoteMutation(
  note: Note,
  operation: OutboxMutationType
): Promise<void> {
  const storage = await getDataStorage();
  const noteKey = `${NOTE_PREFIX}${note.id}`;
  const outboxKey = `${OUTBOX_PREFIX}${note.id}`;

  const existingNote = readJson<CachedMobileNote>(storage, noteKey);
  const existingOutbox = readJson<OutboxMutation>(storage, outboxKey);
  const serverUpdatedAt = existingNote?.serverUpdatedAt ?? null;

  const normalizedNote: Note = {
    ...note,
    pinned: note.deleted_at ? false : note.pinned,
    pinned_at: note.deleted_at ? null : note.pinned_at,
  };

  storage.set(
    noteKey,
    JSON.stringify({
      ...normalizedNote,
      serverUpdatedAt,
    } satisfies CachedMobileNote)
  );

  const nextOutbox = coalesceOutboxMutation({
    existing: existingOutbox,
    noteId: note.id,
    userId: note.user_id,
    operation,
    payload: normalizedNote,
    serverUpdatedAt,
  });

  if (nextOutbox) {
    storage.set(outboxKey, JSON.stringify(nextOutbox));
  } else {
    storage.delete(outboxKey);
  }
}

export async function markLocalNotesPermanentlyDeleted(
  noteIds: string[],
  userId: string
): Promise<void> {
  if (noteIds.length === 0) return;
  const storage = await getDataStorage();
  const allKeys = storage.getAllKeys();

  for (const noteId of noteIds) {
    const noteKey = `${NOTE_PREFIX}${noteId}`;
    const outboxKey = `${OUTBOX_PREFIX}${noteId}`;

    const existingNote = readJson<CachedMobileNote>(storage, noteKey);
    const existingOutbox = readJson<OutboxMutation>(storage, outboxKey);
    const serverUpdatedAt = existingNote?.serverUpdatedAt ?? null;

    storage.delete(noteKey);

    for (const key of allKeys) {
      if (!key.startsWith(PHOTO_OUTBOX_PREFIX)) continue;
      const photoEntry = readJson<PhotoOutboxEntry>(storage, key);
      if (photoEntry?.note_id === noteId) {
        storage.delete(key);
      }
    }

    const nextOutbox = coalesceOutboxMutation({
      existing: existingOutbox,
      noteId,
      userId,
      operation: 'perm_delete',
      payload: null,
      serverUpdatedAt,
    });

    if (nextOutbox) {
      storage.set(outboxKey, JSON.stringify(nextOutbox));
    } else {
      storage.delete(outboxKey);
    }
  }
}

export async function getOutboxMutations(): Promise<OutboxMutation[]> {
  const storage = await getDataStorage();
  const entries: OutboxMutation[] = [];

  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(OUTBOX_PREFIX)) continue;
    const item = readJson<OutboxMutation>(storage, key);
    if (item) entries.push(item);
  }

  return entries.sort((a, b) => compareIsoTimestamps(a.createdAt, b.createdAt));
}

export async function finalizeSyncedNote(
  noteId: string,
  snapshotUpdatedAt: string,
  serverRow: NoteRow
): Promise<void> {
  const storage = await getDataStorage();
  const noteKey = `${NOTE_PREFIX}${noteId}`;
  const outboxKey = `${OUTBOX_PREFIX}${noteId}`;

  const current = readJson<CachedMobileNote>(storage, noteKey);
  if (!current) {
    storage.delete(outboxKey);
    return;
  }

  // If the user edited the note locally while sync was in flight, advance the
  // concurrency base to serverRow.updated_at and retain the newer local mutation.
  if (current.updated_at !== snapshotUpdatedAt) {
    storage.set(
      noteKey,
      JSON.stringify({
        ...current,
        serverUpdatedAt: serverRow.updated_at,
      } satisfies CachedMobileNote)
    );
    const pending = readJson<OutboxMutation>(storage, outboxKey);
    if (pending) {
      storage.set(
        outboxKey,
        JSON.stringify({
          ...pending,
          baseUpdatedAt: serverRow.updated_at,
          retryCount: 0,
          lastError: null,
        } satisfies OutboxMutation)
      );
    }
    return;
  }

  storage.delete(outboxKey);
  storage.set(
    noteKey,
    JSON.stringify({
      ...toDomainNote(serverRow),
      serverUpdatedAt: serverRow.updated_at,
    } satisfies CachedMobileNote)
  );
}

export async function finalizeDeletedNote(noteId: string): Promise<void> {
  const storage = await getDataStorage();
  storage.delete(`${OUTBOX_PREFIX}${noteId}`);
  storage.delete(`${NOTE_PREFIX}${noteId}`);
}

export async function recordOutboxRetry(updated: OutboxMutation): Promise<void> {
  const storage = await getDataStorage();
  storage.set(`${OUTBOX_PREFIX}${updated.noteId}`, JSON.stringify(updated));
}

export async function applyRemoteBatchToCache(rows: NoteRow[]): Promise<void> {
  if (rows.length === 0) return;
  const storage = await getDataStorage();

  for (const row of rows) {
    if (storage.contains(`${OUTBOX_PREFIX}${row.id}`)) {
      continue;
    }

    const noteKey = `${NOTE_PREFIX}${row.id}`;
    const existing = readJson<CachedMobileNote>(storage, noteKey);
    if (
      existing?.serverUpdatedAt &&
      compareIsoTimestamps(row.updated_at, existing.serverUpdatedAt) < 0
    ) {
      continue;
    }

    storage.set(
      noteKey,
      JSON.stringify({
        ...toDomainNote(row),
        serverUpdatedAt: row.updated_at,
      } satisfies CachedMobileNote)
    );
  }
}

export async function removeRemoteHardDeletedNote(noteId: string): Promise<void> {
  const storage = await getDataStorage();
  if (storage.contains(`${OUTBOX_PREFIX}${noteId}`)) {
    return;
  }
  storage.delete(`${NOTE_PREFIX}${noteId}`);
}

export async function getLastPulledAt(): Promise<string | null> {
  const storage = await getDataStorage();
  return storage.getString(META_LAST_PULLED_AT) ?? null;
}

export async function setLastPulledAt(timestampIso: string): Promise<void> {
  const storage = await getDataStorage();
  storage.set(META_LAST_PULLED_AT, timestampIso);
}
