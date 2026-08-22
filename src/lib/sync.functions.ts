import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "./db.server";
import { AttendanceRecordRow } from "./attendance.functions";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !gsKey) {
    throw new Error("Google Sheets connection not configured.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gsKey,
    "Content-Type": "application/json",
  };
}

const spreadsheetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(20)
  .max(60);

// Tab title: letters/digits/space/dash/underscore only. Quotes, slashes, colons etc. rejected.
const sheetTitleSchema = z
  .string()
  .regex(/^[A-Za-z0-9 _-]+$/)
  .min(1)
  .max(100);

async function gfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${text}`);
  }
  return res;
}

async function ensureTab(spreadsheetId: string, title: string) {
  const meta = (await (
    await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}`)
  ).json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const exists = meta.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    });
  }
  return exists;
}

function sanitize(rows: Array<Array<string | number>>) {
  return rows.map((row) =>
    row.map((cell) =>
      typeof cell === "string" && /^[=+\-@\t\r]/.test(cell) ? "'" + cell : cell,
    ),
  );
}

/** Push (app -> sheet) one month into its own tab. */
export const pushMonthToSheet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      spreadsheetId: spreadsheetIdSchema,
      tabName: sheetTitleSchema,
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
    }),
  )

  .handler(async ({ data }) => {
    const { spreadsheetId, tabName, rows } = data;
    await ensureTab(spreadsheetId, tabName);

    await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values/'${tabName}':clear`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    await gfetch(
      `${GATEWAY}/spreadsheets/${spreadsheetId}/values/'${tabName}'!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: sanitize(rows), majorDimension: "ROWS" }),
      },
    );

    return { ok: true, rowsWritten: rows.length };
  });

/** Pull (sheet -> app) one month's tab. Returns raw rows; caller maps them. */
export const pullMonthFromSheet = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      spreadsheetId: spreadsheetIdSchema,
      tabName: sheetTitleSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { spreadsheetId, tabName } = data;
    const meta = (await (
      await gfetch(`${GATEWAY}/spreadsheets/${spreadsheetId}`)
    ).json()) as { sheets?: Array<{ properties?: { title?: string } }> };
    const exists = meta.sheets?.some((s) => s.properties?.title === tabName);
    if (!exists) return { ok: true, found: false, rows: [] as string[][] };

    const res = await gfetch(
      `${GATEWAY}/spreadsheets/${spreadsheetId}/values/'${tabName}'!A1:F400?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const json = (await res.json()) as { values?: Array<Array<string | number>> };
    const rows = (json.values ?? []).map((r) => r.map((c) => String(c ?? "")));
    return { ok: true, found: true, rows };
  });
