import { useRef, useState } from 'react';
import {
  MAX_PHOTOS_PER_NOTE,
  adjustSpansForTextChange,
  adjustSpansForTrim,
  buildGroupedText,
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
import { MarkdownRenderer } from './MarkdownRenderer';

export function SingleNoteOptionsModal({
  note,
  activeView,
  filterType,
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
  const { toggleFavorite, togglePin, restoreNotes, showSnackbar } = useNotesStore();
  const isBin = activeView === 'bin' || note.deleted_at !== null;
  const canShowPin = !isBin && activeView === 'home' && filterType !== 'all';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildGroupedText(note));
    showSnackbar({ message: 'Copied to clipboard!' });
    onClose();
  };

  const handleShare = async () => {
    const text = buildGroupedText(note);
    if (navigator.share) {
      try {
        await navigator.share({
          title: note.title ?? undefined,
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
            {note.title?.trim() || (isBin ? 'Deleted Note' : 'Note Options')}
          </span>
          {!isBin && (
            <button
              type="button"
              className={`star-toggle-btn ${note.favorite ? 'active' : ''}`}
              title="Toggle favorite"
              onClick={() => void toggleFavorite(note.id)}
            >
              {note.favorite ? '★' : '☆'}
            </button>
          )}
        </div>

        {note.type === 'regular' && note.content.body.trim() && (
          <div className="options-note-preview">
            <MarkdownRenderer
              body={note.content.body}
              spans={note.content.spans}
              onCopyCode={(snippet) => {
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
                  void restoreNotes([note.id]);
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
                  onRequestPermDelete(note.id);
                }}
              >
                Delete permanently
              </button>
            </>
          ) : (
            <>
              {canShowPin && (
                <button
                  type="button"
                  onClick={() => {
                    void togglePin(note.id);
                    onClose();
                  }}
                >
                  {note.pinned ? 'Unpin note' : 'Pin note'}
                </button>
              )}
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
                  onPartialCopy(note);
                }}
              >
                Copy partially
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(note);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onClose();
                  onRequestDelete([note.id]);
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

type EditorViewMode = 'write' | 'split' | 'preview';

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
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(initialBody);
  const [spans, setSpans] = useState<TextSpan[]>(initialSpans);
  const [keptPhotos, setKeptPhotos] = useState<PhotoAttachment[]>(existingPhotos);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<EditorViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 720 ? 'split' : 'write'
  );

  const handleTextChange = (nextText: string) => {
    setSpans((prev) => adjustSpansForTextChange(text, nextText, prev));
    setText(nextText);
  };

  const applyWrapOrPrefix = (
    prefix: string,
    suffix = '',
    placeholder = 'text'
  ) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || placeholder;
    const nextText =
      text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    handleTextChange(nextText);
    requestAnimationFrame(() => {
      el?.focus();
      const cursorStart = start + prefix.length;
      el?.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  };

  const applyLinePrefix = (linePrefix: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextText =
      text.slice(0, lineStart) + linePrefix + text.slice(lineStart);
    handleTextChange(nextText);
    requestAnimationFrame(() => {
      el?.focus();
      const nextPos = start + linePrefix.length;
      el?.setSelectionRange(nextPos, nextPos);
    });
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
      <div className={`fullscreen-dialog ${viewMode === 'split' ? 'split-mode' : ''}`}>
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
            <div className="editor-mode-tabs" role="tablist" aria-label="Editor view mode">
              {(['write', 'split', 'preview'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  className={`editor-mode-tab ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'write' ? 'Write' : mode === 'split' ? 'Split' : 'Preview'}
                </button>
              ))}
            </div>
            {viewMode !== 'preview' && (
              <button
                type="button"
                className="btn-pill-accent-outline"
                onClick={handleApplyMono}
                title="Toggle monospace on selected text"
              >
                Mono
              </button>
            )}
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

        {viewMode !== 'preview' && (
          <div className="md-format-bar">
            <button type="button" onClick={() => applyLinePrefix('# ')}>
              H1
            </button>
            <button type="button" onClick={() => applyLinePrefix('## ')}>
              H2
            </button>
            <button type="button" onClick={() => applyWrapOrPrefix('**', '**', 'bold')}>
              <strong>B</strong>
            </button>
            <button type="button" onClick={() => applyWrapOrPrefix('*', '*', 'italic')}>
              <em>I</em>
            </button>
            <button type="button" onClick={() => applyWrapOrPrefix('`', '`', 'code')}>
              {'`Code`'}
            </button>
            <button type="button" onClick={() => applyLinePrefix('- ')}>
              • List
            </button>
            <button type="button" onClick={() => applyLinePrefix('1. ')}>
              1. List
            </button>
            <button type="button" onClick={() => applyLinePrefix('> ')}>
              “Quote”
            </button>
          </div>
        )}

        <div className={`editor-workspace mode-${viewMode}`}>
          {viewMode !== 'preview' && (
            <textarea
              ref={textareaRef}
              className="fullscreen-textarea"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Write your note in Markdown (# Heading, **bold**, *italic*, - list, > quote, `code`)..."
              autoFocus
            />
          )}

          {viewMode !== 'write' && (
            <div className="md-preview-pane">
              {viewMode === 'split' && (
                <div className="md-preview-pane-label">Live Preview</div>
              )}
              {text.trim() ? (
                <MarkdownRenderer
                  body={text}
                  spans={spans}
                  onCopyCode={(snippet) => {
                    void navigator.clipboard.writeText(snippet);
                    showSnackbar({ message: `Copied: ${snippet}` });
                  }}
                />
              ) : (
                <p className="md-empty-hint">
                  Start typing Markdown on the left to see the live formatted preview.
                </p>
              )}
            </div>
          )}
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
              <input
                type="checkbox"
                checked={row.checked}
                onChange={() =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, checked: !r.checked } : r
                    )
                  )
                }
              />
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
