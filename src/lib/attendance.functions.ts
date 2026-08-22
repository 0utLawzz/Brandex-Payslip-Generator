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
    const db = getDb();
    const { data: rows, error } = await db
      .from("attendance_records")
      .select("id, date, status, amount, advance, updated_at")
      .gte("date", data.start)
      .lte("date", data.end)
      .order("date", { ascending: true });
    if (error) throw error;
    return (rows ?? []).map((r) => mapRow(r as Record<string, unknown>));
  });

// ---------------------------------------------------------------------
// getAllAttendance — every record, ordered by date.
// ---------------------------------------------------------------------
export const getAllAttendance = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const { data: rows, error } = await db
    .from("attendance_records")
    .select("id, date, status, amount, advance, updated_at")
    .order("date", { ascending: true });
  if (error) throw error;
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
    const { data: rows, error } = await db
      .from("attendance_records")
      .upsert(
        {
          date: data.date,
          status: data.status,
          amount: data.amount,
          advance: data.advance,
        },
        { onConflict: "date" }
      )
      .select("id, date, status, amount, advance, updated_at");
    if (error) throw error;
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
    const { error } = await db.from("attendance_records").delete().eq("date", data.date);
    if (error) throw error;
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
  const { data: rows, error } = await db
    .from("app_settings")
    .select("spreadsheet_id, sheet_name, daily_rate")
    .eq("id", 1)
    .limit(1);
  if (error) throw error;
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
    const { error } = await db
      .from("app_settings")
      .upsert(
        {
          id: 1,
          spreadsheet_id: data.spreadsheet_id,
          sheet_name: data.sheet_name,
          daily_rate: data.daily_rate,
        },
        { onConflict: "id" }
      );
    if (error) throw error;
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
      const { error } = await db
        .from("attendance_records")
        .delete()
        .in("date", data.deletions)
        .gte("date", data.start)
        .lte("date", data.end);
      if (error) throw error;
    }
    if (data.rows.length > 0) {
      const { error } = await db.from("attendance_records").upsert(data.rows, { onConflict: "date" });
      if (error) throw error;
    }
    return { upserted: data.rows.length, deleted: data.deletions.length };
  });
