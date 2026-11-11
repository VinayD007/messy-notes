export type NoteType = 'regular' | 'field' | 'list';
export type NoteFilter = 'all' | NoteType;
export type NoteView = 'home' | 'favorites' | 'bin';

export const MAX_PINS_PER_CATEGORY = 2;
export const MAX_PHOTOS_PER_NOTE = 12;

export interface TextSpan {
  start: number;
  end: number;
  type: 'mono';
}

export interface FieldValueEntry {
  id: string;
  field: string;
  value: string;
  insertionOrder: number;
}

export interface ListRowEntry {
  id: string;
  value: string;
  checked: boolean;
  insertionOrder: number;
}

export interface PhotoAttachment {
  id: string;
  /** Safe relative file name inside app-private note_photos/ directory */
  fileName: string;
  /** Supabase Storage object path: `${userId}/${noteId}/${fileName}` */
  storagePath: string;
  mimeType: string;
}

export interface RegularNoteContent {
  body: string;
  spans: TextSpan[];
}

export interface FieldNoteContent {
  fields: FieldValueEntry[];
}

export interface ListNoteContent {
  items: ListRowEntry[];
}

export type NoteContent = RegularNoteContent | FieldNoteContent | ListNoteContent;

interface BaseNote {
  id: string;
  user_id: string;
  title: string | null;
  favorite: boolean;
  pinned: boolean;
  pinned_at: string | null;
  photo_attachments: PhotoAttachment[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegularNote extends BaseNote {
  type: 'regular';
  content: RegularNoteContent;
}

export interface FieldNote extends BaseNote {
  type: 'field';
  content: FieldNoteContent;
}

export interface ListNote extends BaseNote {
  type: 'list';
  content: ListNoteContent;
}

export type Note = RegularNote | FieldNote | ListNote;

export type NoteRow = {
  id: string;
  user_id: string;
  title: string | null;
  type: NoteType;
  content: NoteContent;
  favorite: boolean;
  pinned: boolean;
  pinned_at: string | null;
  photo_attachments: PhotoAttachment[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export function compareIsoTimestamps(a: string, b: string): number {
  const diff = Date.parse(a) - Date.parse(b);
  if (!Number.isNaN(diff) && diff !== 0) {
    return diff;
  }
  return a.localeCompare(b);
}

/**
 * Compares `created_at` and `updated_at` using parsed epoch milliseconds so
 * equivalent ISO representations (`Z` vs `+00:00`) never display a false "edited" label.
 */
export function isNoteEdited(
  note: Pick<Note, 'created_at' | 'updated_at'>
): boolean {
  const createdMs = Date.parse(note.created_at);
  const updatedMs = Date.parse(note.updated_at);
  if (!Number.isNaN(createdMs) && !Number.isNaN(updatedMs)) {
    return Math.abs(updatedMs - createdMs) >= 1;
  }
  return note.updated_at !== note.created_at;
}

/**
 * Determines whether an edit patch actually mutates a note's title, content,
 * or photo attachments, preventing unchanged closes/saves from bumping `updated_at`.
 */
export function hasNotePatchChanges(
  existing: Note,
  patch: {
    title?: string | null;
    content?: NoteContent;
    photo_attachments?: PhotoAttachment[];
  }
): boolean {
  if (patch.title !== undefined) {
    const nextTitle = patch.title?.trim() ? patch.title.trim() : null;
    const prevTitle = existing.title?.trim() ? existing.title.trim() : null;
    if (nextTitle !== prevTitle) return true;
  }

  if (
    patch.content !== undefined &&
    JSON.stringify(patch.content) !== JSON.stringify(existing.content)
  ) {
    return true;
  }

  if (
    patch.photo_attachments !== undefined &&
    JSON.stringify(patch.photo_attachments) !==
      JSON.stringify(existing.photo_attachments)
  ) {
    return true;
  }

  return false;
}

export function createDefaultContent(type: 'regular'): RegularNoteContent;
export function createDefaultContent(type: 'field'): FieldNoteContent;
export function createDefaultContent(type: 'list'): ListNoteContent;
export function createDefaultContent(type: NoteType): NoteContent;
export function createDefaultContent(type: NoteType): NoteContent {
  switch (type) {
    case 'regular':
      return { body: '', spans: [] };
    case 'field':
      return { fields: [] };
    case 'list':
      return { items: [] };
  }
}

export function toDomainNote(row: NoteRow): Note {
  const base: BaseNote = {
    id: row.id,
    user_id: row.user_id,
    title: row.title ?? null,
    favorite: Boolean(row.favorite),
    pinned: Boolean(row.pinned) && !row.deleted_at,
    pinned_at: row.deleted_at ? null : (row.pinned_at ?? null),
    photo_attachments: Array.isArray(row.photo_attachments)
      ? row.photo_attachments.slice(0, MAX_PHOTOS_PER_NOTE)
      : [],
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  switch (row.type) {
    case 'regular': {
      const raw = row.content as Partial<RegularNoteContent> | null;
      return {
        ...base,
        type: 'regular',
        content: {
          body: typeof raw?.body === 'string' ? raw.body : '',
          spans: Array.isArray(raw?.spans) ? raw.spans : [],
        },
      };
    }
    case 'field': {
      const raw = row.content as Partial<FieldNoteContent> | null;
      const fields = Array.isArray(raw?.fields)
        ? raw.fields.map((entry, idx) => ({
            id: typeof entry?.id === 'string' ? entry.id : `field-${idx}`,
            field: typeof entry?.field === 'string' ? entry.field : '',
            value: typeof entry?.value === 'string' ? entry.value : '',
            insertionOrder:
              typeof entry?.insertionOrder === 'number' ? entry.insertionOrder : idx,
          }))
        : [];
      return {
        ...base,
        type: 'field',
        content: { fields },
      };
    }
    case 'list': {
      const raw = row.content as Partial<ListNoteContent> | null;
      const items = Array.isArray(raw?.items)
        ? raw.items.map((entry, idx) => ({
            id: typeof entry?.id === 'string' ? entry.id : `item-${idx}`,
            value: typeof entry?.value === 'string' ? entry.value : '',
            checked: Boolean(entry?.checked),
            insertionOrder:
              typeof entry?.insertionOrder === 'number' ? entry.insertionOrder : idx,
          }))
        : [];
      return {
        ...base,
        type: 'list',
        content: { items },
      };
    }
  }
}

export function createNewNote(params: {
  id: string;
  userId: string;
  type: NoteType;
  title?: string | null;
  content?: NoteContent;
  photoAttachments?: PhotoAttachment[];
  nowIso?: string;
}): Note {
  const now = params.nowIso ?? new Date().toISOString();
  return toDomainNote({
    id: params.id,
    user_id: params.userId,
    title: params.title ?? null,
    type: params.type,
    content: params.content ?? createDefaultContent(params.type),
    favorite: false,
    pinned: false,
    pinned_at: null,
    photo_attachments: params.photoAttachments ?? [],
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Compiles grouped plain text for Copy, Share, and Field-Value/List display
 * matching Section 6.8 and 6.14 of the MessyNote specification.
 */
export function buildGroupedText(note: Note): string {
  const titleLine = note.title?.trim() ?? '';

  switch (note.type) {
    case 'regular':
      return note.content.body;

    case 'field': {
      const sorted = [...note.content.fields].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      );
      const rows = sorted
        .map((entry, idx) => `${idx + 1}. ${entry.field} = ${entry.value}`)
        .join('\n');
      return titleLine ? (rows ? `${titleLine}\n\n${rows}` : titleLine) : rows;
    }

    case 'list': {
      const sorted = [...note.content.items].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      );
      const rows = sorted
        .map((entry, idx) => `${idx + 1}. ${entry.value}`)
        .join('\n');
      return titleLine ? (rows ? `${titleLine}\n\n${rows}` : titleLine) : rows;
    }
  }
}

/**
 * Returns true when a note contains any non-whitespace text across its title,
 * body, fields, or list items that can be copied or partially copied.
 */
export function hasCopyableText(note: Note): boolean {
  return buildGroupedText(note).trim().length > 0;
}

/**
 * Primary feed ordering rule (Section 5.9): newest first by created_at.
 * Editing a note updates updated_at only and never alters feed position.
 */
export function orderNotesNewestFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const createdDiff = compareIsoTimestamps(b.created_at, a.created_at);
    if (createdDiff !== 0) return createdDiff;
    return b.id.localeCompare(a.id);
  });
}

/**
 * Category pinning order: pinned notes stay above unpinned notes, both newest-first.
 * Applies exclusively inside Notes, Fields-Values, and Lists tabs.
 */
export function applyPinOrdering(notes: Note[]): Note[] {
  const pinned = orderNotesNewestFirst(notes.filter((n) => n.pinned));
  const unpinned = orderNotesNewestFirst(notes.filter((n) => !n.pinned));
  return [...pinned, ...unpinned];
}

export function matchesSearchQuery(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (note.title && note.title.toLowerCase().includes(q)) {
    return true;
  }

  switch (note.type) {
    case 'regular':
      return note.content.body.toLowerCase().includes(q);
    case 'field':
      return note.content.fields.some(
        (f) => f.field.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
      );
    case 'list':
      return note.content.items.some((i) => i.value.toLowerCase().includes(q));
  }
}

export function getDisplayedNotes(
  notes: Note[],
  filter: NoteFilter,
  searchQuery = ''
): Note[] {
  const active = notes.filter(
    (n) =>
      n.deleted_at === null &&
      (filter === 'all' || n.type === filter) &&
      matchesSearchQuery(n, searchQuery)
  );

  return filter === 'all'
    ? orderNotesNewestFirst(active)
    : applyPinOrdering(active);
}

export function getDisplayedFavorites(notes: Note[], searchQuery = ''): Note[] {
  const favorites = notes.filter(
    (n) => n.deleted_at === null && n.favorite && matchesSearchQuery(n, searchQuery)
  );
  return orderNotesNewestFirst(favorites);
}

export function getDisplayedBinNotes(notes: Note[], searchQuery = ''): Note[] {
  const bin = notes.filter(
    (n) => n.deleted_at !== null && matchesSearchQuery(n, searchQuery)
  );
  return orderNotesNewestFirst(bin);
}

export function countPinsInCategory(notes: Note[], type: NoteType): number {
  return notes.filter(
    (n) => n.deleted_at === null && n.type === type && n.pinned
  ).length;
}

export function canPinNote(
  notes: Note[],
  targetNote: Note
): { allowed: boolean; reason?: string } {
  if (targetNote.pinned) {
    return { allowed: true };
  }
  const activePins = countPinsInCategory(notes, targetNote.type);
  if (activePins >= MAX_PINS_PER_CATEGORY) {
    return {
      allowed: false,
      reason: `Pin limit reached (${MAX_PINS_PER_CATEGORY}). Unpin a note first.`,
    };
  }
  return { allowed: true };
}
