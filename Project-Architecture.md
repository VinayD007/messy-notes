# MessyNotes Project Architecture & Material 3 Design System

## 1. Repository Overview

MessyNotes is a cross-platform TypeScript monorepo sharing domain models, plain-text monospace/link utilities, offline-first synchronization logic, and design tokens between Web (`apps/web`) and Android (`apps/mobile`).

```text
messy-notes/
├── apps/
│   ├── mobile/          # Expo / React Native Android client (MMKV + NetInfo + Supabase)
│   └── web/             # Vite + React Web client (IndexedDB/Dexie + Supabase)
├── packages/
│   └── shared/          # @messy-notes/shared (types, sync/outbox, monospace/URL text spans, theme tokens)
├── supabase/
│   ├── config.toml      # Supabase CLI configuration
│   └── migrations/      # Postgres schema, RLS triggers, and 'note-photos' bucket setup
└── Project-Architecture.md
```

---

## 2. Mobile Material 3 Design System (`packages/shared/src/theme/tokens.ts`)

All visual tokens for `apps/mobile` are centralized in `DarkMessNoteColors`, `LightMessNoteColors`, `MessNoteMetrics`, and `MessNoteTypography`.

### 2.1 Dark OLED Color Tokens (`DarkMessNoteColors`)

| Role | Token | Hex / Value | Usage |
| :--- | :--- | :--- | :--- |
| Screen Background | `bg` | `#000000` | Pure OLED canvas across Auth, Feed, Search, Detail, Editor screens |
| Primary Surfaces | `headerBg`, `surfaceCard`, `surfaceContainer`, `surfaceContainerLow` | `#1C1C1E` | Top app bars, navigation drawer, bottom sheets, confirmation dialogs, composer dock, structured editor cards |
| Raised Surfaces | `surfaceElevated`, `surfaceContainerHigh`, `surfaceContainerHighest`, `secondaryContainer`, `monospaceBg` | `#2C2C2E` | Search bar pills, filter chips (unselected), quick-note pills, snackbars, monospace copy pills, cancel/secondary buttons |
| Primary Accent | `noteBubbleAccent`, `linkAccent`, `monospaceText`, `onPrimaryContainer` | `#FFD60A` | Primary CTAs (`+` FAB, Send, Save), note bubble outlines, active filter chip fill, active drawer label, favorites star, pin badge, inline code/links |
| Content on Accent | `onAccent` | `#000000` | Icons and bold labels placed on `#FFD60A` fills |
| Primary Text | `textPrimary`, `onSecondaryContainer` | `#FFFFFF` | Note body copy, titles, primary dialog headlines, secondary button text, drawer nav labels |
| Secondary Text | `textSecondary` | `#B0B0B5` | Subtitles, dialog body descriptions, category pill labels, nav icons |
| Muted Text | `textMuted` | `#8E8E93` | Input placeholders, timestamps, drag handles, inactive favorite outline star, drawer email |
| Dividers & Hairlines | `borderSubtle`, `outlineVariant` | `#38383A` | Header bottom dividers, surface card borders, chip hairlines, composer pill outlines |
| Tonal / Selected Fill | `primaryContainer`, `selectedItemBackground` | `rgba(255, 214, 10, 0.16)` / `rgba(255, 214, 10, 0.14)` | Active drawer destination pill, active favorite button background, selected note fill |
| Destructive Actions | `destructiveAction` | `#FF453A` | Delete, Delete permanently, Empty bin (`Delete all`), Discard changes, Sign out (never uses `#FFD60A`) |
| Note Bubble Fill | `noteBubbleBackground` | `transparent` | Transparent note cards outlined with `#FFD60A` directly on the `#000000` OLED canvas |

### 2.2 Shape & Layout Metrics (`MessNoteMetrics`)

