import { useEffect, useState } from 'react';
import {
  type Note,
  type PhotoAttachment,
} from '@messy-notes/shared';
import { useNotesStore } from '../store/notesStore';
import { CheckIcon, PushPinIcon, StarIcon } from './MaterialIcons';
import { MarkdownRenderer } from './MarkdownRenderer';

interface NoteBubbleProps {
  note: Note;
  isSelected: boolean;
  selectionMode: boolean;
  showPinBadge: boolean;
  onOpenOptions: (note: Note) => void;
  onRequestOpenLink: (normalizedUrl: string) => void;
  onPreviewPhoto: (url: string) => void;
}

export function NoteBubble({
  note,
  isSelected,
  selectionMode,
  showPinBadge,
  onOpenOptions,
  onRequestOpenLink,
  onPreviewPhoto,
}: NoteBubbleProps) {
  const {
    dirtyIds,
    toggleSelectNote,
    toggleListItemChecked,
    showSnackbar,
    getSignedPhotoUrl,
  } = useNotesStore();
  const isDirty = dirtyIds.has(note.id);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    if (note.photo_attachments.length === 0) {
      setPhotoUrls({});
      return;
    }

    void Promise.all(
      note.photo_attachments.map(async (photo) => {
        const url = await getSignedPhotoUrl(photo.storagePath);
        return [photo.id, url] as const;
      })
    ).then((entries) => {
      if (!mounted) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setPhotoUrls(next);
    });

    return () => {
      mounted = false;
    };
  }, [note.photo_attachments, getSignedPhotoUrl]);

  const handleBubbleClick = () => {
    if (selectionMode) {
      toggleSelectNote(note.id);
      return;
    }
    onOpenOptions(note);
  };

  const handleCopyMono = async (snippet: string) => {
    if (selectionMode) {
      toggleSelectNote(note.id);
      return;
    }
    await navigator.clipboard.writeText(snippet);
    showSnackbar({ message: `Copied: ${snippet}` });
  };

  return (
    <article
      className={`note-bubble ${isSelected ? 'selected' : ''}`}
      onClick={handleBubbleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        toggleSelectNote(note.id);
      }}
      tabIndex={0}
      role="button"
    >
      <div className="bubble-top-row">
        <div className="bubble-badges">
          {note.type !== 'regular' && (
            <span className="bubble-kind-pill">
              {note.type === 'field' ? 'Fields-Values' : 'List'}
            </span>
          )}
          {note.favorite && (
            <span className="star-badge" title="Favorite">
              <StarIcon size={16} />
            </span>
          )}
          {isDirty && <span className="queued-tag">Queued</span>}
        </div>

        <div className="bubble-top-right">
          {showPinBadge && note.pinned && (
            <span className="pin-badge" title="Pinned">
              <PushPinIcon size={15} />
            </span>
          )}
          {selectionMode && (
            <span className={`select-circle ${isSelected ? 'checked' : ''}`}>
              {isSelected ? <CheckIcon size={14} /> : null}
            </span>
          )}
        </div>
      </div>

      {note.title ? <h3 className="bubble-title">{note.title}</h3> : null}

      {note.type === 'regular' && (
        <div className="bubble-text">
          <MarkdownRenderer
            body={note.content.body}
            spans={note.content.spans}
            stopBubbleClick
            onCopyCode={(snippet) => {
              void handleCopyMono(snippet);
            }}
            onOpenLink={(href) => {
              if (selectionMode) {
                toggleSelectNote(note.id);
              } else {
                onRequestOpenLink(href);
              }
            }}
          />
        </div>
      )}

      {note.type === 'field' && (
        <div className="bubble-structured-list">
          {[...note.content.fields]
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((entry, idx) => (
              <div key={entry.id} className="bubble-field-row">
                <span className="row-num">{idx + 1}.</span>
                <span className="field-name">{entry.field}</span>
                <span className="field-eq">=</span>
                <span className="field-val">{entry.value}</span>
              </div>
            ))}
        </div>
      )}

      {note.type === 'list' && (
        <div className="bubble-structured-list">
          {[...note.content.items]
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((item, idx) => (
              <div
                key={item.id}
                className={`bubble-list-row ${item.checked ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectionMode) {
                    toggleSelectNote(note.id);
                  } else {
                    void toggleListItemChecked(note.id, item.id);
                  }
                }}
              >
                <span className={`mini-check ${item.checked ? 'checked' : ''}`}>
                  {item.checked ? <CheckIcon size={12} /> : null}
                </span>
                <span className="row-num">{idx + 1}.</span>
                <span className="list-val">{item.value}</span>
              </div>
            ))}
        </div>
      )}

      {note.photo_attachments.length > 0 && (
        <PhotoStrip
          attachments={note.photo_attachments}
          photoUrls={photoUrls}
          onPreviewPhoto={onPreviewPhoto}
        />
      )}

      <div className="bubble-footer">
        <span className="bubble-time">
          {new Date(note.created_at).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {note.updated_at !== note.created_at ? ' · edited' : ''}
        </span>
        {!selectionMode && (
          <button
            type="button"
            className="bubble-select-trigger"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelectNote(note.id);
            }}
          >
            Select
          </button>
        )}
      </div>
    </article>
  );
}

function PhotoStrip({
  attachments,
  photoUrls,
  onPreviewPhoto,
}: {
  attachments: PhotoAttachment[];
  photoUrls: Record<string, string>;
  onPreviewPhoto: (url: string) => void;
}) {
  return (
    <div className="photo-strip">
      {attachments.map((photo) => {
        const url = photoUrls[photo.id];
        return url ? (
          <button
            key={photo.id}
            type="button"
            className="photo-thumb-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPreviewPhoto(url);
            }}
          >
            <img src={url} alt={photo.fileName} className="photo-thumb" />
          </button>
        ) : (
          <div key={photo.id} className="photo-unavailable">
            Image
          </div>
        );
      })}
    </div>
  );
}
