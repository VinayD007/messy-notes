import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MessNoteMetrics,
  MessNoteTypography,
  type MessyNotePalette,
  type Note,
} from '@messy-notes/shared';
import { getLocalPhotoUri } from '../lib/photoStorage';
import { supabase } from '../lib/supabase';
import { useNotesStore } from '../store/notesStore';
import { MobileMarkdownView } from './MobileMarkdownView';

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
  const { toggleSelectNote, toggleListItemChecked, showSnackbar } = useNotesStore();
  const [resolvedUris, setResolvedUris] = useState<Record<string, string>>({});

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
          .from('note-photos')
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
    <Pressable
      style={[
        styles.bubble,
        {
          backgroundColor: isSelected
            ? palette.primaryContainer
            : palette.surfaceContainerLow,
          borderColor: isSelected
            ? palette.noteBubbleAccent
            : palette.outlineVariant,
        },
      ]}
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
            <Text
              style={[
                styles.kindPill,
                { backgroundColor: palette.surfaceCard, color: palette.textSecondary },
              ]}
            >
              {note.type === 'field' ? 'Fields-Values' : 'List'}
            </Text>
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
        <View style={styles.markdownWrap}>
          <MobileMarkdownView
            body={note.content.body}
            spans={note.content.spans}
            palette={palette}
            onCopyCode={(snippet) => void handleCopyMono(snippet)}
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
                <Text style={[styles.fieldVal, { color: palette.textSecondary }]}>
                  {entry.value}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {note.type === 'list' ? (
        <View style={styles.structuredList}>
          {[...note.content.items]
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((item, idx) => (
              <Pressable
                key={item.id}
                style={styles.structuredRow}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelectNote(note.id);
                  } else {
                    void toggleListItemChecked(note.id, item.id);
                  }
                }}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: palette.noteBubbleAccent },
                    item.checked && { backgroundColor: palette.noteBubbleAccent },
                  ]}
                >
                  {item.checked ? (
                    <Text style={{ color: palette.onAccent, fontSize: 11, fontWeight: '700' }}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.rowNum, { color: palette.textMuted }]}>
                  {idx + 1}.
                </Text>
                <Text
                  style={[
                    styles.listText,
                    { color: item.checked ? palette.textMuted : palette.textPrimary },
                    item.checked && styles.strikethrough,
                  ]}
                >
                  {item.value}
                </Text>
              </Pressable>
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
                <Text style={{ color: palette.textMuted, fontSize: 10 }}>N/A</Text>
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
        {note.updated_at !== note.created_at ? ' · edited' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderRadius: MessNoteMetrics.noteCardCornerRadius,
    padding: 16,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kindPill: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  star: {
    fontSize: 15,
  },
  pendingTag: {
    fontSize: 11,
    color: '#FFD60A',
  },
  pinBadge: {
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
  markdownWrap: {
    marginVertical: 2,
  },
  structuredList: {
    gap: 6,
  },
  structuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowNum: {
    fontSize: 13,
  },
  fieldKey: {
    fontWeight: '600',
    fontSize: 14,
  },
  fieldVal: {
    fontSize: 14,
    flex: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: {
    fontSize: 14,
    flex: 1,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  photoFallback: {
    width: 64,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timestamp: {
    fontSize: 11,
  },
});
