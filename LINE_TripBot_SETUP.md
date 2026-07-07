# LINE Trip Bot — Setup Guide (thin relay → TripReport backend)

What it does: every message in the drivers' LINE group is logged to the
`LineUserCapture` sheet, then forwarded to the TripReport backend. The
**backend** runs the Claude AI extraction, uploads pictures to **Cloudinary**,
and stores each trip in **PostgreSQL** — viewable in the TripReport web
dashboard. The sheet keeps only the raw capture log as a safety net.

## 1. Prerequisites

- The TripReport backend deployed with these env vars set:
  `ANTHROPIC_API_KEY`, `LINE_INGEST_KEY`, `ADMIN_EMAIL`, Cloudinary + Clerk +
  `DATABASE_URL` (see the repo's CLAUDE.md → Environment Variables).
- A LINE Messaging API channel (for the channel access token).

## 2. Apps Script project

1. Open your Google Sheet → Extensions → Apps Script.
2. Replace the script with `LINE_TripBot.gs` from this repo (keep only one `doPost`).
3. Project Settings → check **"Show appsscript.json manifest file"**, then
   replace its content with `appsscript.json` from this repo (drops the old
   Firebase scope; keeps spreadsheets + external requests).
4. Run `testForward` once from the editor to trigger the authorization prompt
   and verify the backend connection — the log should read `stored`.

## 3. BotConfig sheet

Add these rows (column A = key, column B = value):

| A (key)             | B (value)                                            |
|---------------------|------------------------------------------------------|
| `LINE_TOKEN`        | your LINE channel access token                       |
| `BACKEND_URL`       | `https://<your-backend-host>/api/line/ingest`        |
| `INGEST_KEY`        | the same value as `LINE_INGEST_KEY` in the backend   |
| `GroupReplyEnabled` | `FALSE` (keep the bot silent in group)               |
| `TARGET_GROUP_ID`   | *(optional)* `C...` — only forward this group        |

The old layout (token in `A1`) still works as a fallback for `LINE_TOKEN`.
`ANTHROPIC_KEY`, `FIREBASE_BUCKET`, and `MODEL` are no longer read — the AI
key and model now live in the backend env.

## 4. Deploy

1. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**.
2. Put the deployment URL into LINE Developers Console → Messaging API →
   Webhook URL, and enable "Use webhook".
3. Send a test message in the group (e.g. `รถ 71-6213 ออกจากสระบุรีไปขอนแก่น`)
   → the row appears in the TripReport dashboard within seconds, and the
   capture sheet's **Forward Status** column reads `stored`.

## 5. Where the data lives

- **TripReport dashboard** (web): trips list, daily summary per driver/truck,
  driver-name mapping, user-role admin.
- **`LineUserCapture` sheet**: raw log of every message. The **Forward
  Status** column shows `stored`, `ok (not_trip)`, `ok (duplicate)`,
  `skipped (...)`, or `error: ...` — errors stay here for manual replay
  (re-sending the same message is safe; the backend dedupes by message ID).

## Notes

- Duplicate webhook deliveries are ignored (6-hour message-ID cache in Apps
  Script + unique message ID in the database).
- Non-trip chatter (greetings, stickers, unrelated photos) is logged in the
  capture sheet but **not** stored as a trip — the AI decides via the
  `is_trip_report` flag, and non-trip photos are never uploaded to Cloudinary.
- Pictures of real trip reports are stored in Cloudinary under
  `tripreport/line-images/` and shown as thumbnails in the dashboard.
