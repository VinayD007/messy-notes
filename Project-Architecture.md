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

## 2. Mobile Material 3 Expressive Design System (`packages/shared/src/theme/tokens.ts`)

All visual, shape, motion, and typography tokens are centralized in `DarkMessNoteColors`, `LightMessNoteColors`, `MessNoteMetrics`, `MessNoteMotion`, and `MessNoteTypography` (seeded from **Violet Expressive `#6750A4`** in Dark Mode for 412dp mobile viewports with 16dp outer gutters and 8dp intra-component spacing).

### 2.1 Violet Expressive Dark Color Tokens (`DarkMessNoteColors`)

| Role | Token | Hex / Value | Usage |
| :--- | :--- | :--- | :--- |
| Screen Background | `bg`, `headerBg` | `#0F0D13` | Obsidian-violet canvas across Auth, Feed, Search, Detail, Editor screens |
| Primary Surfaces | `surfaceCard`, `surfaceContainer`, `surfaceContainerLow` | `#1D1B20` / `#211F26` / `#19171D` | Navigation drawer, bottom sheets, dialogs, structured editor cards |
| Raised Surfaces | `surfaceElevated`, `surfaceContainerHigh`, `surfaceContainerHighest`, `monospaceBg` | `#2B2930` / `#36343B` | Floating pill BottomAppBar, search bar pills, unselected filter chips, snackbars, monospace pills |
| Primary Accent | `noteBubbleAccent`, `linkAccent`, `monospaceText` | `#D0BCFF` | Primary CTAs (Send, Save, Split action active state), selected note borders, active filter chips, status indicators |
| Content on Accent | `onAccent` | `#381E72` | High-contrast labels and icons rendered on `#D0BCFF` fills |
| Hero / Primary Container | `primaryContainer` / `onPrimaryContainer` | `#4F378B` / `#EADDFF` | Hero `SplitActionButton`, active drawer item fill, expressive sync loading pill, active option toggles |
| Secondary Container | `secondaryContainer` / `onSecondaryContainer` | `#4A4458` / `#E8DEF8` | Theme switch icon button and secondary tonal controls |
| Primary Text | `textPrimary` | `#F5EFF7` | Note body copy, headlines, dialog titles, drawer items |
| Secondary / Muted Text | `textSecondary` / `textMuted` | `#CAC4D0` / `#938F99` | Subtitles, descriptions, placeholders, timestamps |
| Outlines & Hairlines | `borderSubtle`, `outlineVariant` | `#49454F` | Floating BottomAppBar pill outline, surface card borders, chip hairlines |
| Selected Tonal Fill | `selectedItemBackground` | `rgba(208, 188, 255, 0.2)` | Selected note fill and press state overlay |
| Destructive Actions | `destructiveAction` | `#FF5449` | Delete, Delete permanently, Empty bin (`Delete all`), Discard changes, Sign out |
| Note Bubble Fill | `noteBubbleBackground` | `#1B1822` | High-contrast tonal note cards with `24dp` rounded corners |

### 2.2 Shape, Rhythm & Spring Motion Tokens (`MessNoteMetrics`, `MessNoteMotion`)

| Token | Value | Application |
| :--- | :--- | :--- |
| `outerGutter` / `intraSpacing` | `16dp` / `8dp` | Consistent 16dp outer gutters and 8dp intra-component spacing across CenterAligned TopAppBar, Hero SplitActionButton, Filter chips, Note cards, Floating Pill BottomAppBar |
| `dialogCornerRadius` / `heroCornerRadius` | `32dp` / `30dp` | M3E dialogs, bottom sheet top corners, floating pill BottomAppBar |
| `splitButtonOuterRadius` / `splitButtonInnerRadius` | `28dp` / `10dp` (morphs to `28dp`) | Shape-morphing M3E Hero `SplitActionButton` seam |
| `noteCardCornerRadius` | `24dp` | Feed note bubbles (`MobileNoteBubble`) with spring press scale (`0.96`) |
| `fabSize` / `fabCornerRadius` | `56dp` / `18dp` (morphs to `22dp`) | Expressive squircle/pill quick-create action in floating BottomAppBar |
| `MessNoteMotion` | `expressiveFast` (`360/19`), `expressiveSpatial` (`240/18`) | M3E bouncy spring physics for card press feedback, Hero split action, drawer transitions, and morphing `+` menu pills |

### 2.3 Typographic Hierarchy & Accessibility Scaling (`MessNoteTypography`)

Both Web (`apps/web/index.html` Google Fonts stylesheet + `--font-sans: 'Google Sans', Roboto, sans-serif`) and Android (`apps/mobile/android/app/src/main/res/font/google_sans.xml` bundling `400`, `500`, `600`, and `700` `.ttf` weights registered via `ReactFontManager` in `MainActivity.kt` and `MessNoteFontFamily.regular = 'Google Sans'`) use `'Google Sans'` with the M3E Emphasized type scale (tighter tracking and stronger headline weight contrast):

