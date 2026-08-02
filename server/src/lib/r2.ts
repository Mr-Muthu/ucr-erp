import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '../config/env.js';

// Cloudflare R2 is S3-compatible — same SDK, custom endpoint, region "auto".
const s3 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT || undefined,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID || 'unconfigured',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || 'unconfigured',
  },
});

export function isR2Configured(): boolean {
  return Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

export async function presignUpload(params: {
  purpose: string;
  contentType: string;
  extension: string;
}): Promise<{ uploadUrl: string; fileKey: string; expiresIn: number }> {
  const fileKey = `${params.purpose}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${params.extension}`;
  const command = new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: fileKey, ContentType: params.contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: env.R2_PRESIGN_EXPIRY_SECONDS });
  return { uploadUrl, fileKey, expiresIn: env.R2_PRESIGN_EXPIRY_SECONDS };
}

const LOCAL_STORAGE_ROOT = join(process.cwd(), 'storage');

/**
 * Server-generated files (invoice/credit-note PDFs) upload directly here —
 * no presign round trip needed since the server holds the bytes already.
 * Falls back to local disk when R2 isn't configured (same gap as Phase 2's
 * presigned uploads: no real bucket in this dev environment), so the
 * feature stays fully testable without real credentials. Local keys are
 * prefixed `local:` so `getDownloadUrl` knows to serve them from disk
 * instead of redirecting to R2.
 */
export async function uploadBuffer(params: { buffer: Buffer; purpose: string; contentType: string; extension: string }): Promise<string> {
  const relativeKey = `${params.purpose}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${params.extension}`;
  if (isR2Configured()) {
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: relativeKey, Body: params.buffer, ContentType: params.contentType }));
    return relativeKey;
  }
  const fullPath = join(LOCAL_STORAGE_ROOT, relativeKey);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, params.buffer);
  return `local:${relativeKey}`;
}

/** Returns either a presigned R2 GET url or a local-disk buffer to stream, depending on how the file was stored. */
export async function resolveDownload(fileKey: string): Promise<{ kind: 'redirect'; url: string } | { kind: 'stream'; buffer: Buffer }> {
  if (fileKey.startsWith('local:')) {
    const relativeKey = fileKey.slice('local:'.length);
    const buffer = await readFile(join(LOCAL_STORAGE_ROOT, relativeKey));
    return { kind: 'stream', buffer };
  }
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: fileKey });
  const url = await getSignedUrl(s3, command, { expiresIn: env.R2_PRESIGN_EXPIRY_SECONDS });
  return { kind: 'redirect', url };
}
