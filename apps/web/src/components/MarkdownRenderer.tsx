import { Fragment, type MouseEvent } from 'react';
import {
  parseMarkdownDocument,
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  type TextSpan,
} from '@messy-notes/shared';

interface MarkdownRendererProps {
  body: string;
  spans?: TextSpan[];
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
  stopBubbleClick?: boolean;
  className?: string;
}

export function MarkdownRenderer({
  body,
  spans = [],
  onCopyCode,
  onOpenLink,
  stopBubbleClick = false,
  className = '',
}: MarkdownRendererProps) {
  const blocks = parseMarkdownDocument(body, spans);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={`md-content ${className}`.trim()}>
      {blocks.map((block, idx) => (
        <MarkdownBlock
          key={idx}
          block={block}
          onCopyCode={onCopyCode}
          onOpenLink={onOpenLink}
          stopBubbleClick={stopBubbleClick}
        />
      ))}
    </div>
  );
}

function MarkdownBlock({
  block,
  onCopyCode,
  onOpenLink,
  stopBubbleClick,
}: {
  block: MarkdownBlockNode;
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
  stopBubbleClick: boolean;
}) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag className={`md-heading md-h${block.depth}`}>
          <InlineNodes
            nodes={block.inlines}
            onCopyCode={onCopyCode}
            onOpenLink={onOpenLink}
            stopBubbleClick={stopBubbleClick}
          />
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p className="md-paragraph">
          <InlineNodes
            nodes={block.inlines}
            onCopyCode={onCopyCode}
            onOpenLink={onOpenLink}
            stopBubbleClick={stopBubbleClick}
          />
        </p>
      );

    case 'blockquote':
      return (
        <blockquote className="md-blockquote">
          {block.blocks.map((child, idx) => (
            <MarkdownBlock
              key={idx}
              block={child}
              onCopyCode={onCopyCode}
              onOpenLink={onOpenLink}
              stopBubbleClick={stopBubbleClick}
            />
          ))}
        </blockquote>
      );

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          className={`md-list ${block.ordered ? 'md-ol' : 'md-ul'}`}
          start={block.ordered && block.start !== 1 ? block.start : undefined}
        >
          {block.items.map((item, idx) => (
            <li
              key={idx}
              className={`md-list-item ${item.task ? 'md-task-item' : ''}`}
            >
              {item.task && (
                <span
                  className={`md-task-box ${item.checked ? 'checked' : ''}`}
                  aria-hidden="true"
                >
                  {item.checked ? '✓' : ''}
                </span>
              )}
              <div className="md-list-item-body">
                {item.blocks.map((child, childIdx) => (
                  <MarkdownBlock
                    key={childIdx}
                    block={child}
                    onCopyCode={onCopyCode}
                    onOpenLink={onOpenLink}
                    stopBubbleClick={stopBubbleClick}
                  />
                ))}
              </div>
            </li>
          ))}
        </ListTag>
      );
    }

    case 'code_block':
      return (
        <div
          className="md-code-block"
          onClick={stopBubbleClick ? (e) => e.stopPropagation() : undefined}
        >
          <div className="md-code-block-header">
            <span className="md-code-lang">{block.lang || 'code'}</span>
            {onCopyCode && (
              <button
                type="button"
                className="md-code-copy-btn"
                onClick={(e) => {
                  if (stopBubbleClick) e.stopPropagation();
                  onCopyCode(block.text);
                }}
              >
                Copy
              </button>
            )}
          </div>
          <pre className="md-code-pre">
            <code>{block.text}</code>
          </pre>
        </div>
      );

    case 'hr':
      return <hr className="md-hr" />;

    case 'table':
      return (
        <div
          className="md-table-wrap"
          onClick={stopBubbleClick ? (e) => e.stopPropagation() : undefined}
        >
          <table className="md-table">
            <thead>
              <tr>
                {block.headers.map((cell, idx) => (
                  <th key={idx}>
                    <InlineNodes
                      nodes={cell}
                      onCopyCode={onCopyCode}
                      onOpenLink={onOpenLink}
                      stopBubbleClick={stopBubbleClick}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}>
                      <InlineNodes
                        nodes={cell}
                        onCopyCode={onCopyCode}
                        onOpenLink={onOpenLink}
                        stopBubbleClick={stopBubbleClick}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function InlineNodes({
  nodes,
  onCopyCode,
  onOpenLink,
  stopBubbleClick,
}: {
  nodes: MarkdownInlineNode[];
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
  stopBubbleClick: boolean;
}) {
  return (
    <>
      {nodes.map((node, idx) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={idx}>{node.text}</Fragment>;

          case 'strong':
            return (
              <strong key={idx}>
                <InlineNodes
                  nodes={node.children}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                  stopBubbleClick={stopBubbleClick}
                />
              </strong>
            );

          case 'em':
            return (
              <em key={idx}>
                <InlineNodes
                  nodes={node.children}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                  stopBubbleClick={stopBubbleClick}
                />
              </em>
            );

          case 'del':
            return (
              <del key={idx}>
                <InlineNodes
                  nodes={node.children}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                  stopBubbleClick={stopBubbleClick}
                />
              </del>
            );

          case 'code':
            return onCopyCode ? (
              <button
                key={idx}
                type="button"
                className="mono-chip"
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  if (stopBubbleClick) e.stopPropagation();
                  onCopyCode(node.text);
                }}
              >
                {node.text}
              </button>
            ) : (
              <code key={idx} className="mono-chip">
                {node.text}
              </code>
            );

          case 'link':
            return (
              <button
                key={idx}
                type="button"
                className="link-chip"
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  if (stopBubbleClick) e.stopPropagation();
                  onOpenLink?.(node.href);
                }}
              >
                <InlineNodes
                  nodes={node.children}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                  stopBubbleClick={stopBubbleClick}
                />
              </button>
            );
        }
      })}
    </>
  );
}
