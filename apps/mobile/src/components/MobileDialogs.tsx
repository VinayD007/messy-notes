import { useRef, useState } from 'react';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MessNoteMetrics,
  MessNoteTypography,
  adjustSpansForTextChange,
  adjustSpansForTrim,
  buildGroupedText,
  canPinNote,
  hasCopyableText,
  isNoteEdited,
  joinPartialCopyTokens,
  toggleMonoSpan,
  tokenizeForPartialCopy,
  type FieldNote,
  type FieldValueEntry,
  type ListNote,
  type ListRowEntry,
  type MessyNotePalette,
  type Note,
  type NoteFilter,
  type NoteView,
  type TextSpan,
} from '@messy-notes/shared';
import { useNotesStore } from '../store/notesStore';
import { MobilePlainTextView } from './MobilePlainTextView';

export interface MobileConfirmConfig {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onConfirm: () => void | Promise<void>;
}

export function MobileConfirmDialog({
  visible,
  palette,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  asOverlay = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  palette: MessyNotePalette;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  asOverlay?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!visible) return null;

  const badgeIcon: keyof typeof MaterialIcons.glyphMap =
    icon ?? (destructive ? 'delete-outline' : 'info-outline');

  const content = (
    <Pressable
      style={[
        styles.confirmBackdrop,
        asOverlay && styles.confirmOverlayBackdrop,
      ]}
      onPress={onCancel}
    >
      <Pressable
        style={[
          styles.confirmCard,
          {
            backgroundColor: palette.surfaceCard,
            borderColor: palette.outlineVariant,
          },
        ]}
        onPress={() => undefined}
      >
        <View
          style={[
            styles.confirmIconCircle,
            {
              backgroundColor: destructive
                ? 'rgba(255, 69, 58, 0.16)'
                : palette.primaryContainer,
              borderColor: destructive
                ? 'rgba(255, 69, 58, 0.35)'
                : palette.outlineVariant,
            },
          ]}
        >
          <MaterialIcons
            name={badgeIcon}
            size={24}
            color={destructive ? palette.destructiveAction : palette.noteBubbleAccent}
          />
        </View>

        <Text style={[styles.confirmTitle, { color: palette.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.confirmMessage, { color: palette.textSecondary }]}>
          {message}
        </Text>

        <View style={styles.confirmActions}>
          <Pressable
            style={({ pressed }) => [
              styles.confirmSecondaryBtn,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.outlineVariant,
              },
              pressed && { opacity: 0.78 },
            ]}
            onPress={onCancel}
          >
            <Text style={[styles.confirmBtnText, { color: palette.textPrimary }]}>
              {cancelLabel}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.confirmPrimaryBtn,
              {
                backgroundColor: destructive
                  ? palette.destructiveAction
                  : palette.noteBubbleAccent,
              },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => void onConfirm()}
          >
            <Text
              style={[
                styles.confirmBtnText,
                { color: destructive ? '#FFFFFF' : palette.onAccent },
              ]}
            >
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );

  if (asOverlay) {
    return content;
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      {content}
    </Modal>
  );
}

