# TripReport — LINE Trip Report System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the copied ConcreteFlow PERN app into TripReport: a thin-relay LINE bot forwards driver messages to the Express backend, which runs Claude extraction, stores pictures in Cloudinary and trips in Postgres, viewed in a role-gated React dashboard.

**Architecture:** LINE group → `LINE_TripBot.gs` (Apps Script thin relay: dedupe, raw sheet log, image download, display-name fetch) → `POST /api/line/ingest` (shared `X-Ingest-Key` secret) → Claude extraction first, then Cloudinary upload, then a `trips` row. All Productify + ConcreteFlow code is deleted in the same pass; Clerk auth core is kept untouched.

**Tech Stack:** PostgreSQL + Drizzle ORM, Express 5 + TypeScript (commonjs), Clerk, Cloudinary, `@anthropic-ai/sdk`, React 19 + Vite + TanStack Query v5, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-07-06-line-trip-report-design.md` — the authoritative design. Read it if any task detail seems ambiguous.

## Global Constraints

- Thai is the primary UI language, English secondary (labels as written in this plan — copy verbatim).
- Keep the Clerk auth core untouched: `frontend/src/hooks/useAuthReq.js`, `useUserSync.js`, `lib/axios.js`, `backend/src/middleware/requireAuth.ts`, `requireRole.ts`, `clerkMiddleware()` in `index.ts`.
- Roles: `pending` (default for new sign-ups, no access) | `staff` | `admin`. `PATCH /api/users/me` is deleted entirely (self-promotion hole).
- Anthropic model: default `claude-opus-4-8`, overridable via env `ANTHROPIC_MODEL`. Use the official `@anthropic-ai/sdk` — never raw fetch to api.anthropic.com.
- All date bucketing uses timezone `Asia/Bangkok` (+07:00).
- Secrets live in `backend/.env` (gitignored) — never commit them.
- No test framework is added. Verification per task = `tsc` compile / `vite build` / `curl` smoke tests with expected output, per the spec's Testing section.
- Design tokens are unchanged: `concreteflow.css` is renamed to `tripreport.css`; the `.cf` scope class is intentionally retained (renaming it would touch every styled element for zero benefit).
- Backend is `"type": "commonjs"`; keep imports in the existing style (`import x from "y"` compiled by ts-node/tsc).
- Commit after every task with the message given in its final step. Use `git rm` for deletions so commits stay clean.

---

### Task 1: Backend re-shape — strip ConcreteFlow/Productify, rewrite schema, users, env, entrypoint

**Files:**
- Delete: `backend/src/routes/productRoutes.ts`, `backend/src/routes/commentRoutes.ts`, `backend/src/routes/concreteProductRoutes.ts`, `backend/src/routes/orderRoutes.ts`, `backend/src/routes/scheduleRoutes.ts`, `backend/src/routes/truckRoutes.ts`
- Delete: `backend/src/controllers/productController.ts`, `backend/src/controllers/commentController.ts`, `backend/src/controllers/concreteProductController.ts`, `backend/src/controllers/orderController.ts`, `backend/src/controllers/scheduleController.ts`, `backend/src/controllers/truckController.ts`
- Delete: `backend/src/services/lineNotify.ts`, `backend/src/db/seed.ts`, `backend/src/db/queries.ts`
- Rewrite: `backend/src/db/schema.ts`, `backend/src/controllers/userController.ts`, `backend/src/routes/userRoutes.ts`, `backend/src/config/env.ts`, `backend/src/index.ts`
- Modify: `backend/src/services/cloudinaryUpload.ts` (folder rename), `backend/package.json` (drop `db:seed` script)

**Interfaces:**
- Consumes: existing `db` client (`backend/src/db/index.ts`), `requireRole` middleware (unchanged).
- Produces (later tasks rely on these exact names):
  - Schema exports: `users`, `lineDrivers`, `trips`, `tripsRelations`, `lineDriversRelations`; types `User`, `NewUser`, `LineDriver`, `NewLineDriver`, `Trip`, `NewTrip`.
  - `trips` relation name is **`driver`** (`db.query.trips.findMany({ with: { driver: true } })`).
  - `ENV` keys: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `LINE_INGEST_KEY`, `ADMIN_EMAIL` (plus the retained keys).
  - Routes mounted in `index.ts`: `/api/users`, `/api/trips`, `/api/line-drivers`, `/api/line` — the latter three files are created in Tasks 3–4, so `index.ts` in **this** task mounts only `/api/users` (the other mounts are added in their own tasks).

- [ ] **Step 1: Delete the dead backend files**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git rm backend/src/routes/productRoutes.ts backend/src/routes/commentRoutes.ts \
  backend/src/routes/concreteProductRoutes.ts backend/src/routes/orderRoutes.ts \
  backend/src/routes/scheduleRoutes.ts backend/src/routes/truckRoutes.ts \
  backend/src/controllers/productController.ts backend/src/controllers/commentController.ts \
  backend/src/controllers/concreteProductController.ts backend/src/controllers/orderController.ts \
  backend/src/controllers/scheduleController.ts backend/src/controllers/truckController.ts \
  backend/src/services/lineNotify.ts backend/src/db/seed.ts backend/src/db/queries.ts
```

