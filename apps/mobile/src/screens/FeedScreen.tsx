import { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {
  DarkMessNoteColors,
  LightMessNoteColors,
  MAX_PHOTOS_PER_NOTE,
  MessNoteMetrics,
  MessNoteTypography,
  buildGroupedText,
  getDisplayedBinNotes,
  getDisplayedFavorites,
  getDisplayedNotes,
  type FieldNote,
  type ListNote,
  type Note,
  type NoteFilter,
  type TextSpan,
} from '@messy-notes/shared';
import {
  MobileFieldValueModal,
  MobileListModal,
  MobileNoteDetailModal,
  MobileOptionsSheet,
  MobilePartialCopyModal,
  MobileRegularEditorModal,
} from '../components/MobileDialogs';
import { MobileNoteBubble } from '../components/MobileNoteBubble';
import { getPreference, setPreference } from '../lib/mmkvStorage';
import { useAuthStore } from '../store/authStore';
import { useNotesStore } from '../store/notesStore';

const FILTER_ORDER: NoteFilter[] = ['all', 'regular', 'field', 'list'];
const FILTER_LABELS: Record<NoteFilter, string> = {
  all: 'All',
  regular: 'Notes',
  field: 'Fields-Values',
  list: 'Lists',
};

export function FeedScreen() {
  const systemScheme = useColorScheme();
  const { user, signOut } = useAuthStore();
  const {
    notes,
    dirtyIds,
    pendingCount,
    activeView,
    filterType,
    searchActive,
    homeSearchQuery,
    favSearchQuery,
    binSearchQuery,
    selectedNoteIds,
    syncState,
    isOnline,
    realtimeConnected,
    snackbar,
    error,
    setActiveView,
    setFilterType,
    setSearchActive,
    setSearchQueryForActiveView,
    getSearchQueryForActiveView,
    toggleSelectNote,
    clearSelection,
    showSnackbar,
    triggerManualSync,
    createRegularNote,
    createStructuredNote,
    updateNote,
    softDeleteNotes,
    permanentlyDeleteNotes,
    emptyBin,
  } = useNotesStore();

  const [themeOverride, setThemeOverride] = useState<'dark' | 'light' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [draftSpans, setDraftSpans] = useState<TextSpan[]>([]);
  const [draftPhotos, setDraftPhotos] = useState<Array<{ uri: string; mimeType?: string }>>([]);

  const [optionsNote, setOptionsNote] = useState<Note | null>(null);
  const [detailNote, setDetailNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [partialCopyNote, setPartialCopyNote] = useState<Note | null>(null);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  const listRef = useRef<FlatList<Note> | null>(null);

  useEffect(() => {
    const val = getPreference('theme_mode');
    if (val === 'dark' || val === 'light') {
      setThemeOverride(val);
    }
  }, []);

  const isDark =
    themeOverride !== null ? themeOverride === 'dark' : systemScheme !== 'light';
  const palette = isDark ? DarkMessNoteColors : LightMessNoteColors;

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setThemeOverride(next);
    setPreference('theme_mode', next);
  };

  const selectionMode = selectedNoteIds.size > 0;

  // Section 7.1 Back navigation priority order.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (composerExpanded) {
        setComposerExpanded(false);
        return true;
      }
      if (plusMenuOpen) {
        setPlusMenuOpen(false);
        return true;
      }
      if (selectedNoteIds.size > 0) {
        clearSelection();
        return true;
      }
      if (searchActive) {
        setSearchQueryForActiveView('');
        setSearchActive(false);
        return true;
      }
      if (optionsNote || detailNote || editingNote || newFieldOpen || newListOpen || partialCopyNote || previewPhotoUri) {
        setOptionsNote(null);
        setDetailNote(null);
        setEditingNote(null);
        setNewFieldOpen(false);
        setNewListOpen(false);
        setPartialCopyNote(null);
        setPreviewPhotoUri(null);
        return true;
      }
      if (activeView === 'favorites' || activeView === 'bin') {
        setActiveView('home');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [
    drawerOpen,
    composerExpanded,
    plusMenuOpen,
    selectedNoteIds.size,
    searchActive,
    optionsNote,
    detailNote,
    editingNote,
    newFieldOpen,
    newListOpen,
    partialCopyNote,
    previewPhotoUri,
    activeView,
    clearSelection,
    setSearchQueryForActiveView,
    setSearchActive,
    setActiveView,
  ]);

  // Section 4.5 & 6.3 Horizontal swipe navigation across filters on Home.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          if (activeView !== 'home' || selectionMode) return false;
          const absX = Math.abs(gesture.dx);
          const absY = Math.abs(gesture.dy);
          return absX > 16 && absX > absY * 1.5;
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (activeView !== 'home' || selectionMode) return;
          if (Math.abs(gesture.dx) < 64) return;
          if (Math.abs(gesture.dx) <= Math.abs(gesture.dy) * 1.5) return;

          const currentIdx = FILTER_ORDER.indexOf(filterType);
          if (gesture.dx < 0) {
            if (currentIdx < FILTER_ORDER.length - 1) {
              setFilterType(FILTER_ORDER[currentIdx + 1]!);
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }
          } else if (filterType === 'all') {
            setDrawerOpen(true);
          } else if (currentIdx > 0) {
            setFilterType(FILTER_ORDER[currentIdx - 1]!);
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          }
        },
      }),
    [activeView, selectionMode, filterType, setFilterType]
  );

  if (!user) return null;

  const displayedNotes =
    activeView === 'favorites'
      ? getDisplayedFavorites(notes, favSearchQuery)
      : activeView === 'bin'
        ? getDisplayedBinNotes(notes, binSearchQuery)
        : getDisplayedNotes(notes, filterType, homeSearchQuery);

  const selectedNotes = notes.filter((n) => selectedNoteIds.has(n.id));
  const binCount = notes.filter((n) => n.deleted_at !== null).length;

  const statusLabel = !isOnline
    ? `Offline (${pendingCount} queued)`
    : syncState === 'syncing'
      ? 'Syncing...'
      : realtimeConnected
        ? 'Live'
        : 'Connected';

  const confirmSoftDelete = (ids: string[]) => {
    Alert.alert(
      ids.length === 1 ? 'Move 1 note to bin?' : `Move ${ids.length} notes to bin?`,
      'Deleted notes can be restored from the Bin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to bin',
          style: 'destructive',
          onPress: () => void softDeleteNotes(ids),
        },
      ]
    );
  };

  const confirmPermanentDelete = (id: string) => {
    Alert.alert(
      'Delete note permanently?',
      'This note and its photos cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void permanentlyDeleteNotes([id]),
        },
      ]
    );
  };

  const confirmOpenLink = (url: string) => {
    Alert.alert('Open link?', url, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open',
        onPress: () => {
          void Linking.openURL(url).catch(() =>
            showSnackbar({ message: 'No application found to open link' })
          );
        },
      },
    ]);
  };

  const handlePickPhotos = async () => {
    const remaining = MAX_PHOTOS_PER_NOTE - draftPhotos.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });

    if (!result.canceled && result.assets.length > 0) {
      const picked = result.assets
        .slice(0, remaining)
        .map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' }));
      setDraftPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS_PER_NOTE));
    }
  };

  const handleSendRegular = async () => {
    await createRegularNote({
      userId: user.id,
      rawBody: draftText,
      explicitSpans: draftSpans.length > 0 ? draftSpans : undefined,
      pickedPhotoUris: draftPhotos,
    });
    setDraftText('');
    setDraftSpans([]);
    setDraftPhotos([]);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const showComposer =
    activeView === 'home' && !searchActive && !selectionMode && !composerExpanded;

  const activeQuery =
    activeView === 'favorites'
      ? favSearchQuery
      : activeView === 'bin'
        ? binSearchQuery
        : homeSearchQuery;

  const emptyMessage = activeQuery.trim()
    ? `No notes matching "${activeQuery.trim()}"`
    : activeView === 'favorites'
      ? 'No matching favorites'
      : activeView === 'bin'
        ? 'No notes in bin'
        : filterType === 'field'
          ? 'No Fields-Values yet'
          : filterType === 'list'
            ? 'No Lists yet'
            : 'No notes yet';

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      {/* Header */}
      {selectionMode ? (
        <View
          style={[
            styles.header,
            { backgroundColor: palette.surfaceContainer, borderBottomColor: palette.outlineVariant },
          ]}
        >
          <View style={styles.headerLeft}>
            <Pressable style={styles.headerIconBtn} onPress={clearSelection}>
              <MaterialIcons name="close" size={22} color={palette.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
              {selectedNotes.length} selected
            </Text>
          </View>
          <View style={styles.headerActions}>
            {selectedNotes.length === 1 ? (
              <>
                <Pressable
                  style={styles.headerTextBtn}
                  onPress={() => {
                    const target = selectedNotes[0]!;
                    clearSelection();
                    setEditingNote(target);
                  }}
                >
                  <Text style={{ color: palette.textPrimary }}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.headerTextBtn}
                  onPress={() => {
                    const target = selectedNotes[0]!;
                    clearSelection();
                    setPartialCopyNote(target);
                  }}
                >
                  <Text style={{ color: palette.textPrimary }}>Partial</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              style={styles.headerTextBtn}
              onPress={() => {
                void Clipboard.setStringAsync(
                  selectedNotes.map(buildGroupedText).join('\n\n')
                );
                clearSelection();
                showSnackbar({ message: 'Copied to clipboard!' });
              }}
            >
              <Text style={{ color: palette.textPrimary }}>Copy</Text>
            </Pressable>
            <Pressable
              style={styles.headerTextBtn}
              onPress={() => confirmSoftDelete(selectedNotes.map((n) => n.id))}
            >
              <Text style={{ color: palette.destructiveAction }}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : searchActive ? (
        <View
          style={[
            styles.header,
            styles.searchHeaderContainer,
            { backgroundColor: palette.surfaceContainer, borderBottomColor: palette.outlineVariant },
          ]}
        >
          <View
            style={[
              styles.searchBarPill,
              {
                backgroundColor: palette.surfaceContainerHigh,
                borderColor: palette.outlineVariant,
              },
            ]}
          >
            <Pressable
              style={styles.headerIconBtn}
              accessibilityLabel="Exit search"
              onPress={() => {
                setSearchQueryForActiveView('');
                setSearchActive(false);
              }}
            >
              <MaterialIcons name="arrow-back" size={22} color={palette.textPrimary} />
            </Pressable>
            <TextInput
              style={[styles.searchInput, { color: palette.textPrimary }]}
              autoFocus
              value={getSearchQueryForActiveView()}
              onChangeText={setSearchQueryForActiveView}
              placeholder={
                activeView === 'favorites'
                  ? 'Search favorites...'
                  : activeView === 'bin'
                    ? 'Search bin...'
                    : 'Search notes...'
              }
              placeholderTextColor={palette.textMuted}
            />
            {getSearchQueryForActiveView().length > 0 ? (
              <Pressable
                style={styles.searchClearBtn}
                accessibilityLabel="Clear search"
                onPress={() => setSearchQueryForActiveView('')}
              >
                <MaterialIcons name="close" size={18} color={palette.textSecondary} />
              </Pressable>
            ) : null}
            <View
              style={[
                styles.searchCornerBadge,
                { backgroundColor: palette.secondaryContainer },
              ]}
            >
              <MaterialIcons
                name="search"
                size={20}
                color={palette.onSecondaryContainer}
              />
            </View>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.header,
            { backgroundColor: palette.surfaceContainer, borderBottomColor: palette.outlineVariant },
          ]}
        >
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.headerIconBtn}
              accessibilityLabel={activeView === 'home' ? 'Open navigation menu' : 'Back'}
              onPress={() =>
                activeView === 'home' ? setDrawerOpen(true) : setActiveView('home')
              }
            >
              <MaterialIcons
                name={activeView === 'home' ? 'menu' : 'arrow-back'}
                size={24}
                color={palette.textPrimary}
              />
            </Pressable>
            <View>
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
                {activeView === 'favorites'
                  ? 'Favorites'
                  : activeView === 'bin'
                    ? 'Bin'
                    : 'MessyNotes'}
              </Text>
              <Text style={{ color: palette.noteBubbleAccent, ...MessNoteTypography.labelMedium }}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {activeView === 'bin' ? (
              <Pressable
                disabled={binCount === 0}
                style={styles.headerTextBtn}
                onPress={() =>
                  Alert.alert(
                    'Empty bin?',
                    'All notes in the bin will be permanently deleted.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Empty bin',
                        style: 'destructive',
                        onPress: () => void emptyBin(),
                      },
                    ]
                  )
                }
              >
                <Text
                  style={{
                    color: palette.destructiveAction,
                    fontWeight: '600',
                    opacity: binCount === 0 ? 0.4 : 1,
                  }}
                >
                  Delete all
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[
                styles.headerSearchTrigger,
                {
                  backgroundColor: palette.surfaceContainerHigh,
                  borderColor: palette.outlineVariant,
                },
              ]}
              accessibilityLabel="Search notes"
              onPress={() => {
                setPlusMenuOpen(false);
                clearSelection();
                setSearchActive(true);
              }}
            >
              <MaterialIcons name="search" size={22} color={palette.textPrimary} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Home Filter Bar */}
      {activeView === 'home' ? (
        <View
          style={[styles.filterRow, { borderBottomColor: palette.outlineVariant }]}
        >
          {FILTER_ORDER.map((filter) => {
            const active = filterType === filter;
            return (
              <Pressable
                key={filter}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active
                      ? palette.noteBubbleAccent
                      : palette.surfaceContainer,
                    borderColor: active
                      ? palette.noteBubbleAccent
                      : palette.outlineVariant,
                  },
                ]}
                onPress={() => {
                  setPlusMenuOpen(false);
                  setFilterType(filter);
                  listRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
              >
                <Text
                  style={{
                    color: active ? palette.onAccent : palette.textSecondary,
                    ...MessNoteTypography.labelLarge,
                  }}
                >
                  {FILTER_LABELS[filter]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {error ? (
        <Text style={[styles.errorBanner, { color: palette.destructiveAction }]}>
          {error}
        </Text>
      ) : null}

      {/* Feed & Floating Composer Stack */}
      <View style={styles.feedWrap} {...panResponder.panHandlers}>
        <FlatList
          ref={listRef}
          data={displayedNotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.feedContent,
            { paddingBottom: showComposer ? 148 : 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={syncState === 'syncing'}
              onRefresh={() => void triggerManualSync()}
              tintColor={palette.noteBubbleAccent}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              {emptyMessage}
            </Text>
          }
          renderItem={({ item }) => (
            <MobileNoteBubble
              note={item}
              palette={palette}
              isSelected={selectedNoteIds.has(item.id)}
              isDirty={dirtyIds.has(item.id)}
              selectionMode={selectionMode}
              showPinBadge={activeView === 'home' && filterType !== 'all'}
              onOpenOptions={setOptionsNote}
              onRequestOpenLink={confirmOpenLink}
              onPreviewPhoto={setPreviewPhotoUri}
            />
          )}
        />

        {showComposer ? (
          <View style={styles.floatingOverlay} pointerEvents="box-none">
            {plusMenuOpen ? (
              <View style={styles.floatingMenuPills}>
                <Pressable
                  style={[
                    styles.m3MenuPill,
                    {
                      backgroundColor: palette.surfaceContainerHigh,
                      borderColor: palette.outlineVariant,
                    },
                  ]}
                  onPress={() => {
                    setPlusMenuOpen(false);
                    setNewFieldOpen(true);
                  }}
                >
                  <Text
                    style={{
                      color: palette.onSecondaryContainer,
                      ...MessNoteTypography.labelLarge,
                    }}
                  >
                    Field-Value
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.m3MenuPill,
                    {
                      backgroundColor: palette.surfaceContainerHigh,
                      borderColor: palette.outlineVariant,
                    },
                  ]}
                  onPress={() => {
                    setPlusMenuOpen(false);
                    setNewListOpen(true);
                  }}
                >
                  <Text
                    style={{
                      color: palette.onSecondaryContainer,
                      ...MessNoteTypography.labelLarge,
                    }}
                  >
                    List
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.floatingFabStack}>
              <Pressable
                style={[
                  styles.tonalExpandFab,
                  {
                    backgroundColor: palette.secondaryContainer,
                    borderColor: palette.outlineVariant,
                  },
                ]}
                accessibilityLabel="Expand Markdown editor"
                onPress={() => {
                  setPlusMenuOpen(false);
                  setComposerExpanded(true);
                }}
              >
                <MaterialIcons
                  name="open-in-full"
                  size={20}
                  color={palette.onSecondaryContainer}
                />
              </Pressable>

              <Pressable
                style={[
                  styles.fabPlus,
                  { backgroundColor: palette.noteBubbleAccent },
                ]}
                accessibilityLabel={plusMenuOpen ? 'Close quick note menu' : 'Create structured note'}
                onPress={() => setPlusMenuOpen((prev) => !prev)}
              >
                <MaterialIcons
                  name={plusMenuOpen ? 'close' : 'add'}
                  size={24}
                  color={palette.onAccent}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* Bottom Composer Bar (Clip + Send only) */}
      {showComposer ? (
        <View
          style={[
            styles.composerDock,
            { backgroundColor: palette.surfaceContainer, borderTopColor: palette.outlineVariant },
          ]}
        >
          {draftPhotos.length > 0 ? (
            <View style={styles.draftPhotosRow}>
              {draftPhotos.map((p, idx) => (
                <Pressable
                  key={`${p.uri}-${idx}`}
                  onPress={() =>
                    setDraftPhotos((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  <Image source={{ uri: p.uri }} style={styles.draftThumb} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.composerRow}>
            <View
              style={[
                styles.composerPill,
                {
                  backgroundColor: palette.surfaceContainerHigh,
                  borderColor: palette.outlineVariant,
                },
              ]}
            >
              <TextInput
                style={[styles.composerInput, { color: palette.textPrimary }]}
                multiline
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Write a note... (Markdown supported)"
                placeholderTextColor={palette.textMuted}
              />

              <Pressable
                style={styles.pillSmallBtn}
                accessibilityLabel="Attach media"
                onPress={() => void handlePickPhotos()}
              >
                <MaterialIcons
                  name="attach-file"
                  size={21}
                  color={palette.textSecondary}
                />
              </Pressable>

              <Pressable
                disabled={!draftText.trim() && draftPhotos.length === 0}
                accessibilityLabel="Send note"
                style={[
                  styles.sendCircle,
                  {
                    backgroundColor: palette.noteBubbleAccent,
                    opacity: draftText.trim() || draftPhotos.length > 0 ? 1 : 0.35,
                  },
                ]}
                onPress={() => void handleSendRegular()}
              >
                <MaterialIcons
                  name="arrow-upward"
                  size={20}
                  color={palette.onAccent}
                />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Snackbar */}
      {snackbar ? (
        <View
          style={[
            styles.snackbar,
            { backgroundColor: palette.surfaceCard, borderColor: palette.borderSubtle },
          ]}
        >
          <Text style={{ color: palette.textPrimary, flex: 1 }}>
            {snackbar.message}
          </Text>
          {snackbar.undoLabel && snackbar.onUndo ? (
            <Pressable
              onPress={() => {
                void snackbar.onUndo!();
                showSnackbar(null);
              }}
            >
              <Text style={{ color: palette.noteBubbleAccent, fontWeight: '700' }}>
                {snackbar.undoLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Navigation Drawer */}
      <Modal
        transparent
        animationType="fade"
        visible={drawerOpen}
        onRequestClose={() => setDrawerOpen(false)}
      >
        <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)}>
          <Pressable
            style={[
              styles.drawer,
              {
                backgroundColor: palette.surfaceCard,
                borderRightColor: palette.borderSubtle,
              },
            ]}
            onPress={() => undefined}
          >
            <View style={styles.drawerTop}>
              <Text style={[styles.drawerTitle, { color: palette.textPrimary }]}>
                MessyNotes
              </Text>
              <Pressable
                style={[
                  styles.themeBtn,
                  {
                    backgroundColor: palette.secondaryContainer,
                    borderColor: palette.outlineVariant,
                  },
                ]}
                accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
                onPress={toggleTheme}
              >
                <MaterialIcons
                  name={isDark ? 'light-mode' : 'dark-mode'}
                  size={20}
                  color={palette.onSecondaryContainer}
                />
              </Pressable>
            </View>

            <DrawerNavBtn
              label="All Notes"
              active={activeView === 'home'}
              palette={palette}
              onPress={() => {
                setActiveView('home');
                setDrawerOpen(false);
              }}
            />
            <DrawerNavBtn
              label="Favorites"
              active={activeView === 'favorites'}
              palette={palette}
              onPress={() => {
                setActiveView('favorites');
                setDrawerOpen(false);
              }}
            />
            <DrawerNavBtn
              label="Bin"
              active={activeView === 'bin'}
              palette={palette}
              onPress={() => {
                setActiveView('bin');
                setDrawerOpen(false);
              }}
            />

            <View style={styles.drawerFooter}>
              <Text
                style={{ color: palette.textMuted, fontSize: 12, flex: 1 }}
                numberOfLines={1}
              >
                {user.email}
              </Text>
              <Pressable onPress={() => void signOut()}>
                <Text style={{ color: palette.destructiveAction, fontWeight: '600' }}>
                  Sign out
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modals & Sheets */}
      <MobileOptionsSheet
        note={optionsNote}
        palette={palette}
        activeView={activeView}
        filterType={filterType}
        onClose={() => setOptionsNote(null)}
        onViewDetail={setDetailNote}
        onEdit={setEditingNote}
        onPartialCopy={setPartialCopyNote}
        onRequestSoftDelete={confirmSoftDelete}
        onRequestPermDelete={confirmPermanentDelete}
        onRequestOpenLink={confirmOpenLink}
      />

      <MobileNoteDetailModal
        note={detailNote}
        palette={palette}
        isBin={activeView === 'bin' || detailNote?.deleted_at !== null}
        onClose={() => setDetailNote(null)}
        onEdit={setEditingNote}
        onOpenLink={confirmOpenLink}
      />

      {composerExpanded ? (
        <MobileRegularEditorModal
          visible
          palette={palette}
          title="New Note"
          initialBody={draftText}
          initialSpans={draftSpans}
          onCancel={(text, spans) => {
            setDraftText(text);
            setDraftSpans(spans);
            setComposerExpanded(false);
          }}
          onSave={async (trimmedBody, trimmedSpans) => {
            await createRegularNote({
              userId: user.id,
              rawBody: trimmedBody,
              explicitSpans: trimmedSpans,
              pickedPhotoUris: draftPhotos,
            });
            setDraftText('');
            setDraftSpans([]);
            setDraftPhotos([]);
            setComposerExpanded(false);
          }}
        />
      ) : null}

      {editingNote?.type === 'regular' ? (
        <MobileRegularEditorModal
          key={editingNote.id}
          visible
          palette={palette}
          title="Edit Note"
          initialBody={editingNote.content.body}
          initialSpans={editingNote.content.spans}
          onCancel={() => setEditingNote(null)}
          onSave={async (trimmedBody, trimmedSpans) => {
            await updateNote(editingNote.id, {
              content: { body: trimmedBody, spans: trimmedSpans },
            });
            setEditingNote(null);
          }}
        />
      ) : null}

      {newFieldOpen || editingNote?.type === 'field' ? (
        <MobileFieldValueModal
          key={editingNote?.id ?? 'new-field'}
          visible
          palette={palette}
          existingNote={editingNote?.type === 'field' ? (editingNote as FieldNote) : null}
          onClose={() => {
            setNewFieldOpen(false);
            setEditingNote(null);
          }}
          onSave={async (title, fields) => {
            if (editingNote?.type === 'field') {
              await updateNote(editingNote.id, { title, content: { fields } });
              setEditingNote(null);
            } else {
              await createStructuredNote({
                userId: user.id,
                type: 'field',
                title,
                content: { fields },
              });
              setNewFieldOpen(false);
            }
          }}
        />
      ) : null}

      {newListOpen || editingNote?.type === 'list' ? (
        <MobileListModal
          key={editingNote?.id ?? 'new-list'}
          visible
          palette={palette}
          existingNote={editingNote?.type === 'list' ? (editingNote as ListNote) : null}
          onClose={() => {
            setNewListOpen(false);
            setEditingNote(null);
          }}
          onSave={async (title, items) => {
            if (editingNote?.type === 'list') {
              await updateNote(editingNote.id, { title, content: { items } });
              setEditingNote(null);
            } else {
              await createStructuredNote({
                userId: user.id,
                type: 'list',
                title,
                content: { items },
              });
              setNewListOpen(false);
            }
          }}
        />
      ) : null}

      {partialCopyNote ? (
        <MobilePartialCopyModal
          key={partialCopyNote.id}
          note={partialCopyNote}
          palette={palette}
          onClose={() => setPartialCopyNote(null)}
        />
      ) : null}

      <Modal
        transparent
        visible={previewPhotoUri !== null}
        onRequestClose={() => setPreviewPhotoUri(null)}
      >
        <Pressable style={styles.photoBackdrop} onPress={() => setPreviewPhotoUri(null)}>
          {previewPhotoUri ? (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.fullPhoto}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

function DrawerNavBtn({
  label,
  active,
  palette,
  onPress,
}: {
  label: string;
  active: boolean;
  palette: typeof DarkMessNoteColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.drawerBtn,
        active && { backgroundColor: palette.selectedItemBackground },
      ]}
      onPress={onPress}
    >
      <Text
        style={{
          color: active ? palette.noteBubbleAccent : palette.textPrimary,
          fontWeight: active ? '700' : '500',
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: MessNoteMetrics.headerRowHeight,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchHeaderContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchBarPill: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  searchClearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCornerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSearchTrigger: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerTitle: {
    ...MessNoteTypography.titleLarge,
  },
  searchInput: {
    flex: 1,
    ...MessNoteTypography.bodyLarge,
    paddingHorizontal: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  errorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 12,
  },
  feedWrap: {
    flex: 1,
    position: 'relative',
  },
  feedContent: {
    padding: 14,
    gap: 14,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 56,
    ...MessNoteTypography.bodyLarge,
  },
  floatingOverlay: {
    position: 'absolute',
    right: 20,
    bottom: 14,
    alignItems: 'flex-end',
    gap: 10,
  },
  floatingMenuPills: {
    alignItems: 'flex-end',
    gap: 8,
  },
  m3MenuPill: {
    borderWidth: 1,
    borderRadius: MessNoteMetrics.menuCornerRadius,
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  floatingFabStack: {
    alignItems: 'center',
    gap: 10,
  },
  tonalExpandFab: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  fabPlus: {
    width: 48,
    height: 48,
    borderRadius: MessNoteMetrics.fabCornerRadius,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  composerDock: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  draftPhotosRow: {
    flexDirection: 'row',
    gap: 8,
  },
  draftThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  composerPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: MessNoteMetrics.composerCornerRadius,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  composerInput: {
    flex: 1,
    ...MessNoteTypography.bodyLarge,
    maxHeight: 104,
    paddingVertical: 6,
  },
  pillSmallBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 84,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
  },
  drawer: {
    width: 288,
    height: '100%',
    borderRightWidth: 1,
    borderTopRightRadius: MessNoteMetrics.dialogCornerRadius,
    borderBottomRightRadius: MessNoteMetrics.dialogCornerRadius,
    padding: 18,
    gap: 8,
    elevation: 8,
  },
  drawerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  drawerTitle: {
    ...MessNoteTypography.titleLarge,
  },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  drawerFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
  },
  photoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullPhoto: {
    width: '100%',
    height: '80%',
  },
});
