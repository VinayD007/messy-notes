-- Ensure the private `note-photos` Storage bucket and policies exist, and expose
-- an idempotent SECURITY DEFINER RPC so authenticated clients can self-heal if
-- the bucket was omitted during manual dashboard setup.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'note-photos',
  'note-photos',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.ensure_note_photos_bucket()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'note-photos',
    'note-photos',
    FALSE,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_note_photos_bucket() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_note_photos_bucket() TO authenticated;
