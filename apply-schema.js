// apply-schema.js — Run this once to set up the Neon Postgres schema.
// Usage: node apply-schema.js
// Requires DATABASE_URL to be set in .env or environment.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually if not already set
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(resolve(__dirname, ".env"), "utf-8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  } catch {
    // .env not found — rely on environment variables
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Please add it to your .env file.");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const schema = readFileSync(resolve(__dirname, "db/schema.sql"), "utf-8");

console.log("🔧  Applying schema to Neon database...");

try {
  await client.connect();
  await client.query(schema);
  await client.end();
  console.log("✅  Schema applied successfully!");
} catch (err) {
  console.error("❌  Schema apply failed:", err.message);
  try { await client.end(); } catch {}
  process.exit(1);
}
