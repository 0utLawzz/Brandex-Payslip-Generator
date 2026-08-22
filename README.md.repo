# Salary Report Generator (Brandex Attendance)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E599?logo=postgresql&logoColor=black)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Sync-0F9D58?logo=googlesheets&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)
![Automation](https://img.shields.io/badge/Automation-Custom-blue)
![Status](https://img.shields.io/badge/Status-Active-success)

> **Personal attendance & salary ledger** for Brandex Law Services — mark present/absent by day, track advances, calculate net pay in PKR, print monthly reports, and sync to Google Sheets.

**Default daily rate:** Rs 1,600 (configurable in Settings).

## Topics / Keywords

`salary` `payroll` `attendance` `report-generator` `daily-wage` `advance` `google-sheets` `supabase` `tanstack-start` `typescript` `react` `hr` `pakistan` `pkr` `brandex` `neo-brutalist` `automation` `custom-automation`

---

## What is this?

A single-user **attendance dashboard** that turns daily presence into a salary report:

| Feature | Description |
|---------|-------------|
| **Month calendar** | Click any working day → Present / Absent / Clear |
| **Sundays** | Auto-excluded (greyed, Rs 0, not counted as working days) |
| **Daily rate** | Present days earn the configured rate (default **Rs 1,600**) |
| **Advances** | Per-day advance amount; deducted from earnings for **net salary** |
| **Summary cards** | Working days, Present, Absent, Earnings, Advance, Net |
| **Print report** | Clean printable table with signatures (`/print?month=YYYY-MM`) |
| **Google Sheets sync** | Push all records to your spreadsheet via server function |
| **Settings** | Spreadsheet ID, sheet tab name, daily rate |

Branded UI: **neo-brutalist** design (thick black borders, bold type, high-contrast colors) under **Brandex Law Services**.

---

## Pay logic

```
Mon–Sat + Present  →  amount = daily_rate
Mon–Sat + Absent   →  amount = 0
Sunday             →  excluded (off, Rs 0)
Net salary         →  sum(amounts) − sum(advances)
```

Currency formatting uses `en-PK` → e.g. `Rs 1,600`.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | **TanStack Start** (React 19 + Vite) |
| Routing | TanStack Router (file routes) |
| Database | **Neon** (serverless Postgres), accessed via `@neondatabase/serverless` |
| Data access | TanStack `createServerFn` — all DB reads/writes run server-side only, the browser never talks to Postgres directly |
| Sheets sync | Lovable Google Sheets connector gateway |
| UI | shadcn/ui + Tailwind CSS 4 + Lucide icons |
| Forms / validation | Zod |
| Toasts | Sonner |
| Deployment | Vercel (Nitro `vercel` preset) |
| Package manager | npm (`package-lock.json`) — Bun also works |

---

## Project structure

```
Salary-Report-Generator-/
├── src/
│   ├── components/ui/            # shadcn components
│   ├── hooks/                    # use-mobile
│   ├── lib/
│   │   ├── attendance.ts         # daily rate, date helpers, currency, month range
│   │   ├── attendance.functions.ts  # server fns → Neon reads/writes (records + settings)
│   │   ├── db.server.ts          # server-only Neon connection helper
│   │   ├── sync.functions.ts     # server fn → Google Sheets sync
│   │   ├── config.server.ts      # server-only config
│   │   └── api/                  # example server functions
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx             # main dashboard (calendar + stats + settings)
│   │   └── print.tsx             # printable monthly report
│   ├── styles.css
│   ├── router.tsx
│   ├── server.ts
│   └── start.ts
├── db/
│   └── schema.sql                # full Neon/Postgres schema (run once on a fresh DB)
├── .lovable/plan.md              # original product plan
├── CODE_OF_CONDUCT.md
├── LICENSE
└── package.json
```

---

## Database schema (Neon / Postgres)

Run `db/schema.sql` once against a fresh Neon database to create everything below.

### `attendance_records`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `date` | DATE | UNIQUE |
| `status` | TEXT | `present` \| `absent` |
| `amount` | INTEGER | Earned for that day |
| `advance` | INTEGER | Default 0 |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auto-updated |

### `app_settings` (single row, `id = 1`)
| Column | Type | Notes |
|--------|------|-------|
| `spreadsheet_id` | TEXT | Google Spreadsheet ID |
| `sheet_name` | TEXT | Default `Attendance` |
| `daily_rate` | INTEGER | Default **1600** |
| `updated_at` | TIMESTAMPTZ | |

Single-user design: all reads/writes go through server functions (`src/lib/attendance.functions.ts`), never straight from the browser, so there's no need for Postgres-level row security here.

---

## Routes

| Path | Purpose |
|------|---------|
| `/` | Dashboard — calendar, stats, sync, settings |
| `/print?month=YYYY-MM` | Print-friendly attendance report |

---

## Getting started

### Prerequisites
- Node.js 18+
- A [Neon](https://neon.tech) Postgres project (free tier works)
- Optional: Lovable Google Sheets connector keys for sync

### Install & run

```bash
git clone https://github.com/0utLawzz/Salary-Report-Generator-.git
cd Salary-Report-Generator-
npm install
cp .env.example .env   # fill in DATABASE_URL (see below)
psql "$DATABASE_URL" -f db/schema.sql   # create tables on a fresh Neon DB
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite / TanStack Start dev server |
| `npm run build` | Production build (targets Vercel by default — see `vite.config.ts`) |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Environment

Required (server-only — see `.env.example`):

```env
DATABASE_URL=postgresql://user:password@ep-example.region.aws.neon.tech/neondb?sslmode=require
```

For Google Sheets sync (server-only, optional):

```env
LOVABLE_API_KEY=...
GOOGLE_SHEETS_API_KEY=...
```

---

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from there).
2. In Vercel, **New Project → Import** this repo.
3. Add the `DATABASE_URL` environment variable (and the two Sheets-sync keys if you use that feature) in **Project Settings → Environment Variables**.
4. Deploy. `vite.config.ts` sets the Nitro build preset to `"vercel"`, so no extra build config is needed.

---

## Google Sheets sync

1. Open **Settings** on the dashboard.
2. Paste the **Spreadsheet ID** (from the sheet URL: `.../d/SPREADSHEET_ID/edit`).
3. Set the **tab name** (default `Attendance`).
4. Click **Sync**.

The server function:
- Ensures the tab exists (creates it if missing)
- Clears the sheet
- Writes rows in **RAW** mode with formula-injection protection

**Columns written:**  
`Date | Day | Status | Amount (Rs) | Advance (Rs) | Net (Rs)`

---

## Print report

- From the dashboard: **Print** → opens `/print?month=YYYY-MM`
- Columns: Date, Day, Status, Amount, Advance, Net
- Footer totals + employee / authorized signature lines
- Uses `window.print()` and print CSS

---

## Security warning

> ⚠️ **A `.env` file is currently committed in this repository.**  
> Treat any keys in it as compromised: **rotate secrets**, remove `.env` from git history if it contained real credentials, and add `.env` to `.gitignore` (it is not listed there today).

Do not commit secrets. Use local `.env` / deployment secrets only.

---

## Current status & roadmap

**Done**
- Neo-brutalist attendance calendar UI (Brandex Law Services)
- Present / Absent / Clear + per-day advance
- Configurable daily rate
- Month navigation & stats (working days, present, absent, earnings, net)
- Printable monthly report
- Google Sheets sync via server function
- Supabase persistence (`attendance_records`, `app_settings`)

**Possible next steps**
- Auth / multi-user (RLS is open today)
- Half-days, paid leave, custom holidays
- Multiple employees
- PDF export in addition to browser print
- Remove committed `.env` and harden secrets handling

---

## License

MIT — see [LICENSE](LICENSE).

Please also read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Author

**Nadeem (OutLawZ)**  
Custom Automation Specialist  

📧 Contact: [net2outlawzz@gmail.com](mailto:net2outlawzz@gmail.com)  
🔗 GitHub: [0utLawzz](https://github.com/0utLawzz)  
📦 Repo: [0utLawzz/Salary-Report-Generator-](https://github.com/0utLawzz/Salary-Report-Generator-)

---

*Need custom payroll, attendance, or reporting automation for your business? Contact me.*
