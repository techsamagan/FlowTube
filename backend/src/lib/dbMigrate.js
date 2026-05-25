// Idempotent boot-time DDL for schema bumps.
//
// Why this exists: the Render container can't run `prisma db push`, because
// db push needs DIRECT_URL and Supabase's direct host is IPv6-only while
// Render is IPv4-only (P1001 unreachable). But the *pooled* DATABASE_URL the
// app already uses IS IPv4-reachable, and pgbouncer (transaction mode)
// happily forwards a single-statement ALTER. So we run schema deltas as raw
// SQL through the same Prisma client at startup.
//
// Each statement is guarded with IF NOT EXISTS, so re-running it on every
// boot is a no-op. When you change schema.prisma, append the matching DDL
// here in the same commit — that's how prod gets the change.

import { prisma } from './prisma.js';

const STATEMENTS = [
  // commit 88996f6 — calendar autonomy: per-entry auto vs review mode + the
  // last failure message the UI shows next to a "Retry" button. Without
  // these columns the scheduler's findMany throws and the calendar route
  // 500s, so this migration is load-bearing.
  `ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "autoMode" TEXT NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "lastError" TEXT`,
];

export async function ensureSchema() {
  let ran = 0;
  for (const sql of STATEMENTS) {
    try {
      // $executeRawUnsafe is fine here — these are static strings, not user
      // input. Each ADD COLUMN IF NOT EXISTS is a single, idempotent
      // statement that survives pgbouncer transaction-mode pooling.
      await prisma.$executeRawUnsafe(sql);
      ran++;
    } catch (e) {
      // Log loudly but don't crash the app — the scheduler will still log
      // its own error if the column genuinely never made it.
      // eslint-disable-next-line no-console
      console.error(`[db-migrate] FAILED: ${sql}\n  → ${e?.message ?? e}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[db-migrate] applied ${ran}/${STATEMENTS.length} statements`);
}
