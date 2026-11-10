import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import {
  Alert,
  Modal,
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
import { MobileMarkdownView } from './MobileMarkdownView';

export function MobileOptionsSheet({
  note,
  palette,
  activeView,
  filterType,
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
  const { toggleFavorite, togglePin, restoreNotes, showSnackbar } = useNotesStore();
  if (!note) return null;

  const isBin = activeView === 'bin' || note.deleted_at !== null;
  const showPinAction = !isBin && activeView === 'home' && filterType !== 'all';

  const handleCopy = async () => {
    await Clipboard.setStringAsync(buildGroupedText(note));
    showSnackbar({ message: 'Copied to clipboard!' });
    onClose();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: note.title ?? undefined,
        message: buildGroupedText(note),
      });
    } catch {
      showSnackbar({ message: 'No app available to share' });
    }
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: palette.surfaceContainerHigh, borderColor: palette.outlineVariant },
          ]}
          onPress={() => undefined}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: palette.outlineVariant }]}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
              {note.title?.trim() || (isBin ? 'Deleted Note' : 'Note Options')}
            </Text>
            {!isBin ? (
              <Pressable onPress={() => void toggleFavorite(note.id)}>
                <MaterialIcons
                  name={note.favorite ? 'star' : 'star-border'}
                  size={24}
                  color={note.favorite ? palette.noteBubbleAccent : palette.textMuted}
                />
              </Pressable>
            ) : null}
          </View>

          {note.type === 'regular' && note.content.body.trim() ? (
            <ScrollView
              style={[
                styles.sheetPreviewBox,
                { backgroundColor: palette.bg, borderColor: palette.borderSubtle },
              ]}
              nestedScrollEnabled
            >
              <MobileMarkdownView
                body={note.content.body}
                spans={note.content.spans}
                palette={palette}
                onCopyCode={(snippet) => {
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

          {onViewDetail ? (
            <SheetAction
              label="View note detail"
              color={palette.noteBubbleAccent}
              onPress={() => {
                onClose();
                onViewDetail(note);
              }}
            />
          ) : null}

          {isBin ? (
            <>
              <SheetAction
                label="Restore"
                color={palette.textPrimary}
                onPress={() => {
                  void restoreNotes([note.id]);
                  onClose();
                }}
              />
              <SheetAction
                label="Delete permanently"
                color={palette.destructiveAction}
                onPress={() => {
                  onClose();
                  onRequestPermDelete(note.id);
                }}
              />
            </>
          ) : (
            <>
              {showPinAction ? (
                <SheetAction
                  label={note.pinned ? 'Unpin note' : 'Pin note'}
                  color={palette.textPrimary}
                  onPress={() => {
                    void togglePin(note.id);
                    onClose();
                  }}
                />
              ) : null}
              <SheetAction
                label="Share"
                color={palette.textPrimary}
                onPress={() => void handleShare()}
              />
              <SheetAction
                label="Copy"
                color={palette.textPrimary}
                onPress={() => void handleCopy()}
              />
              <SheetAction
                label="Copy partially"
                color={palette.textPrimary}
                onPress={() => {
                  onClose();
                  onPartialCopy(note);
                }}
              />
              <SheetAction
                label="Edit"
                color={palette.textPrimary}
                onPress={() => {
                  onClose();
                  onEdit(note);
                }}
              />
              <SheetAction
                label="Delete"
                color={palette.destructiveAction}
                onPress={() => {
                  onClose();
                  onRequestSoftDelete([note.id]);
                }}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetAction({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.sheetAction} onPress={onPress}>
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

type MobileEditorMode = 'write' | 'split' | 'preview';

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
        <View style={[styles.dialogHeader, { backgroundColor: palette.headerBg }]}>
          <Pressable onPress={onClose}>
            <Text style={{ color: palette.textSecondary }}>Back</Text>
          </Pressable>
          <Text
            style={[styles.dialogTitle, { color: palette.textPrimary, maxWidth: '55%' }]}
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
              <Text style={{ color: palette.onAccent, fontWeight: '700' }}>Edit</Text>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.detailScrollContent}>
          {note.title ? (
            <Text style={[styles.detailHeading, { color: palette.textPrimary }]}>
              {note.title}
            </Text>
          ) : null}

          {note.type === 'regular' ? (
            <MobileMarkdownView
              body={note.content.body}
              spans={note.content.spans}
              palette={palette}
              onCopyCode={(snippet) => {
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
                    <Text style={{ color: palette.textSecondary, flex: 1 }}>
                      {entry.value}
                    </Text>
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
                    <Text style={{ color: palette.noteBubbleAccent, fontWeight: '700' }}>
                      {item.checked ? '☑' : '☐'}
                    </Text>
                    <Text style={{ color: palette.textMuted }}>{idx + 1}.</Text>
                    <Text
                      style={{
                        color: item.checked ? palette.textMuted : palette.textPrimary,
                        textDecorationLine: item.checked ? 'line-through' : 'none',
                        flex: 1,
                      }}
                    >
                      {item.value}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}

          <Text style={[styles.detailTimestamp, { color: palette.textMuted }]}>
            Created {new Date(note.created_at).toLocaleString()}
            {note.updated_at !== note.created_at
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
  onCancel,
  onSave,
}: {
  visible: boolean;
  palette: MessyNotePalette;
  title: string;
  initialBody: string;
  initialSpans: TextSpan[];
  onCancel: (draftBody: string, draftSpans: TextSpan[]) => void;
  onSave: (trimmedBody: string, trimmedSpans: TextSpan[]) => Promise<void>;
}) {
  const showSnackbar = useNotesStore((s) => s.showSnackbar);
  const [text, setText] = useState(initialBody);
  const [spans, setSpans] = useState<TextSpan[]>(initialSpans);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [viewMode, setViewMode] = useState<MobileEditorMode>('split');

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

  const applyWrapOrPrefix = (prefix: string, suffix = '', fallback = 'text') => {
    const start = selection.start;
    const end = selection.end;
    const selected = text.slice(start, end) || fallback;
    const next = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    updateBody(next);
  };

  const applyLinePrefix = (linePrefix: string) => {
    const start = selection.start;
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const next = text.slice(0, lineStart) + linePrefix + text.slice(lineStart);
    updateBody(next);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={() => onCancel(text, spans)}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View style={[styles.dialogHeader, { backgroundColor: palette.headerBg }]}>
          <Pressable onPress={() => onCancel(text, spans)}>
            <Text style={{ color: palette.textSecondary }}>Close</Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]}>{title}</Text>
          <View style={styles.dialogHeaderRight}>
            {viewMode !== 'preview' ? (
              <Pressable
                style={[styles.monoBtn, { borderColor: palette.noteBubbleAccent }]}
                onPress={handleApplyMono}
              >
                <Text style={{ color: palette.noteBubbleAccent, fontWeight: '600' }}>
                  Mono
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.savePill, { backgroundColor: palette.noteBubbleAccent }]}
              onPress={() => {
                const trimmed = adjustSpansForTrim(text, spans);
                if (!trimmed.text) return;
                void onSave(trimmed.text, trimmed.spans);
              }}
            >
              <Text style={{ color: palette.onAccent, fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.editorSubBar,
            { backgroundColor: palette.surfaceCard, borderBottomColor: palette.borderSubtle },
          ]}
        >
          <View style={[styles.modeTabsRow, { borderColor: palette.borderSubtle, backgroundColor: palette.bg }]}>
            {(['write', 'split', 'preview'] as const).map((mode) => {
              const active = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[
                    styles.modeTab,
                    active && { backgroundColor: palette.noteBubbleAccent },
                  ]}
                  onPress={() => setViewMode(mode)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? palette.onAccent : palette.textSecondary,
                    }}
                  >
                    {mode === 'write' ? 'Write' : mode === 'split' ? 'Split' : 'Preview'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {viewMode !== 'preview' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.formatToolbar}
            >
              {[
                { label: 'H1', onPress: () => applyLinePrefix('# ') },
                { label: 'H2', onPress: () => applyLinePrefix('## ') },
                { label: 'B', onPress: () => applyWrapOrPrefix('**', '**', 'bold') },
                { label: 'I', onPress: () => applyWrapOrPrefix('*', '*', 'italic') },
                { label: '`Code`', onPress: () => applyWrapOrPrefix('`', '`', 'code') },
                { label: '• List', onPress: () => applyLinePrefix('- ') },
                { label: '1. List', onPress: () => applyLinePrefix('1. ') },
                { label: '> Quote', onPress: () => applyLinePrefix('> ') },
              ].map((btn) => (
                <Pressable
                  key={btn.label}
                  style={[
                    styles.formatChip,
                    { backgroundColor: palette.bg, borderColor: palette.borderSubtle },
                  ]}
                  onPress={btn.onPress}
                >
                  <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    {btn.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {viewMode !== 'preview' ? (
          <TextInput
            style={[
              styles.fullscreenInput,
              viewMode === 'split' && styles.splitInput,
              { color: palette.textPrimary },
            ]}
            multiline
            autoFocus
            textAlignVertical="top"
            value={text}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            onChangeText={updateBody}
            placeholder="Write your note in Markdown (# Heading, **bold**, *italic*, - list, > quote, `code`)..."
            placeholderTextColor={palette.textMuted}
          />
        ) : null}

        {viewMode !== 'write' ? (
          <View
            style={[
              styles.mobilePreviewContainer,
              viewMode === 'split' && { borderTopWidth: 1, borderTopColor: palette.borderSubtle },
            ]}
          >
            {viewMode === 'split' ? (
              <Text style={[styles.previewPaneHeader, { color: palette.textMuted }]}>
                LIVE PREVIEW
              </Text>
            ) : null}
            <ScrollView contentContainerStyle={styles.previewPaneScroll}>
              {text.trim() ? (
                <MobileMarkdownView
                  body={text}
                  spans={spans}
                  palette={palette}
                  onCopyCode={(snippet) => {
                    void Clipboard.setStringAsync(snippet);
                    showSnackbar({ message: `Copied: ${snippet}` });
                  }}
                />
              ) : (
                <Text style={{ color: palette.textMuted, fontSize: 14 }}>
                  Type Markdown above to preview formatting live.
                </Text>
              )}
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

  if (!visible) return null;

  const lastRow = rows[rows.length - 1];
  const lastRowBlank = !lastRow || (!lastRow.field.trim() && !lastRow.value.trim());

  const handleClose = () => {
    const dirty =
      title !== (existingNote?.title ?? '') ||
      JSON.stringify(rows) !== JSON.stringify(initialRows);
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={handleClose}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View style={[styles.dialogHeader, { backgroundColor: palette.headerBg }]}>
          <Pressable onPress={handleClose}>
            <Text style={{ color: palette.textSecondary }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]}>
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
              void onSave(title.trim() || null, valid);
            }}
          >
            <Text style={{ color: palette.onAccent, fontWeight: '700' }}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.structuredBody}>
          <TextInput
            style={[
              styles.structuredInput,
              {
                backgroundColor: palette.surfaceCard,
                borderColor: palette.borderSubtle,
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
                { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
              ]}
            >
              <Text style={{ color: palette.textMuted }}>{idx + 1}.</Text>
              <TextInput
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="Field"
                placeholderTextColor={palette.textMuted}
                value={row.field}
                onChangeText={(field) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, field } : r))
                  )
                }
              />
              <TextInput
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="Value"
                placeholderTextColor={palette.textMuted}
                value={row.value}
                onChangeText={(value) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value } : r))
                  )
                }
              />
              <Pressable
                disabled={rows.length <= 1}
                onPress={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
              >
                <Text style={{ color: palette.destructiveAction }}>×</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            disabled={lastRowBlank}
            style={[
              styles.addRowBtn,
              { borderColor: palette.borderSubtle, opacity: lastRowBlank ? 0.4 : 1 },
            ]}
            onPress={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: Crypto.randomUUID(),
                  field: '',
                  value: '',
                  insertionOrder: prev.length,
                },
              ])
            }
          >
            <Text style={{ color: palette.noteBubbleAccent, fontWeight: '600' }}>
              + Add Row
            </Text>
          </Pressable>
        </ScrollView>
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

  if (!visible) return null;

  const handleClose = () => {
    const dirty =
      title !== (existingNote?.title ?? '') ||
      JSON.stringify(rows) !== JSON.stringify(initialItems);
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={handleClose}>
      <View style={[styles.fullscreen, { backgroundColor: palette.bg }]}>
        <View style={[styles.dialogHeader, { backgroundColor: palette.headerBg }]}>
          <Pressable onPress={handleClose}>
            <Text style={{ color: palette.textSecondary }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.dialogTitle, { color: palette.textPrimary }]}>
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
              void onSave(title.trim() || null, valid);
            }}
          >
            <Text style={{ color: palette.onAccent, fontWeight: '700' }}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.structuredBody}>
          <TextInput
            style={[
              styles.structuredInput,
              {
                backgroundColor: palette.surfaceCard,
                borderColor: palette.borderSubtle,
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
                { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
              ]}
            >
              <Text style={{ color: palette.textMuted }}>{idx + 1}.</Text>
              <TextInput
                style={[styles.flexInput, { color: palette.textPrimary }]}
                placeholder="List item"
                placeholderTextColor={palette.textMuted}
                value={row.value}
                onChangeText={(value) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, value } : r))
                  )
                }
              />
              <Pressable
                disabled={rows.length <= 1}
                onPress={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
              >
                <Text style={{ color: palette.destructiveAction }}>×</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            style={[styles.addRowBtn, { borderColor: palette.borderSubtle }]}
            onPress={() =>
              setRows((prev) => [
                ...prev,
                {
                  id: Crypto.randomUUID(),
                  value: '',
                  checked: false,
                  insertionOrder: prev.length,
                },
              ])
            }
          >
            <Text style={{ color: palette.noteBubbleAccent, fontWeight: '600' }}>
              + Add Row
            </Text>
          </Pressable>
        </ScrollView>
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
            { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
          ]}
          onPress={() => undefined}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>
              Copy partially
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={() => setSelected(new Set(tokens.map((_, i) => i)))}>
                <Text style={{ color: palette.noteBubbleAccent }}>All</Text>
              </Pressable>
              <Pressable onPress={() => setSelected(new Set())}>
                <Text style={{ color: palette.textSecondary }}>Clear</Text>
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
                        : palette.bg,
                      borderColor: active
                        ? palette.noteBubbleAccent
                        : palette.borderSubtle,
                    },
                  ]}
                  onPress={() => toggle(idx)}
                >
                  <Text
                    style={{
                      color: active ? palette.noteBubbleAccent : palette.textPrimary,
                    }}
                  >
                    {token}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            disabled={selected.size === 0}
            style={[
              styles.savePill,
              {
                backgroundColor: palette.noteBubbleAccent,
                alignSelf: 'flex-end',
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
            <Text style={{ color: palette.onAccent, fontWeight: '700' }}>
              Copy Snippet
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    borderWidth: 1,
    padding: 20,
    gap: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  sheetTitle: {
    ...MessNoteTypography.titleMedium,
    fontWeight: '700',
  },
  sheetAction: {
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  sheetActionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  fullscreen: {
    flex: 1,
  },
  dialogHeader: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dialogHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monoBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  savePill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fullscreenInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
  },
  splitInput: {
    flex: 1,
    minHeight: 160,
  },
  sheetPreviewBox: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 6,
  },
  detailScrollContent: {
    padding: 18,
    gap: 12,
  },
  detailHeading: {
    fontSize: 22,
    fontWeight: '700',
  },
  detailTimestamp: {
    fontSize: 12,
    marginTop: 12,
  },
  editorSubBar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  modeTabsRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  modeTab: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  formatToolbar: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  formatChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  mobilePreviewContainer: {
    flex: 1,
  },
  previewPaneHeader: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 10,
    letterSpacing: 0.5,
  },
  previewPaneScroll: {
    padding: 16,
  },
  structuredBody: {
    padding: 16,
    gap: 12,
  },
  structuredInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  structuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  flexInput: {
    flex: 1,
    fontSize: 15,
  },
  addRowBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  partialDialog: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    maxHeight: '75%',
    gap: 12,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
