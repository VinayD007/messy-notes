import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import type { Note, NoteRow } from '../types/note';
import type { SyncRemoteAdapter } from './outbox';

export const NOTE_PHOTOS_BUCKET = 'note-photos';
export const DEFAULT_WEB_APP_URL = 'https://messy-notes-one.vercel.app/';

const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

let bucketProvisionAttempted = false;

function isBucketNotFoundError(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message ?? '';
  return /bucket not found/i.test(msg);
}

/**
 * Ensures the `note-photos` bucket exists when Supabase reports `Bucket not found`
 * by attempting client storage creation and/or the idempotent `ensure_note_photos_bucket`
 * SQL RPC before retrying upload.
 */
export async function uploadPhotoToNoteBucket(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  fileBody: Blob | ArrayBuffer | Uint8Array,
  mimeType: string
): Promise<void> {
  const tryUpload = () =>
    supabase.storage.from(NOTE_PHOTOS_BUCKET).upload(storagePath, fileBody, {
      contentType: mimeType,
      upsert: true,
    });

  const firstAttempt = await tryUpload();
  if (!firstAttempt.error) {
    return;
  }

  if (isBucketNotFoundError(firstAttempt.error)) {
    if (!bucketProvisionAttempted) {
      bucketProvisionAttempted = true;
      await supabase.storage
        .createBucket(NOTE_PHOTOS_BUCKET, {
          public: false,
          fileSizeLimit: 10 * 1024 * 1024,
          allowedMimeTypes: ALLOWED_PHOTO_MIME_TYPES,
        })
        .catch(() => undefined);

      await supabase.rpc('ensure_note_photos_bucket');
    }

    const retry = await tryUpload();
    if (!retry.error) {
      return;
    }

    throw new Error(
      isBucketNotFoundError(retry.error)
        ? 'Storage bucket "note-photos" not found in Supabase. Run supabase/migrations/20261110000002_storage_bucket_fix.sql in your Supabase SQL Editor.'
        : `Photo upload failed: ${retry.error.message}`
    );
  }

  throw new Error(`Photo upload failed: ${firstAttempt.error.message}`);
}

/**
 * Shared Supabase-backed remote adapter used by both Web and Mobile outbox
 * sync engines so conflict resolution, optimistic concurrency, and storage
 * cleanup behave identically across platforms.
 */
export function createSupabaseNotesRemote(
  supabase: SupabaseClient<Database>
): SyncRemoteAdapter {
  return {
    async upsertNote(note: Note): Promise<NoteRow> {
      const { data, error } = await supabase
        .from('notes')
        .upsert(
          {
            id: note.id,
            user_id: note.user_id,
            title: note.title,
            type: note.type,
            content: note.content,
            favorite: note.favorite,
            pinned: note.deleted_at ? false : note.pinned,
            pinned_at: note.deleted_at ? null : note.pinned_at,
            photo_attachments: note.photo_attachments,
            deleted_at: note.deleted_at,
            created_at: note.created_at,
            updated_at: note.updated_at,
          },
          { onConflict: 'id' }
        )
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to upsert note');
      }
      return data;
    },

    async updateNoteIfUnmodified(
      note: Note,
      expectedUpdatedAt: string
    ): Promise<NoteRow | null> {
      const { data, error } = await supabase
        .from('notes')
        .update({
          title: note.title,
          content: note.content,
          favorite: note.favorite,
          pinned: note.deleted_at ? false : note.pinned,
          pinned_at: note.deleted_at ? null : note.pinned_at,
          photo_attachments: note.photo_attachments,
          deleted_at: note.deleted_at,
        })
        .eq('id', note.id)
        .eq('user_id', note.user_id)
        .eq('updated_at', expectedUpdatedAt)
        .select('*')
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      return data ?? null;
    },

    async fetchRemoteNote(
      noteId: string,
      userId: string
    ): Promise<NoteRow | null> {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      return data ?? null;
    },

    async forceUpdateNote(note: Note): Promise<NoteRow> {
      const { data, error } = await supabase
        .from('notes')
        .update({
          title: note.title,
          content: note.content,
          favorite: note.favorite,
          pinned: note.deleted_at ? false : note.pinned,
          pinned_at: note.deleted_at ? null : note.pinned_at,
          photo_attachments: note.photo_attachments,
          deleted_at: note.deleted_at,
        })
        .eq('id', note.id)
        .eq('user_id', note.user_id)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to force-update note');
      }
      return data;
    },

    async permanentDeleteNote(noteId: string, userId: string): Promise<void> {
      const { data: existing } = await supabase
        .from('notes')
        .select('photo_attachments')
        .eq('id', noteId)
        .eq('user_id', userId)
        .maybeSingle();

      const storagePaths = Array.isArray(existing?.photo_attachments)
        ? existing.photo_attachments
            .map((p) => p?.storagePath)
            .filter((p): p is string => Boolean(p))
        : [];

      if (storagePaths.length > 0) {
        await supabase.storage
          .from(NOTE_PHOTOS_BUCKET)
          .remove(storagePaths)
          .catch(() => undefined);
      }

      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
