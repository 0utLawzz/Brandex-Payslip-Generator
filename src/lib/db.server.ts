import { neon } from "@neondatabase/serverless";

// Server-only Neon client. This module is never imported by client bundles.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set");
  }
  return neon(url);
}
