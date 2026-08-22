import { neon } from "@neondatabase/serverless";

// This module is server-only — never imported by client bundles.
// DATABASE_URL must be set in the environment.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
