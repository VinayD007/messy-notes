import {
  MAX_PINS_PER_CATEGORY,
  MAX_PHOTOS_PER_NOTE,
  NOTE_PHOTOS_BUCKET,
  adjustSpansForTrim,
  canPinNote,
  countPinsInCategory,
  createNewNote,
  hasNotePatchChanges,
  orderNotesNewestFirst,
  parseBackticksToSpans,
  toDomainNote,
  type FieldValueEntry,
  type ListRowEntry,
  type Note,
  type NoteContent,
  type NoteFilter,
  type NoteType,
  type NoteView,
  type PhotoAttachment,
  type TextSpan,
} from '@messy-notes/shared';
import { create } from 'zustand';
import {
  markWebNotesPermanentlyDeleted,
  queueWebPhotoUpload,
  saveLocalWebMutation,
} from '../lib/localDb';
import { supabase } from '../lib/supabase';
import { webSyncEngine, type WebRealtimeStatus } from '../sync/webSyncEngine';

export type RealtimeStatus = WebRealtimeStatus;

export interface SnackbarState {
  message: string;
  undoLabel?: string;
  onUndo?: () => Promise<void>;
}

interface NotesState {
  notes: Note[];
  dirtyIds: Set<string>;
  pendingCount: number;
  activeView: NoteView;
  filterType: NoteFilter;
  searchActive: boolean;
  homeSearchQuery: string;
  favSearchQuery: string;
  binSearchQuery: string;
  selectedNoteIds: Set<string>;
  loading: boolean;
  syncing: boolean;
  isOnline: boolean;
  realtimeStatus: RealtimeStatus;
  snackbar: SnackbarState | null;
  error: string | null;

  startSync: (userId: string) => Promise<void>;
  stopSync: () => void;
  triggerManualSync: () => Promise<void>;

  setActiveView: (view: NoteView) => void;
  setFilterType: (filter: NoteFilter) => void;
  setSearchActive: (active: boolean) => void;
  setSearchQueryForActiveView: (query: string) => void;
  getSearchQueryForActiveView: () => string;

  toggleSelectNote: (noteId: string) => void;
  clearSelection: () => void;
  showSnackbar: (snackbar: SnackbarState | null) => void;

  createRegularNote: (params: {
    userId: string;
    rawBody: string;
    explicitSpans?: TextSpan[];
    photoFiles?: File[];
  }) => Promise<Note | null>;

  createStructuredNote: (params: {
    userId: string;
    type: 'field' | 'list';
    title: string | null;
    content: NoteContent;
    photoFiles?: File[];
  }) => Promise<Note>;

  updateNote: (
    noteId: string,
    patch: {
      title?: string | null;
      content?: NoteContent;
      photo_attachments?: PhotoAttachment[];
    }
  ) => Promise<void>;

  toggleListItemChecked: (noteId: string, itemId: string) => Promise<void>;
  toggleFavorite: (noteId: string) => Promise<void>;
  togglePin: (noteId: string) => Promise<void>;

  softDeleteNotes: (noteIds: string[]) => Promise<void>;
  restoreNotes: (noteIds: string[]) => Promise<void>;
  permanentlyDeleteNotes: (noteIds: string[]) => Promise<void>;
  emptyBin: (userId: string) => Promise<void>;

  uploadPhotosForNote: (
    userId: string,
    noteId: string,
    existing: PhotoAttachment[],
    files: File[]
  ) => Promise<PhotoAttachment[]>;
  getSignedPhotoUrl: (storagePath: string) => Promise<string | null>;

  reset: () => void;
}

let snackbarTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const useNotesStore = create<NotesState>((set, get) => {
  function setTimedSnackbar(next: SnackbarState | null) {
    if (snackbarTimer) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }
    set({ snackbar: next });
    if (next) {
      snackbarTimer = setTimeout(() => {
        set({ snackbar: null });
        snackbarTimer = null;
      }, 4500);
    }
  }

  async function persistLocalAndSync(
    note: Note,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    await saveLocalWebMutation(note, operation);
    await webSyncEngine.refreshFromCache();
    void webSyncEngine.syncNow();
  }

  return {
    notes: [],
    dirtyIds: new Set<string>(),
    pendingCount: 0,
    activeView: 'home',
    filterType: 'all',
    searchActive: false,
    homeSearchQuery: '',
    favSearchQuery: '',
    binSearchQuery: '',
    selectedNoteIds: new Set<string>(),
    loading: false,
    syncing: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    realtimeStatus: 'idle',
    snackbar: null,
    error: null,

    startSync: async (userId) => {
      set({ loading: true, error: null });
      await webSyncEngine.start(userId, {
        onNotesUpdated: ({ notes, dirtyIds, pendingCount }) => {
          set({ notes, dirtyIds, pendingCount, loading: false });
        },
        onStatusChanged: ({ realtimeStatus, isOnline, syncing, error }) => {
          set({ realtimeStatus, isOnline, syncing, error });
        },
      });
    },

    stopSync: () => {
      get().reset();
    },

    triggerManualSync: async () => {
      await webSyncEngine.syncNow();
    },

    setActiveView: (activeView) =>
      set({
        activeView,
        searchActive: false,
        selectedNoteIds: new Set<string>(),
      }),

    setFilterType: (filterType) =>
      set({
        filterType,
        selectedNoteIds: new Set<string>(),
      }),

    setSearchActive: (searchActive) =>
      set((state) => ({
        searchActive,
        selectedNoteIds: searchActive ? new Set<string>() : state.selectedNoteIds,
      })),

    setSearchQueryForActiveView: (query) =>
      set((state) => {
        if (state.activeView === 'favorites') return { favSearchQuery: query };
        if (state.activeView === 'bin') return { binSearchQuery: query };
        return { homeSearchQuery: query };
      }),

    getSearchQueryForActiveView: () => {
      const state = get();
      if (state.activeView === 'favorites') return state.favSearchQuery;
      if (state.activeView === 'bin') return state.binSearchQuery;
      return state.homeSearchQuery;
    },

    toggleSelectNote: (noteId) =>
      set((state) => {
        const next = new Set(state.selectedNoteIds);
        if (next.has(noteId)) next.delete(noteId);
        else next.add(noteId);
        return { selectedNoteIds: next };
      }),

    clearSelection: () => set({ selectedNoteIds: new Set<string>() }),
    showSnackbar: (snackbar) => setTimedSnackbar(snackbar),

    uploadPhotosForNote: async (userId, noteId, existing, files) => {
      const remaining = Math.max(0, MAX_PHOTOS_PER_NOTE - existing.length);
      const batch = files.slice(0, remaining);
      const queued: PhotoAttachment[] = [];

      for (const file of batch) {
        const id = crypto.randomUUID();
        const fileName = `${id}_${sanitizeFileName(file.name || 'photo.jpg')}`;
        const storagePath = `${userId}/${noteId}/${fileName}`;
        const mimeType = file.type || 'image/jpeg';

        // Queue blobs into IndexedDB so photos attach reliably even offline.
        await queueWebPhotoUpload({
          storagePath,
          noteId,
          mimeType,
          blob: file,
        });

        queued.push({
          id,
          fileName,
          storagePath,
          mimeType,
        });
      }

      return [...existing, ...queued];
    },

    getSignedPhotoUrl: async (storagePath) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return null;
      }
      const { data, error } = await supabase.storage
        .from(NOTE_PHOTOS_BUCKET)
        .createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) {
        return null;
      }
      return data.signedUrl;
    },

    createRegularNote: async ({ userId, rawBody, explicitSpans, photoFiles }) => {
      const trimmedSource = rawBody.trim();
      if (!trimmedSource && (!photoFiles || photoFiles.length === 0)) {
        return null;
      }

      const parsed = explicitSpans
        ? adjustSpansForTrim(rawBody, explicitSpans)
        : parseBackticksToSpans(trimmedSource);

      const id = crypto.randomUUID();
      const attachments =
        photoFiles && photoFiles.length > 0
          ? await get().uploadPhotosForNote(userId, id, [], photoFiles)
          : [];

      const note = createNewNote({
        id,
        userId,
        type: 'regular',
        title: null,
        content: { body: parsed.text, spans: parsed.spans },
        photoAttachments: attachments,
      });

      set((state) => ({
        notes: orderNotesNewestFirst([note, ...state.notes]),
        homeSearchQuery: '',
        searchActive: false,
      }));

      await persistLocalAndSync(note, 'create');
      return note;
    },

    createStructuredNote: async ({ userId, type, title, content, photoFiles }) => {
      const id = crypto.randomUUID();
      const attachments =
        photoFiles && photoFiles.length > 0
          ? await get().uploadPhotosForNote(userId, id, [], photoFiles)
          : [];

      const note = createNewNote({
        id,
        userId,
        type,
        title: title?.trim() ? title.trim() : null,
        content,
        photoAttachments: attachments,
      });

      set((state) => ({
        notes: orderNotesNewestFirst([note, ...state.notes]),
        homeSearchQuery: '',
        searchActive: false,
      }));

      await persistLocalAndSync(note, 'create');
      return note;
    },

    updateNote: async (noteId, patch) => {
      const existing = get().notes.find((n) => n.id === noteId);
      if (!existing) return;
      if (!hasNotePatchChanges(existing, patch)) return;

      const updated = toDomainNote({
        ...existing,
        title:
          patch.title !== undefined
            ? patch.title?.trim()
              ? patch.title.trim()
              : null
            : existing.title,
        content: patch.content !== undefined ? patch.content : existing.content,
        photo_attachments:
          patch.photo_attachments !== undefined
            ? patch.photo_attachments
            : existing.photo_attachments,
        updated_at: new Date().toISOString(),
      });

      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
      }));

      await persistLocalAndSync(updated, 'update');
    },

    toggleListItemChecked: async (noteId, itemId) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note || note.type !== 'list') return;

      const nextItems: ListRowEntry[] = note.content.items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );
      await get().updateNote(noteId, { content: { items: nextItems } });
    },

    toggleFavorite: async (noteId) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const nextFavorite = !note.favorite;
      const onFavoritesPage = get().activeView === 'favorites';
      const updated: Note = {
        ...note,
        favorite: nextFavorite,
        updated_at: new Date().toISOString(),
      };

      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
      }));

      await persistLocalAndSync(updated, 'update');

      if (onFavoritesPage && !nextFavorite) {
        setTimedSnackbar({
          message: 'Removed from favorites',
          undoLabel: 'Undo',
          onUndo: async () => {
            await get().toggleFavorite(noteId);
          },
        });
      }
    },

    togglePin: async (noteId) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const check = canPinNote(get().notes, note);
      if (!check.allowed) {
        setTimedSnackbar({ message: check.reason! });
        return;
      }

      const nextPinned = !note.pinned;
      const updated: Note = {
        ...note,
        pinned: nextPinned,
        pinned_at: nextPinned ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
      }));

      await persistLocalAndSync(updated, 'update');
    },

    softDeleteNotes: async (noteIds) => {
      const idSet = new Set(noteIds);
      const targets = get().notes.filter((n) => idSet.has(n.id) && n.deleted_at === null);
      if (targets.length === 0) return;

      const priorSnapshots = new Map(
        targets.map((n) => [
          n.id,
          { pinned: n.pinned, pinned_at: n.pinned_at, type: n.type },
        ])
      );
      const nowIso = new Date().toISOString();

      for (const target of targets) {
        await saveLocalWebMutation(
          {
            ...target,
            deleted_at: nowIso,
            pinned: false,
            pinned_at: null,
            updated_at: nowIso,
          },
          'delete'
        );
      }

      set({ selectedNoteIds: new Set<string>() });
      await webSyncEngine.refreshFromCache();
      void webSyncEngine.syncNow();

      setTimedSnackbar({
        message:
          targets.length === 1
            ? 'Note moved to bin'
            : `${targets.length} notes moved to bin`,
        undoLabel: 'Undo',
        onUndo: async () => {
          for (const target of targets) {
            const snap = priorSnapshots.get(target.id);
            const currentNotes = get().notes;
            const canKeepPin =
              Boolean(snap?.pinned) &&
              countPinsInCategory(currentNotes, target.type) < MAX_PINS_PER_CATEGORY;

            await saveLocalWebMutation(
              {
                ...target,
                deleted_at: null,
                pinned: canKeepPin,
                pinned_at: canKeepPin ? (snap?.pinned_at ?? new Date().toISOString()) : null,
                updated_at: new Date().toISOString(),
              },
              'update'
            );
          }
          await webSyncEngine.refreshFromCache();
          void webSyncEngine.syncNow();
        },
      });
    },

    restoreNotes: async (noteIds) => {
      const idSet = new Set(noteIds);
      const targets = get().notes.filter((n) => idSet.has(n.id));
      if (targets.length === 0) return;

      const nowIso = new Date().toISOString();
      for (const target of targets) {
        await saveLocalWebMutation(
          {
            ...target,
            deleted_at: null,
            pinned: false,
            pinned_at: null,
            updated_at: nowIso,
          },
          'update'
        );
      }

      set({ selectedNoteIds: new Set<string>() });
      await webSyncEngine.refreshFromCache();
      void webSyncEngine.syncNow();

      setTimedSnackbar({
        message: targets.length === 1 ? 'Note restored' : `${targets.length} notes restored`,
      });
    },

    permanentlyDeleteNotes: async (noteIds) => {
      const idSet = new Set(noteIds);
      const targets = get().notes.filter((n) => idSet.has(n.id));
      if (targets.length === 0) return;

      const userId = targets[0]!.user_id;
      await markWebNotesPermanentlyDeleted(
        targets.map((n) => n.id),
        userId
      );

      set({ selectedNoteIds: new Set<string>() });
      await webSyncEngine.refreshFromCache();
      void webSyncEngine.syncNow();
      setTimedSnackbar({ message: 'Note permanently deleted' });
    },

    emptyBin: async (userId) => {
      const binnedIds = get()
        .notes.filter((n) => n.deleted_at !== null)
        .map((n) => n.id);
      if (binnedIds.length === 0) return;

      await markWebNotesPermanentlyDeleted(binnedIds, userId);
      set({ selectedNoteIds: new Set<string>() });
      await webSyncEngine.refreshFromCache();
      void webSyncEngine.syncNow();
      setTimedSnackbar({ message: 'Bin emptied' });
    },

    reset: () => {
      if (snackbarTimer) {
        clearTimeout(snackbarTimer);
        snackbarTimer = null;
      }
      webSyncEngine.stop();
      set({
        notes: [],
        dirtyIds: new Set<string>(),
        pendingCount: 0,
        activeView: 'home',
        filterType: 'all',
        searchActive: false,
        homeSearchQuery: '',
        favSearchQuery: '',
        binSearchQuery: '',
        selectedNoteIds: new Set<string>(),
        loading: false,
        syncing: false,
        realtimeStatus: 'idle',
        snackbar: null,
        error: null,
      });
    },
  };
});

export type { FieldValueEntry, NoteType };
