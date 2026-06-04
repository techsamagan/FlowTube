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
      // Cap retries so a long Redis outage fails fast (we fall back to the
      // in-memory lock for individual calls). Default offline-queue is left
      // ON so the very first call after process boot doesn't race the TCP
      // handshake (commands queue briefly until ready=true).
      maxRetriesPerRequest: 1,
    });
    _redis.on('error', () => {}); // swallow — callers handle individually
    return _redis;
  } catch {
    return (_redis = false);
  }
}

const local = new Map(); // channelId → timeout handle (for auto-expiry)

function localAcquire(channelId) {
  if (local.has(channelId)) return false;
  const t = setTimeout(() => local.delete(channelId), TTL_SEC * 1000);
  if (typeof t.unref === 'function') t.unref();
  local.set(channelId, t);
  return true;
}
function localRelease(channelId) {
  const t = local.get(channelId);
  if (t) clearTimeout(t);
  local.delete(channelId);
}

function key(channelId) {
  return `flowtube:render-lock:${channelId}`;
}

// Try to claim the channel. Returns true if claimed, false if another render
// already holds it. Auto-released after TTL_SEC regardless. If Redis is
// down/unreachable, falls back to the in-memory lock for this call — the
// app keeps working, just without cross-instance coordination.
export async function acquire(channelId) {
  if (!channelId) return true; // routes without a channelId don't need a lock
  const r = redis();
  if (r) {
    try {
      const got = await r.set(key(channelId), '1', 'EX', TTL_SEC, 'NX');
      return got === 'OK';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[renderLock] Redis acquire failed (${e.message}); using local lock for this call.`);
      return localAcquire(channelId);
    }
  }
  return localAcquire(channelId);
}

export async function release(channelId) {
  if (!channelId) return;
  const r = redis();
  if (r) {
    try {
      await r.del(key(channelId));
      return;
    } catch {
      // Fall through to local release.
    }
  }
  localRelease(channelId);
}
