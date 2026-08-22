import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { JWT } from "google-auth-library";

// ---------------------------------------------------------------------------
// Google Sheets API v4 — direct integration via Service Account JWT auth.
// Env vars supported (server-only):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email
//   GOOGLE_PRIVATE_KEY            — PEM private key (or full JSON key string)
//   GOOGLE_SERVICE_ACCOUNT_JSON   — full JSON key string (optional alternative)
// ---------------------------------------------------------------------------

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function parseCredentials() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_CREDENTIALS;

  if (key && key.trim().startsWith("{")) {
    try {
      const json = JSON.parse(key.trim());
      if (json.client_email) email = json.client_email;
      if (json.private_key) key = json.private_key;
    } catch (_) {}
  }

  if (email && email.trim().startsWith("{")) {
    try {
      const json = JSON.parse(email.trim());
      if (json.client_email) email = json.client_email;
      if (json.private_key) key = json.private_key;
    } catch (_) {}
  }

  if (key) {
    key = key.replace(/\\n/g, "\n");
    if (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1);
    }
  }

  return { email: email?.trim(), key: key?.trim() };
}

async function getAccessToken(): Promise<string> {
  const { email, key } = parseCredentials();

  if (!email || !key) {
    throw new Error(
      "Google Sheets sync not configured. " +
        "Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY (or GOOGLE_SERVICE_ACCOUNT_JSON) in environment variables."
    );
  }

  try {
    const client = new JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const res = await client.authorize();
    if (!res.access_token) {
      throw new Error("No access token returned from Google authorization.");
    }
    return res.access_token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to obtain Google access token: ${msg}`);
  }
}

// --- Schema validation -------------------------------------------------------

const spreadsheetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(20)
  .max(100);

const sheetTitleSchema = z
  .string()
  .regex(/^[A-Za-z0-9 _-]+$/)
  .min(1)
  .max(100);

// --- Sheets API helpers -------------------------------------------------------

async function sheetsGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets GET error ${res.status}: ${text}`);
  }
  return res;
}

async function sheetsPost(
  url: string,
  token: string,
  body: unknown,
  method = "POST"
) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets ${method} error ${res.status}: ${text}`);
  }
  return res;
}

async function ensureTab(
  spreadsheetId: string,
  title: string,
  token: string
): Promise<void> {
  const meta = (await (
    await sheetsGet(`${SHEETS_BASE}/${spreadsheetId}`, token)
  ).json()) as { sheets?: Array<{ properties?: { title?: string } }> };

  const exists = meta.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await sheetsPost(
      `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
      token,
      { requests: [{ addSheet: { properties: { title } } }] }
    );
  }
}

/** Prevent formula injection: prefix cells starting with =, +, -, @, tab, CR. */
function sanitize(rows: Array<Array<string | number>>) {
  return rows.map((row) =>
    row.map((cell) =>
      typeof cell === "string" && /^[=+\-@\t\r]/.test(cell)
        ? "'" + cell
        : cell
    )
  );
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Push (app → sheet): write one month into its own tab. */
export const pushMonthToSheet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      spreadsheetId: spreadsheetIdSchema,
      tabName: sheetTitleSchema,
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
    })
  )
  .handler(async ({ data }) => {
    const { spreadsheetId, tabName, rows } = data;
    const token = await getAccessToken();

    await ensureTab(spreadsheetId, tabName, token);

    // Clear the tab
    await sheetsPost(
      `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
      token,
      {}
    );

    // Write rows
    await sheetsPost(
      `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A1?valueInputOption=RAW`,
      token,
      { values: sanitize(rows), majorDimension: "ROWS" },
      "PUT"
    );

    return { ok: true, rowsWritten: rows.length };
  });

/** Pull (sheet → app): read one month's tab and return raw rows. */
export const pullMonthFromSheet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      spreadsheetId: spreadsheetIdSchema,
      tabName: sheetTitleSchema,
    })
  )
  .handler(async ({ data }) => {
    const { spreadsheetId, tabName } = data;
    const token = await getAccessToken();

    const meta = (await (
      await sheetsGet(`${SHEETS_BASE}/${spreadsheetId}`, token)
    ).json()) as { sheets?: Array<{ properties?: { title?: string } }> };

    const exists = meta.sheets?.some((s) => s.properties?.title === tabName);
    if (!exists) return { ok: true, found: false, rows: [] as string[][] };

    const res = await sheetsGet(
      `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A1:F400?valueRenderOption=UNFORMATTED_VALUE`,
      token
    );
    const json = (await res.json()) as {
      values?: Array<Array<string | number>>;
    };
    const rows = (json.values ?? []).map((r) =>
      r.map((c) => String(c ?? ""))
    );
    return { ok: true, found: true, rows };
  });
