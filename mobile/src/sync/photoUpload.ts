import * as FileSystem from 'expo-file-system';
import { uploadsApi } from '../api/endpoints';
import type { UploadPurpose } from '../api/types';

/**
 * Presign + direct PUT to R2. Photo keys are optional everywhere in the
 * server schema (dev environments often have no real R2 bucket configured —
 * see server/README "Phase 2" notes), so callers must treat a failed
 * upload as non-fatal: submit the mutation without the photo key rather
 * than blocking the driver's duty progress on a flaky/unconfigured upload.
 */
export async function uploadPhoto(localUri: string, purpose: UploadPurpose): Promise<string | null> {
  try {
    const extension = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
    const { uploadUrl, fileKey } = await uploadsApi.presign(purpose, contentType, extension);
    const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'PUT',
      headers: { 'Content-Type': contentType },
    });
    if (result.status < 200 || result.status >= 300) return null;
    return fileKey;
  } catch {
    return null;
  }
}
