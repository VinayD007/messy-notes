import { Linking, Platform, StyleSheet, Text } from 'react-native';
import {
  buildStyledSegments,
  MessNoteTypography,
  type MessyNotePalette,
  type TextSpan,
} from '@messy-notes/shared';

interface Props {
  body: string;
  spans?: TextSpan[];
  palette: MessyNotePalette;
  onCopyMono?: (snippet: string) => void;
  onOpenLink?: (href: string) => void;
}

/**
 * Renders note bodies as plain text while preserving explicit monospace
 * tap-to-copy segments and auto-detected clickable links (no Markdown parsing).
 */
export function MobilePlainTextView({
  body,
  spans = [],
  palette,
  onCopyMono,
  onOpenLink,
}: Props) {
  const segments = buildStyledSegments(body, spans);

  if (segments.length === 0) {
    return null;
  }

  return (
    <Text selectable style={[styles.bodyText, { color: palette.textPrimary }]}>
      {segments.map((seg, idx) => {
        if (seg.kind === 'mono') {
          return (
            <Text
              key={idx}
              onPress={onCopyMono ? () => onCopyMono(seg.text) : undefined}
              style={[
                styles.monoInline,
                {
                  backgroundColor: palette.monospaceBg,
                  color: palette.monospaceText,
                },
              ]}
            >
              {seg.text}
            </Text>
          );
        }

        if (seg.kind === 'url' && seg.normalizedUrl) {
          return (
            <Text
              key={idx}
              onPress={() =>
                onOpenLink
                  ? onOpenLink(seg.normalizedUrl!)
                  : void Linking.openURL(seg.normalizedUrl!)
              }
              style={[styles.linkInline, { color: palette.linkAccent }]}
            >
              {seg.text}
            </Text>
          );
        }

        return seg.text;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    ...MessNoteTypography.bodyLarge,
  },
  monoInline: {
    fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }),
    fontWeight: '600',
    fontSize: 14,
  },
  linkInline: {
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});
