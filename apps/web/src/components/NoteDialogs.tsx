import { useRef, useState } from 'react';
import {
  MAX_PHOTOS_PER_NOTE,
  adjustSpansForTextChange,
  adjustSpansForTrim,
  buildGroupedText,
  canPinNote,
  joinPartialCopyTokens,
  toggleMonoSpan,
  tokenizeForPartialCopy,
  type FieldNote,
  type FieldValueEntry,
  type ListNote,
  type ListRowEntry,
  type Note,
  type NoteFilter,
  type NoteView,
  type PhotoAttachment,
  type TextSpan,
} from '@messy-notes/shared';
import { useNotesStore } from '../store/notesStore';
import {
  PushPinIcon,
  PushPinOutlinedIcon,
  StarBorderIcon,
  StarIcon,
} from './MaterialIcons';
import { PlainTextView } from './PlainTextView';

export function SingleNoteOptionsModal({
  note,
  activeView,
  filterType: _filterType,
  onClose,
  onEdit,
  onPartialCopy,
  onRequestDelete,
  onRequestPermDelete,
  onRequestOpenLink,
}: {
  note: Note;
  activeView: NoteView;
  filterType: NoteFilter;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onPartialCopy: (note: Note) => void;
  onRequestDelete: (noteIds: string[]) => void;
  onRequestPermDelete: (noteId: string) => void;
  onRequestOpenLink?: (href: string) => void;
}) {
  const { notes, toggleFavorite, togglePin, restoreNotes, showSnackbar } = useNotesStore();
  const liveNote = notes.find((n) => n.id === note.id) ?? note;
  const [optimisticFavorite, setOptimisticFavorite] = useState<{
    noteId: string;
    favorite: boolean;
  } | null>(null);
  const [optimisticPin, setOptimisticPin] = useState<{
    noteId: string;
    pinned: boolean;
  } | null>(null);
  const isFavorite =
    optimisticFavorite?.noteId === liveNote.id
      ? optimisticFavorite.favorite
      : liveNote.favorite;
  const isPinned =
    optimisticPin?.noteId === liveNote.id
      ? optimisticPin.pinned
      : liveNote.pinned;
  const isBin = activeView === 'bin' || liveNote.deleted_at !== null;

  const handleToggleFavorite = () => {
    const nextFavorite = !isFavorite;
    setOptimisticFavorite({ noteId: liveNote.id, favorite: nextFavorite });
    void toggleFavorite(liveNote.id).finally(() => {
      setOptimisticFavorite((current) =>
        current?.noteId === liveNote.id && current.favorite === nextFavorite
          ? null
          : current
      );
    });
  };

  const handleTogglePin = () => {
    const check = canPinNote(notes, { ...liveNote, pinned: isPinned });
    if (!check.allowed) {
      showSnackbar({ message: check.reason! });
      return;
    }
    const nextPinned = !isPinned;
    setOptimisticPin({ noteId: liveNote.id, pinned: nextPinned });
    void togglePin(liveNote.id).finally(() => {
      setOptimisticPin((current) =>
        current?.noteId === liveNote.id && current.pinned === nextPinned
          ? null
          : current
      );
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildGroupedText(liveNote));
    showSnackbar({ message: 'Copied to clipboard!' });
    onClose();
  };

  const handleShare = async () => {
    const text = buildGroupedText(liveNote);
    if (navigator.share) {
      try {
        await navigator.share({
          title: liveNote.title ?? undefined,
          text,
        });
        onClose();
        return;
      } catch {
        // User cancelled share sheet or unsupported desktop browser.
      }
    }
    await navigator.clipboard.writeText(text);
    showSnackbar({ message: 'Copied note text for sharing' });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="options-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">
            {liveNote.title?.trim() || (isBin ? 'Deleted Note' : 'Note Options')}
          </span>
          {!isBin && (
            <div className="sheet-header-actions">
              <button
                type="button"
                className={`pin-toggle-btn ${isPinned ? 'active' : ''}`}
                aria-label={isPinned ? 'Unpin note' : 'Pin note'}
                title={isPinned ? 'Unpin note' : 'Pin note'}
                aria-pressed={isPinned}
                onClick={handleTogglePin}
              >
                {isPinned ? (
                  <PushPinIcon size={21} />
                ) : (
                  <PushPinOutlinedIcon size={21} />
                )}
              </button>
              <button
                type="button"
                className={`star-toggle-btn ${isFavorite ? 'active' : ''}`}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                title="Toggle favorite"
                aria-pressed={isFavorite}
                onClick={handleToggleFavorite}
              >
                {isFavorite ? (
                  <StarIcon size={22} />
                ) : (
                  <StarBorderIcon size={22} />
                )}
              </button>
            </div>
          )}
        </div>

        {liveNote.type === 'regular' && liveNote.content.body.trim() && (
          <div className="options-note-preview">
            <PlainTextView
              body={liveNote.content.body}
              spans={liveNote.content.spans}
              onCopyMono={(snippet) => {
                void navigator.clipboard.writeText(snippet);
                showSnackbar({ message: `Copied: ${snippet}` });
              }}
              onOpenLink={(href) => {
                onClose();
                onRequestOpenLink?.(href);
              }}
            />
          </div>
        )}

        <div className="sheet-actions">
          {isBin ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void restoreNotes([liveNote.id]);
                  onClose();
                }}
              >
                Restore
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onClose();
                  onRequestPermDelete(liveNote.id);
                }}
              >
                Delete permanently
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void handleShare()}>
                Share
              </button>
              <button type="button" onClick={() => void handleCopy()}>
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPartialCopy(liveNote);
                }}
              >
                Copy partially
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(liveNote);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onClose();
                  onRequestDelete([liveNote.id]);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExpandedRegularDialog({
  title,
  initialBody,
  initialSpans,
  existingPhotos,
  onCancel,
  onSave,
}: {
  title: string;
  initialBody: string;
  initialSpans: TextSpan[];
  existingPhotos: PhotoAttachment[];
  onCancel: (currentText: string, currentSpans: TextSpan[]) => void;
  onSave: (
    trimmedBody: string,
    trimmedSpans: TextSpan[],
    keptPhotos: PhotoAttachment[],
    newFiles: File[]
  ) => Promise<void>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(initialBody);
  const [spans, setSpans] = useState<TextSpan[]>(initialSpans);
  const [keptPhotos, setKeptPhotos] = useState<PhotoAttachment[]>(existingPhotos);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const handleTextChange = (nextText: string) => {
    setSpans((prev) => adjustSpansForTextChange(text, nextText, prev));
    setText(nextText);
  };

  const handleApplyMono = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) return;
    setSpans((prev) => toggleMonoSpan(prev, start, end, text.length));
  };

  const handleSave = async () => {
    const { text: trimmed, spans: trimmedSpans } = adjustSpansForTrim(text, spans);
    if (!trimmed && keptPhotos.length === 0 && newFiles.length === 0) return;

    setSaving(true);
    try {
      await onSave(trimmed, trimmedSpans, keptPhotos, newFiles);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="fullscreen-dialog">
        <div className="dialog-header">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onCancel(text, spans)}
          >
            Close
          </button>
          <strong>{title}</strong>
          <div className="dialog-header-right">
            <button
              type="button"
              className="btn-pill-accent-outline"
              onClick={handleApplyMono}
              title="Toggle monospace on selected text"
            >
              Mono
            </button>
            <button
              type="button"
              className="btn-accent"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="editor-workspace">
          <textarea
            ref={textareaRef}
            className="fullscreen-textarea"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Write a note..."
            autoFocus
          />
        </div>

        {spans.length > 0 && (
          <div className="mono-preview-bar">
            <span className="muted-sm">Monospace snippets:</span>
            {spans.map((s, idx) => (
              <span key={idx} className="mono-chip">
                {text.slice(s.start, s.end)}
              </span>
            ))}
          </div>
        )}

        <div className="dialog-photo-footer">
          <label className="btn-secondary-pill">
            + Photos ({keptPhotos.length + newFiles.length}/{MAX_PHOTOS_PER_NOTE})
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const room = Math.max(
                  0,
                  MAX_PHOTOS_PER_NOTE - keptPhotos.length - newFiles.length
                );
                if (room > 0 && files.length > 0) {
                  setNewFiles((prev) => [...prev, ...files.slice(0, room)]);
                }
                e.target.value = '';
              }}
            />
          </label>
          {keptPhotos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="draft-photo-chip"
              onClick={() =>
                setKeptPhotos((prev) => prev.filter((item) => item.id !== p.id))
              }
            >
              {p.fileName} ×
            </button>
          ))}
          {newFiles.map((f, idx) => (
            <button
              key={`${f.name}-${idx}`}
              type="button"
              className="draft-photo-chip"
              onClick={() =>
                setNewFiles((prev) => prev.filter((_, i) => i !== idx))
              }
            >
              {f.name} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FieldValueDialog({
  existingNote,
  onClose,
  onSave,
}: {
  existingNote: FieldNote | null;
  onClose: () => void;
  onSave: (title: string | null, fields: FieldValueEntry[], newFiles: File[]) => Promise<void>;
}) {
  const initialFields: FieldValueEntry[] = existingNote?.content.fields.length
    ? [...existingNote.content.fields].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      )
    : [{ id: crypto.randomUUID(), field: '', value: '', insertionOrder: 0 }];

  const [title, setTitle] = useState(existingNote?.title ?? '');
  const [rows, setRows] = useState<FieldValueEntry[]>(initialFields);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);

  const lastRow = rows[rows.length - 1];
  const lastRowBlank = !lastRow || (!lastRow.field.trim() && !lastRow.value.trim());

  const isDirty =
    title !== (existingNote?.title ?? '') ||
    JSON.stringify(rows) !== JSON.stringify(initialFields) ||
    newFiles.length > 0;

  const handleSave = async () => {
    const valid = rows
      .filter((r) => r.field.trim() || r.value.trim())
      .map((r, idx) => ({
        ...r,
        field: r.field.trim(),
        value: r.value.trim(),
        insertionOrder: idx,
      }));
    if (valid.length === 0) return;

    setSaving(true);
    try {
      await onSave(title.trim() || null, valid, newFiles);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="fullscreen-dialog">
        <div className="dialog-header">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => (isDirty ? setConfirmDiscard(true) : onClose())}
          >
            Cancel
          </button>
          <strong>{existingNote ? 'Edit Field-Value' : 'New Field-Value'}</strong>
          <button
            type="button"
            className="btn-accent"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="structured-editor-body">
          <input
            type="text"
            className="structured-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
          />

          {rows.map((row, idx) => (
            <div key={row.id} className="structured-row-card">
              <span className="row-num">{idx + 1}.</span>
              <input
                type="text"
                value={row.field}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, field: e.target.value } : r))
                  )
                }
                placeholder="Field"
              />
              <button
                type="button"
                className="field-eq-btn"
                title="Equals"
                tabIndex={-1}
                onClick={(e) => {
                  const nextInput = e.currentTarget.nextElementSibling as HTMLInputElement | null;
                  nextInput?.focus();
                }}
              >
                =
              </button>
              <input
                type="text"
                value={row.value}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r))
                  )
                }
                placeholder="Value"
              />
              <button
                type="button"
                className="btn-ghost danger-text"
                disabled={rows.length <= 1}
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary-pill"
            disabled={lastRowBlank}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  field: '',
                  value: '',
                  insertionOrder: prev.length,
                },
              ])
            }
          >
            + Add Row
          </button>

          {!existingNote && (
            <label className="btn-secondary-pill">
              + Photos ({newFiles.length}/{MAX_PHOTOS_PER_NOTE})
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setNewFiles((prev) =>
                    [...prev, ...files].slice(0, MAX_PHOTOS_PER_NOTE)
                  );
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        {confirmDiscard && (
          <ConfirmDialog
            title="Discard changes?"
            message="Your unsaved changes will be lost."
            confirmLabel="Discard"
            destructive
            onCancel={() => setConfirmDiscard(false)}
            onConfirm={onClose}
          />
        )}
      </div>
    </div>
  );
}

