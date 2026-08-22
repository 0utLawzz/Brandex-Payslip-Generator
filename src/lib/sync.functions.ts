import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Google Sheets API v4 — direct integration via Service Account JWT auth.
// Env vars required (server-only, never shipped to the browser):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — the service account email
//   GOOGLE_PRIVATE_KEY            — the PEM private key (replace \n literals)
// ---------------------------------------------------------------------------

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// --- JWT / OAuth2 helpers (no external deps, runs on Edge / Node alike) ----

/** Base64-URL encode a Uint8Array. */
function b64url(buf: Uint8Array): string {
  let b = "";
  buf.forEach((x) => (b += String.fromCharCode(x)));
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Encode an object as a Base64-URL JSON string. */
function encodeB64Json(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return b64url(bytes);
}

/**
 * Create a signed JWT for a Google Service Account and exchange it for an
 * access token using the Google OAuth2 token endpoint.
 */
async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Google Sheets sync not configured. " +
        "Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in your environment."
    );
  }

  // Clean up private key if user passed entire JSON or extra quotes
  let cleanedKey = rawKey.trim();
  if (cleanedKey.startsWith("{")) {
    try {
      const parsed = JSON.parse(cleanedKey);
      if (parsed.private_key) cleanedKey = parsed.private_key;
    } catch (_) {}
  }
  if ((cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) || (cleanedKey.startsWith("'") && cleanedKey.endsWith("'"))) {
    cleanedKey = cleanedKey.slice(1, -1);
  }

  // Cloud platforms (Vercel) store the key with literal \n in the env string.
  const pemKey = cleanedKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = encodeB64Json({ alg: "RS256", typ: "JWT" });
  const claim = encodeB64Json({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const signingInput = `${header}.${claim}`;

  // Strip PEM headers/footers and keep only base64 chars
  const pemBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  // Use Buffer for base64 decoding (reliable on Node/Vercel serverless)
  const derBytes = Uint8Array.from(Buffer.from(pemBody, "base64"));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64url(new Uint8Array(sigBuf))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Failed to obtain Google access token: ${text}`);
  }

  const json = (await tokenRes.json()) as { access_token: string };
  return json.access_token;
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
