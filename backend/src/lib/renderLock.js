// Per-channel single-flight lock for renders.
//
// Why: a real render holds 100-200 MB of FFmpeg + AI providers; running two
// for the same channel at once burns Anthropic tokens twice and risks OOM on
// Render Starter. The route AND the scheduler both render — so the lock must
// be visible to both processes (in case the deployment ever scales to 2 dynos)
// and must auto-expire if a process dies mid-render (so a crash doesn't
// permanently block the channel).
//
// Redis SET NX EX gives both properties for free. When REDIS_URL is absent
// (local dev without docker compose), we fall back to an in-memory Set with
// a timed auto-release — same behaviour, just single-process.

import Redis from 'ioredis';

const TTL_SEC = 15 * 60; // longest realistic render (~3 min) × 5 — generous

let _redis = null;
function redis() {
  if (_redis !== null) return _redis;
  if (!process.env.REDIS_URL) return (_redis = false);
  try {
    _redis = new Redis(process.env.REDIS_URL, {
      // Don't crash the app if Redis goes away — fall back to local Set.
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    _redis.on('error', () => {});
    return _redis;
  } catch {
    return (_redis = false);
  }
}

const local = new Map(); // channelId → timeout handle (for auto-expiry)

function key(channelId) {
  return `flowtube:render-lock:${channelId}`;
}

// Try to claim the channel. Returns true if claimed, false if another render
// already holds it. Auto-released after TTL_SEC regardless.
export async function acquire(channelId) {
  if (!channelId) return true; // routes without a channelId don't need a lock
  const r = redis();
  if (r) {
    const got = await r.set(key(channelId), '1', 'EX', TTL_SEC, 'NX');
    return got === 'OK';
  }
  if (local.has(channelId)) return false;
  const t = setTimeout(() => local.delete(channelId), TTL_SEC * 1000);
  // Don't hold the event loop open if this is the last pending work.
  if (typeof t.unref === 'function') t.unref();
  local.set(channelId, t);
  return true;
}

export async function release(channelId) {
  if (!channelId) return;
  const r = redis();
  if (r) {
    await r.del(key(channelId)).catch(() => {});
    return;
  }
  const t = local.get(channelId);
  if (t) clearTimeout(t);
  local.delete(channelId);
}
