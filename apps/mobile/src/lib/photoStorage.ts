import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import type { PhotoAttachment } from '@messy-notes/shared';

const PHOTOS_DIR = `${FileSystem.documentDirectory ?? ''}note_photos/`;

async function ensurePhotosDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

export function getLocalPhotoUri(fileName: string): string {
  return `${PHOTOS_DIR}${fileName}`;
}

export async function copyPickedPhotoToPrivateStorage(params: {
  sourceUri: string;
  userId: string;
  noteId: string;
  mimeType?: string;
}): Promise<{ attachment: PhotoAttachment; localUri: string }> {
  await ensurePhotosDir();
  const id = Crypto.randomUUID();
  const ext = params.mimeType === 'image/png' ? 'png' : 'jpg';
  const fileName = `${id}.${ext}`;
  const destinationUri = getLocalPhotoUri(fileName);

  await FileSystem.copyAsync({
    from: params.sourceUri,
    to: destinationUri,
  });

  return {
    attachment: {
      id,
      fileName,
      storagePath: `${params.userId}/${params.noteId}/${fileName}`,
      mimeType: params.mimeType ?? 'image/jpeg',
    },
    localUri: destinationUri,
  };
}

/**
 * Removes unreferenced files from app-private note_photos/ after saves or
 * permanent deletion (Section 5.7). Moving a note to Bin keeps its photos.
 */
export async function cleanupUnreferencedPhotos(
  referencedFileNames: ReadonlySet<string>
): Promise<void> {
  try {
    await ensurePhotosDir();
    const files = await FileSystem.readDirectoryAsync(PHOTOS_DIR);
    for (const fileName of files) {
      if (!referencedFileNames.has(fileName)) {
        await FileSystem.deleteAsync(getLocalPhotoUri(fileName), {
          idempotent: true,
        });
      }
    }
  } catch {
    // Non-fatal cleanup.
  }
}
