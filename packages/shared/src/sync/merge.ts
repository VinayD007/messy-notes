import {
  compareIsoTimestamps,
  orderNotesNewestFirst,
  toDomainNote,
  type Note,
  type NoteRow,
} from '../types/note';

export interface RealtimeNotePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<NoteRow> | Record<string, unknown>;
  old: Partial<NoteRow> | Record<string, unknown>;
}

/**
 * Deterministic Last-Write-Wins (LWW) conflict resolver.
 * Server (`remote`) wins on exact timestamp ties to guarantee cross-device convergence.
 */
export function resolveNoteConflict(local: Note, remote: Note): {
  winner: 'local' | 'remote';
  note: Note;
} {
  if (compareIsoTimestamps(local.updated_at, remote.updated_at) > 0) {
    return { winner: 'local', note: local };
  }
  return { winner: 'remote', note: remote };
}

/**
 * Pure reducer applying a Supabase Realtime postgres_changes payload to the
 * complete notes collection (containing both active notes and soft-deleted Bin notes)
 * while guarding notes with unpushed local edits.
 */
export function applyRealtimeEventToCollection(
  currentNotes: Note[],
  payload: RealtimeNotePayload,
  dirtyNoteIds: ReadonlySet<string>
): Note[] {
  const newRow = payload.new as Partial<NoteRow>;
  const oldRow = payload.old as Partial<NoteRow>;
  const targetId = newRow?.id ?? oldRow?.id;

  if (!targetId) {
    return currentNotes;
  }

  // Defer overwriting active unpushed edits; local flush / LWW resolver handles them.
  if (dirtyNoteIds.has(targetId)) {
    return currentNotes;
  }

  if (payload.eventType === 'DELETE') {
    return currentNotes.filter((n) => n.id !== targetId);
  }

  if (!newRow.id || !newRow.type) {
    return currentNotes;
  }

  const incoming = toDomainNote(newRow as NoteRow);
  const existingIndex = currentNotes.findIndex((n) => n.id === incoming.id);

  if (existingIndex === -1) {
    return orderNotesNewestFirst([incoming, ...currentNotes]);
  }

  const existing = currentNotes[existingIndex]!;
  if (compareIsoTimestamps(incoming.updated_at, existing.updated_at) < 0) {
    return currentNotes;
  }

  const next = [...currentNotes];
  next[existingIndex] = incoming;
  return orderNotesNewestFirst(next);
}