export function MobileOptionsSheet({
  note,
  palette,
  activeView,
  filterType: _filterType,
  onClose,
  onViewDetail,
  onEdit,
  onPartialCopy,
  onRequestSoftDelete,
  onRequestPermDelete,
  onRequestOpenLink,
}: {
  note: Note | null;
  palette: MessyNotePalette;
  activeView: NoteView;
  filterType: NoteFilter;
  onClose: () => void;
  onViewDetail?: (note: Note) => void;
  onEdit: (note: Note) => void;
  onPartialCopy: (note: Note) => void;
  onRequestSoftDelete: (ids: string[]) => void;
  onRequestPermDelete: (id: string) => void;
  onRequestOpenLink?: (url: string) => void;
}) {
  const { notes, toggleFavorite, togglePin, restoreNotes, showSnackbar } = useNotesStore();
  const [optimisticFavorite, setOptimisticFavorite] = useState<{
    noteId: string;
    favorite: boolean;
  } | null>(null);
  const [optimisticPin, setOptimisticPin] = useState<{
    noteId: string;
    pinned: boolean;
  } | null>(null);

  const liveNote = note ? notes.find((n) => n.id === note.id) ?? note : null;
  if (!liveNote) return null;

  const isFavorite =
    optimisticFavorite?.noteId === liveNote.id
      ? optimisticFavorite.favorite
      : liveNote.favorite;
  const isPinned =
    optimisticPin?.noteId === liveNote.id
      ? optimisticPin.pinned
      : liveNote.pinned;
  const isBin = activeView === 'bin' || liveNote.deleted_at !== null;

  const handleToggleFavorite = () => {
    const nextFavorite = !isFavorite;
    setOptimisticFavorite({ noteId: liveNote.id, favorite: nextFavorite });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void toggleFavorite(liveNote.id).finally(() => {
      setOptimisticFavorite((current) =>
        current?.noteId === liveNote.id && current.favorite === nextFavorite
          ? null
          : current
      );
    });
  };

  const handleTogglePin = () => {
    const check = canPinNote(notes, { ...liveNote, pinned: isPinned });
    if (!check.allowed) {
      showSnackbar({ message: check.reason! });
      return;
    }
    const nextPinned = !isPinned;
    setOptimisticPin({ noteId: liveNote.id, pinned: nextPinned });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void togglePin(liveNote.id).finally(() => {
      setOptimisticPin((current) =>
        current?.noteId === liveNote.id && current.pinned === nextPinned
          ? null
          : current
      );
    });
  };

  const canCopyText = hasCopyableText(liveNote);

  const handleCopy = async () => {
    if (!canCopyText) {
      onClose();
      showSnackbar({ message: 'No Text Found' });
      return;
    }
    await Clipboard.setStringAsync(buildGroupedText(liveNote));
    showSnackbar({ message: 'Copied to clipboard!' });
    onClose();
  };

  const handlePartialCopyPress = () => {
    if (!canCopyText) {
      onClose();
      showSnackbar({ message: 'No Text Found' });
      return;
    }
    onClose();
    onPartialCopy(liveNote);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: liveNote.title ?? undefined,
        message: buildGroupedText(liveNote),
      });
    } catch {
      showSnackbar({ message: 'No app available to share' });
    }
    onClose();
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.bottomSheetBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.bottomSheet,
            { backgroundColor: palette.surfaceCard, borderColor: palette.outlineVariant },
          ]}
          onPress={() => undefined}
        >
          <View
            style={[styles.sheetHandle, { backgroundColor: palette.textMuted }]}
          />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
              {liveNote.title?.trim() || (isBin ? 'Deleted Note' : 'Note Options')}
            </Text>
            <View style={styles.sheetHeaderActions}>
              {onViewDetail ? (
                <Pressable
                  style={[
                    styles.starToggleBtn,
                    { backgroundColor: palette.surfaceElevated },
                  ]}
                  onPress={() => {
                    onClose();
                    onViewDetail(liveNote);
                  }}
                  accessibilityLabel="View note detail"
                >
                  <MaterialIcons
                    name="visibility"
                    size={22}
                    color={palette.noteBubbleAccent}
                  />
                </Pressable>
              ) : null}
              {!isBin ? (
                <>
                  <Pressable
                    style={[
                      styles.starToggleBtn,
                      { backgroundColor: palette.surfaceElevated },
                      isPinned && { backgroundColor: palette.primaryContainer },
                    ]}
                    onPress={handleTogglePin}
                    accessibilityLabel={isPinned ? 'Unpin note' : 'Pin note'}
                  >
                    <MaterialCommunityIcons
                      name={isPinned ? 'pin' : 'pin-outline'}
                      size={22}
                      color={isPinned ? palette.noteBubbleAccent : palette.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.starToggleBtn,
                      { backgroundColor: palette.surfaceElevated },
                      isFavorite && { backgroundColor: palette.primaryContainer },
                    ]}
                    onPress={handleToggleFavorite}
                    accessibilityLabel={
                      isFavorite ? 'Remove from favorites' : 'Add to favorites'
                    }
                  >
                    <MaterialIcons
                      name={isFavorite ? 'star' : 'star-border'}
                      size={24}
                      color={isFavorite ? palette.noteBubbleAccent : palette.textMuted}
                    />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {liveNote.type === 'regular' && liveNote.content.body.trim() ? (
              <ScrollView
                style={[
                  styles.sheetPreviewBox,
                  { backgroundColor: palette.bg, borderColor: palette.outlineVariant },
                ]}
                nestedScrollEnabled
              >
                <MobilePlainTextView
                  body={liveNote.content.body}
                  spans={liveNote.content.spans}
                  palette={palette}
                  onCopyMono={(snippet) => {
                    void Clipboard.setStringAsync(snippet);
                    showSnackbar({ message: `Copied: ${snippet}` });
                  }}
                  onOpenLink={(href) => {
                    onClose();
                    onRequestOpenLink?.(href);
                  }}
                />
              </ScrollView>
            ) : null}

            {isBin ? (
              <>
                <SheetAction
                  label="Restore"
                  icon="restore-from-trash"
                  color={palette.textPrimary}
                  palette={palette}
                  onPress={() => {
                    void restoreNotes([liveNote.id]);
                    onClose();
                  }}
                />
                <SheetAction
                  label="Delete permanently"
                  icon="delete-forever"
                  color={palette.destructiveAction}
                  palette={palette}
                  onPress={() => {
                    onClose();
                    onRequestPermDelete(liveNote.id);
                  }}
                />
              </>
            ) : (
              <>
                <SheetAction
                  label="Share"
                  icon="share"
                  color={palette.textPrimary}
                  palette={palette}
                  onPress={() => void handleShare()}
                />
                <SheetAction
                  label="Copy"
                  icon="content-copy"
                  color={canCopyText ? palette.textPrimary : palette.textMuted}
                  disabledStyle={!canCopyText}
                  palette={palette}
                  onPress={() => void handleCopy()}
                />
                <SheetAction
                  label="Copy partially"
                  icon="checklist"
                  color={canCopyText ? palette.textPrimary : palette.textMuted}
                  disabledStyle={!canCopyText}
                  palette={palette}
                  onPress={handlePartialCopyPress}
                />
                <SheetAction
                  label="Edit"
                  icon="edit"
                  color={palette.textPrimary}
                  palette={palette}
                  onPress={() => {
                    onClose();
                    onEdit(liveNote);
                  }}
                />
                <SheetAction
                  label="Delete"
                  icon="delete-outline"
                  color={palette.destructiveAction}
                  palette={palette}
                  onPress={() => {
                    onClose();
                    onRequestSoftDelete([liveNote.id]);
                  }}
                />
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetAction({
  label,
  icon,
  color,
  disabledStyle = false,
  palette,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  disabledStyle?: boolean;
  palette: MessyNotePalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled: disabledStyle }}
      style={({ pressed }) => [
        styles.sheetAction,
        disabledStyle && { opacity: 0.45 },
        pressed && { backgroundColor: palette.surfaceElevated },
      ]}
      onPress={onPress}
    >
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function MobileNoteDetailModal({
  note,
  palette,
  isBin,
  onClose,
  onEdit,
  onOpenLink,
}: {
  note: Note | null;
  palette: MessyNotePalette;
  isBin: boolean;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onOpenLink: (url: string) => void;
}) {
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  if (!note) return null;

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View
          style={[
            styles.dialogHeader,
            { backgroundColor: palette.bg },
          ]}
        >
          <Pressable
            style={[
              styles.headerSecondaryPill,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.headerActionText, { color: palette.textPrimary }]}>
              Back
            </Text>
          </Pressable>
          <Text
            style={[styles.dialogTitle, { color: palette.textPrimary }]}
            numberOfLines={1}
          >
            {note.title?.trim() || 'Note Detail'}
          </Text>
          {!isBin ? (
            <Pressable
              style={[styles.savePill, { backgroundColor: palette.noteBubbleAccent }]}
              onPress={() => {
                onClose();
                onEdit(note);
              }}
            >
              <Text style={[styles.savePillText, { color: palette.onAccent }]}>Edit</Text>
            </Pressable>
          ) : (
            <View style={{ width: 64 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.detailScrollContent}>
          {note.title ? (
            <Text style={[styles.detailHeading, { color: palette.textPrimary }]}>
              {note.title}
            </Text>
          ) : null}

          {note.type === 'regular' ? (
            <MobilePlainTextView
              body={note.content.body}
              spans={note.content.spans}
              palette={palette}
              onCopyMono={(snippet) => {
                void Clipboard.setStringAsync(snippet);
                showSnackbar({ message: `Copied: ${snippet}` });
              }}
              onOpenLink={onOpenLink}
            />
          ) : null}

          {note.type === 'field' ? (
            <View style={{ gap: 10 }}>
              {[...note.content.fields]
                .sort((a, b) => a.insertionOrder - b.insertionOrder)
                .map((entry, idx) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.structuredCard,
                      { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
                    ]}
                  >
                    <Text style={{ color: palette.textMuted }}>{idx + 1}.</Text>
                    <Text style={{ color: palette.textPrimary, fontWeight: '600' }}>
                      {entry.field}
                    </Text>
                    <Text style={{ color: palette.textMuted }}>=</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.detailFieldValBtn,
                        {
                          backgroundColor: palette.surfaceElevated,
                          borderColor: palette.outlineVariant,
                        },
                        pressed && { opacity: 0.72 },
                      ]}
                      onPress={() => {
                        void Clipboard.setStringAsync(entry.value);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        showSnackbar({ message: `Copied: ${entry.value}` });
                      }}
                    >
                      <Text
                        style={{
                          color: palette.textSecondary,
                          fontFamily: Platform.select({
                            android: 'monospace',
                            default: 'monospace',
                          }),
                          fontSize: 13.5,
                        }}
                      >
                        {entry.value}
                      </Text>
                    </Pressable>
                  </View>
                ))}
            </View>
          ) : null}

          {note.type === 'list' ? (
            <View style={{ gap: 8 }}>
              {[...note.content.items]
                .sort((a, b) => a.insertionOrder - b.insertionOrder)
                .map((item, idx) => (
                  <View
                    key={item.id}
                    style={[
                      styles.structuredCard,
                      { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
                    ]}
                  >
                    <Text style={{ color: palette.textMuted }}>{idx + 1}.</Text>
                    <Text style={{ color: palette.textPrimary, flex: 1 }}>
                      {item.value}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}

          <Text style={[styles.detailTimestamp, { color: palette.textMuted }]}>
            Created {new Date(note.created_at).toLocaleString()}
            {isNoteEdited(note)
              ? ` · Updated ${new Date(note.updated_at).toLocaleString()}`
              : ''}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function MobileRegularEditorModal({
  visible,
  palette,
  title,
  initialBody,
  initialSpans,
  isEditingExisting = false,
  onCancel,
  onSave,
}: {
  visible: boolean;
  palette: MessyNotePalette;
  title: string;
  initialBody: string;
  initialSpans: TextSpan[];
  isEditingExisting?: boolean;
  onCancel: (draftBody: string, draftSpans: TextSpan[]) => void;
  onSave: (trimmedBody: string, trimmedSpans: TextSpan[]) => Promise<void>;
}) {
  const [text, setText] = useState(initialBody);
  const [spans, setSpans] = useState<TextSpan[]>(initialSpans);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  if (!visible) return null;

  const updateBody = (next: string) => {
    setSpans((prev) => adjustSpansForTextChange(text, next, prev));
    setText(next);
  };

  const handleApplyMono = () => {
    if (selection.end <= selection.start) return;
    setSpans((prev) =>
      toggleMonoSpan(prev, selection.start, selection.end, text.length)
    );
  };

  return (
    <Modal animationType="slide" visible onRequestClose={() => onCancel(text, spans)}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View
          style={[
            styles.dialogHeader,
            { backgroundColor: palette.bg },
          ]}
        >
          <Pressable
            style={[
              styles.headerSecondaryPill,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
            ]}
            onPress={() => onCancel(text, spans)}
          >
            <Text style={[styles.headerActionText, { color: palette.textPrimary }]}>
              Close
            </Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.dialogHeaderRight}>
            <Pressable
              style={[
                styles.monoBtn,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.noteBubbleAccent,
                },
              ]}
              onPress={handleApplyMono}
            >
              <Text style={[styles.monoBtnText, { color: palette.noteBubbleAccent }]}>
                Mono
              </Text>
            </Pressable>
            <Pressable
              style={[styles.savePill, { backgroundColor: palette.noteBubbleAccent }]}
              onPress={() => {
                const trimmed = adjustSpansForTrim(text, spans);
                if (!trimmed.text) return;
                const initialAdjusted = adjustSpansForTrim(initialBody, initialSpans);
                if (
                  isEditingExisting &&
                  trimmed.text === initialAdjusted.text &&
                  JSON.stringify(trimmed.spans) === JSON.stringify(initialAdjusted.spans)
                ) {
                  onCancel(initialBody, initialSpans);
                  return;
                }
                void onSave(trimmed.text, trimmed.spans);
              }}
            >
              <Text style={[styles.savePillText, { color: palette.onAccent }]}>Save</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          style={[styles.fullscreenInput, { color: palette.textPrimary }]}
          multiline
          autoFocus
          textAlignVertical="top"
          value={text}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          onChangeText={updateBody}
          placeholder="Write a note..."
          placeholderTextColor={palette.textMuted}
        />

        {spans.length > 0 ? (
          <View
            style={[
              styles.monoPreviewRow,
              {
                backgroundColor: palette.surfaceCard,
              },
            ]}
          >
            <Text style={[MessNoteTypography.labelMedium, { color: palette.textMuted }]}>
              Mono:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.monoPreviewChips}
            >
              {spans.map((s, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.monoChipBadge,
                    {
                      backgroundColor: palette.monospaceBg,
                      borderColor: palette.outlineVariant,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }),
                      fontSize: 12,
                      color: palette.monospaceText,
                    }}
                  >
                    {text.slice(s.start, s.end)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function MobileFieldValueModal({
  visible,
  palette,
  existingNote,
  onClose,
  onSave,
}: {
  visible: boolean;
  palette: MessyNotePalette;
  existingNote: FieldNote | null;
  onClose: () => void;
  onSave: (title: string | null, fields: FieldValueEntry[]) => Promise<void>;
}) {
  const initialRows: FieldValueEntry[] = existingNote?.content.fields.length
    ? [...existingNote.content.fields].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      )
    : [{ id: Crypto.randomUUID(), field: '', value: '', insertionOrder: 0 }];

  const [title, setTitle] = useState(existingNote?.title ?? '');
  const [rows, setRows] = useState<FieldValueEntry[]>(initialRows);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fieldInputRefs = useRef<Record<string, TextInput | null>>({});
  const valueInputRefs = useRef<Record<string, TextInput | null>>({});

  if (!visible) return null;

  const lastRow = rows[rows.length - 1];
  const lastRowBlank = !lastRow || (!lastRow.field.trim() && !lastRow.value.trim());

  const appendFieldRow = () => {
    const nextId = Crypto.randomUUID();
    setRows((prev) => [
      ...prev,
      {
        id: nextId,
        field: '',
        value: '',
        insertionOrder: prev.length,
      },
    ]);
    setTimeout(() => fieldInputRefs.current[nextId]?.focus(), 50);
  };

  const handleClose = () => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    const dirty =
      title !== (existingNote?.title ?? '') ||
      JSON.stringify(rows) !== JSON.stringify(initialRows);
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmDiscard(true);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={handleClose}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View
          style={[
            styles.dialogHeader,
            { backgroundColor: palette.bg },
          ]}
        >
          <Pressable
            style={[
              styles.headerSecondaryPill,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
            ]}
            onPress={handleClose}
          >
            <Text style={[styles.headerActionText, { color: palette.textPrimary }]}>
              Cancel
            </Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]} numberOfLines={1}>
            {existingNote ? 'Edit Field-Value' : 'New Field-Value'}
          </Text>
          <Pressable
            style={[styles.savePill, { backgroundColor: palette.noteBubbleAccent }]}
            onPress={() => {
              const valid = rows
                .filter((r) => r.field.trim() || r.value.trim())
                .map((r, idx) => ({
                  ...r,
                  field: r.field.trim(),
                  value: r.value.trim(),
                  insertionOrder: idx,
                }));
              if (valid.length === 0) return;
              if (existingNote) {
                const nextTitle = title.trim() || null;
                const existingSorted = [...existingNote.content.fields].sort(
                  (a, b) => a.insertionOrder - b.insertionOrder
                );
                const unchanged =
                  nextTitle === (existingNote.title ?? null) &&
                  valid.length === existingSorted.length &&
                  valid.every(
                    (r, i) =>
                      r.id === existingSorted[i]?.id &&
                      r.field === existingSorted[i]?.field &&
                      r.value === existingSorted[i]?.value
                  );
                if (unchanged) {
                  onClose();
                  return;
                }
              }
              void onSave(title.trim() || null, valid);
            }}
          >
            <Text style={[styles.savePillText, { color: palette.onAccent }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.structuredBody}>
          <TextInput
            style={[
              styles.structuredInput,
              {
                backgroundColor: palette.surfaceCard,
                borderColor: palette.outlineVariant,
                color: palette.textPrimary,
              },
            ]}
            placeholder="Optional title"
            placeholderTextColor={palette.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          {rows.map((row, idx) => (
            <View
              key={row.id}
              style={[
                styles.structuredCard,
                { backgroundColor: palette.surfaceCard, borderColor: palette.outlineVariant },
              ]}
            >
              <Text style={[styles.rowIdxText, { color: palette.textMuted }]}>{idx + 1}.</Text>
              <TextInput
                ref={(el) => {
                  fieldInputRefs.current[row.id] = el;
                }}
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="Field"
                placeholderTextColor={palette.textMuted}
                returnKeyType="next"
                submitBehavior="submit"
                value={row.field}
                onChangeText={(field) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, field } : r))
                  )
                }
                onSubmitEditing={() => valueInputRefs.current[row.id]?.focus()}
              />
              <Pressable
                style={[
                  styles.fieldEqBtn,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.outlineVariant,
                  },
                ]}
                onPress={() => valueInputRefs.current[row.id]?.focus()}
                accessibilityLabel="Equals separator, jump to value"
              >
                <Text style={[styles.fieldEqText, { color: palette.textSecondary }]}>=</Text>
              </Pressable>
              <TextInput
                ref={(el) => {
                  valueInputRefs.current[row.id] = el;
                }}
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="Value"
                placeholderTextColor={palette.textMuted}
                returnKeyType="done"
                submitBehavior="submit"
                value={row.value}
                onChangeText={(value) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value } : r))
                  )
                }
                onSubmitEditing={() => {
                  if (idx < rows.length - 1) {
                    const nextRow = rows[idx + 1];
                    if (nextRow) {
                      fieldInputRefs.current[nextRow.id]?.focus();
                      return;
                    }
                  }
                  appendFieldRow();
                }}
              />
              <Pressable
                disabled={rows.length <= 1}
                style={[styles.rowDeleteBtn, rows.length <= 1 && { opacity: 0.35 }]}
                onPress={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
                accessibilityLabel="Remove row"
              >
                <MaterialIcons name="close" size={18} color={palette.destructiveAction} />
              </Pressable>
            </View>
          ))}

          <Pressable
            disabled={lastRowBlank}
            style={[
              styles.addRowBtn,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.outlineVariant,
                opacity: lastRowBlank ? 0.4 : 1,
              },
            ]}
            onPress={appendFieldRow}
          >
            <Text style={[styles.addRowBtnText, { color: palette.noteBubbleAccent }]}>
              + Add Row
            </Text>
          </Pressable>
        </ScrollView>

        <MobileConfirmDialog
          visible={confirmDiscard}
          asOverlay
          palette={palette}
          title="Discard changes?"
          message="Your unsaved changes will be lost."
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          destructive
          icon="warning-amber"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}

