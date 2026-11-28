-- Expand the private note-photos Storage bucket to allow up to 25MB files and all media/document MIME types.
UPDATE storage.buckets
SET file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = NULL    -- Allow any MIME type (images, videos, documents, archives)
WHERE id = 'note-photos';

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
    26214400,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
END;
$$;