| Token | Value | Application |
| :--- | :--- | :--- |
| `dialogCornerRadius` | `28dp` | M3 confirmation cards (`MobileConfirmDialog`), Partial Copy dialog, Auth card, Bottom Sheet top corners, Navigation Drawer right corners |
| `noteCardCornerRadius` | `16dp` | Feed note bubbles (`MobileNoteBubble`) with `1dp` (`1.5dp` selected) `#FFD60A` border and transparent fill |
| `composerCornerRadius` | `28dp` | Bottom text composer input pill |
| `fabSize` / `fabCornerRadius` | `52dp` / `26dp` | Circular `52dp` `+` FAB and `52dp` Send action button |
| Full Pill | `999` | Filter chips, search bars, action buttons, confirmation pills, format toolbar chips |
| `headerRowHeight` | `64dp` (`minHeight`) | Flexible app bar height accommodating multi-line and `1.3x` scaled typography |

### 2.3 Typographic Hierarchy & Accessibility Scaling (`MessNoteTypography`)

Typography follows a clean Google Sans–aligned geometric sans scale with generous line heights (`lineHeight >= 1.35 * fontSize`) and flexible container sizing (`minHeight`, `flexShrink: 1`, `flexWrap: 'wrap'`, `ScrollView` wrapping) so system accessibility font scaling up to `1.3x` renders without text clipping:

- `displayHeadline`: `28sp` / `36` (`700`) — Auth title
- `titleLarge`: `22sp` / `30` (`700`) — Screen titles (`MessyNotes`, `Favorites`, `Bin`), drawer title, M3 dialog titles
- `titleMedium`: `16sp` / `24` (`600`) — Note titles, bottom sheet header, empty state headlines
- `bodyLarge`: `16sp` / `24` (`400`) — Composer text input, form inputs, sheet rows, drawer nav items
- `bodyMedium`: `14sp` / `21` (`400`) — Structured field/list rows, dialog descriptions, snackbar messages
- `labelLarge`: `14sp` / `20` (`600`) — Filter chips, action pill buttons, confirmation buttons
- `labelMedium`: `12sp` / `17` (`600`) — Status indicators, timestamps, category chips, editor mode pills

---

## 3. Mobile Screen & Component Hierarchy (`apps/mobile/src/`)

```text
App.tsx (SafeAreaProvider, StatusBar, auth/sync bootstrap)
├── AuthScreen.tsx (OLED #000000 + #1C1C1E 28dp card + pill Sign In / Sign Up)
└── FeedScreen.tsx (Home, Favorites, Bin, Search, Multi-select, Drawer overlay)
    ├── Top Headers (Home / Favorites / Bin / Pill Search Bar / Selection Bar; Expand Editor button placed left of Search icon)
    ├── Horizontal Filter Chips ScrollView (All, Notes, Fields-Values, Lists)
    ├── FlatList<Note> -> MobileNoteBubble.tsx (16dp transparent #FFD60A cards)
    │   └── MobilePlainTextView.tsx (Plain text + explicit monospace copy spans + clickable URLs)
    ├── Empty States & M3 Floating Snackbar (#2C2C2E raised banner + #FFD60A Undo)
    ├── Fullscreen Photo Viewer Modal (Top-right Download button -> MediaLibrary gallery save + feedback)
    ├── Plus Menu Dimmed Scrim (.plusMenuScrim: tapping outside menu dismisses immediately)
    ├── Single 52dp Floating '+' FAB (opens strictly 2 options: Field-Value and List; dismisses keyboard)
    ├── Bottom Composer Dock (#1C1C1E surface, rounded pill + Clip, 52dp circular Send; focusing input collapses + menu)
    ├── Animated Navigation Drawer (#1C1C1E surface, 28dp right corners, pan-to-close)
    │   └── Bottom Pill Section (App URL pill [URL, Open Link, Copy] + Account pill [Email, Sign out])
    └── MobileDialogs.tsx
        ├── MobileConfirmDialog (28dp M3 dialog: red #FF453A destructive / white cancel)
        ├── MobileOptionsSheet (28dp top-radius bottom sheet + top-bar instant Pin & Star toggles across all note types)
        ├── MobileNoteDetailModal (Fullscreen plain-text viewer + monospace tap-to-copy fields)
        ├── MobileRegularEditorModal (Fullscreen plain-text editor + Mono selection toggle)
        ├── MobileFieldValueModal (Structured field = value builder + discard dialog)
        ├── MobileListModal (Numbered list builder + discard dialog)
        └── MobilePartialCopyModal (28dp dialog with selectable #2C2C2E pill tokens)
```

