# TripReport — LINE Trip Report System (Design)

**Date:** 2026-07-06
**Status:** Approved by user (brainstorming dialogue, 2026-07-06)

## 1. Goal

Repurpose the copied ConcreteFlow PERN app into **TripReport** (รายงานเที่ยวรถบรรทุก): truck drivers report trips in a LINE group; every message/image is captured, AI-extracted into a structured trip record, pictures stored in Cloudinary, data stored in PostgreSQL, and viewed in a role-gated web dashboard.

Decisions made with the user:

- **Source of truth:** PostgreSQL via the Express backend (not Google Sheets).
- **Backend** is already deployed publicly over HTTPS.
- **`LINE_TripBot.gs` stays** as the LINE webhook, rewritten as a **thin relay** — AI extraction moves to the backend.
- **This repo has its own separate database** — the schema can be reshaped freely.
- **Dashboard scope:** full sheet replacement — trips list, daily summary, driver manager (+ admin user-role page).
- **Access:** role-gated. New sign-ups default to a no-access role.
- **Execution:** full re-shape in one pass — delete all Productify and ConcreteFlow code while building the trip system.

## 2. Architecture

```
LINE group (drivers)
   │  webhook
   ▼
LINE_TripBot.gs (Apps Script — thin relay)
   • dedupe (6-h message-ID cache)
   • raw log → LineUserCapture sheet
   • image messages: download bytes from LINE
   • fetch sender's LINE display name (CacheService-cached)
   • POST text or base64 image → backend, X-Ingest-Key header
   ▼
Express backend  POST /api/line/ingest   (shared-secret auth, not Clerk)
   1. Claude extraction (text or vision) → structured trip JSON
   2. is_trip_report=false → stop (nothing stored, no Cloudinary upload)
   3. upload image → Cloudinary (existing cloudinaryUpload.ts, folder tripreport/line-images)
   4. upsert line_drivers (LINE userId → display name)
   5. insert trips row (lineMessageId UNIQUE = DB-level dedupe)
   ▼
PostgreSQL ──► role-gated React dashboard (Clerk auth)
               trips list · daily summary · driver manager · user-role admin
```

Key properties:

- LINE channel token lives **only** in the BotConfig sheet; the backend never calls the LINE API.
- Anthropic API key moves **out of the sheet** into backend env vars.
- Extraction runs **before** Cloudinary upload — non-trip photos are never stored.
- Google Sheets keeps only the raw `LineUserCapture` log as a safety net / replay source.

## 3. Database schema (`backend/src/db/schema.ts` — full rewrite)

### `users` (kept, trimmed)

| column | notes |
|---|---|
| `id` text PK | Clerk user id |
| `email` text NOT NULL UNIQUE | |
| `name` text | |
| `imageUrl` text | |
| `role` text NOT NULL default `"pending"` | `pending \| staff \| admin` |
| `createdAt` / `updatedAt` timestamps | as today |

- `phone` and `lineUserId` columns **dropped** (served concrete-order notifications).
- **Admin bootstrap:** in `syncUser`, if the syncing user's email equals env `ADMIN_EMAIL`, insert/update with `role = "admin"`. Prevents lockout on a fresh DB.
- **Security fix:** `PATCH /api/users/me` is deleted (it let any signed-in user set their own `role` — a self-promotion hole, and its other field `phone` is dropped). Only `PATCH /api/users/:id/role` [admin] changes roles.

### `line_drivers` (replaces the Drivers sheet)

| column | notes |
|---|---|
| `lineUserId` text PK | |
| `lineDisplayName` text | auto-learned from relay payload |
| `manualName` text nullable | user's override, editable in dashboard |
| `defaultTruck` text nullable | |
| `createdAt` / `updatedAt` timestamps | |

### `trips` (replaces the Trips sheet)

