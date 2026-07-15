# TripReport — LINE Trip Report System

Thai trucking company tool: drivers report trips in a LINE group; every
message/image is captured, AI-extracted into a structured trip record, and
shown in a role-gated web dashboard.

**Data flow (native webhook — primary path):**

```
LINE group → LINE platform → POST /api/line/webhook (Express backend)
  · verify x-line-signature (HMAC-SHA256, channel secret)
  · ack 200 immediately, then process each event async
  · download image bytes + fetch display name (channel access token)
→ services/lineMessageService.ts (processLineMessage — shared core)
  1. dedupe by lineMessageId
  2. ARCHIVE raw row → line_messages (the full-conversation record) FIRST
  3. text/image only → Claude extraction (services/tripExtract.ts, structured
     output; ANTHROPIC_MODEL, code default claude-opus-4-8)
  4. is_trip_report=false → stop after archive; stickers/etc. → "logged"
  5. trip → image → Cloudinary (tripreport/line-images) · insert trips ·
     link the archived row (isTripReport, tripId)
→ PostgreSQL → React dashboard (Clerk auth, role-gated)
```

Every message is stored (line_messages mirrors the old Google Sheet);
`trips` holds only AI-extracted trip reports. The backend now talks to LINE
directly — the channel access token + channel secret live in backend env.

**Legacy relay path:** `LINE_TripBot.gs` (Apps Script) → `POST
/api/line/ingest` (X-Ingest-Key) still works and shares the same
`processLineMessage` core, but is superseded by the native webhook and only
kept for manual replay/testing. Design spec:
`docs/superpowers/specs/2026-07-06-line-trip-report-design.md`.

## Status

Core complete and verified end to end. Repo:
https://github.com/waipod5142/tripreport_line.

Since 2026-07-12 this codebase has: (1) a **native LINE webhook**
(`/api/line/webhook`, signature-verified, async) so Apps Script + the Google
Sheet are optional; (2) a **line_messages** archive that stores the full
conversation, surfaced on a dashboard **Conversation** page; (3) an
`is_trip_report` extraction fix — the boolean is now **last** in the schema
so the model classifies after extracting (putting it first made the deployed
Haiku model drop ~50% of real trips). `claude-haiku-4-5` is only reliable
*with* this fix; the code default is `claude-opus-4-8`.

**Production rollout is the remaining step:** deploy the backend with env vars
(incl. `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`), set the LINE
console Webhook URL to `<host>/api/line/webhook`, and invite the OA into the
group.

## Stack

PostgreSQL · Drizzle ORM · Express 5 + TypeScript · Clerk · Cloudinary ·
`@anthropic-ai/sdk` · React 19 + Vite · TanStack Query v5 · Tailwind v4 +
design tokens in `frontend/src/tripreport.css` (scoped under `.cf`).
Thai primary UI. All date bucketing in Asia/Bangkok.

## Roles

`users.role`: `pending` (default — no access) | `staff` (dashboard) |
`admin` (+ user management, trip delete). New sign-ups are `pending`; the
account matching env `ADMIN_EMAIL` is auto-promoted to admin on sync.
Roles change only via `PATCH /api/users/:id/role` [admin] — there is
deliberately no self-service role/profile PATCH.

## Database (backend/src/db/schema.ts)

- `users` — id (Clerk), email, name, imageUrl, role, timestamps
- `line_drivers` — lineUserId PK, lineDisplayName (auto-learned),
  manualName (dashboard override), defaultTruck, timestamps
- `trips` — id, lineMessageId UNIQUE, lineUserId, lineGroupId, source
  (text|image), aiDriverName, truck, origin, destination, status, problem,
  notes, imageUrl, rawMessage, reportedAt (LINE event time), createdAt

Driver names resolve at read time: `manualName → aiDriverName →
lineDisplayName → lineUserId` — renaming a driver retroactively fixes all
their old trips.

## API

