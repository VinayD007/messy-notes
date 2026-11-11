import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_WEB_APP_URL,
  DarkMessNoteColors,
  LightMessNoteColors,
  MAX_PHOTOS_PER_NOTE,
  MessNoteFontFamily,
  MessNoteMetrics,
  MessNoteMotion,
  MessNoteTypography,
  applyPinOrdering,
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
  MobileConfirmDialog,
  MobileFieldValueModal,
  MobileListModal,
  MobileNoteDetailModal,
  MobileOptionsSheet,
  MobilePartialCopyModal,
  MobileRegularEditorModal,
  type MobileConfirmConfig,
} from '../components/MobileDialogs';
import { MobileNoteBubble } from '../components/MobileNoteBubble';
import { getPreference, setPreference } from '../lib/mmkvStorage';
import { useAuthStore } from '../store/authStore';
import { useNotesStore } from '../store/notesStore';

const FILTER_ORDER: NoteFilter[] = ['all', 'regular', 'field', 'list'];
const DRAWER_WIDTH = 288;
const SWIPE_TOUCH_SLOP = 16;
const SWIPE_TRIGGER_DISTANCE = 64;
const DRAWER_EDGE_WIDTH = 48;
const FILTER_LABELS: Record<NoteFilter, string> = {
  all: 'All',
  regular: 'Notes',
  field: 'Fields-Values',
  list: 'Lists',
};

