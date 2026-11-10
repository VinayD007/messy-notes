import { Lexer, type Token, type Tokens } from 'marked';
import type { TextSpan } from '../types/note';
import { normalizeSpans } from './monospace';
import { extractUrlSpans } from './urls';

export type MarkdownInlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MarkdownInlineNode[] }
  | { type: 'em'; children: MarkdownInlineNode[] }
  | { type: 'del'; children: MarkdownInlineNode[] }
  | { type: 'code'; text: string }
  | {
      type: 'link';
      href: string;
      children: MarkdownInlineNode[];
    };

export type MarkdownBlockNode =
  | {
      type: 'heading';
      depth: 1 | 2 | 3 | 4 | 5 | 6;
      inlines: MarkdownInlineNode[];
    }
  | {
      type: 'paragraph';
      inlines: MarkdownInlineNode[];
    }
  | {
      type: 'blockquote';
      blocks: MarkdownBlockNode[];
    }
  | {
      type: 'list';
      ordered: boolean;
      start: number;
      items: MarkdownListItemNode[];
    }
  | {
      type: 'code_block';
      lang?: string;
      text: string;
    }
  | {
      type: 'table';
      headers: MarkdownInlineNode[][];
      rows: MarkdownInlineNode[][][];
    }
  | {
      type: 'hr';
    };

export interface MarkdownListItemNode {
  task: boolean;
  checked?: boolean;
  blocks: MarkdownBlockNode[];
}

const SPAN_SENTINEL_START = '\uE010';
const SPAN_SENTINEL_END = '\uE011';
const SPAN_SENTINEL_REGEX = /\uE010(\d+)\uE011/g;

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'https://invalid.local');
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
      return false;
    }
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

/**
 * Replaces explicit monospace `TextSpan` slices (split across line breaks so
 * markdown block prefixes remain intact) with PUA placeholders before lexing.
 * Also protects literals by stripping accidental PUA delimiters from user input.
 */
function prepareTextWithMonoPlaceholders(
  body: string,
  spans: TextSpan[]
): { prepared: string; spanMap: Map<number, string> } {
  const sanitized = body.replace(/[\uE010\uE011]/g, '');
  const normalized = normalizeSpans(spans, body.length);
  const spanMap = new Map<number, string>();

  if (normalized.length === 0 || sanitized !== body) {
    return { prepared: sanitized, spanMap };
  }

  let prepared = '';
  let cursor = 0;
  let seq = 0;

  for (const span of normalized) {
    if (span.start > cursor) {
      prepared += body.slice(cursor, span.start);
    }

    const rawSlice = body.slice(span.start, span.end);
    // Keep line boundaries intact so block-level syntax (`#`, `>`, `-`) across lines works.
    const lineParts = rawSlice.split('\n');
    const encodedParts = lineParts.map((part) => {
      if (!part) return '';
      const id = seq;
      seq += 1;
      spanMap.set(id, part);
      return `${SPAN_SENTINEL_START}${id}${SPAN_SENTINEL_END}`;
    });
    prepared += encodedParts.join('\n');
    cursor = span.end;
  }

  if (cursor < body.length) {
    prepared += body.slice(cursor);
  }

  return { prepared, spanMap };
}

function splitPlainTextWithUrls(text: string): MarkdownInlineNode[] {
  if (!text) return [];
  const urlSpans = extractUrlSpans(text);
  if (urlSpans.length === 0) {
    return [{ type: 'text', text }];
  }

  const nodes: MarkdownInlineNode[] = [];
  let cursor = 0;

  for (const span of urlSpans) {
    if (span.start > cursor) {
      nodes.push({ type: 'text', text: text.slice(cursor, span.start) });
    }
    nodes.push({
      type: 'link',
      href: span.normalizedUrl,
      children: [{ type: 'text', text: span.raw }],
    });
    cursor = span.end;
  }

  if (cursor < text.length) {
    nodes.push({ type: 'text', text: text.slice(cursor) });
  }

  return nodes;
}

