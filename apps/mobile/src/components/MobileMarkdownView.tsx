import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  parseMarkdownDocument,
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  type MessyNotePalette,
  type TextSpan,
} from '@messy-notes/shared';

interface Props {
  body: string;
  spans?: TextSpan[];
  palette: MessyNotePalette;
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
}

const HEADING_SIZES: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 21,
  2: 18,
  3: 16,
  4: 15,
  5: 14,
  6: 13,
};

export function MobileMarkdownView({
  body,
  spans = [],
  palette,
  onCopyCode,
  onOpenLink,
}: Props) {
  const blocks = parseMarkdownDocument(body, spans);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => (
        <MobileMarkdownBlock
          key={idx}
          block={block}
          palette={palette}
          onCopyCode={onCopyCode}
          onOpenLink={onOpenLink}
        />
      ))}
    </View>
  );
}

function MobileMarkdownBlock({
  block,
  palette,
  onCopyCode,
  onOpenLink,
}: {
  block: MarkdownBlockNode;
  palette: MessyNotePalette;
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
}) {
  switch (block.type) {
    case 'heading': {
      const fontSize = HEADING_SIZES[block.depth];
      return (
        <Text
          style={[
            styles.heading,
            {
              fontSize,
              lineHeight: Math.round(fontSize * 1.32),
              color: palette.textPrimary,
            },
          ]}
        >
          <MobileInlineNodes
            nodes={block.inlines}
            palette={palette}
            onCopyCode={onCopyCode}
            onOpenLink={onOpenLink}
          />
        </Text>
      );
    }

    case 'paragraph':
      return (
        <Text style={[styles.paragraph, { color: palette.textPrimary }]}>
          <MobileInlineNodes
            nodes={block.inlines}
            palette={palette}
            onCopyCode={onCopyCode}
            onOpenLink={onOpenLink}
          />
        </Text>
      );

    case 'blockquote':
      return (
        <View
          style={[
            styles.blockquote,
            {
              borderLeftColor: palette.noteBubbleAccent,
              backgroundColor: palette.surfaceCard,
            },
          ]}
        >
          {block.blocks.map((child, idx) => (
            <MobileMarkdownBlock
              key={idx}
              block={child}
              palette={palette}
              onCopyCode={onCopyCode}
              onOpenLink={onOpenLink}
            />
          ))}
        </View>
      );

    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, idx) => {
            const marker = item.task
              ? item.checked
                ? '☑'
                : '☐'
              : block.ordered
                ? `${block.start + idx}.`
                : '•';
            return (
              <View key={idx} style={styles.listRow}>
                <Text
                  style={[
                    styles.listMarker,
                    {
                      color: item.task
                        ? palette.noteBubbleAccent
                        : palette.textSecondary,
                    },
                  ]}
                >
                  {marker}
                </Text>
                <View style={styles.listItemBody}>
                  {item.blocks.map((child, childIdx) => (
                    <MobileMarkdownBlock
                      key={childIdx}
                      block={child}
                      palette={palette}
                      onCopyCode={onCopyCode}
                      onOpenLink={onOpenLink}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );

    case 'code_block':
      return (
        <View
          style={[
            styles.codeBlock,
            {
              backgroundColor: palette.monospaceBg,
              borderColor: palette.borderSubtle,
            },
          ]}
        >
          <View
            style={[
              styles.codeBlockHeader,
              { borderBottomColor: palette.borderSubtle },
            ]}
          >
            <Text style={[styles.codeLang, { color: palette.textMuted }]}>
              {block.lang || 'code'}
            </Text>
            {onCopyCode ? (
              <Pressable
                style={[styles.copyChip, { borderColor: palette.borderSubtle }]}
                onPress={() => onCopyCode(block.text)}
              >
                <Text
                  style={{
                    color: palette.noteBubbleAccent,
                    fontSize: 11,
                    fontWeight: '600',
                  }}
                >
                  Copy
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.codeBlockText, { color: palette.monospaceText }]}>
            {block.text}
          </Text>
        </View>
      );

    case 'hr':
      return (
        <View style={[styles.hr, { backgroundColor: palette.borderSubtle }]} />
      );

    case 'table':
      return (
        <View style={[styles.table, { borderColor: palette.borderSubtle }]}>
          <View
            style={[
              styles.tableRow,
              {
                backgroundColor: palette.surfaceCard,
                borderBottomColor: palette.borderSubtle,
              },
            ]}
          >
            {block.headers.map((cell, idx) => (
              <Text
                key={idx}
                style={[
                  styles.tableCell,
                  styles.tableHeaderText,
                  { color: palette.textPrimary },
                ]}
              >
                <MobileInlineNodes
                  nodes={cell}
                  palette={palette}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                />
              </Text>
            ))}
          </View>
          {block.rows.map((row, rowIdx) => (
            <View
              key={rowIdx}
              style={[
                styles.tableRow,
                { borderBottomColor: palette.borderSubtle },
              ]}
            >
              {row.map((cell, cellIdx) => (
                <Text
                  key={cellIdx}
                  style={[styles.tableCell, { color: palette.textPrimary }]}
                >
                  <MobileInlineNodes
                    nodes={cell}
                    palette={palette}
                    onCopyCode={onCopyCode}
                    onOpenLink={onOpenLink}
                  />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

function MobileInlineNodes({
  nodes,
  palette,
  onCopyCode,
  onOpenLink,
}: {
  nodes: MarkdownInlineNode[];
  palette: MessyNotePalette;
  onCopyCode?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
}) {
  return (
    <>
      {nodes.map((node, idx) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={idx}>{node.text}</Fragment>;

          case 'strong':
            return (
              <Text key={idx} style={styles.bold}>
                <MobileInlineNodes
                  nodes={node.children}
                  palette={palette}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                />
              </Text>
            );

          case 'em':
            return (
              <Text key={idx} style={styles.italic}>
                <MobileInlineNodes
                  nodes={node.children}
                  palette={palette}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                />
              </Text>
            );

          case 'del':
            return (
              <Text key={idx} style={styles.strikethrough}>
                <MobileInlineNodes
                  nodes={node.children}
                  palette={palette}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                />
              </Text>
            );

          case 'code':
            return (
              <Text
                key={idx}
                style={[
                  styles.inlineCode,
                  {
                    backgroundColor: palette.monospaceBg,
                    color: palette.monospaceText,
                  },
                ]}
                onPress={onCopyCode ? () => onCopyCode(node.text) : undefined}
              >
                {` ${node.text} `}
              </Text>
            );

          case 'link':
            return (
              <Text
                key={idx}
                style={[styles.link, { color: palette.linkAccent }]}
                onPress={onOpenLink ? () => onOpenLink(node.href) : undefined}
              >
                <MobileInlineNodes
                  nodes={node.children}
                  palette={palette}
                  onCopyCode={onCopyCode}
                  onOpenLink={onOpenLink}
                />
              </Text>
            );
        }
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  heading: {
    fontWeight: '700',
    marginTop: 2,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontWeight: '600',
    fontSize: 13.5,
  },
  link: {
    textDecorationLine: 'underline',
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    paddingRight: 8,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    gap: 4,
  },
  list: {
    gap: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listMarker: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    minWidth: 16,
  },
  listItemBody: {
    flex: 1,
    gap: 4,
  },
  codeBlock: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  codeLang: {
    fontSize: 11,
    fontWeight: '600',
  },
  copyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  codeBlockText: {
    padding: 10,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 19,
  },
  hr: {
    height: 1,
    marginVertical: 4,
  },
  table: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 13,
  },
  tableHeaderText: {
    fontWeight: '700',
  },
});
