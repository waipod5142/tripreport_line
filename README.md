# TripReport — LINE Trip Report System

Drivers report trips in a LINE group → a thin Apps Script relay forwards each
message to the Express backend → Claude extracts driver / truck / origin /
destination / status / problem → pictures go to Cloudinary, trips go to
PostgreSQL → staff view everything in a role-gated React dashboard.

- Setup for the LINE bot: [`LINE_TripBot_SETUP.md`](LINE_TripBot_SETUP.md)
- Architecture & API reference: [`CLAUDE.md`](CLAUDE.md)
- Design spec: `docs/superpowers/specs/2026-07-06-line-trip-report-design.md`

## Quick start (development)

```bash
# backend  (needs backend/.env — see CLAUDE.md → Environment Variables)
cd backend && npm install && npm run db:push && npm run dev

# frontend (needs frontend/.env)
cd frontend && npm install && npm run dev
```
