import { useEffect, useRef, useState } from 'react';
import {
  applyPinOrdering,
  getDisplayedBinNotes,
  getDisplayedFavorites,
  getDisplayedNotes,
  hasNotePatchChanges,
  type FieldNote,
  type ListNote,
  type Note,
  type TextSpan,
} from '@messy-notes/shared';
import { AuthForm } from './components/AuthForm';
import {
  BottomComposer,
  FloatingComposerActions,
} from './components/BottomComposer';
import {
  NavigationDrawer,
  TopHeader,
} from './components/HeaderAndDrawer';
import { DownloadIcon } from './components/MaterialIcons';
import { NoteBubble } from './components/NoteBubble';
import {
  ConfirmDialog,
  ExpandedRegularDialog,
  FieldValueDialog,
  ListDialog,
  NoteDetailDialog,
  PartialCopyDialog,
  SingleNoteOptionsModal,
} from './components/NoteDialogs';
import { useAuthStore } from './store/authStore';
import { useNotesStore } from './store/notesStore';

const THEME_STORAGE_KEY = 'mess_note_theme_mode';

function resolveInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const { user, initialized, initialize } = useAuthStore();
  const {
    notes,
    activeView,
    filterType,
    searchActive,
    homeSearchQuery,
    favSearchQuery,
    binSearchQuery,
    selectedNoteIds,
    snackbar,
    error,
    startSync,
    stopSync,
    setActiveView,
    setSearchActive,
    setSearchQueryForActiveView,
    clearSelection,
    createRegularNote,
    createStructuredNote,
    updateNote,
    uploadPhotosForNote,
    softDeleteNotes,
    permanentlyDeleteNotes,
    emptyBin,
    showSnackbar,
  } = useNotesStore();

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(resolveInitialTheme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [draftSpans, setDraftSpans] = useState<TextSpan[]>([]);
  const [draftPhotos, setDraftPhotos] = useState<File[]>([]);

  const [optionsNote, setOptionsNote] = useState<Note | null>(null);
  const [detailNote, setDetailNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [newFieldDialogOpen, setNewFieldDialogOpen] = useState(false);
  const [newListDialogOpen, setNewListDialogOpen] = useState(false);
  const [partialCopyNote, setPartialCopyNote] = useState<Note | null>(null);
  const [linkToOpen, setLinkToOpen] = useState<string | null>(null);
  const [pendingBinIds, setPendingBinIds] = useState<string[] | null>(null);
  const [pendingPermDeleteId, setPendingPermDeleteId] = useState<string | null>(null);
  const [confirmEmptyBin, setConfirmEmptyBin] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    return initialize();
  }, [initialize]);

  useEffect(() => {
    if (!user?.id) {
      stopSync();
      return;
    }

    void startSync(user.id);
    return () => {
      stopSync();
    };
  }, [user?.id, startSync, stopSync]);

  // Escape-key priority chain mirroring Section 7.1 Back navigation order.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawerOpen) setDrawerOpen(false);
      else if (composerExpanded) setComposerExpanded(false);
      else if (plusMenuOpen) setPlusMenuOpen(false);
      else if (selectedNoteIds.size > 0) clearSelection();
      else if (searchActive) {
        setSearchQueryForActiveView('');
        setSearchActive(false);
      } else if (
        optionsNote ||
        detailNote ||
        editingNote ||
        newFieldDialogOpen ||
        newListDialogOpen ||
        partialCopyNote ||
        linkToOpen ||
        pendingBinIds ||
        pendingPermDeleteId ||
        confirmEmptyBin ||
        previewPhotoUrl
      ) {
        setOptionsNote(null);
        setDetailNote(null);
        setEditingNote(null);
        setNewFieldDialogOpen(false);
        setNewListDialogOpen(false);
        setPartialCopyNote(null);
        setLinkToOpen(null);
        setPendingBinIds(null);
        setPendingPermDeleteId(null);
        setConfirmEmptyBin(false);
        setPreviewPhotoUrl(null);
      } else if (activeView !== 'home') {
        setActiveView('home');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    drawerOpen,
    composerExpanded,
    plusMenuOpen,
    selectedNoteIds.size,
    searchActive,
    optionsNote,
    editingNote,
    newFieldDialogOpen,
    newListDialogOpen,
    partialCopyNote,
    linkToOpen,
    pendingBinIds,
    pendingPermDeleteId,
    confirmEmptyBin,
    previewPhotoUrl,
    activeView,
    clearSelection,
    setSearchQueryForActiveView,
    setSearchActive,
    setActiveView,
  ]);

  if (!initialized) {
    return (
      <div className="splash-screen">
        <p>Loading MessyNotes...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const displayedNotes =
    activeView === 'favorites'
      ? applyPinOrdering(getDisplayedFavorites(notes, favSearchQuery))
      : activeView === 'bin'
        ? getDisplayedBinNotes(notes, binSearchQuery)
        : applyPinOrdering(getDisplayedNotes(notes, filterType, homeSearchQuery));

  const binCount = notes.filter((n) => n.deleted_at !== null).length;
  const selectionMode = selectedNoteIds.size > 0;
  const activeSearchQuery =
    activeView === 'favorites'
      ? favSearchQuery
      : activeView === 'bin'
        ? binSearchQuery
        : homeSearchQuery;

  const emptyMessage = activeSearchQuery.trim()
    ? `No notes matching "${activeSearchQuery.trim()}"`
    : activeView === 'favorites'
      ? 'No matching favorites'
      : activeView === 'bin'
        ? 'No notes in bin'
        : filterType === 'field'
          ? 'No Fields-Values yet'
          : filterType === 'list'
            ? 'No Lists yet'
            : 'No notes yet';

  const scrollFeedToTop = () => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadPhoto = async (url: string) => {
    const cleanPath = url.split('?')[0]?.split('#')[0] ?? '';
    const extMatch = /\.([a-zA-Z0-9]{2,5})$/.exec(cleanPath);
    const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
    const filename = `messynote-${Date.now()}.${ext}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showSnackbar({ message: 'Image saved to downloads' });
    } catch {
      const fallback = document.createElement('a');
      fallback.href = url;
      fallback.download = filename;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
      showSnackbar({ message: 'Download started' });
    }
  };

  const handleSendRegular = async () => {
    await createRegularNote({
      userId: user.id,
      rawBody: draftText,
      explicitSpans: draftSpans.length > 0 ? draftSpans : undefined,
      photoFiles: draftPhotos,
    });
    setDraftText('');
    setDraftSpans([]);
    setDraftPhotos([]);
    scrollFeedToTop();
  };

  const showComposer =
    activeView === 'home' && !searchActive && !selectionMode && !composerExpanded;

  return (
    <div className="messynote-shell web-desktop-layout">
      <NavigationDrawer
        persistent
        open
        themeMode={themeMode}
        onToggleTheme={() =>
          setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }
        onClose={() => setDrawerOpen(false)}
      />

      {showComposer && plusMenuOpen && (
        <div
          className="plus-menu-scrim"
          aria-hidden="true"
          onClick={() => setPlusMenuOpen(false)}
        />
      )}

      <main className="workspace-main">
        <TopHeader
          binCount={binCount}
          onOpenDrawer={() => setDrawerOpen(true)}
          onExpandEditor={() => {
            setPlusMenuOpen(false);
            setComposerExpanded(true);
          }}
          onEmptyBin={() => setConfirmEmptyBin(true)}
          onEditSelected={(note) => {
            clearSelection();
            setEditingNote(note);
          }}
          onPartialCopySelected={(note) => {
            clearSelection();
            setPartialCopyNote(note);
          }}
          onDeleteSelected={(ids) => setPendingBinIds(ids)}
        />

        {error && <div className="banner-error">{error}</div>}

        <div className="feed-stage">
          <div ref={feedRef} className="feed-scroll">
            {displayedNotes.length === 0 ? (
              <div className="empty-feed">{emptyMessage}</div>
            ) : (
              <div className="feed-list">
                {displayedNotes.map((note) => (
                  <NoteBubble
                    key={note.id}
                    note={note}
                    isSelected={selectedNoteIds.has(note.id)}
                    selectionMode={selectionMode}
                    showPinBadge={activeView !== 'bin'}
                    onOpenOptions={setOptionsNote}
                    onRequestOpenLink={setLinkToOpen}
                    onPreviewPhoto={setPreviewPhotoUrl}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {showComposer && (
          <div className="composer-dock-floating">
            <div className="composer-floating-wrap">
              <FloatingComposerActions
                plusMenuOpen={plusMenuOpen}
                onTogglePlusMenu={() => setPlusMenuOpen((prev) => !prev)}
                onOpenNewFieldValue={() => setNewFieldDialogOpen(true)}
                onOpenNewList={() => setNewListDialogOpen(true)}
              />
              <BottomComposer
                draftText={draftText}
                draftSpans={draftSpans}
                draftPhotos={draftPhotos}
                onChangeDraft={(t, s) => {
                  setDraftText(t);
                  setDraftSpans(s);
                }}
                onChangePhotos={setDraftPhotos}
                onFocusInput={() => setPlusMenuOpen(false)}
                onSend={() => {
                  setPlusMenuOpen(false);
                  return handleSendRegular();
                }}
              />
            </div>
          </div>
        )}
      </main>

      {snackbar && (
        <div className="snackbar">
          <span>{snackbar.message}</span>
          {snackbar.undoLabel && snackbar.onUndo && (
            <button
              type="button"
              className="snackbar-undo"
              onClick={() => {
                void snackbar.onUndo!();
                showSnackbar(null);
              }}
            >
              {snackbar.undoLabel}
            </button>
          )}
        </div>
      )}

      <NavigationDrawer
        open={drawerOpen}
        themeMode={themeMode}
        onToggleTheme={() =>
          setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }
        onClose={() => setDrawerOpen(false)}
      />

      {optionsNote && (
        <SingleNoteOptionsModal
          note={optionsNote}
          activeView={activeView}
          filterType={filterType}
          onClose={() => setOptionsNote(null)}
          onViewDetail={(n) => setDetailNote(n)}
          onEdit={(n) => setEditingNote(n)}
          onPartialCopy={(n) => setPartialCopyNote(n)}
          onRequestDelete={(ids) => setPendingBinIds(ids)}
          onRequestPermDelete={(id) => setPendingPermDeleteId(id)}
          onRequestOpenLink={(href) => setLinkToOpen(href)}
        />
      )}

      {detailNote && (
        <NoteDetailDialog
          note={detailNote}
          isBin={activeView === 'bin' || detailNote.deleted_at !== null}
          onClose={() => setDetailNote(null)}
          onEdit={(n) => setEditingNote(n)}
          onRequestOpenLink={(href) => setLinkToOpen(href)}
        />
      )}

      {composerExpanded && (
        <ExpandedRegularDialog
          title="New Note"
          initialBody={draftText}
          initialSpans={draftSpans}
          existingPhotos={[]}
          onCancel={(text, spans) => {
            setDraftText(text);
            setDraftSpans(spans);
            setComposerExpanded(false);
          }}
          onSave={async (trimmedBody, trimmedSpans, _kept, newFiles) => {
            await createRegularNote({
              userId: user.id,
              rawBody: trimmedBody,
              explicitSpans: trimmedSpans,
              photoFiles: [...draftPhotos, ...newFiles],
            });
            setDraftText('');
            setDraftSpans([]);
            setDraftPhotos([]);
            setComposerExpanded(false);
            scrollFeedToTop();
          }}
        />
      )}

      {editingNote?.type === 'regular' && (
        <ExpandedRegularDialog
          title="Edit Note"
          initialBody={editingNote.content.body}
          initialSpans={editingNote.content.spans}
          existingPhotos={editingNote.photo_attachments}
          onCancel={() => setEditingNote(null)}
          onSave={async (trimmedBody, trimmedSpans, keptPhotos, newFiles) => {
            if (
              newFiles.length === 0 &&
              !hasNotePatchChanges(editingNote, {
                content: { body: trimmedBody, spans: trimmedSpans },
                photo_attachments: keptPhotos,
              })
            ) {
              setEditingNote(null);
              return;
            }

            const nextPhotos =
              newFiles.length > 0
                ? await uploadPhotosForNote(
                    user.id,
                    editingNote.id,
                    keptPhotos,
                    newFiles
                  )
                : keptPhotos;

            await updateNote(editingNote.id, {
              content: { body: trimmedBody, spans: trimmedSpans },
              photo_attachments: nextPhotos,
            });
            setEditingNote(null);
          }}
        />
      )}

      {(newFieldDialogOpen || editingNote?.type === 'field') && (
        <FieldValueDialog
          existingNote={editingNote?.type === 'field' ? (editingNote as FieldNote) : null}
          onClose={() => {
            setNewFieldDialogOpen(false);
            setEditingNote(null);
          }}
          onSave={async (title, fields, newFiles) => {
            if (editingNote?.type === 'field') {
              await updateNote(editingNote.id, { title, content: { fields } });
              setEditingNote(null);
            } else {
              await createStructuredNote({
                userId: user.id,
                type: 'field',
                title,
                content: { fields },
                photoFiles: newFiles,
              });
              setNewFieldDialogOpen(false);
              scrollFeedToTop();
            }
          }}
        />
      )}

      {(newListDialogOpen || editingNote?.type === 'list') && (
        <ListDialog
          existingNote={editingNote?.type === 'list' ? (editingNote as ListNote) : null}
          onClose={() => {
            setNewListDialogOpen(false);
            setEditingNote(null);
          }}
          onSave={async (title, items, newFiles) => {
            if (editingNote?.type === 'list') {
              await updateNote(editingNote.id, { title, content: { items } });
              setEditingNote(null);
            } else {
              await createStructuredNote({
                userId: user.id,
                type: 'list',
                title,
                content: { items },
                photoFiles: newFiles,
              });
              setNewListDialogOpen(false);
              scrollFeedToTop();
            }
          }}
        />
      )}

      {partialCopyNote && (
        <PartialCopyDialog
          note={partialCopyNote}
          onClose={() => setPartialCopyNote(null)}
        />
      )}

      {linkToOpen && (
        <ConfirmDialog
          title="Open link?"
          message={linkToOpen}
          confirmLabel="Open"
          onCancel={() => setLinkToOpen(null)}
          onConfirm={() => {
            window.open(linkToOpen, '_blank', 'noopener,noreferrer');
            setLinkToOpen(null);
          }}
        />
      )}

      {pendingBinIds && (
        <ConfirmDialog
          title={
            pendingBinIds.length === 1
              ? 'Move 1 note to bin?'
              : `Move ${pendingBinIds.length} notes to bin?`
          }
          message="You can restore deleted notes from the Bin later."
          confirmLabel="Move to bin"
          destructive
          onCancel={() => setPendingBinIds(null)}
          onConfirm={() => {
            void softDeleteNotes(pendingBinIds);
            setPendingBinIds(null);
          }}
        />
      )}

      {pendingPermDeleteId && (
        <ConfirmDialog
          title="Delete note permanently?"
          message="This note and its attached photos cannot be recovered."
          confirmLabel="Delete"
          destructive
          onCancel={() => setPendingPermDeleteId(null)}
          onConfirm={() => {
            void permanentlyDeleteNotes([pendingPermDeleteId]);
            setPendingPermDeleteId(null);
          }}
        />
      )}

      {confirmEmptyBin && (
        <ConfirmDialog
          title="Empty bin?"
          message="All notes in the bin will be permanently deleted."
          confirmLabel="Empty bin"
          destructive
          onCancel={() => setConfirmEmptyBin(false)}
          onConfirm={() => {
            void emptyBin(user.id);
            setConfirmEmptyBin(false);
          }}
        />
      )}

      {previewPhotoUrl && (
        <div className="modal-backdrop photo-viewer-backdrop" onClick={() => setPreviewPhotoUrl(null)}>
          <button
            type="button"
            className="photo-viewer-download-btn"
            aria-label="Download image"
            title="Download image"
            onClick={(e) => {
              e.stopPropagation();
              void handleDownloadPhoto(previewPhotoUrl);
            }}
          >
            <DownloadIcon size={22} />
          </button>
          <img
            src={previewPhotoUrl}
            alt="Attachment preview"
            className="photo-lightbox"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