- [ ] **Step 2: Rewrite `backend/src/db/schema.ts`** (full file replacement)

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // clerkId
  email: text("email").notNull().unique(),
  name: text("name"),
  imageUrl: text("image_url"),
  role: text("role").notNull().default("pending"), // pending | staff | admin
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// LINE group members who report trips (not app users) — replaces the Drivers sheet
export const lineDrivers = pgTable("line_drivers", {
  lineUserId: text("line_user_id").primaryKey(),
  lineDisplayName: text("line_display_name"), // auto-learned from the relay
  manualName: text("manual_name"),            // dashboard override — wins over everything
  defaultTruck: text("default_truck"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// One row per AI-extracted trip report — replaces the Trips sheet
export const trips = pgTable("trips", {
  id: uuid("id").defaultRandom().primaryKey(),
  lineMessageId: text("line_message_id").notNull().unique(), // DB-level dedupe
  lineUserId: text("line_user_id").notNull(),
  lineGroupId: text("line_group_id"),
  source: text("source").notNull(), // "text" | "image"
  aiDriverName: text("ai_driver_name"),
  truck: text("truck"),             // e.g. 71-6213
  origin: text("origin"),           // ต้นทาง
  destination: text("destination"), // ปลายทาง
  status: text("status"),           // รับงาน | ถึงต้นทาง | ขึ้นของ | ออกเดินทาง | ถึงปลายทาง | ลงของ | จบงาน | มีปัญหา | อื่นๆ
  problem: text("problem"),
  notes: text("notes"),
  imageUrl: text("image_url"),      // Cloudinary secure_url, null for text reports or failed uploads
  rawMessage: text("raw_message"),
  reportedAt: timestamp("reported_at", { mode: "date" }).notNull().defaultNow(), // LINE event time
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const tripsRelations = relations(trips, ({ one }) => ({
  driver: one(lineDrivers, { fields: [trips.lineUserId], references: [lineDrivers.lineUserId] }),
}));

export const lineDriversRelations = relations(lineDrivers, ({ many }) => ({
  trips: many(trips),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type LineDriver = typeof lineDrivers.$inferSelect;
export type NewLineDriver = typeof lineDrivers.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
```

- [ ] **Step 3: Rewrite `backend/src/config/env.ts`** (full file replacement)

```ts
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const ENV = {
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  LINE_INGEST_KEY: process.env.LINE_INGEST_KEY,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
};
```

- [ ] **Step 4: Add the new env vars to `backend/.env`** (local only — never committed)

Append these lines to `backend/.env` and delete the `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` lines:

```
ANTHROPIC_API_KEY=<the user's sk-ant-... key — ask if not present>
LINE_INGEST_KEY=<output of: openssl rand -hex 32>
ADMIN_EMAIL=waipody@gmail.com
```

Generate the ingest key with `openssl rand -hex 32`. `ANTHROPIC_MODEL` stays unset (defaults to `claude-opus-4-8`).

- [ ] **Step 5: Rewrite `backend/src/controllers/userController.ts`** (full file replacement — `PATCH /me` and `getDrivers` are gone; `queries.ts` helper is inlined; ADMIN_EMAIL bootstrap added)

```ts
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "../db";
import { users } from "../db/schema";
import { ENV } from "../config/env";

const VALID_ROLES = ["pending", "staff", "admin"];

export async function syncUser(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { email, name, imageUrl } = req.body;
    if (!email || !name || !imageUrl) {
      return res.status(400).json({ error: "Email, name, and imageUrl are required" });
    }

    // Bootstrap: the ADMIN_EMAIL account is always admin, so a fresh DB can't lock you out
    const isBootstrapAdmin =
      !!ENV.ADMIN_EMAIL && String(email).toLowerCase() === ENV.ADMIN_EMAIL.toLowerCase();
    const profile = { email, name, imageUrl };

    const [user] = await db
      .insert(users)
      .values({ id: userId, ...profile, ...(isBootstrapAdmin ? { role: "admin" } : {}) })
      .onConflictDoUpdate({
        target: users.id,
        set: { ...profile, ...(isBootstrapAdmin ? { role: "admin" } : {}) },
      })
      .returning();

    res.status(200).json(user);
  } catch (error) {
    console.error("Error syncing user:", error);
    res.status(500).json({ error: "Failed to sync user" });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

export async function getAllUsers(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(users).orderBy(users.createdAt);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
}

export async function updateUserRole(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "User not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
}
```

- [ ] **Step 6: Rewrite `backend/src/routes/userRoutes.ts`** (full file replacement)

```ts
import { Router } from "express";
import { syncUser, getMe, getAllUsers, updateUserRole } from "../controllers/userController";
import { requireAuth } from "@clerk/express";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/sync", requireAuth(), syncUser);
router.get("/me", requireAuth(), getMe);
router.get("/", requireRole("admin"), getAllUsers);
router.patch("/:id/role", requireRole("admin"), updateUserRole);

export default router;
```

- [ ] **Step 7: Rewrite `backend/src/index.ts`** (full file replacement — Tasks 3–4 will add three more route mounts here)

```ts
import express from "express";
import cors from "cors";
import path from "path";

import { ENV } from "./config/env";
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/userRoutes";

const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
app.use(clerkMiddleware()); // attaches auth to req; does not block unauthenticated requests
// 25mb: LINE photos arrive as base64 (~1.33x the binary size)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({
    message: "TripReport API — PostgreSQL · Drizzle · Clerk · Claude",
    endpoints: {
      users: "/api/users",
      trips: "/api/trips",
      lineDrivers: "/api/line-drivers",
      ingest: "/api/line/ingest",
    },
  });
});

app.use("/api/users", userRoutes);

if (ENV.NODE_ENV === "production") {
  const __dirname = path.resolve();

  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
```

- [ ] **Step 8: Rename the Cloudinary folder in `backend/src/services/cloudinaryUpload.ts`**

Change the `folder` option in `uploadImage` (keep the rest of the file, including `deleteImages`, unchanged):

```ts
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: "tripreport/line-images",
    resource_type: "image",
  });
```

Also update the comment example string `"concreteflow/site-photos/abc123"` → `"tripreport/line-images/abc123"`.

- [ ] **Step 9: Drop the `db:seed` script from `backend/package.json`**

Remove the line `"db:seed": "ts-node src/db/seed.ts",` from `scripts`.

- [ ] **Step 10: Verify it compiles**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx tsc --noEmit
```
Expected: no output (exit 0). If it reports missing modules, a deleted file is still imported somewhere — fix the import.

- [ ] **Step 11: Push the new schema (drops the 7 old tables — this DB belongs to this project only)**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx drizzle-kit push --force
```
Expected: reports creating `line_drivers` and `trips`, altering `users` (drop `phone`, `line_user_id`, default `pending`), dropping `products`, `comments`, `concrete_products`, `orders`, `order_items`, `trucks`, `delivery_schedules`.

- [ ] **Step 12: Boot and smoke-test**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npm run dev &
sleep 4 && curl -s http://localhost:3000/api/health
```
Expected: `{"message":"TripReport API — PostgreSQL · Drizzle · Clerk · Claude", ...}`. Then stop the dev server (`kill %1`).

- [ ] **Step 13: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add -A backend
git commit -m "Re-shape backend: drop ConcreteFlow/Productify, new users/line_drivers/trips schema"
```

---

### Task 2: Claude extraction service (`tripExtract.ts`)

**Files:**
- Create: `backend/src/services/tripExtract.ts`
- Modify: `backend/package.json` (+ `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `ENV.ANTHROPIC_API_KEY`, `ENV.ANTHROPIC_MODEL`.
- Produces:
  - `type TripExtraction = { is_trip_report: boolean; driver_name: string; truck: string; origin: string; destination: string; status: string; problem: string; notes: string }`
  - `extractTrip(input: { text?: string; image?: { base64: string; mediaType: string } }): Promise<TripExtraction | null>` — throws on API/config errors; returns `null` only when Claude refuses or returns unparseable output.

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk --prefix /Users/waipodyeamkeaw/TripReport_Line/backend
```

- [ ] **Step 2: Create `backend/src/services/tripExtract.ts`** (schema + system prompt ported verbatim from the old `LINE_TripBot.gs`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "../config/env";

const DEFAULT_MODEL = "claude-opus-4-8";

// Ported verbatim from LINE_TripBot.gs — what the AI must return for every message/image
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    is_trip_report: {
      type: "boolean",
      description:
        "true only if the message/image contains information about a truck trip, job assignment, loading/unloading, or a dispatching problem",
    },
    driver_name: { type: "string", description: "Driver name if mentioned, else empty string" },
    truck: { type: "string", description: "Truck plate/number, e.g. 71-6213. Empty string if not found" },
    origin: { type: "string", description: "Trip origin (ต้นทาง). Empty string if not found" },
    destination: { type: "string", description: "Trip destination (ปลายทาง). Empty string if not found" },
    status: {
      type: "string",
      description: "One of: รับงาน, ถึงต้นทาง, ขึ้นของ, ออกเดินทาง, ถึงปลายทาง, ลงของ, จบงาน, มีปัญหา, อื่นๆ",
    },
    problem: { type: "string", description: "Problem/challenge reported (ปัญหา), empty string if none" },
    notes: { type: "string", description: "Other useful details: cargo, weight, document numbers, times" },
  },
  required: ["is_trip_report", "driver_name", "truck", "origin", "destination", "status", "problem", "notes"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You read messages from a Thai LINE group where truck drivers and supervisors",
  "report job progress: trips, loading/unloading, and problems during dispatching.",
  "Messages are mostly Thai, sometimes mixed with English. Images may be photos of",
  "delivery documents, weight slips, GPS screens, truck/cargo photos, or handwritten notes.",
  "Extract the trip information into the required JSON shape.",
  "Truck plates look like 71-6213 or 72-5535. Use an empty string for anything not present.",
  "If the content is just chat/greetings/stickers with no job information, set is_trip_report to false.",
].join(" ");

export type TripExtraction = {
  is_trip_report: boolean;
  driver_name: string;
  truck: string;
  origin: string;
  destination: string;
  status: string;
  problem: string;
  notes: string;
};

const SUPPORTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof SUPPORTED_MEDIA)[number];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!ENV.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!client) client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });
  return client;
}

export async function extractTrip(input: {
  text?: string;
  image?: { base64: string; mediaType: string };
}): Promise<TripExtraction | null> {
  const anthropic = getClient();

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    const mediaType: MediaType = (SUPPORTED_MEDIA as readonly string[]).includes(input.image.mediaType)
      ? (input.image.mediaType as MediaType)
      : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: input.image.base64 },
    });
    content.push({
      type: "text",
      text: "Extract the trip information from this image sent in the drivers' LINE group.",
    });
  } else {
    content.push({
      type: "text",
      text: "Extract the trip information from this LINE message:\n\n" + (input.text ?? ""),
    });
  }

  const response = await anthropic.messages.create({
    model: ENV.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    messages: [{ role: "user", content }],
  });

  // Check stop_reason before reading content — a refusal has empty/partial content
  if (response.stop_reason === "refusal") {
    console.warn("Claude refused the extraction request");
    return null;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  try {
    return JSON.parse(textBlock.text) as TripExtraction;
  } catch {
    console.error("Failed to parse extraction JSON:", textBlock.text);
    return null;
  }
}
```

> If `tsc` rejects the `output_config` typing on the installed SDK version, pass it as the documented wire shape via the request options escape hatch is NOT needed — instead update the SDK (`npm install @anthropic-ai/sdk@latest`) which types `output_config.format`. Do not switch to raw fetch.

- [ ] **Step 3: Verify compile**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Verify a live extraction (uses `ANTHROPIC_API_KEY` from `backend/.env`)**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx ts-node -e "require('./src/services/tripExtract').extractTrip({ text: 'รถ 71-6213 ออกจากโรงงานสระบุรีไปส่งปูนที่ขอนแก่นครับ ถึงประมาณบ่ายสอง' }).then((r) => console.log(JSON.stringify(r, null, 2)))"
```
Expected JSON: `is_trip_report: true`, `truck: "71-6213"`, `origin` containing `สระบุรี`, `destination` containing `ขอนแก่น`.

- [ ] **Step 5: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add backend/src/services/tripExtract.ts backend/package.json backend/package-lock.json
git commit -m "Add Claude trip-extraction service (structured output, text + vision)"
```

---

### Task 3: LINE ingest endpoint (`POST /api/line/ingest`)

**Files:**
- Create: `backend/src/controllers/lineIngestController.ts`, `backend/src/routes/lineIngestRoutes.ts`
- Modify: `backend/src/index.ts` (mount `/api/line`)

**Interfaces:**
- Consumes: `extractTrip` (Task 2), `uploadImage` from `services/cloudinaryUpload.ts`, schema `trips`/`lineDrivers` (Task 1), `ENV.LINE_INGEST_KEY`.
- Produces the ingest contract the `.gs` relay (Task 5) calls:
  - Request: `POST /api/line/ingest`, header `X-Ingest-Key`, JSON body `{ messageId, type: "text"|"image", lineUserId, lineGroupId?, senderDisplayName?, timestamp?, text?, image?: { base64, mediaType } }`
  - Responses: `401 {error}` bad key · `400 {error}` bad body · `200 {stored:false, reason:"duplicate"|"not_trip"}` · `502 {error}` extraction failure · `200 {stored:true, tripId}`

- [ ] **Step 1: Create `backend/src/controllers/lineIngestController.ts`**

```ts
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips, lineDrivers } from "../db/schema";
import { ENV } from "../config/env";
import { extractTrip } from "../services/tripExtract";
import { uploadImage } from "../services/cloudinaryUpload";

export async function ingestLineMessage(req: Request, res: Response) {
  try {
    if (!ENV.LINE_INGEST_KEY || req.get("x-ingest-key") !== ENV.LINE_INGEST_KEY) {
      return res.status(401).json({ error: "Invalid ingest key" });
    }

    const { messageId, type, lineUserId, lineGroupId, senderDisplayName, timestamp, text, image } =
      req.body ?? {};

    if (!messageId || !lineUserId || (type !== "text" && type !== "image")) {
      return res.status(400).json({ error: "messageId, lineUserId and type (text|image) are required" });
    }
    if (type === "text" && !String(text ?? "").trim()) {
      return res.status(400).json({ error: "text is required for type=text" });
    }
    if (type === "image" && !image?.base64) {
      return res.status(400).json({ error: "image.base64 is required for type=image" });
    }

    // Dedupe: the relay's cache is the first line; this is the DB backstop
    const [existing] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.lineMessageId, String(messageId)));
    if (existing) return res.status(200).json({ stored: false, reason: "duplicate" });

    // Extraction runs BEFORE any upload, so non-trip photos never reach Cloudinary
    let extracted;
    try {
      extracted = await extractTrip(
        type === "text"
          ? { text: String(text) }
          : { image: { base64: image.base64, mediaType: image.mediaType || "image/jpeg" } }
      );
    } catch (err) {
      console.error("AI extraction failed:", err);
      return res.status(502).json({ error: "AI extraction failed" });
    }
    if (!extracted) return res.status(502).json({ error: "AI extraction returned no result" });
    if (!extracted.is_trip_report) return res.status(200).json({ stored: false, reason: "not_trip" });

    let imageUrl: string | null = null;
    if (type === "image") {
      try {
        imageUrl = await uploadImage(`data:${image.mediaType || "image/jpeg"};base64,${image.base64}`);
      } catch (err) {
        console.error("Cloudinary upload failed — storing trip without image:", err);
      }
    }

    // Learn/refresh the sender's display name; never touch manualName/defaultTruck
    if (senderDisplayName) {
      await db
        .insert(lineDrivers)
        .values({ lineUserId: String(lineUserId), lineDisplayName: String(senderDisplayName) })
        .onConflictDoUpdate({
          target: lineDrivers.lineUserId,
          set: { lineDisplayName: String(senderDisplayName) },
        });
    } else {
      await db.insert(lineDrivers).values({ lineUserId: String(lineUserId) }).onConflictDoNothing();
    }

    try {
      const [trip] = await db
        .insert(trips)
        .values({
          lineMessageId: String(messageId),
          lineUserId: String(lineUserId),
          lineGroupId: lineGroupId ? String(lineGroupId) : null,
          source: type,
          aiDriverName: extracted.driver_name || null,
          truck: extracted.truck || null,
          origin: extracted.origin || null,
          destination: extracted.destination || null,
          status: extracted.status || null,
          problem: extracted.problem || null,
          notes: extracted.notes || null,
          imageUrl,
          rawMessage: type === "text" ? String(text) : "(image)",
          reportedAt: timestamp ? new Date(Number(timestamp)) : new Date(),
        })
        .returning();

      return res.status(200).json({ stored: true, tripId: trip.id });
    } catch (err: unknown) {
      // Unique-violation race: two deliveries passed the dedupe check simultaneously
      if ((err as { code?: string }).code === "23505") {
        return res.status(200).json({ stored: false, reason: "duplicate" });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error ingesting LINE message:", error);
    res.status(500).json({ error: "Failed to ingest message" });
  }
}
```

- [ ] **Step 2: Create `backend/src/routes/lineIngestRoutes.ts`**

```ts
import { Router } from "express";
import { ingestLineMessage } from "../controllers/lineIngestController";

const router = Router();

// Authenticated by X-Ingest-Key inside the controller — not a Clerk route
router.post("/ingest", ingestLineMessage);

export default router;
```

- [ ] **Step 3: Mount it in `backend/src/index.ts`**

Add the import below `userRoutes` and the mount below `/api/users`:

```ts
import lineIngestRoutes from "./routes/lineIngestRoutes";
```
```ts
app.use("/api/line", lineIngestRoutes);
```

- [ ] **Step 4: Compile check**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Smoke-test the endpoint** (dev server running: `npm run dev` in `backend/`)

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
KEY=$(grep '^LINE_INGEST_KEY=' backend/.env | cut -d= -f2)

# 5a — wrong key → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/line/ingest \
  -H "Content-Type: application/json" -H "X-Ingest-Key: wrong" -d '{}'
# Expected: 401

# 5b — Thai trip text → stored
curl -s -X POST http://localhost:3000/api/line/ingest \
  -H "Content-Type: application/json" -H "X-Ingest-Key: $KEY" \
  -d "{\"messageId\":\"smoke-1\",\"type\":\"text\",\"lineUserId\":\"Usmoketest1\",\"senderDisplayName\":\"สมชาย ทดสอบ\",\"timestamp\":$(date +%s)000,\"text\":\"รถ 71-6213 ออกจากโรงงานสระบุรีไปส่งปูนที่ขอนแก่นครับ ถึงประมาณบ่ายสอง\"}"
# Expected: {"stored":true,"tripId":"<uuid>"}

# 5c — same messageId again → duplicate (also proves the row persisted)
# (re-run the exact 5b command)
# Expected: {"stored":false,"reason":"duplicate"}

# 5d — non-trip chatter → not stored
curl -s -X POST http://localhost:3000/api/line/ingest \
  -H "Content-Type: application/json" -H "X-Ingest-Key: $KEY" \
  -d "{\"messageId\":\"smoke-2\",\"type\":\"text\",\"lineUserId\":\"Usmoketest1\",\"timestamp\":$(date +%s)000,\"text\":\"สวัสดีครับ ทานข้าวหรือยัง\"}"
# Expected: {"stored":false,"reason":"not_trip"}

# 5e — image path (1x1 white JPEG; expect not_trip — proves the vision path runs end-to-end)
curl -s -X POST http://localhost:3000/api/line/ingest \
  -H "Content-Type: application/json" -H "X-Ingest-Key: $KEY" \
  -d "{\"messageId\":\"smoke-3\",\"type\":\"image\",\"lineUserId\":\"Usmoketest1\",\"timestamp\":$(date +%s)000,\"image\":{\"mediaType\":\"image/jpeg\",\"base64\":\"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==\"}}"
# Expected: {"stored":false,"reason":"not_trip"}   (a 502 here means the image failed to decode — investigate)
```

> The Cloudinary branch only fires for images that ARE trips; it gets its real end-to-end test in the rollout step (Task 10) with an actual delivery-document photo. `uploadImage` itself is proven code from ConcreteFlow.

- [ ] **Step 6: Delete the smoke rows so real data starts clean**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx ts-node -e "
const { db } = require('./src/db');
const { trips, lineDrivers } = require('./src/db/schema');
const { eq, like } = require('drizzle-orm');
Promise.all([
  db.delete(trips).where(like(trips.lineMessageId, 'smoke-%')),
  db.delete(lineDrivers).where(eq(lineDrivers.lineUserId, 'Usmoketest1')),
]).then(() => { console.log('cleaned'); process.exit(0); });"
```
Expected: `cleaned`.

- [ ] **Step 7: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add backend/src/controllers/lineIngestController.ts backend/src/routes/lineIngestRoutes.ts backend/src/index.ts
git commit -m "Add LINE ingest endpoint: X-Ingest-Key auth, extract-then-upload, DB dedupe"
```

---

### Task 4: Trip + line-driver read/manage routes

**Files:**
- Create: `backend/src/controllers/tripController.ts`, `backend/src/routes/tripRoutes.ts`, `backend/src/controllers/lineDriverController.ts`, `backend/src/routes/lineDriverRoutes.ts`
- Modify: `backend/src/index.ts` (mount `/api/trips`, `/api/line-drivers`)

**Interfaces:**
- Consumes: schema + relations (Task 1), `requireRole`.
- Produces (frontend Tasks 6–9 rely on these exact shapes):
  - `GET /api/trips?date=YYYY-MM-DD&driver=&truck=` [staff|admin] → `Trip[]` each augmented with `driverName: string` and `driver: LineDriver | null`, newest first, max 300.
  - `GET /api/trips/summary?date=YYYY-MM-DD` [staff|admin] → `{ date, byDriver: Array<{name, count, routes: string[], trucks: string[], problems: string[]}>, byTruck: Array<{name, count, routes: string[], drivers: string[], problems: string[]}> }`
  - `DELETE /api/trips/:id` [admin] → deleted trip row.
  - `GET /api/line-drivers` [staff|admin] → `LineDriver[]`.
  - `PATCH /api/line-drivers/:lineUserId` [staff|admin], body `{ manualName?, defaultTruck? }` → updated row.

- [ ] **Step 1: Create `backend/src/controllers/tripController.ts`**

```ts
import type { Request, Response } from "express";
import { and, desc, eq, gte, ilike, lt } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

/** yyyy-MM-dd for "today" in Asia/Bangkok */
function bkkToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** [start, end) of a Bangkok calendar day */
function bkkDayWindow(date: string): [Date, Date] {
  const start = new Date(`${date}T00:00:00+07:00`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

/** manualName → aiDriverName → lineDisplayName → lineUserId */
function resolveDriverName(t: {
  aiDriverName: string | null;
  lineUserId: string;
  driver: { manualName: string | null; lineDisplayName: string | null } | null;
}): string {
  return t.driver?.manualName || t.aiDriverName || t.driver?.lineDisplayName || t.lineUserId;
}

export async function getTrips(req: Request, res: Response) {
  try {
    const { date, driver, truck } = req.query as { date?: string; driver?: string; truck?: string };

    const conds = [];
    if (date) {
      const [start, end] = bkkDayWindow(date);
      conds.push(gte(trips.reportedAt, start), lt(trips.reportedAt, end));
    }
    if (truck) conds.push(ilike(trips.truck, `%${truck}%`));

    const rows = await db.query.trips.findMany({
      where: conds.length ? and(...conds) : undefined,
      with: { driver: true },
      orderBy: [desc(trips.reportedAt)],
      limit: 300,
    });

    const resolved = rows.map((r) => ({ ...r, driverName: resolveDriverName(r) }));
    const filtered = driver ? resolved.filter((r) => r.driverName.includes(driver)) : resolved;

    res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
}

export async function getTripSummary(req: Request, res: Response) {
  try {
    const date = (req.query.date as string) || bkkToday();
    const [start, end] = bkkDayWindow(date);

    const rows = await db.query.trips.findMany({
      where: and(gte(trips.reportedAt, start), lt(trips.reportedAt, end)),
      with: { driver: true },
    });

    type Group = { name: string; count: number; routes: string[]; problems: string[] } & Record<string, unknown>;
    const byDriver: Record<string, Group> = {};
    const byTruck: Record<string, Group> = {};

    for (const t of rows) {
      const driverName = resolveDriverName(t);
      const truckName = t.truck || "(ไม่ทราบ)";
      const route = t.origin || t.destination ? `${t.origin || "?"} → ${t.destination || "?"}` : "";

      const add = (map: Record<string, Group>, key: string, other: string | null, otherKey: string) => {
        if (!map[key]) map[key] = { name: key, count: 0, routes: [], [otherKey]: [], problems: [] };
        const g = map[key];
        g.count++;
        if (route && !g.routes.includes(route)) g.routes.push(route);
        const list = g[otherKey] as string[];
        if (other && other !== "(ไม่ทราบ)" && !list.includes(other)) list.push(other);
        if (t.problem && !g.problems.includes(t.problem)) g.problems.push(t.problem);
      };

      add(byDriver, driverName, t.truck, "trucks");
      add(byTruck, truckName, driverName, "drivers");
    }

    res.status(200).json({ date, byDriver: Object.values(byDriver), byTruck: Object.values(byTruck) });
  } catch (error) {
    console.error("Error building trip summary:", error);
    res.status(500).json({ error: "Failed to build summary" });
  }
}

export async function deleteTrip(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(trips).where(eq(trips.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Trip not found" });
    res.status(200).json(deleted);
  } catch (error) {
    console.error("Error deleting trip:", error);
    res.status(500).json({ error: "Failed to delete trip" });
  }
}
```

- [ ] **Step 2: Create `backend/src/routes/tripRoutes.ts`**

```ts
import { Router } from "express";
import { getTrips, getTripSummary, deleteTrip } from "../controllers/tripController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", requireRole(["staff", "admin"]), getTrips);
router.get("/summary", requireRole(["staff", "admin"]), getTripSummary);
router.delete("/:id", requireRole("admin"), deleteTrip);

export default router;
```

- [ ] **Step 3: Create `backend/src/controllers/lineDriverController.ts`**

```ts
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { lineDrivers } from "../db/schema";

export async function getLineDrivers(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(lineDrivers).orderBy(lineDrivers.createdAt);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching line drivers:", error);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
}

export async function updateLineDriver(req: Request, res: Response) {
  try {
    const { lineUserId } = req.params;
    const { manualName, defaultTruck } = req.body;

    const patch: Record<string, string | null> = {};
    if (manualName !== undefined) patch.manualName = String(manualName).trim() || null;
    if (defaultTruck !== undefined) patch.defaultTruck = String(defaultTruck).trim() || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update" });

    const [updated] = await db
      .update(lineDrivers)
      .set(patch)
      .where(eq(lineDrivers.lineUserId, lineUserId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Driver not found" });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating line driver:", error);
    res.status(500).json({ error: "Failed to update driver" });
  }
}
```

- [ ] **Step 4: Create `backend/src/routes/lineDriverRoutes.ts`**

```ts
import { Router } from "express";
import { getLineDrivers, updateLineDriver } from "../controllers/lineDriverController";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.get("/", requireRole(["staff", "admin"]), getLineDrivers);
router.patch("/:lineUserId", requireRole(["staff", "admin"]), updateLineDriver);

export default router;
```

- [ ] **Step 5: Mount both in `backend/src/index.ts`**

```ts
import tripRoutes from "./routes/tripRoutes";
import lineDriverRoutes from "./routes/lineDriverRoutes";
```
```ts
app.use("/api/trips", tripRoutes);
app.use("/api/line-drivers", lineDriverRoutes);
```

- [ ] **Step 6: Verify compile + auth gate** (dev server running)

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx tsc --noEmit
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/trips
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/line-drivers
```
Expected: exit 0, then `401` twice (no Clerk token). Role-gated success paths are verified through the dashboard in Tasks 6–9.

- [ ] **Step 7: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add backend/src
git commit -m "Add trips + line-drivers routes: list, Bangkok-day summary, driver mapping"
```

---

### Task 5: Rewrite `LINE_TripBot.gs` as a thin relay (+ `appsscript.json`, setup doc)

**Files:**
- Rewrite: `LINE_TripBot.gs` (repo root)
- Create: `appsscript.json` (repo root)
- Rewrite: `LINE_TripBot_SETUP.md`

**Interfaces:**
- Consumes: the ingest contract from Task 3 (verbatim field names).
- Produces: BotConfig sheet keys `LINE_TOKEN`, `BACKEND_URL` (full URL of `/api/line/ingest`), `INGEST_KEY`, `GroupReplyEnabled`, `TARGET_GROUP_ID` (optional).

- [ ] **Step 1: Replace `LINE_TripBot.gs`** (full file replacement)

```js
// ============================================================
// LINE TRIP BOT — thin relay: LINE webhook → TripReport backend
//
// Deploy as Web App ("Execute as: Me", "Who has access: Anyone")
// and set the deployment URL as the LINE webhook.
//
// AI extraction, Cloudinary upload, and trip storage all happen in
// the TripReport backend (POST /api/line/ingest). This script only:
//   1. dedupes webhook redeliveries (6-hour message-ID cache)
//   2. logs every message to the LineUserCapture sheet (raw safety net)
//   3. downloads image bytes from LINE
//   4. fetches the sender's display name (cached)
//   5. forwards text/base64-image to the backend with X-Ingest-Key
//
// Sheets used:
//   BotConfig       — key/value config (see CONFIG KEYS below)
//   LineUserCapture — raw log of every message + Forward Status column
//
// CONFIG KEYS (BotConfig: column A = key, column B = value)
//   LINE_TOKEN        LINE channel access token (falls back to A1 for
//                     backward compatibility with the old layout)
//   BACKEND_URL       full ingest URL, e.g. https://your-app.example.com/api/line/ingest
//   INGEST_KEY        must match LINE_INGEST_KEY in the backend env
//   GroupReplyEnabled TRUE/FALSE — reply with IDs in group chat
//   TARGET_GROUP_ID   optional — only forward messages from this group
// ============================================================

const TRIPBOT = {
  CAPTURE_SHEET: "LineUserCapture",
  CONFIG_SHEET:  "BotConfig",
  TZ:            "Asia/Bangkok"
};

const CAPTURE_HEADER = [
  "Timestamp", "Source Type", "LINE User ID", "Group ID", "Message Text", "Forward Status"
];

// ============================================================
// CONFIG HELPERS
// ============================================================
function tbConfigSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRIPBOT.CONFIG_SHEET);
  if (!sheet) throw new Error("BotConfig sheet not found");
  return sheet;
}

function tbGetConfig_(key) {
  const rows = tbConfigSheet_().getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return String(rows[i][1]).trim();
  }
  return "";
}

function tbGetLineToken_() {
  const token = tbGetConfig_("LINE_TOKEN") || String(tbConfigSheet_().getRange("A1").getValue()).trim();
  if (!token) throw new Error("LINE_TOKEN missing in BotConfig");
  return token;
}

function tbGetSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================
// ENTRY POINT
// ============================================================
function doPost(e) {
  try {
    const parsed = JSON.parse(e.postData ? e.postData.contents : "{}");
    (parsed.events || []).forEach(event => {
      try {
        handleEvent_(event);
      } catch (err) {
        Logger.log("Event error: " + err.toString());
      }
    });
    return tbRespond_({ status: "ok" });
  } catch (err) {
    Logger.log("doPost error: " + err.toString());
    return tbRespond_({ status: "error", message: err.toString() });
  }
}

function handleEvent_(event) {
  if (event.type !== "message" || !event.source) return;

  // LINE may redeliver the same webhook — skip already-processed messages.
  // The backend's unique lineMessageId is the second line of defense.
  const cache = CacheService.getScriptCache();
  const dedupeKey = "line_msg_" + event.message.id;
  if (cache.get(dedupeKey)) return;
  cache.put(dedupeKey, "1", 21600); // 6 hours

  const rowIndex = captureIds_(event);

  // Optionally restrict forwarding to one group
  const targetGroup = tbGetConfig_("TARGET_GROUP_ID");
  const groupId = event.source.groupId || event.source.roomId || "";
  if (targetGroup && groupId !== targetGroup) {
    setForwardStatus_(rowIndex, "skipped (other group)");
    return;
  }

  const msgType = event.message.type;
  if (msgType !== "text" && msgType !== "image") {
    setForwardStatus_(rowIndex, "skipped (" + msgType + ")");
    return;
  }

  const status = forwardToBackend_(event);
  setForwardStatus_(rowIndex, status);
}

// ============================================================
// CAPTURE — raw log of every message (safety net / replay source)
// ============================================================
function captureIds_(event) {
  const sheet = tbGetSheet_(TRIPBOT.CAPTURE_SHEET, CAPTURE_HEADER);

  const sourceType  = event.source.type    || "";
  const userId      = event.source.userId  || "";
  const groupId     = event.source.groupId || event.source.roomId || "-";
  const messageText = event.message
    ? (event.message.text || "(" + event.message.type + ")")
    : "(no message)";

  sheet.appendRow([new Date(), sourceType, userId, groupId, messageText, ""]);
  const rowIndex = sheet.getLastRow();

  const replyEnabled = tbGetConfig_("GroupReplyEnabled").toUpperCase() === "TRUE";
  if (replyEnabled || sourceType !== "group") {
    replyWithIds_(event.replyToken, userId, groupId, sourceType);
  }
  return rowIndex;
}

function setForwardStatus_(rowIndex, status) {
  try {
    tbGetSheet_(TRIPBOT.CAPTURE_SHEET, CAPTURE_HEADER).getRange(rowIndex, 6).setValue(status);
  } catch (err) {
    Logger.log("Forward status write failed: " + err.toString());
  }
}

function replyWithIds_(replyToken, userId, groupId, sourceType) {
  if (!replyToken) return;
  const text = sourceType === "group"
    ? ["✅ Group ID (C...):", groupId, "", "👤 Your User ID:", userId, "", "กรุณาส่งให้ผู้ดูแลระบบ"].join("\n")
    : ["✅ TripReport bot ทำงานอยู่", "", "👤 Your User ID:", userId].join("\n");

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + tbGetLineToken_()
    },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "text", text: text }] }),
    muteHttpExceptions: true
  });
}