| column | notes |
|---|---|
| `id` uuid PK defaultRandom | |
| `lineMessageId` text NOT NULL UNIQUE | DB-level dedupe |
| `lineUserId` text NOT NULL | sender |
| `lineGroupId` text | |
| `source` text NOT NULL | `"text" \| "image"` |
| `aiDriverName` text | driver name as extracted from message content |
| `truck` text | e.g. `71-6213` |
| `origin` text | ต้นทาง |
| `destination` text | ปลายทาง |
| `status` text | รับงาน, ถึงต้นทาง, ขึ้นของ, ออกเดินทาง, ถึงปลายทาง, ลงของ, จบงาน, มีปัญหา, อื่นๆ |
| `problem` text | |
| `notes` text | |
| `imageUrl` text nullable | Cloudinary secure_url |
| `rawMessage` text | original text or `"(image)"` |
| `reportedAt` timestamp NOT NULL | LINE event timestamp |
| `createdAt` timestamp | |

**Driver-name resolution happens at read time** by joining `line_drivers`:
`manualName → aiDriverName → lineDisplayName → lineUserId`. Renaming a driver retroactively fixes all their old trips.

**Deleted tables:** `products`, `comments`, `concrete_products`, `orders`, `order_items`, `trucks`, `delivery_schedules` (+ all their relations and inferred types). Applied with `npm run db:push` against this repo's own database.

## 4. Backend API

### `POST /api/line/ingest` (new — `routes/lineIngestRoutes.ts`, `controllers/lineIngestController.ts`)

- **Auth:** `X-Ingest-Key` header must equal env `LINE_INGEST_KEY`. 401 otherwise. Not a Clerk route.
- **Body** (JSON; existing 10 mb body limit retained for base64 images):

```json
{
  "messageId": "...",
  "type": "text" | "image",
  "lineUserId": "U...",
  "lineGroupId": "C...",
  "senderDisplayName": "สมชาย",
  "timestamp": 1751772000000,
  "text": "รถ 71-6213 ออกจากสระบุรี...",
  "image": { "base64": "...", "mediaType": "image/jpeg" }
}
```

- **Flow:**
  1. Validate key + required fields (`messageId`, `type`, `lineUserId`, and `text` or `image` matching `type`).
  2. If a trip with this `lineMessageId` exists → `200 { stored: false, reason: "duplicate" }`.
  3. Call `tripExtract` (text or vision). Claude/API failure → `502` (relay logs it; message stays replayable from the capture sheet).
  4. `is_trip_report === false` → `200 { stored: false, reason: "not_trip" }`.
  5. If image: upload to Cloudinary folder `tripreport/line-images`. On failure, continue with `imageUrl = null` and log the error.
  6. Upsert `line_drivers` (`lineUserId`; update `lineDisplayName` if provided; never touch `manualName`/`defaultTruck`).
  7. Insert `trips` row → `200 { stored: true, tripId }`.

### `services/tripExtract.ts` (new)

- Ports the `.gs` extraction verbatim: same JSON schema (`is_trip_report`, `driver_name`, `truck`, `origin`, `destination`, `status`, `problem`, `notes`) and the same Thai-context system prompt.
- Calls the Anthropic Messages API with structured output (JSON-schema output format), text-only or image+text content.
- Env: `ANTHROPIC_API_KEY` (required for extraction), `ANTHROPIC_MODEL` (optional, default `claude-opus-4-8` — same as the `.gs` today).
- Consult the `claude-api` skill during implementation for current SDK/REST specifics.

### Trip + driver routes (new — Clerk auth + `requireRole("staff", "admin")` unless noted)

```
GET    /api/trips?date=&driver=&truck=      list, newest first; driver name resolved via line_drivers join;
                                            date = yyyy-MM-dd (Asia/Bangkok day window on reportedAt)
GET    /api/trips/summary?date=             on-the-fly rollup: per driver and per truck —
                                            report count, distinct routes (origin → destination),
                                            trucks/drivers involved, problems. No stored summary table.
DELETE /api/trips/:id                       [admin] remove a bad extraction
GET    /api/line-drivers                    driver mapping list
PATCH  /api/line-drivers/:lineUserId        edit manualName / defaultTruck
```

