# Security Policy

## Reporting a Vulnerability

Please report security issues privately to **net2outlawzz@gmail.com** with the subject `[SECURITY] salary-creator`.

Include a clear description, steps to reproduce, and potential impact. Do not open public issues for security vulnerabilities.

## Scope notes

- Never commit `.env` or Google Service Account private keys.
- Database access and Sheets credentials must remain server-side only.
- `DATABASE_URL`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` belong in Vercel (or local `.env`) only.
