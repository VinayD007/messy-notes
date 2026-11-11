import { useEffect, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  isNoteEdited,
  MessNoteFontFamily,
  MessNoteMetrics,
  MessNoteMotion,
  MessNoteTypography,
  NOTE_PHOTOS_BUCKET,
  type MessyNotePalette,
  type Note,
} from '@messy-notes/shared';
import { getLocalPhotoUri } from '../lib/photoStorage';
import { supabase } from '../lib/supabase';
import { useNotesStore } from '../store/notesStore';
import { MobilePlainTextView } from './MobilePlainTextView';

interface Props {
  note: Note;
  palette: MessyNotePalette;
  isSelected: boolean;
  isDirty: boolean;
  selectionMode: boolean;
  showPinBadge: boolean;
  onOpenOptions: (note: Note) => void;
  onRequestOpenLink: (url: string) => void;
  onPreviewPhoto: (uri: string) => void;
}

export function MobileNoteBubble({
  note,
  palette,
  isSelected,
  isDirty,
  selectionMode,
  showPinBadge,
  onOpenOptions,
  onRequestOpenLink,
  onPreviewPhoto,
}: Props) {
  const { toggleSelectNote, showSnackbar } = useNotesStore();
  const [resolvedUris, setResolvedUris] = useState<Record<string, string>>({});
  const pressScale = useRef(new Animated.Value(1)).current;

  const animatePress = (toValue: number) => {
    Animated.spring(pressScale, {
      toValue,
      ...MessNoteMotion.expressiveFast,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    let mounted = true;
    if (note.photo_attachments.length === 0) {
      setResolvedUris({});
      return;
    }

    void Promise.all(
      note.photo_attachments.map(async (photo) => {
        const localUri = getLocalPhotoUri(photo.fileName);
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) {
          return [photo.id, localUri] as const;
        }
        const { data } = await supabase.storage
          .from(NOTE_PHOTOS_BUCKET)
          .createSignedUrl(photo.storagePath, 3600);
        return [photo.id, data?.signedUrl ?? ''] as const;
      })
    ).then((pairs) => {
      if (!mounted) return;
      const map: Record<string, string> = {};
      for (const [id, uri] of pairs) {
        if (uri) map[id] = uri;
      }
      setResolvedUris(map);
    });

    return () => {
      mounted = false;
    };
  }, [note.photo_attachments]);

  const handleCopyMono = async (snippet: string) => {
    if (selectionMode) {
      toggleSelectNote(note.id);
      return;
    }
    await Clipboard.setStringAsync(snippet);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showSnackbar({ message: `Copied: ${snippet}` });
  };

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.bubble,
          {
            backgroundColor: isSelected
              ? palette.selectedItemBackground
              : palette.noteBubbleBackground,
            borderColor: isSelected ? palette.noteBubbleAccent : palette.outlineVariant,
            borderWidth: isSelected ? 1.5 : 1,
          },
          pressed && { backgroundColor: palette.selectedItemBackground },
        ]}
        onPressIn={() => animatePress(MessNoteMotion.pressScale)}
        onPressOut={() => animatePress(1)}
        onPress={() => {
          if (selectionMode) {
            toggleSelectNote(note.id);
          } else {
            onOpenOptions(note);
          }
        }}
        onLongPress={() => toggleSelectNote(note.id)}
      >
      <View style={styles.topRow}>
        <View style={styles.leftBadges}>
          {note.type !== 'regular' ? (
            <View
              style={[
                styles.kindPill,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.outlineVariant,
                },
              ]}
            >
              <Text style={[styles.kindPillText, { color: palette.textSecondary }]}>
                {note.type === 'field' ? 'Fields-Values' : 'List'}
              </Text>
            </View>
          ) : null}
          {note.favorite ? (
            <MaterialIcons
              name="star"
              size={16}
              color={palette.noteBubbleAccent}
            />
          ) : null}
          {isDirty ? (
            <Text style={[styles.pendingTag, { color: palette.noteBubbleAccent }]}>
              Queued
            </Text>
          ) : null}
        </View>

        <View style={styles.rightBadges}>
          {showPinBadge && note.pinned ? (
            <MaterialIcons
              name="push-pin"
              size={15}
              color={palette.noteBubbleAccent}
              style={{ transform: [{ rotate: '22deg' }] }}
            />
          ) : null}
          {selectionMode ? (
            <View
              style={[
                styles.selectCircle,
                { borderColor: palette.noteBubbleAccent },
                isSelected && { backgroundColor: palette.noteBubbleAccent },
              ]}
            >
              {isSelected ? (
                <MaterialIcons name="check" size={14} color={palette.onAccent} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {note.title ? (
        <Text style={[styles.title, { color: palette.textPrimary }]}>{note.title}</Text>
      ) : null}

      {note.type === 'regular' ? (
        <View style={styles.bodyWrap}>
          <MobilePlainTextView
            body={note.content.body}
            spans={note.content.spans}
            palette={palette}
            onCopyMono={(snippet) => void handleCopyMono(snippet)}
            onOpenLink={(href) => {
              if (selectionMode) {
                toggleSelectNote(note.id);
              } else {
                onRequestOpenLink(href);
              }
            }}
          />
        </View>
      ) : null}

      {note.type === 'field' ? (
        <View style={styles.structuredList}>
          {[...note.content.fields]
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((entry, idx) => (
              <View key={entry.id} style={styles.structuredRow}>
                <Text style={[styles.rowNum, { color: palette.textMuted }]}>
                  {idx + 1}.
                </Text>
                <Text style={[styles.fieldKey, { color: palette.textPrimary }]}>
                  {entry.field}
                </Text>
                <Text style={{ color: palette.textMuted }}>=</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.fieldValBtn,
                    {
                      backgroundColor: palette.surfaceElevated,
                      borderColor: palette.outlineVariant,
                    },
                    pressed && { opacity: 0.72 },
                  ]}
                  onPress={() => void handleCopyMono(entry.value)}
                  accessibilityLabel={`Copy ${entry.field} value`}
                >
                  <Text
                    style={[styles.fieldValMono, { color: palette.textSecondary }]}
                  >
                    {entry.value}
                  </Text>
                </Pressable>
              </View>
            ))}
        </View>
      ) : null}

      {note.type === 'list' ? (
        <View style={styles.structuredList}>
          {[...note.content.items]
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((item, idx) => (
              <View key={item.id} style={styles.structuredRow}>
                <Text style={[styles.rowNum, { color: palette.textMuted }]}>
                  {idx + 1}.
                </Text>
                <Text style={[styles.listText, { color: palette.textPrimary }]}>
                  {item.value}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {note.photo_attachments.length > 0 ? (
        <View style={styles.photoRow}>
          {note.photo_attachments.map((photo) => {
            const uri = resolvedUris[photo.id];
            return uri ? (
              <Pressable key={photo.id} onPress={() => onPreviewPhoto(uri)}>
                <Image source={{ uri }} style={styles.photoThumb} />
              </Pressable>
            ) : (
              <View
                key={photo.id}
                style={[styles.photoFallback, { backgroundColor: palette.surfaceCard }]}
              >
                <Text
                  style={{
                    color: palette.textMuted,
                    fontFamily: MessNoteFontFamily.regular,
                    fontSize: 10,
                  }}
                >
                  N/A
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[styles.timestamp, { color: palette.textMuted }]}>
        {new Date(note.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {isNoteEdited(note) ? ' · edited' : ''}
      </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderRadius: MessNoteMetrics.noteCardCornerRadius,
    padding: MessNoteMetrics.outerGutter,
    gap: MessNoteMetrics.intraSpacing,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  rightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kindPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  kindPillText: {
    ...MessNoteTypography.labelMedium,
  },
  star: {
    fontFamily: MessNoteFontFamily.regular,
    fontSize: 15,
  },
  pendingTag: {
    ...MessNoteTypography.labelMedium,
  },
  pinBadge: {
    fontFamily: MessNoteFontFamily.regular,
    fontSize: 13,
    transform: [{ rotate: '22deg' }],
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...MessNoteTypography.titleMedium,
    fontWeight: '700',
  },
  bodyWrap: {
    marginVertical: 2,
  },
  structuredList: {
    gap: 8,
  },
  structuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowNum: {
    ...MessNoteTypography.bodyMedium,
    minWidth: 20,
  },
  fieldKey: {
    ...MessNoteTypography.bodyMedium,
    fontWeight: '600',
    flexShrink: 1,
  },
  fieldValBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  fieldValMono: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }),
  },
  listText: {
    ...MessNoteTypography.bodyMedium,
    flex: 1,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: 68,
    height: 68,
    borderRadius: 12,
  },
  photoFallback: {
    width: 68,
    height: 68,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timestamp: {
    ...MessNoteTypography.labelMedium,
    fontWeight: '500',
  },
});
