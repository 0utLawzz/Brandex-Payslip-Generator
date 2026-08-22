import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "./db.server";
import { DAILY_RATE_DEFAULT } from "./attendance";

// Shape of a single attendance row
const AttendanceRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: z.enum(["present", "absent"]),
  amount: z.number(),
  advance: z.number(),
  updated_at: z.string(),
});
export type AttendanceRecordRow = z.infer<typeof AttendanceRecordSchema>;

// Safely map raw DB row to AttendanceRecordRow in YYYY-MM-DD format
function mapRow(row: Record<string, unknown>): AttendanceRecordRow {
  let dateStr = "";
  if (row.date instanceof Date) {
    const y = row.date.getUTCFullYear();
    const m = String(row.date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(row.date.getUTCDate()).padStart(2, "0");
    dateStr = `${y}-${m}-${d}`;
  } else {
    dateStr = String(row.date ?? "").slice(0, 10);
  }
  return {
    id: String(row.id),
    date: dateStr, // YYYY-MM-DD
    status: row.status as "present" | "absent",
    amount: Number(row.amount),
    advance: Number(row.advance),
    updated_at: String(row.updated_at),
  };
}

// ---------------------------------------------------------------------
// getAttendanceRange — fetch all records between two dates (inclusive).
// ---------------------------------------------------------------------
export const getAttendanceRange = createServerFn({ method: "GET" })
  .validator(z.object({ start: z.string(), end: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db.query(
      "SELECT id, date::text AS date, status, amount, advance, updated_at FROM attendance_records WHERE date >= $1 AND date <= $2 ORDER BY date ASC",
      [data.start, data.end]
    );
    return (rows ?? []).map((r) => mapRow(r as Record<string, unknown>));
  });

// ---------------------------------------------------------------------
// getAllAttendance — every record, ordered by date.
// ---------------------------------------------------------------------
export const getAllAttendance = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const rows = await db.query(
    "SELECT id, date::text AS date, status, amount, advance, updated_at FROM attendance_records ORDER BY date ASC"
  );
  return (rows ?? []).map((r) => mapRow(r as Record<string, unknown>));
});

// ---------------------------------------------------------------------
// upsertAttendanceDay — mark a day present/absent and/or set its advance
// ---------------------------------------------------------------------
export const upsertAttendanceDay = createServerFn({ method: "POST" })
  .validator(
    z.object({
      date: z.string(),
      status: z.enum(["present", "absent"]),
      amount: z.number().int().min(0),
      advance: z.number().int().min(0),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = await db.query(
      `INSERT INTO attendance_records (date, status, amount, advance)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (date) DO UPDATE SET
         status = EXCLUDED.status,
         amount = EXCLUDED.amount,
         advance = EXCLUDED.advance,
         updated_at = now()
       RETURNING id, date::text AS date, status, amount, advance, updated_at`,
      [data.date, data.status, data.amount, data.advance]
    );
    if (!rows || rows.length === 0) throw new Error("Upsert returned no row");
    return mapRow(rows[0] as Record<string, unknown>);
  });

// ---------------------------------------------------------------------
// deleteAttendanceDay
// ---------------------------------------------------------------------
export const deleteAttendanceDay = createServerFn({ method: "POST" })
  .validator(z.object({ date: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    await db.query("DELETE FROM attendance_records WHERE date = $1", [data.date]);
    return { ok: true };
  });

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
const SettingsSchema = z.object({
  spreadsheet_id: z.string().nullable(),
  sheet_name: z.string().nullable(),
  daily_rate: z.number(),
});
export type SettingsRow = z.infer<typeof SettingsSchema>;

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const rows = await db.query(
    "SELECT spreadsheet_id, sheet_name, daily_rate FROM app_settings WHERE id = 1 LIMIT 1"
  );
  if (!rows || rows.length === 0) {
    return { spreadsheet_id: null, sheet_name: "Attendance", daily_rate: DAILY_RATE_DEFAULT } as SettingsRow;
  }
  const r = rows[0] as Record<string, unknown>;
  return {
    spreadsheet_id: r.spreadsheet_id ? String(r.spreadsheet_id) : null,
    sheet_name: r.sheet_name ? String(r.sheet_name) : "Attendance",
    daily_rate: Number(r.daily_rate) || DAILY_RATE_DEFAULT,
  } as SettingsRow;
});

export const updateSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      spreadsheet_id: z.string().nullable(),
      sheet_name: z.string(),
      daily_rate: z.number().int().min(0),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    await db.query(
      `INSERT INTO app_settings (id, spreadsheet_id, sheet_name, daily_rate)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         spreadsheet_id = EXCLUDED.spreadsheet_id,
         sheet_name = EXCLUDED.sheet_name,
         daily_rate = EXCLUDED.daily_rate,
         updated_at = now()`,
      [data.spreadsheet_id, data.sheet_name, data.daily_rate]
    );
    return { ok: true };
  });

// ---------------------------------------------------------------------
// bulkUpsertAttendanceFromSheet — apply a pulled sheet month to the DB
// ---------------------------------------------------------------------
export const bulkUpsertAttendanceFromSheet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      start: z.string(),
      end: z.string(),
      rows: z.array(
        z.object({
          date: z.string(),
          status: z.enum(["present", "absent"]),
          amount: z.number().int().min(0),
          advance: z.number().int().min(0),
        })
      ),
      deletions: z.array(z.string()),
    })
  )
  .handler(async ({ data }) => {
    const db = getDb();
    if (data.deletions.length > 0) {
      await db.query(
        `DELETE FROM attendance_records WHERE date >= $1 AND date <= $2 AND date = ANY($3::date[])`,
        [data.start, data.end, data.deletions]
      );
    }

    if (data.rows.length > 0) {
      await Promise.all(
        data.rows.map((r) =>
          db.query(
            `INSERT INTO attendance_records (date, status, amount, advance)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (date) DO UPDATE SET
               status = EXCLUDED.status,
               amount = EXCLUDED.amount,
               advance = EXCLUDED.advance,
               updated_at = now()`,
            [r.date, r.status, r.amount, r.advance]
          )
        )
      );
    }
    return { upserted: data.rows.length, deleted: data.deletions.length };
  });