// ============================================================
// FORWARD → BACKEND
// Returns a short status string written to the Forward Status column.
// LINE always receives 200, so failed messages stay in the capture
// sheet for manual replay (backend dedupe makes replays idempotent).
// ============================================================
function forwardToBackend_(event) {
  const backendUrl = tbGetConfig_("BACKEND_URL");
  const ingestKey  = tbGetConfig_("INGEST_KEY");
  if (!backendUrl || !ingestKey) return "error: BACKEND_URL/INGEST_KEY missing in BotConfig";

  const msg = event.message;
  const payload = {
    messageId: msg.id,
    type: msg.type,
    lineUserId: event.source.userId || "",
    lineGroupId: event.source.groupId || event.source.roomId || "",
    senderDisplayName: getSenderName_(event),
    timestamp: event.timestamp
  };

  if (msg.type === "text") {
    if (!msg.text || !msg.text.trim()) return "skipped (empty)";
    payload.text = msg.text;
  } else {
    const res = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + msg.id + "/content", {
      headers: { "Authorization": "Bearer " + tbGetLineToken_() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return "error: LINE content fetch " + res.getResponseCode();
    }
    const blob = res.getBlob();
    payload.image = {
      base64: Utilities.base64Encode(blob.getBytes()),
      mediaType: blob.getContentType() || "image/jpeg"
    };
  }

  const resp = UrlFetchApp.fetch(backendUrl, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Ingest-Key": ingestKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  if (code === 200) {
    try {
      const body = JSON.parse(resp.getContentText());
      return body.stored ? "stored" : "ok (" + (body.reason || "not stored") + ")";
    } catch (err) {
      return "ok (unparsed response)";
    }
  }
  return "error: backend " + code + " " + resp.getContentText().slice(0, 180);
}

// ============================================================
// SENDER DISPLAY NAME — fetched from LINE, cached 6 hours
// ============================================================
function getSenderName_(event) {
  const userId = event.source.userId || "";
  if (!userId) return "";

  const cache = CacheService.getScriptCache();
  const cacheKey = "line_name_" + userId;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const groupId = event.source.groupId || "";
  const name = fetchLineDisplayName_(userId, groupId);
  cache.put(cacheKey, name, 21600);
  return name;
}

function fetchLineDisplayName_(userId, groupId) {
  const url = groupId
    ? "https://api.line.me/v2/bot/group/" + groupId + "/member/" + userId
    : "https://api.line.me/v2/bot/profile/" + userId;
  try {
    const res = UrlFetchApp.fetch(url, {
      headers: { "Authorization": "Bearer " + tbGetLineToken_() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).displayName || "";
    }
  } catch (err) {
    Logger.log("Profile fetch failed: " + err.toString());
  }
  return "";
}

// ============================================================
// HELPERS / TESTS
// ============================================================
function tbRespond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run from the editor to verify BACKEND_URL + INGEST_KEY end-to-end.
// Expected log: "stored". Each run uses a fresh message ID, so it stores
// one test trip — delete it afterwards with the admin trash button in the
// dashboard's trips table.
function testForward() {
  const fakeEvent = {
    type: "message",
    timestamp: Date.now(),
    source: { type: "user", userId: "test-user-apps-script" },
    message: {
      id: "test-" + Date.now(),
      type: "text",
      text: "รถ 71-6213 ออกจากโรงงานสระบุรีไปส่งปูนที่ขอนแก่นครับ ถึงประมาณบ่ายสอง"
    }
  };
  Logger.log(forwardToBackend_(fakeEvent));
}
```

- [ ] **Step 2: Create `appsscript.json`** (repo root — pasted into the Apps Script project; Firebase scope removed)

```json
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

- [ ] **Step 3: Rewrite `LINE_TripBot_SETUP.md`** (full file replacement)

```markdown
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
```

- [ ] **Step 4: Verify the `.gs` parses as JavaScript**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line && node --check LINE_TripBot.gs && echo OK
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add LINE_TripBot.gs appsscript.json LINE_TripBot_SETUP.md
git commit -m "Rewrite LINE_TripBot.gs as thin relay to backend ingest; drop Firebase/AI from Apps Script"
```

---

### Task 6: Frontend re-shape — strip, TripShell, API layer, TripsPage

**Files:**
- Delete: `frontend/src/pages/HomePage.jsx`, `ProductPage.jsx`, `CreatePage.jsx`, `EditProductPage.jsx`, `ProfilePage.jsx`, `OrderPage.jsx`, `MyOrdersPage.jsx`, `DispatcherDashboard.jsx`, `TruckView.jsx`
- Delete: `frontend/src/components/Navbar.jsx`, `ProductCard.jsx`, `CommentsSection.jsx`, `EditProductForm.jsx`, `ThemeSelector.jsx`, `ConcreteShell.jsx`
- Delete: `frontend/src/hooks/useProducts.js`, `useComments.js`, `useConcreteProducts.js`, `useOrders.js`, `useDispatcher.js`
- Rename: `frontend/src/concreteflow.css` → `frontend/src/tripreport.css` (+ small edits)
- Rewrite: `frontend/src/lib/api.js`, `frontend/src/App.jsx`
- Create: `frontend/src/components/TripShell.jsx`, `frontend/src/hooks/useTrips.js`, `frontend/src/hooks/useLineDrivers.js`, `frontend/src/hooks/useUsers.js`, `frontend/src/pages/TripsPage.jsx`, `frontend/src/pages/PendingPage.jsx`
- Modify: `frontend/index.html` (title), `frontend/package.json` (remove unused deps)

**Interfaces:**
- Consumes: backend routes from Tasks 1 & 4; kept hooks `useAuthReq`, `useUserSync`, `useMe`, `LoadingSpinner`.
- Produces (Tasks 7–9 rely on):
  - `TripShell` — default export, props `{ children }`; contains `NAV` array + `PAGE_TITLES` map that Tasks 7–9 do NOT need to edit (all four entries are present from this task).
  - `api.js` exports: `syncUser`, `getMe`, `getTrips(params)`, `getTripSummary(date)`, `deleteTrip(id)`, `getLineDrivers()`, `updateLineDriver({lineUserId, manualName, defaultTruck})`, `getAllUsers()`, `updateUserRole({id, role})`.
  - Hooks: `useTrips(params)` (30 s poll), `useDeleteTrip()` from `useTrips.js`; `useTripSummary(date)` also from `useTrips.js`; `useLineDrivers()`, `useUpdateLineDriver()` from `useLineDrivers.js`; `useUsers()`, `useUpdateUserRole()` from `useUsers.js`.
  - `App.jsx` exports the `Protected` wrapper pattern; Tasks 7–9 each add one `<Route>` line.

- [ ] **Step 1: Delete dead frontend files + rename the stylesheet**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git rm frontend/src/pages/HomePage.jsx frontend/src/pages/ProductPage.jsx \
  frontend/src/pages/CreatePage.jsx frontend/src/pages/EditProductPage.jsx \
  frontend/src/pages/ProfilePage.jsx frontend/src/pages/OrderPage.jsx \
  frontend/src/pages/MyOrdersPage.jsx frontend/src/pages/DispatcherDashboard.jsx \
  frontend/src/pages/TruckView.jsx \
  frontend/src/components/Navbar.jsx frontend/src/components/ProductCard.jsx \
  frontend/src/components/CommentsSection.jsx frontend/src/components/EditProductForm.jsx \
  frontend/src/components/ThemeSelector.jsx frontend/src/components/ConcreteShell.jsx \
  frontend/src/hooks/useProducts.js frontend/src/hooks/useComments.js \
  frontend/src/hooks/useConcreteProducts.js frontend/src/hooks/useOrders.js \
  frontend/src/hooks/useDispatcher.js
git mv frontend/src/concreteflow.css frontend/src/tripreport.css
```

- [ ] **Step 2: Edit `frontend/src/tripreport.css`**

Three small edits (tokens otherwise unchanged):
1. First line comment: `/* ConcreteFlow Design System — scoped under .cf parent */` → `/* TripReport Design System — scoped under .cf parent (scope class kept from ConcreteFlow) */`
2. After the `.cf .badge-cancelled` line, add:
```css
.cf .badge-problem   { color: var(--danger);       background: var(--danger-bg); }
```
3. Delete the entire `/* ── react-datepicker overrides ── */` block at the end of the file (the dependency is removed in Step 9).

- [ ] **Step 3: Rewrite `frontend/src/lib/api.js`** (full file replacement)

```js
import api from "./axios";

// USERS
export const syncUser = async (userData) => {
  const { data } = await api.post("/users/sync", userData);
  return data;
};

export const getMe = async () => {
  const { data } = await api.get("/users/me");
  return data;
};

export const getAllUsers = async () => {
  const { data } = await api.get("/users");
  return data;
};

export const updateUserRole = async ({ id, role }) => {
  const { data } = await api.patch(`/users/${id}/role`, { role });
  return data;
};

// TRIPS
export const getTrips = async (params) => {
  const { data } = await api.get("/trips", { params });
  return data;
};

export const getTripSummary = async (date) => {
  const { data } = await api.get("/trips/summary", { params: { date } });
  return data;
};

export const deleteTrip = async (id) => {
  const { data } = await api.delete(`/trips/${id}`);
  return data;
};

// LINE DRIVERS
export const getLineDrivers = async () => {
  const { data } = await api.get("/line-drivers");
  return data;
};

export const updateLineDriver = async ({ lineUserId, manualName, defaultTruck }) => {
  const { data } = await api.patch(`/line-drivers/${lineUserId}`, { manualName, defaultTruck });
  return data;
};
```

- [ ] **Step 4: Create `frontend/src/hooks/useTrips.js`**

```js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrips, getTripSummary, deleteTrip } from "../lib/api";

export const useTrips = (params) =>
  useQuery({
    queryKey: ["trips", params],
    queryFn: () => getTrips(params),
    refetchInterval: 30_000, // new LINE reports appear without a manual refresh
  });

export const useTripSummary = (date) =>
  useQuery({ queryKey: ["tripSummary", date], queryFn: () => getTripSummary(date) });

export const useDeleteTrip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["tripSummary"] });
    },
  });
};
```

- [ ] **Step 5: Create `frontend/src/hooks/useLineDrivers.js`**

```js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLineDrivers, updateLineDriver } from "../lib/api";

export const useLineDrivers = () =>
  useQuery({ queryKey: ["lineDrivers"], queryFn: getLineDrivers });

export const useUpdateLineDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLineDriver,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineDrivers"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] }); // renames retroactively change driverName
      queryClient.invalidateQueries({ queryKey: ["tripSummary"] });
    },
  });
};
```

- [ ] **Step 6: Create `frontend/src/hooks/useUsers.js`**

```js
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllUsers, updateUserRole } from "../lib/api";

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: getAllUsers });

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateUserRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
};
```

- [ ] **Step 7: Create `frontend/src/components/TripShell.jsx`**

```jsx
import { Link, useLocation } from "react-router";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useState } from "react";
import { Truck, ClipboardList, CalendarDays, Users, Shield, Menu, X, LogOut } from "lucide-react";
import { useMe } from "../hooks/useMe";
import "../tripreport.css";

const NAV = [
  { path: "/",        label: "รายงานเที่ยว", Icon: ClipboardList },
  { path: "/summary", label: "สรุปรายวัน",   Icon: CalendarDays },
  { path: "/drivers", label: "คนขับ",        Icon: Users },
];
const ADMIN_NAV = [{ path: "/admin/users", label: "ผู้ใช้งาน", Icon: Shield }];

const PAGE_TITLES = {
  "/":            "รายงานเที่ยววิ่งรถบรรทุก",
  "/summary":     "สรุปรายวัน",
  "/drivers":     "รายชื่อคนขับ",
  "/admin/users": "จัดการผู้ใช้งาน",
};

const ROLE_LABELS = { pending: "รอสิทธิ์", staff: "พนักงาน", admin: "ผู้ดูแลระบบ" };

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function TripShell({ children }) {
  const location = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = PAGE_TITLES[location.pathname] ?? "TripReport";
  const navItems = me?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="cf app">
      <div className={`overlay${sidebarOpen ? " show" : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="ปิดเมนู">
          <X size={15} />
        </button>

        <div className="brand">
          <div className="brand-logo"><Truck size={20} strokeWidth={2} /></div>
          <div>
            <div className="brand-name">TripReport</div>
            <div className="brand-sub">รายงานเที่ยวรถบรรทุก</div>
          </div>
        </div>

        <div className="nav-group-label">เมนูหลัก</div>
        <nav className="nav">
          {navItems.map(({ path, label, Icon }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`nav-item${location.pathname === path ? " active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="avatar" style={{ width: 34, height: 34, objectFit: "cover" }} />
            ) : (
              <div className="avatar" style={{ width: 34, height: 34, background: "#1F52C9", fontSize: 14 }}>
                {(user?.fullName || "?").charAt(0)}
              </div>
            )}
            <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.fullName ?? "ผู้ใช้งาน"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{ROLE_LABELS[me?.role] ?? ""}</div>
            </div>
            <button
              onClick={() => signOut()}
              title="ออกจากระบบ"
              style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", padding: 4 }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="เปิดเมนู">
            <Menu size={18} />
          </button>
          <h1>{title}</h1>
          <div className="chip" style={{ height: 32 }}>
            <CalendarDays size={14} />
            วันนี้ · {todayLabel()}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create `frontend/src/pages/PendingPage.jsx`**

```jsx
import { useUser, useClerk } from "@clerk/clerk-react";
import { Clock } from "lucide-react";
import "../tripreport.css";

export default function PendingPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  return (
    <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad pop-in" style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--st-pending-bg)", color: "var(--st-pending)", display: "grid", placeItems: "center" }}>
            <Clock size={26} />
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>รอสิทธิ์การใช้งาน</div>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          บัญชี {user?.primaryEmailAddress?.emailAddress} ยังไม่ได้รับสิทธิ์เข้าดูข้อมูล
          กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>ออกจากระบบ</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `frontend/src/pages/TripsPage.jsx`**

```jsx
import { useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import TripShell from "../components/TripShell";
import { useTrips, useDeleteTrip } from "../hooks/useTrips";
import { useMe } from "../hooks/useMe";

const STATUS_STYLE = {
  "รับงาน": "badge-pending",
  "ถึงต้นทาง": "badge-confirmed",
  "ขึ้นของ": "badge-confirmed",
  "ออกเดินทาง": "badge-in_transit",
  "ถึงปลายทาง": "badge-scheduled",
  "ลงของ": "badge-scheduled",
  "จบงาน": "badge-delivered",
  "มีปัญหา": "badge-problem",
};

const bkkToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const bkkTime = (iso) =>
  new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", verticalAlign: "top" };

export default function TripsPage() {
  const [date, setDate] = useState(bkkToday());
  const [driver, setDriver] = useState("");
  const [truck, setTruck] = useState("");
  const [photo, setPhoto] = useState(null);
  const { data: trips = [], isLoading, isError, refetch, isFetching } = useTrips({ date });
  const { data: me } = useMe();
  const { mutate: removeTrip, isPending: isDeleting } = useDeleteTrip();
  const isAdmin = me?.role === "admin";

  const drivers = useMemo(() => [...new Set(trips.map((t) => t.driverName).filter(Boolean))], [trips]);
  const trucks = useMemo(() => [...new Set(trips.map((t) => t.truck).filter(Boolean))], [trips]);
  const rows = trips.filter((t) => (!driver || t.driverName === driver) && (!truck || t.truck === truck));

  return (
    <TripShell>
      <div className="page fade-in">
        <div className="card card-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <label className="field-label">วันที่</label>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
          </div>
          <div>
            <label className="field-label">คนขับ</label>
            <select className="field" value={driver} onChange={(e) => setDriver(e.target.value)} style={{ width: 180 }}>
              <option value="">ทั้งหมด</option>
              {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">ทะเบียนรถ</label>
            <select className="field" value={truck} onChange={(e) => setTruck(e.target.value)} style={{ width: 150 }}>
              <option value="">ทั้งหมด</option>
              {trucks.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()} style={{ height: 42 }}>
            <RefreshCw size={14} className={isFetching ? "spin" : ""} />
            รีเฟรช
          </button>
          <div className="chip" style={{ marginLeft: "auto" }}>{rows.length} รายการ</div>
        </div>

        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง</div>
        ) : rows.length === 0 ? (
          <div className="card card-pad muted">ไม่มีรายงานเที่ยวในวันที่เลือก</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  {["เวลา", "คนขับ", "รถ", "เส้นทาง", "สถานะ", "ปัญหา", "รูป", "ข้อความ"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                  {isAdmin && <th style={thStyle}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle} className="mono">{bkkTime(t.reportedAt)}</td>
                    <td style={tdStyle}>{t.driverName}</td>
                    <td style={tdStyle} className="mono">{t.truck || "–"}</td>
                    <td style={tdStyle}>{t.origin || t.destination ? `${t.origin || "?"} → ${t.destination || "?"}` : "–"}</td>
                    <td style={tdStyle}>
                      {t.status ? (
                        <span className={`badge ${STATUS_STYLE[t.status] ?? "badge-pending"}`}>
                          <span className="dot" />{t.status}
                        </span>
                      ) : "–"}
                    </td>
                    <td style={{ ...tdStyle, color: t.problem ? "var(--danger)" : undefined, fontWeight: t.problem ? 600 : undefined }}>
                      {t.problem || "–"}
                    </td>
                    <td style={tdStyle}>
                      {t.imageUrl ? (
                        <img
                          src={t.imageUrl}
                          alt="รูปรายงาน"
                          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                          onClick={() => setPhoto(t.imageUrl)}
                        />
                      ) : (
                        <ImageIcon size={16} color="var(--ink-4)" />
                      )}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260 }}>
                      {t.rawMessage && t.rawMessage !== "(image)" ? (
                        <details>
                          <summary className="muted" style={{ cursor: "pointer" }}>ดูข้อความ</summary>
                          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                            {t.rawMessage}
                            {t.notes ? `\n\nหมายเหตุ AI: ${t.notes}` : ""}
                          </div>
                        </details>
                      ) : (
                        t.notes || "–"
                      )}
                    </td>
                    {isAdmin && (
                      <td style={tdStyle}>
                        <button
                          title="ลบรายงานนี้ (กรณี AI สกัดข้อมูลผิด)"
                          disabled={isDeleting}
                          onClick={() => window.confirm("ลบรายงานเที่ยวนี้?") && removeTrip(t.id)}
                          style={{ border: "none", background: "none", color: "var(--ink-3)", cursor: "pointer", padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {photo && (
          <div
            onClick={() => setPhoto(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,.75)", zIndex: 100, display: "grid", placeItems: "center", cursor: "zoom-out", padding: 24 }}
          >
            <img src={photo} alt="รูปรายงาน" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 12 }} />
          </div>
        )}
      </div>
    </TripShell>
  );
}
```

- [ ] **Step 10: Rewrite `frontend/src/App.jsx`** (full file replacement)

```jsx
import { Navigate, Route, Routes } from "react-router";
import { SignIn } from "@clerk/clerk-react";
import TripsPage from "./pages/TripsPage";
import PendingPage from "./pages/PendingPage";
import LoadingSpinner from "./components/LoadingSpinner";
import useAuthReq from "./hooks/useAuthReq";
import useUserSync from "./hooks/useUserSync";
import { useMe } from "./hooks/useMe";
import "./tripreport.css";

function Protected({ adminOnly = false, children }) {
  const { data: me, isLoading, isError } = useMe();
  if (isLoading) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <LoadingSpinner />
      </div>
    );
  }
  if (isError || !me || me.role === "pending") return <PendingPage />;
  if (adminOnly && me.role !== "admin") return <Navigate to="/" />;
  return children;
}

function App() {
  const { isClerkLoaded, isSignedIn } = useAuthReq();
  useUserSync();

  if (!isClerkLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>TripReport</div>
            <div className="muted">รายงานเที่ยวรถบรรทุกจากกลุ่ม LINE</div>
          </div>
          <SignIn routing="hash" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Protected><TripsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
```

- [ ] **Step 11: Update `frontend/index.html` title**

Change `<title>ConcreteFlow — นครคอนกรีต Ready-Mix</title>` → `<title>TripReport — รายงานเที่ยวรถบรรทุก</title>`.

- [ ] **Step 12: Remove now-unused dependencies**

```bash
npm uninstall @cloudinary/react @cloudinary/url-gen react-datepicker --prefix /Users/waipodyeamkeaw/TripReport_Line/frontend
```

- [ ] **Step 13: Verify build + lint**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/frontend && npm run build && npm run lint
```
Expected: Vite build succeeds; eslint exits 0 (deleted files are no longer linted).

- [ ] **Step 14: Manual smoke test** (backend `npm run dev` + frontend `npm run dev`)

1. Open http://localhost:5173 signed out → TripReport sign-in screen.
2. Sign in with the `ADMIN_EMAIL` account → trips table renders (empty state "ไม่มีรายงานเที่ยวในวันที่เลือก" is fine). The สรุปรายวัน/คนขับ sidebar links bounce back to `/` via the catch-all until Tasks 7–8 add their routes — expected mid-plan state.
3. Re-run the Task 3 Step 5b curl (new `messageId`, e.g. `smoke-ui-1`) → row appears within 30 s (poll) with driver "สมชาย ทดสอบ", truck `71-6213`.
4. Sign in with a second (non-admin) account in an incognito window → PendingPage ("รอสิทธิ์การใช้งาน").

- [ ] **Step 15: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add -A frontend
git commit -m "Re-shape frontend: TripShell + role gate + TripsPage; drop Productify/ConcreteFlow UI"
```

---

### Task 7: SummaryPage (สรุปรายวัน)

**Files:**
- Create: `frontend/src/pages/SummaryPage.jsx`
- Modify: `frontend/src/App.jsx` (add route)

**Interfaces:**
- Consumes: `useTripSummary(date)` → `{ date, byDriver: [{name,count,routes,trucks,problems}], byTruck: [{name,count,routes,drivers,problems}] }`; `TripShell`.

- [ ] **Step 1: Create `frontend/src/pages/SummaryPage.jsx`**

```jsx
import { useState } from "react";
import { User, Truck } from "lucide-react";
import TripShell from "../components/TripShell";
import { useTripSummary } from "../hooks/useTrips";

const bkkToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

const thStyle = { textAlign: "left", padding: "9px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "9px 14px", verticalAlign: "top" };

function SummaryTable({ title, Icon, rows, otherKey, otherLabel }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-pad sec-title" style={{ borderBottom: "1px solid var(--border)" }}>
        <Icon size={17} />{title}
      </div>
      {rows.length === 0 ? (
        <div className="card-pad muted">ไม่มีข้อมูล</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>ชื่อ</th>
                <th style={thStyle}>รายงาน</th>
                <th style={thStyle}>เส้นทาง</th>
                <th style={thStyle}>{otherLabel}</th>
                <th style={thStyle}>ปัญหา</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{g.name}</td>
                  <td style={tdStyle} className="mono">{g.count}</td>
                  <td style={tdStyle}>{g.routes.join(" | ") || "–"}</td>
                  <td style={tdStyle} className="mono">{g[otherKey].join(", ") || "–"}</td>
                  <td style={{ ...tdStyle, color: g.problems.length ? "var(--danger)" : undefined }}>
                    {g.problems.join(" | ") || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SummaryPage() {
  const [date, setDate] = useState(bkkToday());
  const { data, isLoading, isError } = useTripSummary(date);

  return (
    <TripShell>
      <div className="page fade-in">
        <div className="card card-pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <label className="field-label">วันที่</label>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
          </div>
        </div>

        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : (
          <>
            <SummaryTable title="สรุปตามคนขับ" Icon={User} rows={data?.byDriver ?? []} otherKey="trucks" otherLabel="รถที่ใช้" />
            <SummaryTable title="สรุปตามรถ" Icon={Truck} rows={data?.byTruck ?? []} otherKey="drivers" otherLabel="คนขับ" />
          </>
        )}
      </div>
    </TripShell>
  );
}
```

- [ ] **Step 2: Add the route in `frontend/src/App.jsx`**

Add the import after `TripsPage`:
```jsx
import SummaryPage from "./pages/SummaryPage";
```
Add the route line directly below the `/` route:
```jsx
      <Route path="/summary" element={<Protected><SummaryPage /></Protected>} />
```

- [ ] **Step 3: Verify**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/frontend && npm run build
```
Expected: build succeeds. In the browser, "สรุปรายวัน" in the sidebar shows both tables (with the smoke trip from Task 6 Step 14 if not deleted).

- [ ] **Step 4: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add frontend/src/pages/SummaryPage.jsx frontend/src/App.jsx
git commit -m "Add SummaryPage: per-driver and per-truck daily rollup"
```

---

### Task 8: DriversPage (รายชื่อคนขับ)

**Files:**
- Create: `frontend/src/pages/DriversPage.jsx`
- Modify: `frontend/src/App.jsx` (add route)

**Interfaces:**
- Consumes: `useLineDrivers()` → `LineDriver[]` (`lineUserId`, `lineDisplayName`, `manualName`, `defaultTruck`); `useUpdateLineDriver()`.

- [ ] **Step 1: Create `frontend/src/pages/DriversPage.jsx`**

```jsx
import { useState } from "react";
import TripShell from "../components/TripShell";
import { useLineDrivers, useUpdateLineDriver } from "../hooks/useLineDrivers";

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 14px", verticalAlign: "middle" };

function DriverRow({ d }) {
  const [manualName, setManualName] = useState(d.manualName ?? "");
  const [defaultTruck, setDefaultTruck] = useState(d.defaultTruck ?? "");
  const { mutate, isPending } = useUpdateLineDriver();
  const dirty = manualName !== (d.manualName ?? "") || defaultTruck !== (d.defaultTruck ?? "");

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={tdStyle}>{d.lineDisplayName || <span className="muted">(ไม่ทราบ)</span>}</td>
      <td style={{ ...tdStyle, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} className="mono muted">
        {d.lineUserId}
      </td>
      <td style={tdStyle}>
        <input
          className="field"
          value={manualName}
          placeholder="ชื่อจริงคนขับ"
          onChange={(e) => setManualName(e.target.value)}
          style={{ width: 180, height: 36 }}
        />
      </td>
      <td style={tdStyle}>
        <input
          className="field mono"
          value={defaultTruck}
          placeholder="เช่น 71-6213"
          onChange={(e) => setDefaultTruck(e.target.value)}
          style={{ width: 130, height: 36 }}
        />
      </td>
      <td style={tdStyle}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty || isPending}
          onClick={() => mutate({ lineUserId: d.lineUserId, manualName, defaultTruck })}
        >
          {isPending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </td>
    </tr>
  );
}

export default function DriversPage() {
  const { data: drivers = [], isLoading, isError } = useLineDrivers();

  return (
    <TripShell>
      <div className="page fade-in">
        <p className="muted" style={{ marginTop: 0 }}>
          ชื่อ LINE จะถูกบันทึกอัตโนมัติเมื่อคนขับส่งข้อความครั้งแรก — ใส่ "ชื่อจริง"
          เพื่อให้รายงานทุกเที่ยว (รวมย้อนหลัง) แสดงชื่อที่ถูกต้อง
        </p>
        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : drivers.length === 0 ? (
          <div className="card card-pad muted">ยังไม่มีคนขับ — จะปรากฏเมื่อมีข้อความแรกจากกลุ่ม LINE</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ชื่อใน LINE</th>
                  <th style={thStyle}>LINE User ID</th>
                  <th style={thStyle}>ชื่อจริง (แก้ไขได้)</th>
                  <th style={thStyle}>รถประจำ</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => <DriverRow key={d.lineUserId} d={d} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TripShell>
  );
}
```

- [ ] **Step 2: Add the route in `frontend/src/App.jsx`**

```jsx
import DriversPage from "./pages/DriversPage";
```
```jsx
      <Route path="/drivers" element={<Protected><DriversPage /></Protected>} />
```

- [ ] **Step 3: Verify**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/frontend && npm run build
```
In the browser: "คนขับ" page lists the smoke-test driver; typing a ชื่อจริง and clicking บันทึก persists it, and the trips list now shows that name (retroactive rename via the invalidated queries).

- [ ] **Step 4: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add frontend/src/pages/DriversPage.jsx frontend/src/App.jsx
git commit -m "Add DriversPage: LINE userId → real name / default truck mapping"
```

---

### Task 9: AdminUsersPage (จัดการผู้ใช้งาน)

**Files:**
- Create: `frontend/src/pages/AdminUsersPage.jsx`
- Modify: `frontend/src/App.jsx` (add admin-gated route)

**Interfaces:**
- Consumes: `useUsers()` → `User[]` (`id`, `email`, `name`, `imageUrl`, `role`, `createdAt`); `useUpdateUserRole()`.

- [ ] **Step 1: Create `frontend/src/pages/AdminUsersPage.jsx`**

```jsx
import TripShell from "../components/TripShell";
import { useUsers, useUpdateUserRole } from "../hooks/useUsers";
import { useMe } from "../hooks/useMe";

const ROLE_OPTIONS = [
  { value: "pending", label: "รอสิทธิ์ (pending)" },
  { value: "staff", label: "พนักงาน (staff)" },
  { value: "admin", label: "ผู้ดูแลระบบ (admin)" },
];

const thStyle = { textAlign: "left", padding: "10px 14px", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 14px", verticalAlign: "middle" };

export default function AdminUsersPage() {
  const { data: users = [], isLoading, isError } = useUsers();
  const { data: me } = useMe();
  const { mutate, isPending } = useUpdateUserRole();

  return (
    <TripShell>
      <div className="page fade-in">
        <p className="muted" style={{ marginTop: 0 }}>
          ผู้สมัครใหม่จะได้สถานะ "รอสิทธิ์" โดยอัตโนมัติ — เปลี่ยนเป็น "พนักงาน" เพื่อเปิดสิทธิ์ดูรายงาน
        </p>
        {isLoading ? (
          <div className="card card-pad muted">กำลังโหลด...</div>
        ) : isError ? (
          <div className="card card-pad" style={{ color: "var(--danger)" }}>โหลดข้อมูลไม่สำเร็จ</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ผู้ใช้งาน</th>
                  <th style={thStyle}>อีเมล</th>
                  <th style={thStyle}>สิทธิ์</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {u.imageUrl ? (
                          <img src={u.imageUrl} alt="" className="avatar" style={{ width: 30, height: 30, objectFit: "cover" }} />
                        ) : (
                          <div className="avatar" style={{ width: 30, height: 30, background: "#1F52C9", fontSize: 13 }}>
                            {(u.name || "?").charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 600 }}>{u.name || "–"}</span>
                        {u.id === me?.id && <span className="chip" style={{ height: 22 }}>คุณ</span>}
                      </div>
                    </td>
                    <td style={tdStyle} className="muted">{u.email}</td>
                    <td style={tdStyle}>
                      <select
                        className="field"
                        value={u.role}
                        disabled={isPending || u.id === me?.id}
                        onChange={(e) => mutate({ id: u.id, role: e.target.value })}
                        style={{ width: 200, height: 36 }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TripShell>
  );
}
```

- [ ] **Step 2: Add the admin-gated route in `frontend/src/App.jsx`**

```jsx
import AdminUsersPage from "./pages/AdminUsersPage";
```
```jsx
      <Route path="/admin/users" element={<Protected adminOnly><AdminUsersPage /></Protected>} />
```

- [ ] **Step 3: Verify**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/frontend && npm run build
```
In the browser (as the `ADMIN_EMAIL` account): "ผู้ใช้งาน" appears in the sidebar; promote the second test account from Task 6 Step 14 to `staff` → in its incognito window, reloading now shows the trips dashboard. Non-admin accounts do not see the nav item and are redirected from `/admin/users` to `/`.

- [ ] **Step 4: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add frontend/src/pages/AdminUsersPage.jsx frontend/src/App.jsx
git commit -m "Add AdminUsersPage: role management (pending/staff/admin)"
```

---

### Task 10: Docs rewrite + rollout

**Files:**
- Rewrite: `CLAUDE.md`, `README.md`
- Modify: root `package.json` (name)

- [ ] **Step 1: Update root `package.json`**

Change `"name": "concrete-ordering"` → `"name": "tripreport-line"` and `"description": ""` → `"description": "LINE group trip reports → Claude extraction → Postgres + Cloudinary, with a role-gated dashboard"`. Leave the `repository`/`bugs`/`homepage` fields for the user to update when they create the new GitHub repo.

- [ ] **Step 2: Rewrite `CLAUDE.md`** (full file replacement)

```markdown
# TripReport — LINE Trip Report System

Thai trucking company tool: drivers report trips in a LINE group; every
message/image is captured, AI-extracted into a structured trip record, and
shown in a role-gated web dashboard.

**Data flow:**

```
LINE group → LINE_TripBot.gs (Apps Script thin relay)
  · dedupe (6-h cache) · raw log → LineUserCapture sheet
  · downloads image bytes · fetches sender display name (cached)
  · POST /api/line/ingest  (X-Ingest-Key shared secret)
→ Express backend
  1. Claude extraction (services/tripExtract.ts — text or vision,
     structured output; model env ANTHROPIC_MODEL, default claude-opus-4-8)
  2. is_trip_report=false → stop (nothing stored)
  3. image → Cloudinary (folder tripreport/line-images)
  4. upsert line_drivers · insert trips (lineMessageId UNIQUE = dedupe)
→ PostgreSQL → React dashboard (Clerk auth, role-gated)
```

The LINE channel token lives only in the BotConfig sheet (backend never calls
LINE). The Anthropic key lives only in backend env. Design spec:
`docs/superpowers/specs/2026-07-06-line-trip-report-design.md`.

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
ANTHROPIC_MODEL=                     # optional, default claude-opus-4-8
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
- No test framework — verify with tsc / vite build / curl smoke tests
  (see docs/superpowers/plans/2026-07-07-line-trip-report.md).
```

- [ ] **Step 3: Rewrite `README.md`** (full file replacement)

```markdown
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
```

- [ ] **Step 4: Full-repo verification**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line/backend && npx tsc --noEmit
cd /Users/waipodyeamkeaw/TripReport_Line/frontend && npm run build
grep -ri "concreteflow\|concrete-ordering\|นครคอนกรีต" /Users/waipodyeamkeaw/TripReport_Line \
  --include="*.ts" --include="*.jsx" --include="*.js" --include="*.json" --include="*.html" --include="*.css" --include="*.gs" \
  --exclude-dir=node_modules --exclude-dir=dist -l
```
Expected: compile + build pass; the grep returns **no files** (docs/superpowers history may mention ConcreteFlow — that's fine, it's excluded by the `--include` filters).

- [ ] **Step 5: Commit**

```bash
cd /Users/waipodyeamkeaw/TripReport_Line
git add CLAUDE.md README.md package.json
git commit -m "Rewrite docs for TripReport; rename root package"
```

- [ ] **Step 6: Rollout (production — do with the user, in this order)**

1. Push `main` → deploy the backend with the new env vars (`ANTHROPIC_API_KEY`, `LINE_INGEST_KEY`, `ADMIN_EMAIL`; remove `LINE_CHANNEL_*`). The deploy runs `db:push` via the root `start` script — if the host runs it non-interactively and it stalls on drop confirmations, run `npx drizzle-kit push --force` against the production `DATABASE_URL` once manually.
2. Paste the new `LINE_TripBot.gs` + `appsscript.json` into the Apps Script project; add `BACKEND_URL` + `INGEST_KEY` rows to BotConfig; redeploy the web app (same URL keeps the LINE webhook valid).
3. Run `testForward` in the Apps Script editor → expect `stored`.
4. Send a real text report and a real photo (delivery document) in the LINE group → both appear in the dashboard; the photo thumbnail loads from `res.cloudinary.com` (this is the live Cloudinary verification).
5. Sign in as `ADMIN_EMAIL`, promote real staff accounts at `/admin/users`.
```