export function ListDialog({
  existingNote,
  onClose,
  onSave,
}: {
  existingNote: ListNote | null;
  onClose: () => void;
  onSave: (title: string | null, items: ListRowEntry[], newFiles: File[]) => Promise<void>;
}) {
  const initialItems: ListRowEntry[] = existingNote?.content.items.length
    ? [...existingNote.content.items].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      )
    : [{ id: crypto.randomUUID(), value: '', checked: false, insertionOrder: 0 }];

  const [title, setTitle] = useState(existingNote?.title ?? '');
  const [rows, setRows] = useState<ListRowEntry[]>(initialItems);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);

  const isDirty =
    title !== (existingNote?.title ?? '') ||
    JSON.stringify(rows) !== JSON.stringify(initialItems) ||
    newFiles.length > 0;

  const handleSave = async () => {
    const valid = rows
      .filter((r) => r.value.trim())
      .map((r, idx) => ({
        ...r,
        value: r.value.trim(),
        insertionOrder: idx,
      }));
    if (valid.length === 0) return;

    setSaving(true);
    try {
      await onSave(title.trim() || null, valid, newFiles);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="fullscreen-dialog">
        <div className="dialog-header">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => (isDirty ? setConfirmDiscard(true) : onClose())}
          >
            Cancel
          </button>
          <strong>{existingNote ? 'Edit List' : 'New List'}</strong>
          <button
            type="button"
            className="btn-accent"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="structured-editor-body">
          <input
            type="text"
            className="structured-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
          />

          {rows.map((row, idx) => (
            <div key={row.id} className="structured-row-card">
              <span className="row-num">{idx + 1}.</span>
              <input
                type="text"
                value={row.value}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r))
                  )
                }
                placeholder="List item"
              />
              <button
                type="button"
                className="btn-ghost danger-text"
                disabled={rows.length <= 1}
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary-pill"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  value: '',
                  checked: false,
                  insertionOrder: prev.length,
                },
              ])
            }
          >
            + Add Row
          </button>

          {!existingNote && (
            <label className="btn-secondary-pill">
              + Photos ({newFiles.length}/{MAX_PHOTOS_PER_NOTE})
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setNewFiles((prev) =>
                    [...prev, ...files].slice(0, MAX_PHOTOS_PER_NOTE)
                  );
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        {confirmDiscard && (
          <ConfirmDialog
            title="Discard changes?"
            message="Your unsaved changes will be lost."
            confirmLabel="Discard"
            destructive
            onCancel={() => setConfirmDiscard(false)}
            onConfirm={onClose}
          />
        )}
      </div>
    </div>
  );
}

export function PartialCopyDialog({
  note,
  onClose,
}: {
  note: Note;
  onClose: () => void;
}) {
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const tokens = tokenizeForPartialCopy(note);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCopySnippet = async () => {
    const snippet = joinPartialCopyTokens(note, tokens, selected);
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    showSnackbar({ message: 'Snippet copied to clipboard!' });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="confirm-dialog partial-copy-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Copy partially</h3>
        <div className="partial-copy-toolbar">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSelected(new Set(tokens.map((_, i) => i)))}
          >
            All
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>

        <div className="partial-chips-wrap">
          {tokens.map((token, idx) => (
            <button
              key={idx}
              type="button"
              className={`partial-chip ${selected.has(idx) ? 'selected' : ''}`}
              onClick={() => toggle(idx)}
            >
              {token}
            </button>
          ))}
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-accent"
            disabled={selected.size === 0}
            onClick={() => void handleCopySnippet()}
          >
            Copy Snippet
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={destructive ? 'btn-danger' : 'btn-accent'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
