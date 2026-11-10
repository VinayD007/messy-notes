# MessyNote (Android & Web + Supabase)

**MessyNote** application targeting **Android (via USB/ADB)** and **Web**, built from the **MessyNote Technical Specification** (`com.oneline.notes`) with real-time multi-device sync, Email/Password authentication, and offline-first local SQLite persistence via **Supabase**.

## Tech Stack

- **Backend / Database**: Supabase (PostgreSQL, Row Level Security, Realtime `postgres_changes`, private `note-photos` Storage bucket)
- **Web Client**: React 18 + Vite + TypeScript + Zustand + Dexie (IndexedDB) (`apps/web`)
- **Mobile Client (Android)**: React Native (Expo SDK 52, Android-only target) + TypeScript + Zustand + `react-native-mmkv` + `expo-secure-store` + `@react-native-community/netinfo` (`apps/mobile`, `com.oneline.notes`)
- **Shared Domain & Sync**: `@messy-notes/shared` (`packages/shared`) — polymorphic note models, ordering/pinning invariants, monospace backtick parser & span offset tracker, URL extraction & partial-copy tokenizer, shared mutation outbox queue & replay engine (`coalesceOutboxMutation`, `replayOutboxQueue`, `createSupabaseNotesRemote`), LWW conflict resolver, and design tokens (`#000000` OLED black + `#FFD60A` yellow accent)

## Repository Structure

```text
messy-notes/
├── package.json
├── tsconfig.base.json
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 20261110000001_create_notes_schema.sql
├── packages/
│   └── shared/
│       └── src/
│           ├── types/ (note.ts, database.ts)
│           ├── sync/ (merge.ts)
│           ├── utils/ (monospace.ts, urls.ts)
│           └── theme/ (tokens.ts)
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── lib/supabase.ts
│   │       ├── store/ (authStore.ts, notesStore.ts)
│   │       └── components/ (HeaderAndDrawer.tsx, NoteBubble.tsx, BottomComposer.tsx, NoteDialogs.tsx, AuthForm.tsx)
│   └── mobile/
│       └── src/
│           ├── lib/ (supabase.ts, sqlite.ts, photoStorage.ts)
│           ├── sync/syncEngine.ts
│           ├── store/ (authStore.ts, notesStore.ts)
│           ├── components/ (MobileNoteBubble.tsx, MobileDialogs.tsx)
│           └── screens/ (AuthScreen.tsx, FeedScreen.tsx)
```

## Key Architectural Guarantees

1. **Polymorphic Note Types (`regular`, `field`, `list`)**:
   - `regular`: text body + inline `TextSpan` monospace offsets (`parseBackticksToSpans` + `Mono` selection toggle + quick-copy on tap).
   - `field`: ordered `FieldValueEntry` key/value pairs with optional title and `1. field = value` grouped compilation.
   - `list`: ordered `ListRowEntry` checklist items with completion toggles (`checked`), optional title, and numbered compilation.
2. **Feed Ordering, Pinning, Favorites & Bin Invariants**:
   - Feed sorts newest-first by `created_at DESC`; edits update `updated_at` only and never reorder feed position.
   - Category pinning (max **2 pinned notes per category**) applies strictly inside `Notes`, `Fields-Values`, and `Lists` tabs — ignored in `All`, `Favorites`, and `Bin`.
   - Soft-deleting a pinned note clears its pin; Undo from the snackbar restores the pin only if `< 2` pins exist in that category.
3. **Real-Time & Offline-First Sync**:
   - **Web**: caches notes and queued mutations in IndexedDB via Dexie (`messynotes_web_db`), hydrates instantaneously on boot/offline, subscribes to `notes:user:${userId}` (`postgres_changes`), and replays queued mutations automatically on `navigator.onLine` / `online` events with exponential backoff and LWW conflict resolution.
   - **Mobile**: persists notes, coalesced `OutboxMutation` records (with timestamps & retry counters), and `photo_outbox` entries synchronously in AES-encrypted `react-native-mmkv` storage (`messynotes-data-v1` keyed via `expo-secure-store`); replays queued mutations via `@messy-notes/shared` (`replayOutboxQueue`) and pulls incremental deltas (`updated_at >= last_pulled_at`) on `@react-native-community/netinfo` reconnect, `AppState` foreground, and Realtime recovery.

## Setup

1. Run `supabase/migrations/20261110000001_create_notes_schema.sql` in your Supabase SQL Editor (or `supabase db push`).
2. Copy `apps/web/.env.example` to `apps/web/.env` and `apps/mobile/.env.example` to `apps/mobile/.env` with your Supabase URL and Anon Key.
3. Install dependencies and start the Web client:
   ```bash
   npm install
   npm run dev:web
   ```
4. Launch the Android client via USB/ADB:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
   npm run dev:android:usb
   ```
