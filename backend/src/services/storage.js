// Object storage for rendered MP4s. Works with both AWS S3 and any
// S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO) — set
// AWS_ENDPOINT_URL to point at the non-AWS endpoint.
//
// Why this exists: Render Starter's disk is ephemeral. With the scheduler's
// 2-hour advance render window, a restart between render and YouTube upload
// loses the file → silent auto-publish failure. Persisting MP4s to a bucket
// lets the publish step download a fresh copy regardless of which instance
// rendered it (and survives restarts).
//
// All exports are no-ops when the bucket isn't configured, so dev/local
// keeps writing to backend/storage/media as before.

import { readFile, writeFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BUCKET = process.env.AWS_BUCKET_NAME ?? '';
const ENDPOINT = process.env.AWS_ENDPOINT_URL ?? undefined; // R2 etc.

let _client = null;
function client() {
  if (_client) return _client;
  _client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    // R2/MinIO need path-style addressing; AWS auto-handles either.
    forcePathStyle: Boolean(ENDPOINT),
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // fall through to default chain (IAM role, etc.)
  });
  return _client;
}

export function isStorageConfigured() {
  return Boolean(
    BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

export function videoKey(videoId) {
  return `videos/${videoId}.mp4`;
}

// Upload a finished MP4 to the bucket. Returns the object key (not a URL —
// URLs are generated on demand via signedUrl() so they stay short-lived).
export async function uploadVideo(localPath, key) {
  const body = await readFile(localPath);
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=86400',
    }),
  );
  return key;
}

// Download the MP4 back to a local path so FFmpeg/YouTube uploader can read
// it as a file stream. Used by the publish step to insulate it from
// container restarts that wipe the original local copy.
export async function downloadVideo(key, localPath) {
  const out = await client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const buf = Buffer.from(await out.Body.transformToByteArray());
  await writeFile(localPath, buf);
  return localPath;
}

// Time-bounded URL the frontend can play directly (no public bucket needed).
// 24h is well above how long users sit on a review; the poll endpoint
// re-signs on every request so a stale URL is never persisted.
export async function signedUrl(key, expirySec = 86400) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expirySec },
  );
}

// Lightweight bucket reachability probe for /api/health. Uses a HEAD on the
// bucket itself (a synthetic key) — returns true if the credentials and
// endpoint resolve, false on any error.
export async function bucketReachable() {
  if (!isStorageConfigured()) return false;
  try {
    await client().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: '__health_probe__' }),
    );
    return true;
  } catch (e) {
    // NoSuchKey is a "reached the bucket" success; anything else is failure.
    return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
  }
}
