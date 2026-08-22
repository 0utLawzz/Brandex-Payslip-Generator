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

// Map raw DB row to AttendanceRecordRow
function mapRow(row: Record<string, unknown>): AttendanceRecordRow {
  return {
    id: String(row.id),
    date: String(row.date).slice(0, 10), // YYYY-MM-DD
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
    const sql = getDb();
    const rows = await sql`
      SELECT id, date, status, amount, advance, updated_at
      FROM public.attendance_records
      WHERE date >= ${data.start}::date AND date <= ${data.end}::date
      ORDER BY date ASC
    `;
    return rows.map(mapRow);
  });

// ---------------------------------------------------------------------
// getAllAttendance — every record, ordered by date.
// ---------------------------------------------------------------------
export const getAllAttendance = createServerFn({ method: "GET" }).handler(async () => {
  const sql = getDb();
  const rows = await sql`
    SELECT id, date, status, amount, advance, updated_at
    FROM public.attendance_records
    ORDER BY date ASC
  `;
  return rows.map(mapRow);
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
    const sql = getDb();
    const rows = await sql`
      INSERT INTO public.attendance_records (date, status, amount, advance)
      VALUES (${data.date}::date, ${data.status}, ${data.amount}, ${data.advance})
      ON CONFLICT (date) DO UPDATE SET
        status     = EXCLUDED.status,
        amount     = EXCLUDED.amount,
        advance    = EXCLUDED.advance,
        updated_at = now()
      RETURNING id, date, status, amount, advance, updated_at
    `;
    return mapRow(rows[0] as Record<string, unknown>);
  });

// ---------------------------------------------------------------------
// deleteAttendanceDay
// ---------------------------------------------------------------------
export const deleteAttendanceDay = createServerFn({ method: "POST" })
  .validator(z.object({ date: z.string() }))
  .handler(async ({ data }) => {
    const sql = getDb();
    await sql`DELETE FROM public.attendance_records WHERE date = ${data.date}::date`;
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
  const sql = getDb();
  const rows = await sql`
    SELECT spreadsheet_id, sheet_name, daily_rate
    FROM public.app_settings
    WHERE id = 1
    LIMIT 1
  `;
  if (!rows.length) {
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
    const sql = getDb();
    await sql`
      INSERT INTO public.app_settings (id, spreadsheet_id, sheet_name, daily_rate)
      VALUES (1, ${data.spreadsheet_id}, ${data.sheet_name}, ${data.daily_rate})
      ON CONFLICT (id) DO UPDATE SET
        spreadsheet_id = EXCLUDED.spreadsheet_id,
        sheet_name     = EXCLUDED.sheet_name,
        daily_rate     = EXCLUDED.daily_rate,
        updated_at     = now()
    `;
    return { ok: true };
  });