function splitTextAndSentinels(
  rawText: string,
  spanMap: Map<number, string>
): MarkdownInlineNode[] {
  if (!rawText) return [];
  if (spanMap.size === 0) {
    return splitPlainTextWithUrls(rawText);
  }

  const result: MarkdownInlineNode[] = [];
  SPAN_SENTINEL_REGEX.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = SPAN_SENTINEL_REGEX.exec(rawText)) !== null) {
    if (match.index > cursor) {
      result.push(...splitPlainTextWithUrls(rawText.slice(cursor, match.index)));
    }
    const id = Number(match[1]);
    const original = spanMap.get(id);
    if (original !== undefined) {
      result.push({ type: 'code', text: original });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < rawText.length) {
    result.push(...splitPlainTextWithUrls(rawText.slice(cursor)));
  }

  return result;
}

function restoreSentinelsPlain(
  text: string,
  spanMap: Map<number, string>
): string {
  if (spanMap.size === 0) return text;
  return text.replace(SPAN_SENTINEL_REGEX, (_full, idStr) => {
    return spanMap.get(Number(idStr)) ?? '';
  });
}

function mapInlineTokens(
  tokens: Token[] | undefined,
  spanMap: Map<number, string>
): MarkdownInlineNode[] {
  if (!tokens || tokens.length === 0) return [];
  const nodes: MarkdownInlineNode[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          nodes.push(...mapInlineTokens(textToken.tokens, spanMap));
        } else {
          nodes.push(...splitTextAndSentinels(textToken.raw ?? textToken.text, spanMap));
        }
        break;
      }
      case 'escape': {
        const esc = token as Tokens.Escape;
        nodes.push(...splitTextAndSentinels(esc.text, spanMap));
        break;
      }
      case 'br': {
        nodes.push({ type: 'text', text: '\n' });
        break;
      }
      case 'codespan': {
        const codeToken = token as Tokens.Codespan;
        let inner = codeToken.raw
          ? codeToken.raw.replace(/^`+/, '').replace(/`+$/, '')
          : codeToken.text;
        // CommonMark strips a single symmetric space around inline code when non-empty.
        if (inner.length >= 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim().length > 0) {
          inner = inner.slice(1, -1);
        }
        nodes.push({
          type: 'code',
          text: restoreSentinelsPlain(inner, spanMap),
        });
        break;
      }
      case 'strong': {
        const strong = token as Tokens.Strong;
        nodes.push({
          type: 'strong',
          children: mapInlineTokens(strong.tokens, spanMap),
        });
        break;
      }
      case 'em': {
        const em = token as Tokens.Em;
        nodes.push({
          type: 'em',
          children: mapInlineTokens(em.tokens, spanMap),
        });
        break;
      }
      case 'del': {
        const del = token as Tokens.Del;
        nodes.push({
          type: 'del',
          children: mapInlineTokens(del.tokens, spanMap),
        });
        break;
      }
      case 'link': {
        const link = token as Tokens.Link;
        const href = restoreSentinelsPlain(link.href, spanMap);
        const children = mapInlineTokens(link.tokens, spanMap);
        if (isSafeHref(href)) {
          nodes.push({
            type: 'link',
            href,
            children: children.length > 0 ? children : [{ type: 'text', text: href }],
          });
        } else {
          nodes.push(...splitTextAndSentinels(link.raw ?? link.text, spanMap));
        }
        break;
      }
      case 'image': {
        const img = token as Tokens.Image;
        const label = img.text ? `[Image: ${img.text}]` : `[Image: ${img.href}]`;
        nodes.push(...splitTextAndSentinels(label, spanMap));
        break;
      }
      case 'html': {
        // Render angle-bracketed text safely as literal plain text rather than raw HTML.
        const html = token as Tokens.HTML;
        nodes.push(...splitTextAndSentinels(html.raw ?? html.text, spanMap));
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          nodes.push(...mapInlineTokens(token.tokens, spanMap));
        } else if (typeof token.raw === 'string') {
          nodes.push(...splitTextAndSentinels(token.raw, spanMap));
        }
        break;
      }
    }
  }

  return nodes;
}