- `displayHeadline`: `30sp` / `36` (`700`, tracking `-0.8`) — Auth display headline
- `titleLarge`: `22sp` / `28` (`700`, tracking `-0.45`) — CenterAligned TopAppBar title (`MessyNotes`, `Favorites`, `Bin`), drawer title, M3E dialog titles
- `titleMedium`: `16sp` / `22` (`700`, tracking `-0.15`) — Note titles, bottom sheet header, empty state headlines
- `bodyLarge`: `16sp` / `24` (`400`, tracking `0`) — Composer text input, form inputs, sheet rows, drawer nav items
- `bodyMedium`: `14sp` / `20` (`400`, tracking `0.05`) — Structured field/list rows, dialog descriptions, snackbar messages
- `labelLarge`: `14sp` / `20` (`700`, tracking `0.05`) — Hero SplitActionButton, filter chips, action pill buttons, confirmation buttons
- `labelMedium`: `12sp` / `16` (`600`, tracking `0.2`) — Status pills, timestamps, category chips, editor mode pills

---

## 3. Mobile Screen & Component Hierarchy (`apps/mobile/src/`)

```text
App.tsx (SafeAreaProvider, StatusBar, auth/sync bootstrap)
├── AuthScreen.tsx (Violet Expressive Dark #0F0D13 + #1D1B20 32dp card + pill Sign In / Sign Up)
└── FeedScreen.tsx (Home, Favorites, Bin, Search, Multi-select, Drawer overlay)
    ├── CenterAligned TopAppBar (Left Menu/Back squircle, Centered Title + M3E status badge/loader, Right Expand Editor & Search)
    ├── Hero SplitActionButton Row (48dp tonal violet #4F378B split button: New Rich Note + morphing quick-create toggle)
    ├── Horizontal Filter Chips ScrollView (All, Notes, Fields-Values, Lists; 16dp gutter, 8dp gap)
    ├── Expressive Sync Pill Loader (animated rotating squircle indicator during sync)
    ├── FlatList<Note> -> MobileNoteBubble.tsx (24dp tonal #1B1822 cards with spring press scale)
    │   └── MobilePlainTextView.tsx (Plain text + explicit monospace copy spans + clickable URLs)
    ├── Plus Menu Dimmed Scrim + Spring-Animated Quick Pills (Field-Value & List above Floating Pill BottomAppBar)
    ├── Floating Pill BottomAppBar (999dp pill in #2B2930: "Write a note...", Attach, Send CTA, morphing '+' FAB menu trigger)
    ├── Spring-Animated Navigation Drawer (#1D1B20 surface, 32dp right corners, pan-to-close)
    └── MobileDialogs.tsx (32dp M3E dialogs, bottom sheets with top-bar Pin/Star toggles, plain-text/structured editors)
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
│   ├── Primary Views (All Notes + persistent indented .drawer-nested-filters [All, Notes, Fields-Values, Lists], Favorites, Bin)
│   └── Bottom Account Footer (.drawer-footer-group -> Account pill [Email, Sign out])
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
- **Persistent Left Sidebar (`>= 769px`):** Always anchored on the left side (`280px` width) displaying navigation views (`All Notes`, `Favorites`, `Bin`) and a bottom **Account Pill** grouping the signed-in email ID and a `Sign out` pill button. The four category filter pills (**All**, **Notes**, **Fields-Values**, **Lists**) remain permanently expanded and indented directly beneath **All Notes** (`.drawer-nested-filters`); when **Favorites** or **Bin** is active, no sub-filter chip shows an active highlight, feed queries (`getDisplayedFavorites`, `getDisplayedBinNotes`) ignore `filterType`, and clicking any sub-filter chip navigates back to `home` with that filter active.
- **Header Maximize Control (`Expand editor`):** Relocated from the floating bottom-right stack into the top header directly to the left of the search icon across both mobile and web Home views, opening the plain-text expanded editor (`MobileRegularEditorModal` / `ExpandedRegularDialog`) with `"Write a note..."` placeholder and the explicit `Mono` toggle button.
- **Plain-Text Note Rendering (No Markdown):** Regular notes across `PlainTextView` (web) and `MobilePlainTextView` (mobile) use `buildStyledSegments` to render literal plain text with no Markdown parsing (headings, bold, italic, strikethrough, blockquotes, tables, or Markdown syntax helpers removed), preserving only explicit monospace tap-to-copy spans and auto-detected clickable URLs.
- **Responsive Narrow Viewport (`<= 768px`):** Automatically collapses the persistent sidebar behind the top-left menu button drawer overlay (`drawerOpen`) while retaining the nested filters and account pill inside the slide-out drawer.
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