export function MobileListModal({
  visible,
  palette,
  existingNote,
  onClose,
  onSave,
}: {
  visible: boolean;
  palette: MessyNotePalette;
  existingNote: ListNote | null;
  onClose: () => void;
  onSave: (title: string | null, items: ListRowEntry[]) => Promise<void>;
}) {
  const initialItems: ListRowEntry[] = existingNote?.content.items.length
    ? [...existingNote.content.items].sort(
        (a, b) => a.insertionOrder - b.insertionOrder
      )
    : [{ id: Crypto.randomUUID(), value: '', checked: false, insertionOrder: 0 }];

  const [title, setTitle] = useState(existingNote?.title ?? '');
  const [rows, setRows] = useState<ListRowEntry[]>(initialItems);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const itemInputRefs = useRef<Record<string, TextInput | null>>({});

  if (!visible) return null;

  const appendListRow = () => {
    const nextId = Crypto.randomUUID();
    setRows((prev) => [
      ...prev,
      {
        id: nextId,
        value: '',
        checked: false,
        insertionOrder: prev.length,
      },
    ]);
    setTimeout(() => itemInputRefs.current[nextId]?.focus(), 50);
  };

  const handleClose = () => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    const dirty =
      title !== (existingNote?.title ?? '') ||
      JSON.stringify(rows) !== JSON.stringify(initialItems);
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmDiscard(true);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={handleClose}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View
          style={[
            styles.dialogHeader,
            { backgroundColor: palette.bg },
          ]}
        >
          <Pressable
            style={[
              styles.headerSecondaryPill,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
            ]}
            onPress={handleClose}
          >
            <Text style={[styles.headerActionText, { color: palette.textPrimary }]}>
              Cancel
            </Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]} numberOfLines={1}>
            {existingNote ? 'Edit List' : 'New List'}
          </Text>
          <Pressable
            style={[styles.savePill, { backgroundColor: palette.noteBubbleAccent }]}
            onPress={() => {
              const valid = rows
                .filter((r) => r.value.trim())
                .map((r, idx) => ({
                  ...r,
                  value: r.value.trim(),
                  insertionOrder: idx,
                }));
              if (valid.length === 0) return;
              if (existingNote) {
                const nextTitle = title.trim() || null;
                const existingSorted = [...existingNote.content.items].sort(
                  (a, b) => a.insertionOrder - b.insertionOrder
                );
                const unchanged =
                  nextTitle === (existingNote.title ?? null) &&
                  valid.length === existingSorted.length &&
                  valid.every(
                    (r, i) =>
                      r.id === existingSorted[i]?.id &&
                      r.value === existingSorted[i]?.value
                  );
                if (unchanged) {
                  onClose();
                  return;
                }
              }
              void onSave(title.trim() || null, valid);
            }}
          >
            <Text style={[styles.savePillText, { color: palette.onAccent }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.structuredBody}>
          <TextInput
            style={[
              styles.structuredInput,
              {
                backgroundColor: palette.surfaceCard,
                borderColor: palette.outlineVariant,
                color: palette.textPrimary,
              },
            ]}
            placeholder="Optional title"
            placeholderTextColor={palette.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          {rows.map((row, idx) => (
            <View
              key={row.id}
              style={[
                styles.structuredCard,
                { backgroundColor: palette.surfaceCard, borderColor: palette.outlineVariant },
              ]}
            >
              <Text style={[styles.rowIdxText, { color: palette.textMuted }]}>{idx + 1}.</Text>
              <TextInput
                ref={(el) => {
                  itemInputRefs.current[row.id] = el;
                }}
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="List item"
                placeholderTextColor={palette.textMuted}
                returnKeyType="done"
                submitBehavior="submit"
                value={row.value}
                onChangeText={(value) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value } : r))
                  )
                }
                onSubmitEditing={() => {
                  if (idx < rows.length - 1) {
                    const nextRow = rows[idx + 1];
                    if (nextRow) {
                      itemInputRefs.current[nextRow.id]?.focus();
                      return;
                    }
                  }
                  appendListRow();
                }}
              />
              <Pressable
                disabled={rows.length <= 1}
                style={[styles.rowDeleteBtn, rows.length <= 1 && { opacity: 0.35 }]}
                onPress={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
                accessibilityLabel="Remove row"
              >
                <MaterialIcons name="close" size={18} color={palette.destructiveAction} />
              </Pressable>
            </View>
          ))}

          <Pressable
            style={[
              styles.addRowBtn,
              { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
            ]}
            onPress={appendListRow}
          >
            <Text style={[styles.addRowBtnText, { color: palette.noteBubbleAccent }]}>
              + Add Row
            </Text>
          </Pressable>
        </ScrollView>

        <MobileConfirmDialog
          visible={confirmDiscard}
          asOverlay
          palette={palette}
          title="Discard changes?"
          message="Your unsaved changes will be lost."
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          destructive
          icon="warning-amber"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}

