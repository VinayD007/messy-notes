import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  formatFileSize,
  getDocumentBadge,
  type MessyNotePalette,
  type NoteAttachment,
} from '@messy-notes/shared';
import { openOrShareAttachment } from '../lib/photoStorage';
import { useNotesStore } from '../store/notesStore';

export interface MobileDocumentCardProps {
  attachment: NoteAttachment;
  palette: MessyNotePalette;
}

export function MobileDocumentCard({
  attachment,
  palette,
}: MobileDocumentCardProps) {
  const [opening, setOpening] = useState(false);
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const badge = getDocumentBadge(attachment.mimeType, attachment.fileName);
  const sizeLabel = formatFileSize(attachment.fileSize);

  const handlePress = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await openOrShareAttachment(attachment);
      if (!res.success && res.error) {
        showSnackbar({ message: res.error });
      }
    } catch (err) {
      showSnackbar({
        message: err instanceof Error ? err.message : 'Could not open file',
      });
    } finally {
      setOpening(false);
    }
  };

  const getIconName = (): keyof typeof MaterialIcons.glyphMap => {
    switch (badge.extension) {
      case 'pdf':
        return 'picture-as-pdf';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return 'table-chart';
      case 'doc':
      case 'docx':
        return 'description';
      case 'ppt':
      case 'pptx':
        return 'slideshow';
      case 'zip':
      case 'rar':
      case '7z':
        return 'folder-zip';
      default:
        return 'insert-drive-file';
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.surfaceElevated,
          borderColor: palette.outlineVariant,
        },
        pressed && { opacity: 0.75 },
      ]}
      onPress={handlePress}
      accessibilityLabel={`Open ${attachment.fileName}`}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.badge,
          {
            backgroundColor: `${badge.color}1E`,
            borderColor: `${badge.color}55`,
          },
        ]}
      >
        <MaterialIcons name={getIconName()} size={16} color={badge.color} />
        <Text style={[styles.badgeText, { color: badge.color }]}>
          {badge.label}
        </Text>
      </View>

      <View style={styles.metaContainer}>
        <Text
          style={[styles.fileName, { color: palette.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {attachment.fileName}
        </Text>
        {sizeLabel ? (
          <Text style={[styles.fileSize, { color: palette.textMuted }]}>
            {sizeLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionWrap}>
        {opening ? (
          <ActivityIndicator size="small" color={palette.noteBubbleAccent} />
        ) : (
          <MaterialIcons
            name="open-in-new"
            size={18}
            color={palette.textSecondary}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 3,
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  metaContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  fileSize: {
    fontSize: 11,
    marginTop: 1,
  },
  actionWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
