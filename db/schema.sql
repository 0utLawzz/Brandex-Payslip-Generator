-- Salary Report Generator — Neon/Postgres schema
-- Run this once against a fresh Neon database, e.g.:
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- This is the plain-Postgres equivalent of the old Supabase migrations.
-- Supabase-specific bits (Row Level Security policies, anon/authenticated
-- role grants) were removed because Neon has no such roles — the app
-- reaches the database only from server functions (never the browser),
-- so those roles are not needed here.

-- gen_random_uuid() lives in pgcrypto on most Postgres builds.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  amount INTEGER NOT NULL DEFAULT 0,
  advance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  spreadsheet_id TEXT,
  sheet_name TEXT DEFAULT 'Attendance',
  daily_rate INTEGER NOT NULL DEFAULT 1600,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single settings row if it doesn't already exist.
INSERT INTO public.app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Keep updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_attendance_updated ON public.attendance_records;
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON public.app_settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