```
POST   /api/users/sync             upsert on sign-in (+ ADMIN_EMAIL bootstrap)
GET    /api/users/me               profile + role
GET    /api/users                  [admin]
PATCH  /api/users/:id/role         [admin]  pending | staff | admin

POST   /api/line/ingest            X-Ingest-Key auth (not Clerk) — see below

GET    /api/trips?date=&driver=&truck=   [staff|admin] newest first, driverName resolved
GET    /api/trips/summary?date=          [staff|admin] per-driver + per-truck rollup (on the fly)
DELETE /api/trips/:id                    [admin]

GET    /api/line-drivers                 [staff|admin]
PATCH  /api/line-drivers/:lineUserId     [staff|admin]  { manualName?, defaultTruck? }
```

**Ingest body:** `{ messageId, type: "text"|"image", lineUserId, lineGroupId?,
senderDisplayName?, timestamp?, text?, image?: { base64, mediaType } }` →
`200 {stored:true,tripId}` | `200 {stored:false,reason:"duplicate"|"not_trip"}`
| `401` bad key | `502` extraction failure (relay logs it; message stays in
the capture sheet for replay — replays are idempotent).

## Frontend (frontend/src/)

- `App.jsx` — sign-in screen → `Protected` gate (pending → PendingPage;
  `adminOnly` for /admin/users)
- `components/TripShell.jsx` — sidebar shell (nav + role-aware admin item)
- `pages/` — `TripsPage` (/), `SummaryPage` (/summary), `DriversPage`
  (/drivers), `AdminUsersPage` (/admin/users), `PendingPage`
- `hooks/` — `useTrips` (30 s poll) · `useTripSummary` · `useDeleteTrip` ·
  `useLineDrivers` · `useUpdateLineDriver` · `useUsers` · `useUpdateUserRole`
  · kept auth hooks: `useAuthReq`, `useUserSync`, `useMe`
- `lib/api.js` + `lib/axios.js` (Clerk token interceptor)

## Apps Script (LINE_TripBot.gs + appsscript.json)

Thin relay only — no AI, no storage. BotConfig keys: `LINE_TOKEN`,
`BACKEND_URL` (full /api/line/ingest URL), `INGEST_KEY`, `GroupReplyEnabled`,
`TARGET_GROUP_ID` (optional). Forward result is written to the capture
sheet's Forward Status column. Setup: `LINE_TripBot_SETUP.md`.

## Environment Variables

Backend (`backend/.env`, gitignored):

```
PORT=3000
DATABASE_URL=postgresql://...        # this project's OWN database
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
CLERK_PUBLISHABLE_KEY= / CLERK_SECRET_KEY=
CLOUDINARY_CLOUD_NAME= / CLOUDINARY_API_KEY= / CLOUDINARY_API_SECRET=
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=                     # optional, default claude-opus-4-8; set claude-haiku-4-5 to cut cost ~5x (verify Thai extraction quality)
LINE_INGEST_KEY=                     # long random; must match BotConfig INGEST_KEY
ADMIN_EMAIL=                         # auto-admin bootstrap account
```

Frontend (`frontend/.env`): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`.

## Commands

```bash
npm run dev --prefix backend        # nodemon + ts-node on :3000
npm run db:push --prefix backend    # drizzle-kit push (use --force for drops)
npm run dev --prefix frontend       # Vite on :5173
npm run build && npm run start      # production (root package.json)
```

## Design notes

- Extraction runs BEFORE Cloudinary upload — non-trip photos are never stored.
- The relay always returns 200 to LINE; failures are visible in the sheet's
  Forward Status column and replayable (DB dedupes by lineMessageId).
- Cloudinary failure does not lose the trip (stored with imageUrl null).
- A too-small image (e.g. 1×1 px) makes the Anthropic API return
  400 "Could not process image", which surfaces as a 502 (the correct
  extraction-failure path); real driver photos are well above the size floor.
- No test framework — verify with tsc / vite build / curl smoke tests
  (see docs/superpowers/plans/2026-07-07-line-trip-report.md).
