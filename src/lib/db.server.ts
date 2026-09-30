import { neon } from "@neondatabase/serverless";

// Server-only Neon client. This module is never imported by client bundles.
// neon() returns a tagged-template sql function; use sql.query() for
// parameterized queries with $1, $2 placeholders.

let schemaReady: Promise<void> | null = null;

/** Ensure notes column exists (safe to re-run). Runs once per cold start. */
async function ensureSchema(sql: ReturnType<typeof neon>) {
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await sql.query(
          `ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`
        );
      } catch (e) {
        // Table may not exist yet on a brand-new DB; ignore so first-time setup still works.
        console.warn("[db] ensureSchema notes:", e);
      }
    })();
  }
  await schemaReady;
}

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set");
  }
  const sql = neon(url);

  // Proxy so every .query() call waits for schema ensure first.
  return {
    query: async (text: string, params?: unknown[]) => {
      await ensureSchema(sql);
      return sql.query(text, params as any);
    },
  };
}