export function MobilePartialCopyModal({
  note,
  palette,
  onClose,
}: {
  note: Note | null;
  palette: MessyNotePalette;
  onClose: () => void;
}) {
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (!note) return null;
  const tokens = tokenizeForPartialCopy(note);

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.partialDialog,
            { backgroundColor: palette.surfaceCard, borderColor: palette.outlineVariant },
          ]}
          onPress={() => undefined}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
              Copy partially
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={[styles.partialHeaderBtn, { backgroundColor: palette.primaryContainer }]}
                onPress={() => setSelected(new Set(tokens.map((_, i) => i)))}
              >
                <Text style={{ color: palette.noteBubbleAccent, ...MessNoteTypography.labelLarge }}>
                  All
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.partialHeaderBtn,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.outlineVariant,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setSelected(new Set())}
              >
                <Text style={{ color: palette.textPrimary, ...MessNoteTypography.labelLarge }}>
                  Clear
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.chipsWrap}>
            {tokens.map((token, idx) => {
              const active = selected.has(idx);
              return (
                <Pressable
                  key={idx}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active
                        ? palette.selectedItemBackground
                        : palette.surfaceElevated,
                      borderColor: active
                        ? palette.noteBubbleAccent
                        : palette.outlineVariant,
                    },
                  ]}
                  onPress={() => toggle(idx)}
                >
                  <Text
                    style={{
                      ...MessNoteTypography.bodyMedium,
                      color: active ? palette.noteBubbleAccent : palette.textPrimary,
                    }}
                  >
                    {token}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.partialFooter}>
            <Pressable
              style={[
                styles.headerSecondaryPill,
                { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.headerActionText, { color: palette.textPrimary }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              disabled={selected.size === 0}
              style={[
                styles.savePill,
                {
                  backgroundColor: palette.noteBubbleAccent,
                  opacity: selected.size === 0 ? 0.4 : 1,
                },
              ]}
              onPress={() => {
                const snippet = joinPartialCopyTokens(note, tokens, selected);
                void Clipboard.setStringAsync(snippet);
                showSnackbar({ message: 'Snippet copied to clipboard!' });
                onClose();
              }}
            >
              <Text style={[styles.savePillText, { color: palette.onAccent }]}>
                Copy Snippet
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    elevation: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    borderWidth: 1,
    padding: 24,
    gap: 14,
  },
  confirmIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    ...MessNoteTypography.titleLarge,
  },
  confirmMessage: {
    ...MessNoteTypography.bodyMedium,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  confirmSecondaryBtn: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryBtn: {
    borderRadius: 999,
    minHeight: 42,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    ...MessNoteTypography.labelLarge,
    fontWeight: '700',
  },
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: MessNoteMetrics.dialogCornerRadius,
    borderTopRightRadius: MessNoteMetrics.dialogCornerRadius,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 12,
    opacity: 0.55,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  starToggleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    borderWidth: 1,
    padding: 20,
    gap: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 6,
    gap: 12,
  },
  sheetTitle: {
    ...MessNoteTypography.titleMedium,
    fontWeight: '700',
    flex: 1,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  sheetActionText: {
    ...MessNoteTypography.bodyLarge,
    fontWeight: '500',
    flex: 1,
  },
  fullscreen: {
    flex: 1,
  },
  dialogHeader: {
    minHeight: MessNoteMetrics.headerRowHeight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dialogTitle: {
    ...MessNoteTypography.titleMedium,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  dialogHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSecondaryPill: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionText: {
    ...MessNoteTypography.labelLarge,
  },
  monoBtn: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monoBtnText: {
    ...MessNoteTypography.labelLarge,
  },
  savePill: {
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePillText: {
    ...MessNoteTypography.labelLarge,
    fontWeight: '700',
  },
  fullscreenInput: {
    flex: 1,
    padding: 16,
    ...MessNoteTypography.bodyLarge,
  },
  sheetPreviewBox: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  detailScrollContent: {
    padding: 18,
    gap: 12,
  },
  detailHeading: {
    ...MessNoteTypography.titleLarge,
  },
  detailTimestamp: {
    ...MessNoteTypography.labelMedium,
    marginTop: 12,
  },
  monoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  monoPreviewChips: {
    flexDirection: 'row',
    gap: 6,
  },
  monoChipBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  structuredBody: {
    padding: 16,
    gap: 12,
  },
  structuredInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 50,
    ...MessNoteTypography.titleMedium,
  },
  structuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 50,
  },
  rowIdxText: {
    ...MessNoteTypography.bodyMedium,
    minWidth: 20,
  },
  flexInput: {
    flex: 1,
    ...MessNoteTypography.bodyLarge,
    paddingVertical: 4,
  },
  detailFieldValBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fieldEqBtn: {
    minWidth: 34,
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldEqText: {
    ...MessNoteTypography.titleMedium,
    fontWeight: '700',
  },
  rowDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowBtn: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowBtnText: {
    ...MessNoteTypography.labelLarge,
  },
  partialDialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    borderWidth: 1,
    padding: 22,
    maxHeight: '78%',
    gap: 14,
  },
  partialHeaderBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partialFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
});