### Users routes (kept, trimmed)

```
POST   /api/users/sync        upsert on sign-in (+ ADMIN_EMAIL → admin bootstrap)
GET    /api/users/me          profile + role
GET    /api/users             [admin]
PATCH  /api/users/:id/role    [admin] — valid roles now: pending | staff | admin
```

`PATCH /api/users/me` deleted entirely: its only fields were `phone` (column dropped) and `role` (the self-promotion hole); name/email/imageUrl come from Clerk via `/sync`. `GET /api/users/drivers` deleted (ConcreteFlow concept; trip drivers are LINE users, not app users).

### Deleted from backend

- Routes + controllers: `productRoutes`, `commentRoutes`, `concreteProductRoutes`, `orderRoutes`, `scheduleRoutes`, `truckRoutes` and their controllers.
- `services/lineNotify.ts`, `db/seed.ts` (concrete grades), `db/queries.ts` (the user-upsert helper moves into `userController`).
- `index.ts`: mounts only `users`, `trips`, `line-drivers`, `line/ingest`; health message rebranded.
- `env.ts`: remove `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_CHANNEL_SECRET`; add `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (optional), `LINE_INGEST_KEY`, `ADMIN_EMAIL` (optional). Cloudinary + Clerk + `DATABASE_URL` + `FRONTEND_URL` stay.

Kept: `db/index.ts`, `middleware/requireAuth.ts`, `middleware/requireRole.ts`, `services/cloudinaryUpload.ts` (upload folder renamed to `tripreport/line-images`).

## 5. `LINE_TripBot.gs` rewrite (thin relay)

**Kept:** `doPost` structure; 6-hour message-ID dedupe via `CacheService`; `LineUserCapture` raw log of every message; `TARGET_GROUP_ID` filter; `GroupReplyEnabled` flag; LINE display-name fetch (result cached in `CacheService`, no Drivers sheet).

**New core:** `forwardToBackend_(event)` replaces `processTripText_`/`processTripImage_`:

- text → POST `{ messageId, type:"text", lineUserId, lineGroupId, senderDisplayName, timestamp, text }`.
- image → download bytes from `api-data.line.me` (as today) → POST with `image: { base64, mediaType }`.
- Headers: `Content-Type: application/json`, `X-Ingest-Key: <INGEST_KEY>`.
- Non-200 response → error written to a new **Forward Status** column in `LineUserCapture` (success writes `ok`). LINE always receives 200 so it doesn't retry-spam; failed messages can be replayed manually later (dedupe makes replay idempotent).

**Deleted:** Firebase upload + scope in `appsscript.json`; Claude call, schema, prompt; `Trips`/`Drivers`/`DailySummary` writers; `summarizeToday`/`summarizeYesterday`/`summarizeDate_`/`installDailyTrigger`; the concrete-shop 1:1 reply text (becomes an ID-info reply useful during setup).

**BotConfig keys:** `LINE_TOKEN`, `BACKEND_URL` (full URL of `/api/line/ingest`), `INGEST_KEY`, `GroupReplyEnabled`, `TARGET_GROUP_ID` (optional). `ANTHROPIC_KEY`, `FIREBASE_BUCKET`, `MODEL` no longer read.

**Test helper:** `testForward()` posts a sample Thai trip text to `BACKEND_URL` from the editor.

`LINE_TripBot_SETUP.md` is rewritten to match (no Firebase/Anthropic prerequisites in the sheet; backend env vars documented instead).

## 6. Frontend (dashboard)

**Branding & shell:** `ConcreteShell` → `TripShell` (same 248-px sidebar layout); `concreteflow.css` → `tripreport.css` (tokens unchanged); app name **TripReport**, sub-brand **รายงานเที่ยวรถบรรทุก**. Demo role switcher deleted — roles come from `useMe`.

**Access model:** all routes require sign-in; users with role `pending` see a "รอสิทธิ์การใช้งาน — ติดต่อผู้ดูแล" page instead of any data; `/admin/users` additionally requires `admin`.

| Route | Page | Contents |
|---|---|---|
| `/` | `TripsPage` | Date filter (default today) + driver/truck dropdowns; rows: time, driver, truck, ต้นทาง → ปลายทาง, status chip, problem highlighted (danger tint), photo thumbnail → full-size modal, expandable raw message. Polls every 30 s (`refetchInterval`). |
| `/summary` | `SummaryPage` | Date picker; two tables — per driver and per truck: report count, routes, trucks/drivers, problems. |
| `/drivers` | `DriversPage` | `line_drivers` list; inline edit of ชื่อจริง (manualName) + รถประจำ (defaultTruck). |
| `/admin/users` | `AdminUsersPage` | [admin] user list + role dropdown (pending/staff/admin). |

**Kept:** `lib/axios.js`, `hooks/useAuthReq.js`, `hooks/useUserSync.js`, `hooks/useMe.js`, `components/LoadingSpinner.jsx`.

**Rewritten:** `lib/api.js` (trips, summary, line-drivers, users); new hooks `useTrips`, `useTripSummary`, `useLineDrivers`, `useUsers` (+ mutations `useUpdateLineDriver`, `useUpdateUserRole`, `useDeleteTrip`); `App.jsx` routes as above.

**Deleted:** pages `HomePage`, `ProductPage`, `CreatePage`, `EditProductPage`, `ProfilePage`, `OrderPage`, `MyOrdersPage`, `DispatcherDashboard`, `TruckView`; components `Navbar`, `ProductCard`, `CommentsSection`, `EditProductForm`, `ThemeSelector`, `ConcreteShell` (replaced); hooks `useProducts`, `useComments`, `useConcreteProducts`, `useOrders`, `useDispatcher`; `concreteflow.css` (replaced). Frontend deps `@cloudinary/react` / `@cloudinary/url-gen` removed if unused after the rewrite (plain `<img>` on `secure_url` suffices).

`CLAUDE.md` and `README.md` are rewritten for TripReport (the ConcreteFlow content no longer describes this repo).

## 7. Error handling

| Failure | Behaviour |
|---|---|
| Backend unreachable / non-200 from ingest | Relay logs error in Forward Status column; message remains in capture sheet for manual replay; LINE still gets 200. |
| Claude API error | Ingest returns 502; nothing stored; replayable. |
| Extraction says not a trip | `200 { stored: false }`; nothing stored. |
| Cloudinary upload error | Trip stored with `imageUrl = null`; error logged server-side. |
| Duplicate delivery | Relay 6-h cache first; `trips.lineMessageId` UNIQUE as backstop → `stored: false, duplicate`. |
| LINE image download fails in relay | Error logged to Forward Status; skip. |

## 8. Testing & rollout

**Testing (no test framework in repo; staying pragmatic):**

- `curl` smoke tests against local `/api/line/ingest`: Thai trip text, image, non-trip chatter, duplicate `messageId`, wrong ingest key.
- `testForward()` from the Apps Script editor against the deployed backend.
- Dashboard verified manually against the dev backend (pending vs staff vs admin accounts).

**Rollout order:**

1. `npm run db:push --prefix backend` (new schema, old tables dropped — own DB).
2. Deploy backend with new env vars: `ANTHROPIC_API_KEY`, `LINE_INGEST_KEY` (generate a long random string), `ADMIN_EMAIL`; remove LINE channel vars.
3. Paste rewritten `LINE_TripBot.gs`; update `appsscript.json` (drop Firebase scope); add `BACKEND_URL` + `INGEST_KEY` rows to BotConfig; redeploy the web app.
4. Send a test message in the LINE group → confirm row in dashboard + picture in Cloudinary.
5. Promote real staff accounts via `/admin/users`.
