import * as Crypto from 'expo-crypto';
import {
  MAX_PINS_PER_CATEGORY,
  adjustSpansForTrim,
  canPinNote,
  countPinsInCategory,
  createNewNote,
  hasNotePatchChanges,
  orderNotesNewestFirst,
  parseBackticksToSpans,
  toDomainNote,
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
import { copyPickedPhotoToPrivateStorage } from '../lib/photoStorage';
import {
  markLocalNotesPermanentlyDeleted,
  queuePhotoUpload,
  saveLocalNoteMutation,
} from '../lib/mmkvStorage';
import { syncEngine, type EngineSyncState } from '../sync/syncEngine';

export interface MobileSnackbar {
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
  syncState: EngineSyncState;
  isOnline: boolean;
  realtimeConnected: boolean;
  snackbar: MobileSnackbar | null;
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
  showSnackbar: (snackbar: MobileSnackbar | null) => void;

  createRegularNote: (params: {
    userId: string;
    rawBody: string;
    explicitSpans?: TextSpan[];
    pickedPhotoUris?: Array<{ uri: string; mimeType?: string }>;
  }) => Promise<Note | null>;

  createStructuredNote: (params: {
    userId: string;
    type: 'field' | 'list';
    title: string | null;
    content: NoteContent;
    pickedPhotoUris?: Array<{ uri: string; mimeType?: string }>;
  }) => Promise<Note>;

  updateNote: (
    noteId: string,
    patch: {
      title?: string | null;
      content?: NoteContent;
      photo_attachments?: PhotoAttachment[];
    }
  ) => Promise<void>;

  attachPhotosToNote: (
    userId: string,
    noteId: string,
    picked: Array<{ uri: string; mimeType?: string }>
  ) => Promise<PhotoAttachment[]>;

  toggleListItemChecked: (noteId: string, itemId: string) => Promise<void>;
  toggleFavorite: (noteId: string) => Promise<void>;
  togglePin: (noteId: string) => Promise<void>;

  softDeleteNotes: (noteIds: string[]) => Promise<void>;
  restoreNotes: (noteIds: string[]) => Promise<void>;
  permanentlyDeleteNotes: (noteIds: string[]) => Promise<void>;
  emptyBin: () => Promise<void>;
}

let snackbarTimer: ReturnType<typeof setTimeout> | null = null;

export const useNotesStore = create<NotesState>((set, get) => {
  function setTimedSnackbar(next: MobileSnackbar | null) {
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

  async function persistLocal(
    note: Note,
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    await saveLocalNoteMutation(note, operation);
    await syncEngine.refreshFromCache();
    void syncEngine.syncNow();
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
    syncState: 'idle',
    isOnline: true,
    realtimeConnected: false,
    snackbar: null,
    error: null,

    startSync: async (userId) => {
      await syncEngine.start(userId, {
        onNotesUpdated: ({ notes, dirtyIds, pendingCount }) => {
          set({ notes, dirtyIds, pendingCount });
        },
        onStatusChanged: ({ syncState, isOnline, realtimeConnected, error }) => {
          set({ syncState, isOnline, realtimeConnected, error });
        },
      });
    },

    stopSync: () => {
      if (snackbarTimer) {
        clearTimeout(snackbarTimer);
        snackbarTimer = null;
      }
      syncEngine.stop();
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
        syncState: 'idle',
        realtimeConnected: false,
        snackbar: null,
        error: null,
      });
    },

    triggerManualSync: async () => {
      await syncEngine.syncNow();
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

    attachPhotosToNote: async (userId, noteId, picked) => {
      const attachments: PhotoAttachment[] = [];
      for (const item of picked) {
        const { attachment, localUri } = await copyPickedPhotoToPrivateStorage({
          sourceUri: item.uri,
          userId,
          noteId,
          mimeType: item.mimeType,
        });
        await queuePhotoUpload({
          storage_path: attachment.storagePath,
          local_uri: localUri,
          mime_type: attachment.mimeType,
          note_id: noteId,
        });
        attachments.push(attachment);
      }
      return attachments;
    },

    createRegularNote: async ({
      userId,
      rawBody,
      explicitSpans,
      pickedPhotoUris,
    }) => {
      const trimmedSource = rawBody.trim();
      if (!trimmedSource && (!pickedPhotoUris || pickedPhotoUris.length === 0)) {
        return null;
      }

      const parsed = explicitSpans
        ? adjustSpansForTrim(rawBody, explicitSpans)
        : parseBackticksToSpans(trimmedSource);

      const id = Crypto.randomUUID();
      const attachments =
        pickedPhotoUris && pickedPhotoUris.length > 0
          ? await get().attachPhotosToNote(userId, id, pickedPhotoUris)
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

      await persistLocal(note, 'create');
      return note;
    },

    createStructuredNote: async ({
      userId,
      type,
      title,
      content,
      pickedPhotoUris,
    }) => {
      const id = Crypto.randomUUID();
      const attachments =
        pickedPhotoUris && pickedPhotoUris.length > 0
          ? await get().attachPhotosToNote(userId, id, pickedPhotoUris)
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

      await persistLocal(note, 'create');
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

      await persistLocal(updated, 'update');
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
      const updated = {
        ...note,
        favorite: nextFavorite,
        updated_at: new Date().toISOString(),
      };

      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
      }));
      await persistLocal(updated, 'update');

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
      const updated = {
        ...note,
        pinned: nextPinned,
        pinned_at: nextPinned ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? updated : n)),
      }));
      await persistLocal(updated, 'update');
    },

    softDeleteNotes: async (noteIds) => {
      const idSet = new Set(noteIds);
      const targets = get().notes.filter((n) => idSet.has(n.id) && n.deleted_at === null);
      if (targets.length === 0) return;

      const priorSnapshots = new Map<
        string,
        { pinned: boolean; pinned_at: string | null; type: NoteType }
      >(
        targets.map((n) => [
          n.id,
          { pinned: n.pinned, pinned_at: n.pinned_at, type: n.type },
        ])
      );
      const nowIso = new Date().toISOString();

      for (const target of targets) {
        await saveLocalNoteMutation(
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
      await syncEngine.refreshFromCache();
      void syncEngine.syncNow();

      setTimedSnackbar({
        message:
          targets.length === 1
            ? 'Note moved to bin'
            : `${targets.length} notes moved to bin`,
        undoLabel: 'Undo',
        onUndo: async () => {
          for (const target of targets) {
            const snap = priorSnapshots.get(target.id);
            const current = get().notes;
            const keepPin =
              Boolean(snap?.pinned) &&
              countPinsInCategory(current, target.type) < MAX_PINS_PER_CATEGORY;

            await saveLocalNoteMutation(
              {
                ...target,
                deleted_at: null,
                pinned: keepPin,
                pinned_at: keepPin ? (snap?.pinned_at ?? new Date().toISOString()) : null,
                updated_at: new Date().toISOString(),
              },
              'update'
            );
          }
          await syncEngine.refreshFromCache();
          void syncEngine.syncNow();
        },
      });
    },

    restoreNotes: async (noteIds) => {
      const idSet = new Set(noteIds);
      const targets = get().notes.filter((n) => idSet.has(n.id));
      if (targets.length === 0) return;

      const nowIso = new Date().toISOString();
      for (const target of targets) {
        await saveLocalNoteMutation(
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
      await syncEngine.refreshFromCache();
      void syncEngine.syncNow();

      setTimedSnackbar({
        message: targets.length === 1 ? 'Note restored' : `${targets.length} notes restored`,
      });
    },

    permanentlyDeleteNotes: async (noteIds) => {
      const targets = get().notes.filter((n) => noteIds.includes(n.id));
      if (targets.length === 0) return;

      await markLocalNotesPermanentlyDeleted(
        targets.map((n) => n.id),
        targets[0]!.user_id
      );
      set({ selectedNoteIds: new Set<string>() });
      await syncEngine.refreshFromCache();
      void syncEngine.syncNow();
      setTimedSnackbar({ message: 'Note permanently deleted' });
    },

    emptyBin: async () => {
      const binned = get().notes.filter((n) => n.deleted_at !== null);
      if (binned.length === 0) return;

      await markLocalNotesPermanentlyDeleted(
        binned.map((n) => n.id),
        binned[0]!.user_id
      );
      set({ selectedNoteIds: new Set<string>() });
      await syncEngine.refreshFromCache();
      void syncEngine.syncNow();
      setTimedSnackbar({ message: 'Bin emptied' });
    },
  };
});
