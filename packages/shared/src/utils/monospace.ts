import type { TextSpan } from '../types/note';

/**
 * Parses paired inline backtick sequences (e.g. `api_key`) into stripped plain
 * text plus TextSpan offsets. Unmatched single backticks are preserved literally.
 */
export function parseBackticksToSpans(rawText: string): {
  text: string;
  spans: TextSpan[];
} {
  const spans: TextSpan[] = [];
  let result = '';
  let i = 0;

  while (i < rawText.length) {
    if (rawText[i] === '`') {
      // Preserve multi-backtick runs (such as ``` fenced code blocks) literally.
      if (rawText[i + 1] === '`') {
        while (i < rawText.length && rawText[i] === '`') {
          result += rawText[i];
          i += 1;
        }
        continue;
      }

      const closing = rawText.indexOf('`', i + 1);
      if (
        closing > i + 1 &&
        rawText[closing + 1] !== '`' &&
        !rawText.slice(i + 1, closing).includes('\n')
      ) {
        const inner = rawText.slice(i + 1, closing);
        const start = result.length;
        result += inner;
        spans.push({ start, end: result.length, type: 'mono' });
        i = closing + 1;
        continue;
      }
    }
    result += rawText[i];
    i += 1;
  }

  return { text: result, spans };
}

/**
 * Adjusts monospace span indices when text is edited inside a plain-text
 * input, preserving existing spans outside the modified range.
 */
export function adjustSpansForTextChange(
  prevText: string,
  nextText: string,
  spans: TextSpan[]
): TextSpan[] {
  if (prevText === nextText || spans.length === 0) {
    return spans;
  }

  let prefixLen = 0;
  const minLen = Math.min(prevText.length, nextText.length);
  while (prefixLen < minLen && prevText[prefixLen] === nextText[prefixLen]) {
    prefixLen += 1;
  }

  let prevEnd = prevText.length;
  let nextEnd = nextText.length;
  while (
    prevEnd > prefixLen &&
    nextEnd > prefixLen &&
    prevText[prevEnd - 1] === nextText[nextEnd - 1]
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  const delta = nextText.length - prevText.length;
  const updated: TextSpan[] = [];

  for (const span of spans) {
    if (span.end <= prefixLen) {
      updated.push(span);
    } else if (span.start >= prevEnd) {
      updated.push({
        ...span,
        start: span.start + delta,
        end: span.end + delta,
      });
    } else {
      const newStart = Math.min(span.start, prefixLen);
      const newEnd = Math.max(newStart, span.end + delta);
      if (newEnd > newStart && newEnd <= nextText.length) {
        updated.push({ ...span, start: newStart, end: newEnd });
      }
    }
  }

  return normalizeSpans(updated, nextText.length);
}

/**
 * Shifts monospace span offsets accurately when trimming leading/trailing whitespace.
 */
export function adjustSpansForTrim(rawText: string, spans: TextSpan[]): {
  text: string;
  spans: TextSpan[];
} {
  const leading = rawText.length - rawText.trimStart().length;
  const trimmed = rawText.trim();

  if (!trimmed) {
    return { text: '', spans: [] };
  }

  const adjusted = spans
    .map((span) => ({
      ...span,
      start: Math.max(0, span.start - leading),
      end: Math.min(trimmed.length, span.end - leading),
    }))
    .filter((span) => span.end > span.start);

  return { text: trimmed, spans: normalizeSpans(adjusted, trimmed.length) };
}

/**
 * Applies a monospace span over a text selection [start, end) or toggles it off
 * if the exact range is already marked monospace.
 */
export function toggleMonoSpan(
  spans: TextSpan[],
  start: number,
  end: number,
  textLength: number
): TextSpan[] {
  if (end <= start || start < 0 || end > textLength) {
    return spans;
  }

  const exactIndex = spans.findIndex((s) => s.start === start && s.end === end);
  if (exactIndex !== -1) {
    return spans.filter((_, idx) => idx !== exactIndex);
  }

  return normalizeSpans([...spans, { start, end, type: 'mono' }], textLength);
}

export function normalizeSpans(spans: TextSpan[], textLength: number): TextSpan[] {
  const valid = spans
    .map((s) => ({
      start: Math.max(0, Math.min(s.start, textLength)),
      end: Math.max(0, Math.min(s.end, textLength)),
      type: 'mono' as const,
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: TextSpan[] = [];
  for (const span of valid) {
    const prev = merged[merged.length - 1];
    if (prev && span.start <= prev.end) {
      prev.end = Math.max(prev.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}
