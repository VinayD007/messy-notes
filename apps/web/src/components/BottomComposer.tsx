import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  MAX_PHOTOS_PER_NOTE,
  adjustSpansForTextChange,
  type TextSpan,
} from '@messy-notes/shared';
import {
  AddIcon,
  ArrowForwardIcon,
  AttachFileIcon,
  CloseIcon,
} from './MaterialIcons';

interface BottomComposerProps {
  draftText: string;
  draftSpans: TextSpan[];
  draftPhotos: File[];
  onChangeDraft: (text: string, spans: TextSpan[]) => void;
  onChangePhotos: (files: File[]) => void;
  onFocusInput?: () => void;
  onSend: () => Promise<void>;
}

interface FloatingComposerActionsProps {
  plusMenuOpen: boolean;
  onTogglePlusMenu: () => void;
  onOpenNewFieldValue: () => void;
  onOpenNewList: () => void;
}

export function FloatingComposerActions({
  plusMenuOpen,
  onTogglePlusMenu,
  onOpenNewFieldValue,
  onOpenNewList,
}: FloatingComposerActionsProps) {
  return (
    <div className="floating-actions-overlay">
      {plusMenuOpen && (
        <div className="floating-plus-menu">
          <button
            type="button"
            className="m3-menu-pill"
            onClick={() => {
              onTogglePlusMenu();
              onOpenNewFieldValue();
            }}
          >
            Field-Value
          </button>
          <button
            type="button"
            className="m3-menu-pill"
            onClick={() => {
              onTogglePlusMenu();
              onOpenNewList();
            }}
          >
            List
          </button>
        </div>
      )}

      <button
        type="button"
        className={`m3-primary-fab ${plusMenuOpen ? 'open' : ''}`}
        aria-label={plusMenuOpen ? 'Close quick note menu' : 'Create structured note'}
        title="Create structured note"
        onClick={() => {
          if (
            !plusMenuOpen &&
            typeof document !== 'undefined' &&
            document.activeElement instanceof HTMLElement
          ) {
            document.activeElement.blur();
          }
          onTogglePlusMenu();
        }}
      >
        <AddIcon size={20} />
      </button>
    </div>
  );
}

export function BottomComposer({
  draftText,
  draftSpans,
  draftPhotos,
  onChangeDraft,
  onChangePhotos,
  onFocusInput,
  onSend,
}: BottomComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);

  const isMultiline = draftText.includes('\n') || draftText.length > 68;
  const hasDraftText = draftText.trim().length > 0;
  const canSend = (hasDraftText || draftPhotos.length > 0) && !sending;

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      const merged = [...draftPhotos, ...picked].slice(0, MAX_PHOTOS_PER_NOTE);
      onChangePhotos(merged);
    }
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="composer-dock">
      {draftPhotos.length > 0 && (
        <div className="draft-photo-strip">
          {draftPhotos.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="draft-photo-chip">
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  onChangePhotos(draftPhotos.filter((_, i) => i !== idx))
                }
              >
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-row">
        <div className="composer-pill">
          <textarea
            className="composer-input"
            rows={isMultiline ? 3 : 1}
            value={draftText}
            onChange={(e) =>
              onChangeDraft(
                e.target.value,
                adjustSpansForTextChange(draftText, e.target.value, draftSpans)
              )
            }
            onFocus={onFocusInput}
            onKeyDown={handleKeyDown}
            placeholder="Write a note..."
          />

          <div className="composer-pill-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFilePick}
            />
            <button
              type="button"
              className="composer-clip-btn"
              aria-label={`Attach media (${draftPhotos.length}/${MAX_PHOTOS_PER_NOTE})`}
              title={`Attach media (${draftPhotos.length}/${MAX_PHOTOS_PER_NOTE})`}
              onClick={() => {
                onFocusInput?.();
                fileInputRef.current?.click();
              }}
            >
              <AttachFileIcon size={20} />
            </button>

            <button
              type="button"
              className="send-circle-btn"
              disabled={!canSend}
              aria-label="Send note"
              title="Send note (Ctrl+Enter)"
              onClick={() => void handleSubmit()}
            >
              <ArrowForwardIcon size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