### 3.1 Confirmation Flows (`MobileConfirmDialog`)

All native system `Alert.alert` popups across `FeedScreen.tsx` and `MobileDialogs.tsx` are replaced with the unified Material 3 `MobileConfirmDialog` (`#1C1C1E`, `28dp` radius, `#38383A` hairline border):
- **Move to bin** (`softDeleteNotes`), **Delete permanently** (`permanentlyDeleteNotes`), **Empty bin** (`Delete all`), and **Discard changes** use clear `#FF453A` destructive buttons paired with white secondary cancel pills (`#2C2C2E` surface, `#FFFFFF` label).
- **Open external link** renders with a primary `#FFD60A` button (`#000000` label) and white `Cancel` pill.
- In-modal confirmation prompts (`MobileFieldValueModal`, `MobileListModal`) use `asOverlay` to prevent nested Android `Modal` stacking glitches.

---

## 4. Web Desktop Layout Architecture (`apps/web/src/`)

On Windows and desktop browser viewports, `apps/web` uses a full-viewport two-column split layout (`.web-desktop-layout`) separating persistent navigation/filtering on the left from the scrollable note canvas and floating composer on the right:

```text
App.tsx (.web-desktop-layout)
├── Left Persistent Sidebar (NavigationDrawer persistent={true}, 280px fixed rail)
│   ├── Brand Header (MessyNotes logo + Dark/Light Theme switch)
│   ├── Primary Views (All Notes, Favorites, Bin)
│   ├── Vertical Filter Stack (HomeFilterBar vertical={true}, .filter-bar-vertical: All, Notes, Fields-Values, Lists)
│   └── Bottom Footer Group (2 adjacent M3 pill containers: App URL pill [URL, Open, Copy] + Account pill [Email, Sign out])
└── Right Workspace Column (.workspace-main)
    ├── TopHeader (Workspace view/filter title, Live sync badge, Expand Editor button left of Search, Selection controls)
    ├── Scrollable Feed Stage (.feed-stage -> .feed-scroll -> centered max-width 820px feed-list)
    ├── Photo Lightbox (.photo-viewer-backdrop -> top-right .photo-viewer-download-btn for instant image download)
    └── Floating Composer Dock (.composer-dock-floating -> .composer-floating-wrap)
        ├── Dimmed Outside Scrim (.plus-menu-scrim when '+' menu is open)
        ├── Floating Quick Action (Single '+' FAB opening strictly Field-Value and List pills)
        └── BottomComposer (.composer-pill: "Write a note...", Clip, Send; focusing textarea closes + menu)
```

