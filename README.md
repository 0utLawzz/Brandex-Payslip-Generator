# Brandex Payslip — Salary Report Generator

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E599?logo=postgresql&logoColor=black)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Sync-0F9D58?logo=googlesheets&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active-success)

> **Personal attendance & salary ledger** for Brandex Law Services — mark present/absent by day, track advances, calculate net pay in PKR, print monthly reports, and sync to Google Sheets via direct API.

**Default daily rate:** Rs 1,600 (configurable in Settings).

## Topics / Keywords

`salary` `payroll` `attendance` `report-generator` `daily-wage` `advance` `google-sheets` `neon-postgres` `tanstack-start` `typescript` `react` `hr` `pakistan` `pkr` `brandex` `neo-brutalist` `automation`

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
| **Google Sheets sync** | Push/pull records to/from your spreadsheet via Service Account |
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
| Data access | TanStack `createServerFn` — all DB reads/writes run server-side only |
| Sheets sync | Direct **Google Sheets API v4** via Service Account JWT (no intermediary) |
| UI | shadcn/ui + Tailwind CSS 4 + Lucide icons |
| Forms / validation | Zod |
| Toasts | Sonner |
| Deployment | Vercel (Nitro `vercel` preset) |
| Package manager | npm (`package-lock.json`) |

---

## Project structure

```
salary-creator/
├── src/
│   ├── components/ui/            # shadcn components
│   ├── hooks/                    # use-mobile
│   ├── lib/
│   │   ├── attendance.ts         # daily rate, date helpers, currency, month range
│   │   ├── attendance.functions.ts  # server fns → Neon reads/writes (records + settings)
│   │   ├── db.server.ts          # server-only Neon connection helper
│   │   ├── sync.functions.ts     # server fn → Google Sheets sync (Service Account)
│   │   ├── config.server.ts      # server-only config
│   │   └── error-capture.ts      # error boundary helper
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
├── .env.example                  # copy to .env and fill in your values
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

Single-user design: all reads/writes go through server functions, never straight from the browser.

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
- A Google Cloud Service Account with Sheets API access (for sync)

### Install & run

```bash
git clone https://github.com/0utLawzz/salary-creator.git
cd salary-creator
npm install
cp .env.example .env   # fill in DATABASE_URL and Google credentials
psql "$DATABASE_URL" -f db/schema.sql   # create tables on a fresh Neon DB
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite / TanStack Start dev server |
| `npm run build` | Production build (targets Vercel by default) |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Environment

Copy `.env.example` to `.env` and fill in:

```env
# Neon Postgres
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Google Sheets sync (Service Account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

> **Never commit `.env`** — it is listed in `.gitignore`.

---

## Google Sheets sync

The sync uses a **Google Service Account** with direct Sheets API v4 calls (no third-party gateway).

### One-time setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Enable APIs** → enable **Google Sheets API**.
2. **IAM & Admin → Service Accounts** → Create a new service account.
3. Create a **JSON key** for that account → download the file.
4. From the JSON file, copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` newlines)
5. Open your Google Spreadsheet → **Share** → add the service account email with **Editor** access.

### Using sync on the dashboard

1. Open **Config Panel** (gear icon).
2. Paste the **Spreadsheet ID** (from the sheet URL: `.../d/SPREADSHEET_ID/edit`).
3. Set the **tab prefix** (default `Attendance`; each month gets its own tab, e.g. `Attendance 2026-08`).
4. Click **Push** to export app data → sheet, or **Pull** to import sheet data → app.

**Columns written:**
`Date | Day | Status | Amount (Rs) | Advance (Rs) | Net (Rs)`

---

## Print report

- From the dashboard: **Generate PDF** → opens `/print?month=YYYY-MM`
- Columns: Date, Day, Status, Amount, Advance, Net
- Footer totals + employee / authorized signature lines
- Uses `window.print()` and print CSS

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project → Import** this repo.
3. Add environment variables in **Project Settings → Environment Variables**:
   - `DATABASE_URL`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (paste the full PEM key — Vercel preserves newlines)
4. Deploy. The Nitro preset is `"vercel"` (set in `vite.config.ts`).

---

## Current status & roadmap

**Done**
- Neo-brutalist attendance calendar UI (Brandex Law Services)
- Present / Absent / Clear + per-day advance
- Configurable daily rate
- Month navigation & stats (working days, present, absent, earnings, net)
- Printable monthly report
- Google Sheets bi-directional sync (push & pull) via Service Account
- Neon Postgres persistence (`attendance_records`, `app_settings`)

**Possible next steps**
- Auth / multi-user support
- Half-days, paid leave, custom holidays
- Multiple employees
- PDF export in addition to browser print

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
📦 Repo: [0utLawzz/salary-creator](https://github.com/0utLawzz/salary-creator)  

---

*Need custom payroll, attendance, or reporting automation for your business? Contact me.*