export function FeedScreen() {
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
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);
  const [photoSavedFeedback, setPhotoSavedFeedback] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(74);
  const [confirmDialog, setConfirmDialog] = useState<MobileConfirmConfig | null>(null);

  const listRef = useRef<FlatList<Note> | null>(null);
  const filterScrollRef = useRef<ScrollView | null>(null);
  const filterChipLayoutsRef = useRef<
    Partial<Record<NoteFilter, { x: number; width: number }>>
  >({});
  const filterBarOpacity = useRef(
    new Animated.Value(activeView === 'home' ? 1 : 0)
  ).current;
  const fabMorphAnim = useRef(new Animated.Value(0)).current;
  const heroPressScale = useRef(new Animated.Value(1)).current;
  const syncPulseAnim = useRef(new Animated.Value(0)).current;
  const composerInputRef = useRef<TextInput | null>(null);
  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const drawerAnimatingRef = useRef(false);
  const activeFilterRef = useRef<NoteFilter>(filterType);
  const swipeTriggeredRef = useRef(false);
  activeFilterRef.current = filterType;
  const liveAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || DEFAULT_WEB_APP_URL;

  const selectionMode = selectedNoteIds.size > 0;
  const hasModalOverlayOpen =
    composerExpanded ||
    optionsNote !== null ||
    detailNote !== null ||
    editingNote !== null ||
    newFieldOpen ||
    newListOpen ||
    partialCopyNote !== null ||
    previewPhotoUri !== null ||
    confirmDialog !== null;

  // Unified gesture state mirroring ModalNavigationDrawer gesturesEnabled & list swipe flag.
  const drawerGesturesEnabled =
    !hasModalOverlayOpen &&
    !selectionMode &&
    !searchActive &&
    ((activeView === 'home' && filterType === 'all') ||
      activeView === 'favorites' ||
      activeView === 'bin');
  const listSwipeEnabled =
    activeView === 'home' && !hasModalOverlayOpen && !selectionMode;

  const openDrawer = useCallback(() => {
    if (
      drawerOpen ||
      drawerAnimatingRef.current ||
      hasModalOverlayOpen ||
      selectionMode
    ) {
      return;
    }
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    setPlusMenuOpen(false);
    setDrawerOpen(true);
  }, [drawerOpen, hasModalOverlayOpen, selectionMode]);

  const closeDrawerSmoothly = useCallback(() => {
    if (!drawerOpen || drawerAnimatingRef.current) return;
    drawerAnimatingRef.current = true;
    Animated.timing(drawerTranslateX, {
      toValue: -DRAWER_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      drawerAnimatingRef.current = false;
      setDrawerOpen(false);
    });
  }, [drawerOpen, drawerTranslateX]);

  useEffect(() => {
    if (!drawerOpen) {
      drawerAnimatingRef.current = false;
      return;
    }
    drawerAnimatingRef.current = true;
    drawerTranslateX.setValue(-DRAWER_WIDTH);
    Animated.spring(drawerTranslateX, {
      toValue: 0,
      ...MessNoteMotion.expressiveSpatial,
      useNativeDriver: true,
    }).start(() => {
      drawerAnimatingRef.current = false;
    });
  }, [drawerOpen, drawerTranslateX]);

  useEffect(() => {
    Animated.spring(fabMorphAnim, {
      toValue: plusMenuOpen ? 1 : 0,
      ...MessNoteMotion.expressiveFast,
      useNativeDriver: true,
    }).start();
  }, [plusMenuOpen, fabMorphAnim]);

  useEffect(() => {
    if (syncState !== 'syncing') {
      syncPulseAnim.stopAnimation();
      syncPulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(syncPulseAnim, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(syncPulseAnim, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [syncState, syncPulseAnim]);

  useEffect(() => {
    Animated.timing(filterBarOpacity, {
      toValue: activeView === 'home' ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeView, filterBarOpacity]);

  useEffect(() => {
    const val = getPreference('theme_mode');
    if (val === 'dark' || val === 'light') {
      setThemeOverride(val);
    }
  }, []);

  useEffect(() => {
    const hidePlusMenu = () => setPlusMenuOpen(false);
    const didShowSub = Keyboard.addListener('keyboardDidShow', hidePlusMenu);
    const willShowSub = Keyboard.addListener('keyboardWillShow', hidePlusMenu);
    return () => {
      didShowSub.remove();
      willShowSub.remove();
    };
  }, []);

  const isDark = themeOverride !== null ? themeOverride === 'dark' : true;
  const palette = isDark ? DarkMessNoteColors : LightMessNoteColors;

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setThemeOverride(next);
    setPreference('theme_mode', next);
  };

  // Back navigation priority order:
  // 1) Drawer open -> close; 2) Expanded composer; 3) '+' menu; 4) Multi-selection;
  // 5) Search; 6) Bottom sheet/dialog; 7) Favorites/Bin -> Home; 8) Default.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        closeDrawerSmoothly();
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
      if (
        confirmDialog ||
        optionsNote ||
        detailNote ||
        editingNote ||
        newFieldOpen ||
        newListOpen ||
        partialCopyNote ||
        previewPhotoUri
      ) {
        setConfirmDialog(null);
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
    confirmDialog,
    optionsNote,
    detailNote,
    editingNote,
    newFieldOpen,
    newListOpen,
    partialCopyNote,
    previewPhotoUri,
    activeView,
    closeDrawerSmoothly,
    clearSelection,
    setSearchQueryForActiveView,
    setSearchActive,
    setActiveView,
  ]);

  const drawerPanResponder = useMemo(() => {
    const shouldClaimDrawerClose = (gesture: { dx: number; dy: number }) =>
      drawerOpen &&
      !drawerAnimatingRef.current &&
      gesture.dx < -8 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => shouldClaimDrawerClose(gesture),
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        shouldClaimDrawerClose(gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_evt, gesture) => {
        if (drawerAnimatingRef.current) return;
        const clamped = Math.min(0, Math.max(-DRAWER_WIDTH, gesture.dx));
        drawerTranslateX.setValue(clamped);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (drawerAnimatingRef.current) return;
        if (gesture.dx < -48 || gesture.vx < -0.35) {
          closeDrawerSmoothly();
        } else {
          drawerAnimatingRef.current = true;
          Animated.spring(drawerTranslateX, {
            toValue: 0,
            ...MessNoteMotion.expressiveSpatial,
            useNativeDriver: true,
          }).start(() => {
            drawerAnimatingRef.current = false;
          });
        }
      },
      onPanResponderTerminate: () => {
        if (drawerAnimatingRef.current) return;
        Animated.spring(drawerTranslateX, {
          toValue: 0,
          ...MessNoteMotion.expressiveSpatial,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [drawerOpen, closeDrawerSmoothly, drawerTranslateX]);

  const drawerBackdropOpacity = drawerTranslateX.interpolate({
    inputRange: [-DRAWER_WIDTH, 0],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleFilterChange = useCallback(
    (nextFilter: NoteFilter) => {
      activeFilterRef.current = nextFilter;
      setPlusMenuOpen(false);
      clearSelection();
      setFilterType(nextFilter);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const chipLayout = filterChipLayoutsRef.current[nextFilter];
      if (chipLayout) {
        filterScrollRef.current?.scrollTo({
          x: Math.max(0, chipLayout.x - 16),
          animated: true,
        });
      }
    },
    [clearSelection, setFilterType]
  );

  const handleFeedSwipe = useCallback(
    (dx: number, startX: number) => {
      if (activeView === 'home') {
        if (!listSwipeEnabled) return;
        const currentFilter = activeFilterRef.current;
        const currentIdx = FILTER_ORDER.indexOf(currentFilter);
        if (dx < 0) {
          if (currentIdx < FILTER_ORDER.length - 1) {
            handleFilterChange(FILTER_ORDER[currentIdx + 1]!);
          }
        } else if (currentFilter === 'all') {
          if (drawerGesturesEnabled && !drawerAnimatingRef.current) {
            openDrawer();
          }
        } else if (currentIdx > 0) {
          handleFilterChange(FILTER_ORDER[currentIdx - 1]!);
        }
        return;
      }

      if (
        dx > 0 &&
        startX <= DRAWER_EDGE_WIDTH &&
        drawerGesturesEnabled &&
        !drawerAnimatingRef.current
      ) {
        openDrawer();
      }
    },
    [
      activeView,
      drawerGesturesEnabled,
      handleFilterChange,
      listSwipeEnabled,
      openDrawer,
    ]
  );

  // Single pointer-input handler on notes list (Home filter swipes + All/Favorites/Bin drawer swipe).
  const panResponder = useMemo(() => {
    const shouldClaimHorizontalSwipe = (gesture: {
      dx: number;
      dy: number;
      x0: number;
    }) => {
      if (drawerOpen) return false;
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      if (absX <= SWIPE_TOUCH_SLOP || absX <= absY * 1.5) return false;
      if (listSwipeEnabled) {
        if (
          activeFilterRef.current === 'all' &&
          gesture.dx > 0 &&
          !drawerGesturesEnabled
        ) {
          return false;
        }
        return true;
      }
      return (
        drawerGesturesEnabled &&
        !drawerAnimatingRef.current &&
        gesture.dx > SWIPE_TOUCH_SLOP &&
        gesture.x0 <= DRAWER_EDGE_WIDTH
      );
    };

    const maybeTriggerSwipe = (gesture: {
      dx: number;
      dy: number;
      x0: number;
    }) => {
      if (swipeTriggeredRef.current) return;
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      if (absX >= SWIPE_TRIGGER_DISTANCE && absX > absY * 1.5) {
        swipeTriggeredRef.current = true;
        handleFeedSwipe(gesture.dx, gesture.x0);
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        shouldClaimHorizontalSwipe(gesture),
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        shouldClaimHorizontalSwipe(gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        swipeTriggeredRef.current = false;
      },
      onPanResponderMove: (_evt, gesture) => {
        maybeTriggerSwipe(gesture);
      },
      onPanResponderRelease: (_evt, gesture) => {
        maybeTriggerSwipe(gesture);
        swipeTriggeredRef.current = false;
      },
      onPanResponderTerminate: () => {
        swipeTriggeredRef.current = false;
      },
    });
  }, [drawerOpen, drawerGesturesEnabled, handleFeedSwipe, listSwipeEnabled]);

  if (!user) return null;

  const displayedNotes =
    activeView === 'favorites'
      ? applyPinOrdering(getDisplayedFavorites(notes, favSearchQuery))
      : activeView === 'bin'
        ? getDisplayedBinNotes(notes, binSearchQuery)
        : applyPinOrdering(getDisplayedNotes(notes, filterType, homeSearchQuery));

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
    setConfirmDialog({
      title: ids.length === 1 ? 'Move 1 note to bin?' : `Move ${ids.length} notes to bin?`,
      message: 'Deleted notes can be restored from the Bin.',
      confirmLabel: 'Move to bin',
      cancelLabel: 'Cancel',
      destructive: true,
      icon: 'delete-outline',
      onConfirm: () => {
        setConfirmDialog(null);
        void softDeleteNotes(ids);
      },
    });
  };

  const confirmPermanentDelete = (id: string) => {
    setConfirmDialog({
      title: 'Delete note permanently?',
      message: 'This note and its photos cannot be recovered.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      icon: 'delete-forever',
      onConfirm: () => {
        setConfirmDialog(null);
        void permanentlyDeleteNotes([id]);
      },
    });
  };

  const confirmOpenLink = (url: string) => {
    setConfirmDialog({
      title: 'Open external link?',
      message: url,
      confirmLabel: 'Open',
      cancelLabel: 'Cancel',
      destructive: false,
      icon: 'open-in-new',
      onConfirm: () => {
        setConfirmDialog(null);
        void Linking.openURL(url).catch(() =>
          showSnackbar({ message: 'No application found to open link' })
        );
      },
    });
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

  const handleSavePreviewPhoto = useCallback(
    async (uri: string) => {
      if (downloadingPhoto) return;
      setDownloadingPhoto(true);
      let tempFileUri: string | null = null;

      try {
        const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
        if (!perm.granted && perm.status !== 'granted') {
          setPhotoSavedFeedback('Permission required');
          showSnackbar({ message: 'Gallery permission required to save photos' });
          return;
        }

        const cleanPath = uri.split('?')[0]?.split('#')[0] ?? '';
        const extMatch = /\.([a-zA-Z0-9]{2,5})$/.exec(cleanPath);
        const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
        const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        let localUri = uri;

        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          if (!baseDir) throw new Error('Cache directory unavailable');
          tempFileUri = `${baseDir}messynote_${Date.now()}.${ext}`;
          const downloaded = await FileSystem.downloadAsync(uri, tempFileUri);
          if (downloaded.status >= 400) {
            throw new Error(`HTTP ${downloaded.status}`);
          }
          localUri = downloaded.uri;
        } else if (uri.startsWith('data:')) {
          if (!baseDir) throw new Error('Cache directory unavailable');
          const base64Payload = uri.split(',')[1] ?? '';
          tempFileUri = `${baseDir}messynote_${Date.now()}.${ext}`;
          await FileSystem.writeAsStringAsync(tempFileUri, base64Payload, {
            encoding: FileSystem.EncodingType.Base64,
          });
          localUri = tempFileUri;
        } else if (!uri.startsWith('file://')) {
          localUri = `file://${uri}`;
        }

        await MediaLibrary.saveToLibraryAsync(localUri);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPhotoSavedFeedback('Saved to gallery');
        showSnackbar({ message: 'Photo saved to gallery' });
        setTimeout(() => setPhotoSavedFeedback(null), 2200);
      } catch {
        setPhotoSavedFeedback('Could not save photo');
        showSnackbar({ message: 'Failed to save photo' });
        setTimeout(() => setPhotoSavedFeedback(null), 2200);
      } finally {
        if (tempFileUri) {
          void FileSystem.deleteAsync(tempFileUri, { idempotent: true }).catch(() => void 0);
        }
        setDownloadingPhoto(false);
      }
    },
    [downloadingPhoto, showSnackbar]
  );

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

  const emptySubtitle = activeQuery.trim()
    ? 'Try a different keyword or clear the search filter.'
    : activeView === 'favorites'
      ? 'Star notes from the options sheet to keep them handy here.'
      : activeView === 'bin'
        ? 'Deleted notes appear here until restored or permanently removed.'
        : 'Type below or tap + to add structured notes.';

  const emptyIcon: keyof typeof MaterialIcons.glyphMap = activeQuery.trim()
    ? 'search'
    : activeView === 'favorites'
      ? 'star-border'
      : activeView === 'bin'
        ? 'delete-outline'
        : filterType === 'field'
          ? 'table-chart'
          : filterType === 'list'
            ? 'format-list-bulleted'
            : 'lightbulb-outline';

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header */}
      {selectionMode ? (
        <View
          style={[
            styles.header,
            { backgroundColor: palette.bg },
          ]}
        >
          <View style={styles.headerLeft}>
            <Pressable style={styles.headerIconBtn} onPress={clearSelection}>
              <MaterialIcons name="close" size={22} color={palette.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]} numberOfLines={1}>
              {selectedNotes.length} selected
            </Text>
          </View>
          <View style={styles.headerActions}>
            {selectedNotes.length === 1 ? (
              <>
                <Pressable
                  style={[
                    styles.headerTextPillBtn,
                    { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
                  ]}
                  onPress={() => {
                    const target = selectedNotes[0]!;
                    clearSelection();
                    setEditingNote(target);
                  }}
                >
                  <Text style={[styles.headerActionLabel, { color: palette.textPrimary }]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.headerTextPillBtn,
                    { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
                  ]}
                  onPress={() => {
                    const target = selectedNotes[0]!;
                    clearSelection();
                    setPartialCopyNote(target);
                  }}
                >
                  <Text style={[styles.headerActionLabel, { color: palette.textPrimary }]}>
                    Partial
                  </Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              style={[
                styles.headerTextPillBtn,
                { backgroundColor: palette.surfaceElevated, borderColor: palette.outlineVariant },
              ]}
              onPress={() => {
                void Clipboard.setStringAsync(
                  selectedNotes.map(buildGroupedText).join('\n\n')
                );
                clearSelection();
                showSnackbar({ message: 'Copied to clipboard!' });
              }}
            >
              <Text style={[styles.headerActionLabel, { color: palette.textPrimary }]}>
                Copy
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.headerTextPillBtn,
                {
                  backgroundColor: 'rgba(255, 69, 58, 0.14)',
                  borderColor: 'rgba(255, 69, 58, 0.35)',
                },
              ]}
              onPress={() => confirmSoftDelete(selectedNotes.map((n) => n.id))}
            >
              <Text style={[styles.headerActionLabel, { color: palette.destructiveAction }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      ) : searchActive ? (
        <View
          style={[
            styles.header,
            styles.searchHeaderContainer,
            { backgroundColor: palette.bg },
          ]}
        >
          <View
            style={[
              styles.searchBarPill,
              {
                backgroundColor: palette.surfaceElevated,
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
                { backgroundColor: palette.surfaceCard },
              ]}
            >
              <MaterialIcons
                name="search"
                size={20}
                color={palette.textPrimary}
              />
            </View>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.header,
            { backgroundColor: palette.bg },
          ]}
        >
          {/* CenterAligned M3E TopAppBar */}
          <View style={styles.headerSideLeft}>
            <Pressable
              style={[
                styles.headerSearchTrigger,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.outlineVariant,
                },
              ]}
              accessibilityLabel={activeView === 'home' ? 'Open navigation menu' : 'Back'}
              onPress={() =>
                activeView === 'home' ? openDrawer() : setActiveView('home')
              }
            >
              <MaterialIcons
                name={activeView === 'home' ? 'menu' : 'arrow-back'}
                size={22}
                color={palette.textPrimary}
              />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]} numberOfLines={1}>
              {activeView === 'favorites'
                ? 'Favorites'
                : activeView === 'bin'
                  ? 'Bin'
                  : 'MessyNotes'}
            </Text>
            <View
              style={[
                styles.headerStatusPill,
                {
                  backgroundColor:
                    syncState === 'syncing' ? palette.primaryContainer : palette.surfaceCard,
                  borderColor: palette.outlineVariant,
                },
              ]}
            >
              {syncState === 'syncing' ? (
                <Animated.View
                  style={[
                    styles.m3eSyncShape,
                    {
                      backgroundColor: palette.noteBubbleAccent,
                      transform: [
                        {
                          rotate: syncPulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '90deg'],
                          }),
                        },
                        {
                          scale: syncPulseAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0.85, 1.15, 0.85],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
              <Text
                style={{
                  color:
                    syncState === 'syncing'
                      ? palette.onPrimaryContainer
                      : palette.noteBubbleAccent,
                  ...MessNoteTypography.labelMedium,
                }}
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.headerSideRight}>
            {activeView === 'bin' ? (
              <Pressable
                disabled={binCount === 0}
                style={[
                  styles.headerTextPillBtn,
                  {
                    backgroundColor: 'rgba(255, 84, 73, 0.14)',
                    borderColor: 'rgba(255, 84, 73, 0.35)',
                    opacity: binCount === 0 ? 0.38 : 1,
                  },
                ]}
                onPress={() =>
                  setConfirmDialog({
                    title: 'Empty bin?',
                    message: 'All notes in the bin will be permanently deleted.',
                    confirmLabel: 'Empty bin',
                    cancelLabel: 'Cancel',
                    destructive: true,
                    icon: 'delete-sweep',
                    onConfirm: () => {
                      setConfirmDialog(null);
                      void emptyBin();
                    },
                  })
                }
              >
                <Text style={[styles.headerActionLabel, { color: palette.destructiveAction }]}>
                  Delete all
                </Text>
              </Pressable>
            ) : null}

            {activeView === 'home' ? (
              <Pressable
                style={[
                  styles.headerSearchTrigger,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.outlineVariant,
                  },
                ]}
                accessibilityLabel="Expand editor"
                onPress={() => {
                  composerInputRef.current?.blur();
                  Keyboard.dismiss();
                  setPlusMenuOpen(false);
                  setComposerExpanded(true);
                }}
              >
                <MaterialIcons name="open-in-full" size={20} color={palette.textPrimary} />
              </Pressable>
            ) : null}

            <Pressable
              style={[
                styles.headerSearchTrigger,
                {
                  backgroundColor: palette.surfaceElevated,
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

      {/* M3E Hero SplitActionButton Section (Home idle state) */}
      {activeView === 'home' && !searchActive && !selectionMode ? (
        <Animated.View
          style={[styles.heroSplitRow, { transform: [{ scale: heroPressScale }] }]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.heroSplitPrimary,
              {
                backgroundColor: palette.primaryContainer,
                borderTopRightRadius: plusMenuOpen
                  ? MessNoteMetrics.splitButtonOuterRadius
                  : MessNoteMetrics.splitButtonInnerRadius,
                borderBottomRightRadius: plusMenuOpen
                  ? MessNoteMetrics.splitButtonOuterRadius
                  : MessNoteMetrics.splitButtonInnerRadius,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
            accessibilityLabel="Create rich note"
            onPressIn={() => {
              Animated.spring(heroPressScale, {
                toValue: MessNoteMotion.pressScale,
                ...MessNoteMotion.expressiveFast,
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.spring(heroPressScale, {
                toValue: 1,
                ...MessNoteMotion.expressiveFast,
                useNativeDriver: true,
              }).start();
            }}
            onPress={() => {
              composerInputRef.current?.blur();
              Keyboard.dismiss();
              setPlusMenuOpen(false);
              setComposerExpanded(true);
            }}
          >
            <MaterialIcons name="auto-awesome" size={18} color={palette.onPrimaryContainer} />
            <Text style={[styles.heroPrimaryLabel, { color: palette.onPrimaryContainer }]}>
              New rich note
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.heroSplitSecondary,
              {
                backgroundColor: plusMenuOpen
                  ? palette.noteBubbleAccent
                  : palette.primaryContainer,
                borderTopLeftRadius: plusMenuOpen
                  ? MessNoteMetrics.splitButtonOuterRadius
                  : MessNoteMetrics.splitButtonInnerRadius,
                borderBottomLeftRadius: plusMenuOpen
                  ? MessNoteMetrics.splitButtonOuterRadius
                  : MessNoteMetrics.splitButtonInnerRadius,
              },
            ]}
            accessibilityLabel="Toggle structured note templates"
            onPress={() => {
              composerInputRef.current?.blur();
              Keyboard.dismiss();
              setPlusMenuOpen((prev) => !prev);
            }}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: fabMorphAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}
            >
              <MaterialIcons
                name="expand-less"
                size={22}
                color={plusMenuOpen ? palette.onAccent : palette.onPrimaryContainer}
              />
            </Animated.View>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Home Filter Bar (Horizontal Scrolling Pills) */}
      {activeView === 'home' ? (
        <Animated.View style={{ opacity: filterBarOpacity }}>
          <ScrollView
            ref={filterScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBarScroll}
            contentContainerStyle={styles.filterRow}
          >
            {FILTER_ORDER.map((filter) => {
              const active = filterType === filter;
              return (
                <Pressable
                  key={filter}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    filterChipLayoutsRef.current[filter] = { x, width };
                  }}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: active
                        ? palette.noteBubbleAccent
                        : palette.surfaceElevated,
                      borderColor: active
                        ? palette.noteBubbleAccent
                        : palette.outlineVariant,
                    },
                  ]}
                  onPress={() => handleFilterChange(filter)}
                >
                  <Text
                    style={{
                      color: active ? palette.onAccent : palette.textPrimary,
                      ...MessNoteTypography.labelLarge,
                    }}
                  >
                    {FILTER_LABELS[filter]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : null}

      {error ? (
        <Text style={[styles.errorBanner, { color: palette.destructiveAction }]}>
          {error}
        </Text>
      ) : null}

      {syncState === 'syncing' ? (
        <View
          style={[
            styles.expressiveLoaderPill,
            {
              backgroundColor: palette.primaryContainer,
              borderColor: palette.noteBubbleAccent,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.m3eSyncShape,
              {
                backgroundColor: palette.noteBubbleAccent,
                transform: [
                  {
                    rotate: syncPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              },
            ]}
          />
          <Text style={{ color: palette.onPrimaryContainer, ...MessNoteTypography.labelMedium }}>
            Syncing workspace...
          </Text>
        </View>
      ) : null}

      {/* Feed & Floating Composer Stack */}
      <View style={styles.feedWrap} {...panResponder.panHandlers}>
        <FlatList
          ref={listRef}
          keyboardShouldPersistTaps="handled"
          data={displayedNotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.feedContent,
            { paddingBottom: showComposer ? 112 : 28 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={syncState === 'syncing'}
              onRefresh={() => void triggerManualSync()}
              tintColor={palette.noteBubbleAccent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View
                style={[
                  styles.emptyIconBadge,
                  {
                    backgroundColor: palette.surfaceCard,
                    borderColor: palette.outlineVariant,
                  },
                ]}
              >
                <MaterialIcons name={emptyIcon} size={30} color={palette.noteBubbleAccent} />
              </View>
              <Text style={[styles.emptyText, { color: palette.textPrimary }]}>
                {emptyMessage}
              </Text>
              <Text style={[styles.emptySubtext, { color: palette.textSecondary }]}>
                {emptySubtitle}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MobileNoteBubble
              note={item}
              palette={palette}
              isSelected={selectedNoteIds.has(item.id)}
              isDirty={dirtyIds.has(item.id)}
              selectionMode={selectionMode}
              showPinBadge={activeView !== 'bin'}
              onOpenOptions={setOptionsNote}
              onRequestOpenLink={confirmOpenLink}
              onPreviewPhoto={setPreviewPhotoUri}
            />
          )}
        />
      </View>

      {showComposer && plusMenuOpen ? (
        <Pressable
          style={styles.plusMenuScrim}
          accessibilityLabel="Close quick note menu"
          onPress={() => setPlusMenuOpen(false)}
        />
      ) : null}

      {/* Floating Structured Note '+' Menu above Floating Pill BottomAppBar */}
      {showComposer && plusMenuOpen ? (
        <Animated.View
          style={[
            styles.floatingOverlay,
            {
              bottom: composerHeight + 10,
              opacity: fabMorphAnim,
              transform: [
                {
                  translateY: fabMorphAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
                {
                  scale: fabMorphAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.floatingMenuPills}>
            <Pressable
              style={[
                styles.m3MenuPill,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.noteBubbleAccent,
                },
              ]}
              onPress={() => {
                setPlusMenuOpen(false);
                setNewFieldOpen(true);
              }}
            >
              <MaterialIcons
                name="table-chart"
                size={18}
                color={palette.noteBubbleAccent}
              />
              <Text
                style={{
                  color: palette.textPrimary,
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
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.noteBubbleAccent,
                },
              ]}
              onPress={() => {
                setPlusMenuOpen(false);
                setNewListOpen(true);
              }}
            >
              <MaterialIcons
                name="format-list-bulleted"
                size={18}
                color={palette.noteBubbleAccent}
              />
              <Text
                style={{
                  color: palette.textPrimary,
                  ...MessNoteTypography.labelLarge,
                }}
              >
                List
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Floating Pill M3E BottomAppBar (Composer + Attach + Send + Split/FAB Menu) */}
      {showComposer ? (
        <View
          onLayout={(e) => setComposerHeight(Math.round(e.nativeEvent.layout.height))}
          style={[
            styles.composerDock,
            {
              zIndex: 22,
              backgroundColor: 'transparent',
            },
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

          <View
            style={[
              styles.floatingBottomBar,
              {
                backgroundColor: palette.surfaceContainerHigh,
                borderColor: palette.outlineVariant,
              },
            ]}
          >
            <TextInput
              ref={composerInputRef}
              style={[styles.composerInput, { color: palette.textPrimary }]}
              multiline
              value={draftText}
              onChangeText={setDraftText}
              onFocus={() => setPlusMenuOpen(false)}
              placeholder="Write a note..."
              placeholderTextColor={palette.textMuted}
            />

            <Pressable
              style={styles.pillSmallBtn}
              accessibilityLabel="Attach media"
              onPress={() => {
                setPlusMenuOpen(false);
                void handlePickPhotos();
              }}
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
                styles.bottomActionBtn,
                {
                  backgroundColor: palette.noteBubbleAccent,
                  opacity: draftText.trim() || draftPhotos.length > 0 ? 1 : 0.35,
                },
              ]}
              onPress={() => {
                setPlusMenuOpen(false);
                void handleSendRegular();
              }}
            >
              <MaterialIcons
                name="arrow-forward"
                size={20}
                color={palette.onAccent}
              />
            </Pressable>

            <Pressable
              style={[
                styles.bottomActionBtn,
                {
                  backgroundColor: plusMenuOpen
                    ? palette.noteBubbleAccent
                    : palette.primaryContainer,
                  borderRadius: plusMenuOpen ? 22 : 14,
                },
              ]}
              accessibilityLabel={plusMenuOpen ? 'Close quick note menu' : 'Create structured note'}
              onPress={() => {
                if (plusMenuOpen) {
                  setPlusMenuOpen(false);
                  return;
                }
                composerInputRef.current?.blur();
                Keyboard.dismiss();
                setPlusMenuOpen(true);
              }}
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: fabMorphAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '45deg'],
                      }),
                    },
                  ],
                }}
              >
                <MaterialIcons
                  name="add"
                  size={22}
                  color={plusMenuOpen ? palette.onAccent : palette.onPrimaryContainer}
                />
              </Animated.View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Snackbar */}
      {snackbar ? (
        <View
          style={[
            styles.snackbar,
            {
              bottom: showComposer ? 92 : 24,
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.outlineVariant,
            },
          ]}
        >
          <Text style={{ ...MessNoteTypography.bodyMedium, color: palette.textPrimary, flex: 1 }}>
            {snackbar.message}
          </Text>
          {snackbar.undoLabel && snackbar.onUndo ? (
            <Pressable
              onPress={() => {
                void snackbar.onUndo!();
                showSnackbar(null);
              }}
            >
              <Text
                style={{
                  color: palette.noteBubbleAccent,
                  ...MessNoteTypography.labelLarge,
                  fontWeight: '700',
                }}
              >
                {snackbar.undoLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Navigation Drawer */}
      {drawerOpen ? (
        <View style={styles.drawerBackdrop} {...drawerPanResponder.panHandlers}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.drawerScrim,
              { opacity: drawerBackdropOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.drawer,
              {
                backgroundColor: palette.surfaceCard,
                borderRightColor: palette.borderSubtle,
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
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
              icon="notes"
              active={activeView === 'home'}
              palette={palette}
              onPress={() => {
                setActiveView('home');
                closeDrawerSmoothly();
              }}
            />
            <DrawerNavBtn
              label="Favorites"
              icon="star"
              active={activeView === 'favorites'}
              palette={palette}
              onPress={() => {
                setActiveView('favorites');
                closeDrawerSmoothly();
              }}
            />
            <DrawerNavBtn
              label="Bin"
              icon="delete-outline"
              active={activeView === 'bin'}
              palette={palette}
              onPress={() => {
                setActiveView('bin');
                closeDrawerSmoothly();
              }}
            />

            <View style={styles.drawerFooterGroup}>
              <View
                style={[
                  styles.drawerUrlCard,
                  {
                    backgroundColor: palette.surfaceContainerHigh,
                    borderColor: palette.outlineVariant,
                  },
                ]}
              >
                <Text
                  style={[styles.drawerUrlText, { color: palette.noteBubbleAccent }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {liveAppUrl}
                </Text>
                <View style={styles.drawerUrlActions}>
                  <Pressable
                    style={[
                      styles.drawerUrlBtn,
                      {
                        backgroundColor: palette.surfaceCard,
                        borderColor: palette.outlineVariant,
                      },
                    ]}
                    accessibilityLabel="Open web version"
                    onPress={() => {
                      void Linking.openURL(liveAppUrl).catch(() =>
                        showSnackbar({ message: 'No application found to open URL' })
                      );
                    }}
                  >
                    <MaterialIcons
                      name="open-in-new"
                      size={16}
                      color={palette.noteBubbleAccent}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.drawerUrlBtn,
                      {
                        backgroundColor: palette.surfaceCard,
                        borderColor: palette.outlineVariant,
                      },
                    ]}
                    accessibilityLabel="Copy app URL"
                    onPress={() => {
                      void Clipboard.setStringAsync(liveAppUrl);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      showSnackbar({ message: 'App URL copied to clipboard!' });
                    }}
                  >
                    <MaterialIcons
                      name="content-copy"
                      size={16}
                      color={palette.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>

              <View
                style={[
                  styles.drawerFooter,
                  {
                    backgroundColor: palette.surfaceContainerHigh,
                    borderColor: palette.outlineVariant,
                  },
                ]}
              >
                <Text
                  style={[styles.drawerUserEmail, { color: palette.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {user.email}
                </Text>
                <Pressable
                  style={[
                    styles.drawerSignOutBtn,
                    {
                      backgroundColor: 'rgba(255, 69, 58, 0.14)',
                      borderColor: 'rgba(255, 69, 58, 0.35)',
                    },
                  ]}
                  accessibilityLabel="Sign out"
                  onPress={() => void signOut()}
                >
                  <Text
                    style={{
                      color: palette.destructiveAction,
                      ...MessNoteTypography.labelMedium,
                      fontWeight: '700',
                    }}
                  >
                    Sign out
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
          <Pressable style={{ flex: 1 }} onPress={closeDrawerSmoothly} />
        </View>
      ) : null}

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
          isEditingExisting
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
        onRequestClose={() => {
          setPhotoSavedFeedback(null);
          setPreviewPhotoUri(null);
        }}
      >
        <Pressable
          style={styles.photoBackdrop}
          onPress={() => {
            setPhotoSavedFeedback(null);
            setPreviewPhotoUri(null);
          }}
        >
          <Pressable
            disabled={downloadingPhoto}
            style={[
              styles.photoDownloadBtn,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.outlineVariant,
                opacity: downloadingPhoto ? 0.6 : 1,
              },
            ]}
            accessibilityLabel="Download image"
            onPress={(e) => {
              e.stopPropagation();
              if (previewPhotoUri) {
                void handleSavePreviewPhoto(previewPhotoUri);
              }
            }}
          >
            <MaterialIcons
              name={downloadingPhoto ? 'hourglass-top' : 'download'}
              size={24}
              color={palette.noteBubbleAccent}
            />
          </Pressable>

          {photoSavedFeedback ? (
            <View
              style={[
                styles.photoFeedbackPill,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.noteBubbleAccent,
                },
              ]}
            >
              <Text style={{ color: palette.textPrimary, ...MessNoteTypography.labelLarge }}>
                {photoSavedFeedback}
              </Text>
            </View>
          ) : null}

          {previewPhotoUri ? (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.fullPhoto}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      <MobileConfirmDialog
        visible={confirmDialog !== null}
        palette={palette}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Confirm'}
        cancelLabel={confirmDialog?.cancelLabel ?? 'Cancel'}
        destructive={Boolean(confirmDialog?.destructive)}
        icon={confirmDialog?.icon}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (confirmDialog) {
            void confirmDialog.onConfirm();
          }
        }}
      />
    </View>
  );
}

function DrawerNavBtn({
  label,
  icon,
  active,
  palette,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  active: boolean;
  palette: typeof DarkMessNoteColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.drawerBtn,
        active && { backgroundColor: palette.primaryContainer },
      ]}
      onPress={onPress}
    >
      <MaterialIcons
        name={icon}
        size={20}
        color={active ? palette.noteBubbleAccent : palette.textSecondary}
      />
      <Text
        style={{
          ...MessNoteTypography.bodyLarge,
          color: active ? palette.noteBubbleAccent : palette.textPrimary,
          fontWeight: active ? '700' : '500',
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
    minHeight: MessNoteMetrics.headerRowHeight,
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingVertical: MessNoteMetrics.intraSpacing,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: MessNoteMetrics.intraSpacing,
  },
  headerSideLeft: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  headerSideRight: {
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: MessNoteMetrics.intraSpacing,
  },
  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  m3eSyncShape: {
    width: 10,
    height: 10,
    borderRadius: 4,
  },
  heroSplitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: MessNoteMetrics.outerGutter,
    marginBottom: MessNoteMetrics.intraSpacing,
    gap: MessNoteMetrics.intraSpacing,
  },
  heroSplitPrimary: {
    flex: 1,
    minHeight: 48,
    borderTopLeftRadius: MessNoteMetrics.splitButtonOuterRadius,
    borderBottomLeftRadius: MessNoteMetrics.splitButtonOuterRadius,
    paddingHorizontal: MessNoteMetrics.outerGutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: MessNoteMetrics.intraSpacing,
  },
  heroPrimaryLabel: {
    ...MessNoteTypography.labelLarge,
  },
  heroSplitSecondary: {
    width: 56,
    minHeight: 48,
    borderTopRightRadius: MessNoteMetrics.splitButtonOuterRadius,
    borderBottomRightRadius: MessNoteMetrics.splitButtonOuterRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expressiveLoaderPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: MessNoteMetrics.intraSpacing,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: MessNoteMetrics.intraSpacing,
  },
  headerTitleCol: {
    flexShrink: 1,
  },
  searchHeaderContainer: {
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingVertical: MessNoteMetrics.intraSpacing,
  },
  searchBarPill: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchClearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCornerBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSearchTrigger: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: MessNoteMetrics.intraSpacing,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextPillBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionLabel: {
    ...MessNoteTypography.labelMedium,
    fontWeight: '700',
  },
  headerTitle: {
    ...MessNoteTypography.titleLarge,
  },
  searchInput: {
    flex: 1,
    ...MessNoteTypography.bodyLarge,
    paddingHorizontal: 4,
  },
  filterBarScroll: {
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MessNoteMetrics.intraSpacing,
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingVertical: MessNoteMetrics.intraSpacing,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingVertical: 6,
    ...MessNoteTypography.labelMedium,
  },
  feedWrap: {
    flex: 1,
    position: 'relative',
  },
  feedContent: {
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingTop: MessNoteMetrics.intraSpacing,
    gap: MessNoteMetrics.intraSpacing + 4,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    marginTop: 56,
    gap: 10,
  },
  emptyIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyText: {
    textAlign: 'center',
    ...MessNoteTypography.titleMedium,
  },
  emptySubtext: {
    textAlign: 'center',
    ...MessNoteTypography.bodyMedium,
  },
  plusMenuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    zIndex: 20,
    elevation: 10,
  },
  floatingOverlay: {
    position: 'absolute',
    right: MessNoteMetrics.outerGutter,
    bottom: 86,
    zIndex: 30,
    elevation: 16,
    alignItems: 'flex-end',
    gap: MessNoteMetrics.intraSpacing,
  },
  floatingMenuPills: {
    alignItems: 'flex-end',
    gap: MessNoteMetrics.intraSpacing,
  },
  m3MenuPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MessNoteMetrics.intraSpacing,
    borderWidth: 1,
    borderRadius: MessNoteMetrics.menuCornerRadius,
    minHeight: 44,
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingVertical: 10,
  },
  composerDock: {
    paddingHorizontal: MessNoteMetrics.outerGutter,
    paddingBottom: 12,
    paddingTop: 4,
    gap: MessNoteMetrics.intraSpacing,
  },
  draftPhotosRow: {
    flexDirection: 'row',
    gap: MessNoteMetrics.intraSpacing,
  },
  draftThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },
  floatingBottomBar: {
    minHeight: MessNoteMetrics.fabSize,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: MessNoteMetrics.outerGutter,
    paddingRight: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: MessNoteMetrics.intraSpacing,
    elevation: 6,
  },
  composerInput: {
    flex: 1,
    ...MessNoteTypography.bodyLarge,
    maxHeight: 120,
    paddingVertical: 7,
  },
  pillSmallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snackbar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 92,
    zIndex: 24,
    elevation: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 20,
    flexDirection: 'row',
  },
  drawerScrim: {
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  drawer: {
    width: 288,
    height: '100%',
    borderRightWidth: 1,
    borderTopRightRadius: MessNoteMetrics.dialogCornerRadius,
    borderBottomRightRadius: MessNoteMetrics.dialogCornerRadius,
    padding: 18,
    gap: 8,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
  },
  drawerFooterGroup: {
    marginTop: 'auto',
    gap: 10,
  },
  drawerUrlCard: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerUrlText: {
    flex: 1,
    fontFamily: MessNoteFontFamily.regular,
    fontSize: 12,
    fontWeight: '600',
  },
  drawerUrlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drawerUrlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerFooter: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerUserEmail: {
    flex: 1,
    fontFamily: MessNoteFontFamily.regular,
    fontSize: 12,
    fontWeight: '500',
  },
  drawerSignOutBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoDownloadBtn: {
    position: 'absolute',
    top: 44,
    right: 18,
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFeedbackPill: {
    position: 'absolute',
    top: 102,
    right: 18,
    zIndex: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  fullPhoto: {
    width: '100%',
    height: '80%',
  },
});