### 4.1 Desktop Layout Rules & Responsive Behavior
- **Persistent Left Sidebar (`>= 769px`):** Always anchored on the left side (`280px` width) displaying navigation views (`All Notes`, `Favorites`, `Bin`), the vertical stack of category filter pills (**All**, **Notes**, **Fields-Values**, **Lists**), and two distinct bottom M3 pill containers: an **App URL Pill** grouping the live URL (`https://messy-notes-one.vercel.app/`), Open Link icon button, and Copy button, followed by an adjacent **Account Pill** grouping the signed-in email ID and a `Sign out` pill button. Clicking any filter chip switches to the `home` view with that category selected.
- **Header Maximize Control (`Expand editor`):** Relocated from the floating bottom-right stack into the top header directly to the left of the search icon across both mobile and web Home views, opening the plain-text expanded editor (`MobileRegularEditorModal` / `ExpandedRegularDialog`) with `"Write a note..."` placeholder and the explicit `Mono` toggle button.
- **Plain-Text Note Rendering (No Markdown):** Regular notes across `PlainTextView` (web) and `MobilePlainTextView` (mobile) use `buildStyledSegments` to render literal plain text with no Markdown parsing (headings, bold, italic, strikethrough, blockquotes, tables, or Markdown syntax helpers removed), preserving only explicit monospace tap-to-copy spans and auto-detected clickable URLs.
- **Responsive Narrow Viewport (`<= 768px`):** Automatically collapses the persistent sidebar behind the top-left menu button drawer overlay (`drawerOpen`) while retaining the vertical filter list and URL card inside the slide-out drawer.
- **Floating Bottom Composer & `+` Menu Coordination:** The bottom-right `+` button strictly expands **Field-Value** and **List** creation options above the elevated floating composer (`Ctrl+Enter` / `Cmd+Enter` quick-send on Windows). Tapping anywhere outside the open menu (the dimmed `.plus-menu-scrim` / `plusMenuScrim`) dismisses it; focusing/tapping the bottom text bar auto-collapses the `+` menu; tapping `+` while typing simultaneously dismisses the keyboard/blur (`Keyboard.dismiss()` / `blur()`) and opens the menu.
- **Photo Lightbox Download:** Full-screen image overlays (`Modal` on Android, `.photo-viewer-backdrop` on Web) include a top-right download button triggering immediate local gallery save (`expo-media-library` + `expo-file-system`) on mobile or direct Blob file download on web.
- **Note Options Header Pin & Favorite Toggles (`MobileOptionsSheet` / `SingleNoteOptionsModal`):** Across all note types (`regular`, `field`, `list`) in non-bin views, both Pin (`PushPinIcon` / `PushPinOutlinedIcon` on web; `MaterialCommunityIcons` `pin` / `pin-outline` on mobile) and Favorite Star controls reside side-by-side in the top sheet/dialog header row with instant optimistic visual state updates (`solid` accent vs. `outline` muted). No duplicate Pin/Unpin text entry appears in the vertical action list (`Share`, `Copy`, `Copy partially`, `Edit`, `Delete`).

---

## 5. Behavioral & Sync Integrity Boundaries

All visual updates across `packages/shared/src/theme/tokens.ts`, `apps/mobile/src/**`, and `apps/web/src/**` strictly preserve existing business logic without functional regression:
- **Local Persistence & Outbox (`mmkvStorage.ts`, `localDb.ts`, `notesStore.ts`):** Encrypted MMKV (mobile) and IndexedDB/Dexie (web) note caches and mutation outboxes remain untouched.
- **Sync Engine (`syncEngine.ts`, `webSyncEngine.ts`, `supabaseRemote.ts`):** Realtime subscriptions, last-write-wins timestamp resolution, unchanged-edit suppression (`hasNotePatchChanges`), `"Bucket not found"` storage recovery, and photo attachment syncing remain unchanged.
- **Navigation & Gestures:** Android hardware back priority order, left-to-right filter/drawer swipe, and capture-phase right-to-left drawer swipe-to-close remain intact.

---

## 6. Android Gradle Build & Monorepo Resolution (`apps/mobile/android/`)

- **Static `settings.gradle` Plugin & Workspace Resolution:** Replaced dynamic `node` CLI lookups inside `pluginManagement`, `reactAndroidLibs`, `autolinking.gradle`, and `includeBuild` in `apps/mobile/android/settings.gradle` with deterministic static filesystem resolution checking `../node_modules/<pkg>` first and falling back to hoisted npm workspace root `../../../node_modules/<pkg>` (resolving `com.facebook.react.settings` directly from `@react-native/gradle-plugin`).
- **Release JDK & SDK Environment:** Gradle 8.10.2 targets JDK 21 (`C:\Program Files\Java\jdk-21` rather than JDK 25 `25.0.5.0.3`, which triggers an embedded Kotlin `JavaVersion.parse` failure) with Android SDK (`C:\Users\Lenovo\AppData\Local\Android\Sdk`) during `.\gradlew.bat clean assembleRelease --no-daemon`.
