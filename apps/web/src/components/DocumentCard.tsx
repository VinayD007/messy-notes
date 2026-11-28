import { useState } from 'react';
import {
  formatFileSize,
  getDocumentBadge,
  type NoteAttachment,
} from '@messy-notes/shared';
import { useNotesStore } from '../store/notesStore';

export function DocumentCard({ attachment }: { attachment: NoteAttachment }) {
  const [opening, setOpening] = useState(false);
  const getSignedPhotoUrl = useNotesStore((s) => s.getSignedPhotoUrl);
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const badge = getDocumentBadge(attachment.mimeType, attachment.fileName);
  const sizeLabel = formatFileSize(attachment.fileSize);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (opening) return;
    setOpening(true);

    try {
      const url = await getSignedPhotoUrl(attachment.storagePath);
      if (!url) {
        showSnackbar({
          message: 'Could not access file. Please check your connection.',
        });
        return;
      }

      const isPdfOrText =
        attachment.mimeType === 'application/pdf' ||
        attachment.mimeType.startsWith('text/') ||
        attachment.fileName.toLowerCase().endsWith('.pdf') ||
        attachment.fileName.toLowerCase().endsWith('.txt');

      if (isPdfOrText) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      showSnackbar({ message: 'Failed to open file' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className="web-document-card"
      role="button"
      tabIndex={0}
      title={`Open ${attachment.fileName}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      <div
        className="web-doc-badge"
        style={{
          color: badge.color,
          backgroundColor: `${badge.color}1E`,
          borderColor: `${badge.color}55`,
        }}
      >
        {badge.label}
      </div>

      <div className="web-doc-meta">
        <span className="web-doc-name">{attachment.fileName}</span>
        {sizeLabel && <span className="web-doc-size">{sizeLabel}</span>}
      </div>

      <div className="web-doc-action">
        {opening ? (
          <span style={{ fontSize: '0.75rem' }}>...</span>
        ) : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        )}
      </div>
    </div>
  );
}
