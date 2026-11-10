-- ============================================================================
-- MessyNote (Messy Notes): PostgreSQL Schema, RLS, Storage & Realtime
-- Aligned with Turn 1 Supabase requirements & MessyNote Technical Specification
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Note Type Enum ('regular' | 'field' | 'list')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'note_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.note_type AS ENUM ('regular', 'field', 'list');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Notes Table
-- ----------------------------------------------------------------------------
-- Core columns: id, user_id, title, type, content, created_at, updated_at
-- Extended spec columns:
--   - favorite / pinned / pinned_at (max 2 pinned active notes per category)
--   - deleted_at (soft-delete Bin tombstone for restore & delta sync)
--   - photo_attachments (JSONB array of up to 12 attachment descriptors)
--
-- Content JSONB shape per type:
--   - regular: { "body": string, "spans": Array<{ start, end, type: "mono" }> }
--   - field:   { "fields": Array<{ id, field, value, insertionOrder }> }
--   - list:    { "items": Array<{ id, value, checked, insertionOrder }> }
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NULL,
  type public.note_type NOT NULL DEFAULT 'regular',
  content JSONB NOT NULL DEFAULT '{"body":"","spans":[]}'::jsonb,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMPTZ NULL,
  photo_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT notes_valid_content_shape CHECK (
    jsonb_typeof(content) = 'object'
    AND (
      (
        type = 'regular'
        AND content ? 'body'
        AND jsonb_typeof(content -> 'body') = 'string'
        AND (NOT (content ? 'spans') OR jsonb_typeof(content -> 'spans') = 'array')
      )
      OR (
        type = 'field'
        AND content ? 'fields'
        AND jsonb_typeof(content -> 'fields') = 'array'
      )
      OR (
        type = 'list'
        AND content ? 'items'
        AND jsonb_typeof(content -> 'items') = 'array'
      )
    )
  ),

  CONSTRAINT notes_valid_photo_attachments CHECK (
    jsonb_typeof(photo_attachments) = 'array'
    AND jsonb_array_length(photo_attachments) <= 12
  ),

  CONSTRAINT notes_pinned_timestamp_consistency CHECK (
    (pinned = FALSE AND pinned_at IS NULL)
    OR (pinned = TRUE AND deleted_at IS NULL)
  )
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Feed Ordering, Category Views & Incremental Delta Sync
-- ----------------------------------------------------------------------------
-- Delta pull on reconnect: WHERE user_id = $1 AND updated_at >= $2
CREATE INDEX IF NOT EXISTS idx_notes_user_updated
  ON public.notes (user_id, updated_at DESC);

-- Primary newest-first feed (ordering by created_at DESC; edits never reorder)
CREATE INDEX IF NOT EXISTS idx_notes_user_active_created
  ON public.notes (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Filtered category feed with pinned items first
CREATE INDEX IF NOT EXISTS idx_notes_user_type_pin_created
  ON public.notes (user_id, type, pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- Favorites view
CREATE INDEX IF NOT EXISTS idx_notes_user_favorites
  ON public.notes (user_id, created_at DESC)
  WHERE deleted_at IS NULL AND favorite = TRUE;

-- Bin view
CREATE INDEX IF NOT EXISTS idx_notes_user_bin
  ON public.notes (user_id, created_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Triggers: Timestamp Maintenance, Immutable Fields & Bin/Pin Invariants
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_notes_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Preserve ownership and creation order (editing never changes feed position).
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := timezone('utc', now());
  END IF;

  -- Moving a note to the Bin always clears its category pin.
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.pinned := FALSE;
    NEW.pinned_at := NULL;
  ELSIF NEW.pinned = TRUE AND NEW.pinned_at IS NULL THEN
    NEW.pinned_at := timezone('utc', now());
  ELSIF NEW.pinned = FALSE THEN
    NEW.pinned_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_before_write ON public.notes;
CREATE TRIGGER trg_notes_before_write
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notes_before_write();

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_own" ON public.notes;
CREATE POLICY "notes_select_own"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "notes_insert_own" ON public.notes;
CREATE POLICY "notes_insert_own"
  ON public.notes
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
CREATE POLICY "notes_update_own"
  ON public.notes
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;
CREATE POLICY "notes_delete_own"
  ON public.notes
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 6. Private Storage Bucket for Note Photo Attachments (max 12 per note)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'note-photos',
  'note-photos',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "note_photos_select_own" ON storage.objects;
CREATE POLICY "note_photos_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'note-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "note_photos_insert_own" ON storage.objects;
CREATE POLICY "note_photos_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'note-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "note_photos_update_own" ON storage.objects;
CREATE POLICY "note_photos_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'note-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "note_photos_delete_own" ON storage.objects;
CREATE POLICY "note_photos_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'note-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 7. Supabase Realtime Publication Setup
-- ----------------------------------------------------------------------------
ALTER TABLE public.notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;
END
$$;
