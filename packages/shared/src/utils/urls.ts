import type { Note, TextSpan } from '../types/note';

export interface UrlSpan {
  start: number;
  end: number;
  raw: string;
  normalizedUrl: string;
}

export interface TextSegment {
  text: string;
  kind: 'plain' | 'mono' | 'url';
  normalizedUrl?: string;
}

const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|app|co|ai|edu|gov|me|info|xyz)(?:\/[^\s<>()[\]{}"']*)?/gi;

const TRAILING_PUNCTUATION_REGEX = /[.,;:!?)}\]"']+$/;

export function normalizeUrlForIntent(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts clickable web URL ranges from text while stripping trailing sentence
 * punctuation so links like "See https://example.com." resolve cleanly.
 */
export function extractUrlSpans(text: string): UrlSpan[] {
  if (!text) return [];
  const spans: UrlSpan[] = [];
  URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const rawCandidate = match[0];
    const stripped = rawCandidate.replace(TRAILING_PUNCTUATION_REGEX, '');
    if (!stripped) continue;

    const start = match.index;
    const end = start + stripped.length;
    spans.push({
      start,
      end,
      raw: stripped,
      normalizedUrl: normalizeUrlForIntent(stripped),
    });
  }

  return spans;
}

/**
 * Splits note text into non-overlapping styled segments for rendering monospace
 * snippets (highest priority for quick-copy) and clickable URLs.
 */
export function buildStyledSegments(
  text: string,
  monoSpans: TextSpan[]
): TextSegment[] {
  if (!text) return [];

  const urlSpans = extractUrlSpans(text);
  const ranges: Array<{
    start: number;
    end: number;
    kind: 'mono' | 'url';
    normalizedUrl?: string;
  }> = [];

  for (const mono of monoSpans) {
    if (mono.end > mono.start && mono.end <= text.length) {
      ranges.push({ start: mono.start, end: mono.end, kind: 'mono' });
    }
  }

  for (const url of urlSpans) {
    const overlapsMono = ranges.some(
      (r) => url.start < r.end && url.end > r.start
    );
    if (!overlapsMono) {
      ranges.push({
        start: url.start,
        end: url.end,
        kind: 'url',
        normalizedUrl: url.normalizedUrl,
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), kind: 'plain' });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      kind: range.kind,
      normalizedUrl: range.normalizedUrl,
    });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), kind: 'plain' });
  }

  return segments;
}

/**
 * Tokenizes a note for the Partial Copy dialog per Section 6.12:
 *  - Regular: whitespace-delimited words, keeping URLs intact as single tokens.
 *  - Field-Value: keys and values as separate chips (no row numbers or '=').
 *  - List: each row as a single chip.
 */
export function tokenizeForPartialCopy(note: Note): string[] {
  switch (note.type) {
    case 'regular': {
      const text = note.content.body.trim();
      if (!text) return [];

      const urls = extractUrlSpans(text);
      const tokens: string[] = [];
      let cursor = 0;

      for (const url of urls) {
        if (url.start > cursor) {
          const prefixWords = text
            .slice(cursor, url.start)
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          tokens.push(...prefixWords);
        }
        tokens.push(url.raw);
        cursor = url.end;
      }

      if (cursor < text.length) {
        const suffixWords = text
          .slice(cursor)
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        tokens.push(...suffixWords);
      }

      return tokens;
    }

    case 'field': {
      const sorted = [...note.content.fields].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      );
      const tokens: string[] = [];
      for (const entry of sorted) {
        if (entry.field.trim()) tokens.push(entry.field.trim());
        if (entry.value.trim()) tokens.push(entry.value.trim());
      }
      return tokens;
    }

    case 'list': {
      const sorted = [...note.content.items].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      );
      return sorted.map((item) => item.value.trim()).filter(Boolean);
    }
  }
}

export function joinPartialCopyTokens(
  note: Note,
  tokens: string[],
  selectedIndices: ReadonlySet<number>
): string {
  const chosen = tokens.filter((_, idx) => selectedIndices.has(idx));
  const separator = note.type === 'list' ? '\n' : ' ';
  return chosen.join(separator);
}