function mapBlockTokens(
  tokens: Token[] | undefined,
  spanMap: Map<number, string>
): MarkdownBlockNode[] {
  if (!tokens || tokens.length === 0) return [];
  const blocks: MarkdownBlockNode[] = [];
  let inlineBuffer: Token[] = [];

  const flushInlineBuffer = () => {
    if (inlineBuffer.length === 0) return;
    const inlines = mapInlineTokens(inlineBuffer, spanMap);
    inlineBuffer = [];
    if (inlines.length > 0) {
      blocks.push({ type: 'paragraph', inlines });
    }
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        flushInlineBuffer();
        break;

      case 'heading': {
        flushInlineBuffer();
        const heading = token as Tokens.Heading;
        const depth = Math.max(1, Math.min(6, heading.depth)) as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6;
        blocks.push({
          type: 'heading',
          depth,
          inlines: mapInlineTokens(heading.tokens, spanMap),
        });
        break;
      }

      case 'paragraph': {
        flushInlineBuffer();
        const para = token as Tokens.Paragraph;
        blocks.push({
          type: 'paragraph',
          inlines: mapInlineTokens(para.tokens, spanMap),
        });
        break;
      }

      case 'blockquote': {
        flushInlineBuffer();
        const quote = token as Tokens.Blockquote;
        blocks.push({
          type: 'blockquote',
          blocks: mapBlockTokens(quote.tokens, spanMap),
        });
        break;
      }

      case 'list': {
        flushInlineBuffer();
        const list = token as Tokens.List;
        blocks.push({
          type: 'list',
          ordered: list.ordered,
          start: typeof list.start === 'number' ? list.start : 1,
          items: list.items.map((item) => ({
            task: item.task,
            checked: item.checked,
            blocks: mapBlockTokens(item.tokens, spanMap),
          })),
        });
        break;
      }

      case 'code': {
        flushInlineBuffer();
        const code = token as Tokens.Code;
        blocks.push({
          type: 'code_block',
          lang: code.lang?.trim() || undefined,
          text: restoreSentinelsPlain(code.text, spanMap),
        });
        break;
      }

      case 'hr':
        flushInlineBuffer();
        blocks.push({ type: 'hr' });
        break;

      case 'table': {
        flushInlineBuffer();
        const table = token as Tokens.Table;
        blocks.push({
          type: 'table',
          headers: table.header.map((cell) => mapInlineTokens(cell.tokens, spanMap)),
          rows: table.rows.map((row) =>
            row.map((cell) => mapInlineTokens(cell.tokens, spanMap))
          ),
        });
        break;
      }

      case 'html': {
        const html = token as Tokens.HTML;
        const text = restoreSentinelsPlain(html.raw ?? html.text, spanMap).trimEnd();
        if (text) {
          inlineBuffer.push({ type: 'text', raw: text, text } as Tokens.Text);
        }
        break;
      }

      case 'text':
      default:
        inlineBuffer.push(token);
        break;
    }
  }

  flushInlineBuffer();
  return blocks;
}

/**
 * Parses a regular note body + explicit monospace `TextSpan` offsets into a
 * platform-agnostic Markdown AST using `marked.Lexer`, preserving both standard
 * markdown syntax and MessyNotes' quick-copy mono chips & clickable URLs.
 */
export function parseMarkdownDocument(
  body: string,
  monoSpans: TextSpan[] = []
): MarkdownBlockNode[] {
  if (!body) return [];
  const { prepared, spanMap } = prepareTextWithMonoPlaceholders(body, monoSpans);
  const tokens = Lexer.lex(prepared, {
    gfm: true,
    breaks: true,
  });
  return mapBlockTokens(tokens, spanMap);
}
