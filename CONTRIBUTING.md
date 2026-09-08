# Contributing to Brandex Payslip (salary-creator)

Thank you for your interest in improving this project.

## Development setup

1. Fork and clone the repository.
2. Copy `.env.example` to `.env` and fill in Neon + Google credentials (never commit them).
3. Apply schema: `psql "$DATABASE_URL" -f db/schema.sql`
4. Install and run: `npm install` then `npm run dev`

## Guidelines

- Keep DB and Google Sheets access in server functions only.
- Run `npm run lint` and `npm run build` before opening a PR.
- Prefer focused PRs with a clear description.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
