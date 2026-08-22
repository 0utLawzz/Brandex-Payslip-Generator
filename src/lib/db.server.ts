import { neon } from "@neondatabase/serverless";

// Server-only Neon client. This module is never imported by client bundles.
// neon() returns a tagged-template sql function; use sql.query() for
// parameterized queries with $1, $2 placeholders.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set");
  }
  return neon(url);
}
