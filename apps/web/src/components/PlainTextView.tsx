import { Fragment, type MouseEvent } from 'react';
import { buildStyledSegments, type TextSpan } from '@messy-notes/shared';

interface PlainTextViewProps {
  body: string;
  spans?: TextSpan[];
  onCopyMono?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
  stopBubbleClick?: boolean;
  className?: string;
}

/**
 * Renders regular note text strictly as plain text with explicit monospace
 * copy chips and auto-detected clickable URLs (without Markdown parsing).
 */
export function PlainTextView({
  body,
  spans = [],
  onCopyMono,
  onOpenLink,
  stopBubbleClick = false,
  className = '',
}: PlainTextViewProps) {
  const segments = buildStyledSegments(body, spans);

  if (segments.length === 0) {
    return null;
  }

  const handleMonoClick = (e: MouseEvent, snippet: string) => {
    if (stopBubbleClick) {
      e.stopPropagation();
    }
    onCopyMono?.(snippet);
  };

  const handleLinkClick = (e: MouseEvent, href: string) => {
    e.preventDefault();
    if (stopBubbleClick) {
      e.stopPropagation();
    }
    onOpenLink?.(href);
  };

  return (
    <div className={`plain-note-body ${className}`.trim()}>
      {segments.map((seg, idx) => {
        if (seg.kind === 'mono') {
          return (
            <button
              key={idx}
              type="button"
              className="mono-chip"
              title="Click to copy"
              onClick={(e) => handleMonoClick(e, seg.text)}
            >
              {seg.text}
            </button>
          );
        }

        if (seg.kind === 'url' && seg.normalizedUrl) {
          return (
            <button
              key={idx}
              type="button"
              className="link-chip"
              onClick={(e) => handleLinkClick(e, seg.normalizedUrl!)}
            >
              {seg.text}
            </button>
          );
        }

        return <Fragment key={idx}>{seg.text}</Fragment>;
      })}
    </div>
  );
}
