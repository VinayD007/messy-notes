import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import {
  NOTE_PHOTOS_BUCKET,
  getAttachmentType,
  type NoteAttachment,
  type PhotoAttachment,
} from '@messy-notes/shared';
import { supabase } from './supabase';

const PHOTOS_DIR = `${FileSystem.documentDirectory ?? ''}note_photos/`;

async function ensurePhotosDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

export function getLocalPhotoUri(fileNameOrDiskName: string): string {
  return `${PHOTOS_DIR}${fileNameOrDiskName}`;
}

export async function copyPickedAttachmentToPrivateStorage(params: {
  sourceUri: string;
  userId: string;
  noteId: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}): Promise<{ attachment: NoteAttachment; localUri: string }> {
  await ensurePhotosDir();
  const id = Crypto.randomUUID();
  let originalName = (params.fileName ?? '').trim();

  let ext = originalName.includes('.')
    ? originalName.split('.').pop()!.toLowerCase()
    : '';

  if (!ext) {
    if (params.mimeType === 'image/png') ext = 'png';
    else if (params.mimeType === 'image/webp') ext = 'webp';
    else if (params.mimeType?.startsWith('image/')) ext = 'jpg';
    else if (params.mimeType === 'application/pdf') ext = 'pdf';
    else if (params.mimeType?.includes('sheet') || params.mimeType?.includes('excel')) ext = 'xlsx';
    else if (params.mimeType?.includes('word')) ext = 'docx';
    else if (params.mimeType?.includes('csv')) ext = 'csv';
    else if (params.mimeType?.includes('zip')) ext = 'zip';
    else if (params.mimeType?.includes('text/')) ext = 'txt';
    else ext = 'bin';
  }

  if (!originalName) {
    originalName = `file_${id.slice(0, 8)}.${ext}`;
  } else if (!originalName.includes('.')) {
    originalName = `${originalName}.${ext}`;
  }

  const safeDiskName = `${id}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const destinationUri = getLocalPhotoUri(safeDiskName);

  await FileSystem.copyAsync({
    from: params.sourceUri,
    to: destinationUri,
  });

  const mimeType = params.mimeType || 'application/octet-stream';
  const type = getAttachmentType(mimeType, originalName);

  let fileSize = params.size;
  if (!fileSize) {
    try {
      const info = await FileSystem.getInfoAsync(destinationUri);
      if (info.exists && typeof info.size === 'number') {
        fileSize = info.size;
      }
    } catch {
      // Non-fatal
    }
  }

  const attachment: NoteAttachment = {
    id,
    fileName: originalName,
    storagePath: `${params.userId}/${params.noteId}/${safeDiskName}`,
    mimeType,
    type,
    fileSize,
  };

  return {
    attachment,
    localUri: destinationUri,
  };
}

export const copyPickedPhotoToPrivateStorage = copyPickedAttachmentToPrivateStorage;

export async function openOrShareAttachment(
  attachment: NoteAttachment
): Promise<{ success: boolean; error?: string }> {
  try {
    const localFileName = attachment.storagePath
      ? attachment.storagePath.split('/').pop()!
      : attachment.fileName;
    const localUri = getLocalPhotoUri(localFileName);

    let fileUriToOpen = localUri;
    const info = await FileSystem.getInfoAsync(localUri);

    if (!info.exists) {
      const fallbackOldUri = getLocalPhotoUri(attachment.fileName);
      const oldInfo = await FileSystem.getInfoAsync(fallbackOldUri);
      if (oldInfo.exists) {
        fileUriToOpen = fallbackOldUri;
      } else {
        // Download from Supabase signed URL
        const { data, error } = await supabase.storage
          .from(NOTE_PHOTOS_BUCKET)
          .createSignedUrl(attachment.storagePath, 3600);

        if (error || !data?.signedUrl) {
          throw new Error(error?.message || 'Could not load attachment from cloud');
        }

        await ensurePhotosDir();
        const downloadRes = await FileSystem.downloadAsync(data.signedUrl, localUri);
        fileUriToOpen = downloadRes.uri;
      }
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(fileUriToOpen, {
        mimeType: attachment.mimeType || 'application/octet-stream',
        dialogTitle: attachment.fileName,
      });
      return { success: true };
    }

    // Secondary fallback
    const { data } = await supabase.storage
      .from(NOTE_PHOTOS_BUCKET)
      .createSignedUrl(attachment.storagePath, 3600);
    if (data?.signedUrl) {
      await Linking.openURL(data.signedUrl);
      return { success: true };
    }

    return { success: false, error: 'Sharing not available on this device' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to open file',
    };
  }
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
