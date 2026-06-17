# ConcreteFlow — Full-Stack PERN Concrete Ordering & Scheduling System

## Implementation Status

| Layer | Status |
|---|---|
| Database schema (all 5 ConcreteFlow tables + role/phone on users) | ✅ Done — `db:push` applied |
| Middleware: `requireAuth` + `requireRole` | ✅ Done |
| Concrete Products CRUD + seed (7 ksc grades in DB) | ✅ Done |
| Orders backend: `POST /api/orders`, `GET /api/orders/my` (with joins), `GET /api/orders`, `PATCH /api/orders/:id/status` (also updates `preferredDate` + `preferredTimeSlot` when confirming) | ✅ Done |
| User routes: `POST /sync`, `GET /me`, `PATCH /me`, `GET /` (admin), `PATCH /:id/role` (admin) | ✅ Done |
| Cloudinary photo upload — backend uploads base64 → Cloudinary; stores `secure_url` in DB | ✅ Done |
| `OrderPage` wired to real API (`useConcreteProducts` + `useCreateOrder`) | ✅ Done |
| `MyOrdersPage` wired to real API (`useMyOrders` + `toUiOrder` normaliser) | ✅ Done |
| Schedule routes/controller (`scheduleRoutes.ts` + `scheduleController.ts`) | ✅ Done — GET, POST, PUT (replace-all), PATCH/:id/status, DELETE; qty + conflict validation |
| Truck routes/controller (`truckRoutes.ts` + `truckController.ts`) | ✅ Done — GET, POST/seed (5 trucks seeded), POST, PATCH |
| `DispatcherDashboard` + inline `AssignDrawer` | ✅ Done — stats bar, order queues, ETA confirm panel (date + time picker before confirm), multi-truck assign, edit mode (PUT), fleet panel |
| `TruckView` — 24-hour side-by-side Gantt (today + tomorrow) | ✅ Done — 64px/hr, sticky labels, auto-scroll to now, block click → status actions |
| `useDispatcher.js` + `api.js` dispatcher functions | ✅ Done — all hooks + API helpers wired |
| `MyOrdersPage` multi-truck support + null guards | ✅ Done — `schedules[]` array, `mapSched` helper, null-safe orderNumber |
| LINE service (`lineNotify.ts`) | ⬜ Pending |
| Live Monitor (`LiveMonitor.jsx`) | ⬜ Pending |
| Schedule Board Page (`ScheduleBoardPage.jsx`) — classic truck-column Gantt | ⬜ Pending |
| Driver UI (`DriverDashboard.jsx`) | ⬜ Pending |
| Admin UI (`AdminPage.jsx`) | ⬜ Pending |

---

## Project Overview

A Thai-market full-stack web application for **นครคอนกรีต Ready-Mix** (a concrete supply company operating from a plant in พระราม 2, Bangkok). Customers browse ready-mix grades, place delivery orders with job-site location and photos, and track status. Dispatchers manage a scheduling board, assign mixer trucks (รถโม่) and drivers, and confirm delivery windows. Drivers see their daily schedule. A LINE Official Account thread mirrors all status transitions to the customer in real time.

Built on the existing PERN stack: **PostgreSQL · Express · React · Node.js** — using the same tooling already wired into this repo (Clerk auth, Drizzle ORM, TanStack Query, TailwindCSS + DaisyUI).

App name shown in UI: **ConcreteFlow**
Sub-brand: **นครคอนกรีต Ready-Mix**
Currency: **฿ (THB)** — quantities in **คิว (m³)**
Language: Thai primary, English secondary labels

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Database | PostgreSQL | Hosted on Neon / Supabase / Railway |
| ORM | Drizzle ORM | Type-safe schema in `backend/src/db/schema.ts` |
| Auth | Clerk | Roles stored in `users.role` column; JWT passed via `clerkMiddleware()` |
| API | Express 5 + TypeScript | REST, JSON responses |
| Frontend | React 19 + Vite | SPA, React Router v7 |
| Data Fetching | TanStack Query v5 | Caching + optimistic updates |
| UI | TailwindCSS v4 + DaisyUI v5 | Theme-aware components |
| Icons | lucide-react | Consistent icon set |
| Fonts | IBM Plex Sans Thai · IBM Plex Mono | Primary body + monospace numerics |
| Photo Storage | Cloudinary | Site photos uploaded server-side; `secure_url` stored in DB. SDK: `cloudinary` (backend), `@cloudinary/react` + `@cloudinary/url-gen` (frontend display) |

---

## User Roles

| Role | Thai label | Description |
|---|---|---|
| `customer` | ลูกค้า | Registers, places orders, tracks delivery status via web + LINE |
| `dispatcher` | ฝ่ายจัดส่ง | Views all orders, builds the delivery schedule, assigns trucks/drivers, monitors live map |
| `driver` | คนขับ | Views assigned daily deliveries, marks in-transit and delivered |
| `admin` | ผู้ดูแลระบบ | Full access — manages products, users, and system settings |

Role is stored in the `users.role` column and checked server-side in route middleware.

---

## Concrete Product Catalogue (Thai ksc grades)

Grades are specified in **ksc** (กิโลกรัม-แรง/ตร.ซม.) — not MPa. Seed data:

| id | Thai name | Grade | Slump | Typical use | Price ฿/คิว | Min คิว |
|---|---|---|---|---|---|---|
| p180 | คอนกรีตผสมเสร็จ 180 ksc | 180 | 7.5 | งานเทพื้น เทหล่อทั่วไป งานเบา | 1,850 | 1 |
| p210 | คอนกรีตผสมเสร็จ 210 ksc | 210 | 10 | พื้น คาน เสาบ้านพักอาศัย | 1,980 | 1 |
| p240 | คอนกรีตผสมเสร็จ 240 ksc | 240 | 10 | งานโครงสร้างทั่วไป อาคาร 2–3 ชั้น | 2,120 | 1 |
| p280 | คอนกรีตผสมเสร็จ 280 ksc | 280 | 12.5 | โครงสร้างรับน้ำหนัก อาคารสูง | 2,290 | 1.5 |
| p320 | คอนกรีตผสมเสร็จ 320 ksc | 320 | 12.5 | เสาเข็ม ฐานราก งานรับแรงสูง | 2,480 | 1.5 |
| p350 | คอนกรีตกำลังอัดสูง 350 ksc | 350 | 15 | งานพิเศษ พื้น Post-tension | 2,640 | 2 |
| p400 | คอนกรีตกำลังอัดสูง 400 ksc | 400 | 15 | โครงสร้างพิเศษ สะพาน เสาสูง | 2,880 | 2 |

Product cards show: grade (ksc) + slump + use-case blurb + price/คิว. Prices exclude VAT 7%.

---

## Database Schema (`backend/src/db/schema.ts`)

Extend the existing `users`, `products`, `comments` tables with the following:

### `users` (extend existing)
```ts
role: text("role").notNull().default("customer"), // customer | dispatcher | driver | admin
phone: text("phone"),
```

### `concrete_products`
```ts
id: uuid PK
name: text          // e.g. "คอนกรีตผสมเสร็จ 240 ksc"
description: text
grade: text         // e.g. "240" (ksc value as string)
slump: text         // e.g. "10" (cm)
useCase: text       // e.g. "งานโครงสร้างทั่วไป อาคาร 2–3 ชั้น"
pricePerCubicMeter: numeric(10,2)
minOrderM3: numeric(6,2)
imageUrl: text
isActive: boolean default true
createdAt, updatedAt: timestamp
```

### `orders`
Customer order header — extended with contact info, job-site location, and photos.
```ts
id: uuid PK
orderNumber: text UNIQUE    // auto-generated: "ORD-20260603-0001"
customerId: text FK → users.id
status: text default "pending"
  // pending | confirmed | scheduled | in_transit | delivered | cancelled

// delivery location (Bangkok neighbourhood key + optional coords)
deliveryArea: text          // e.g. "sathorn" — key into known delivery zones
deliveryLabel: text         // e.g. "อาคารสำนักงานสาทร"
deliveryLat: numeric(10,6)
deliveryLng: numeric(10,6)
deliveryGeoLink: text       // Google Maps short link or full URL pasted by customer
deliveryGeoMethod: text     // "link" | "pin"

// customer contact at job site
contactName: text           // required — "คุณสมศักดิ์ ใจดี"
contactPhone: text          // Thai mobile: 0XX-XXX-XXXX

// job-site reference photos (up to 4, stored as JSON array of URLs)
sitePhotoUrls: json

preferredDate: date
preferredTimeSlot: text     // customer submits "morning"|"afternoon"|"evening"; dispatcher overwrites with specific ETA e.g. "13:30" when confirming
specialInstructions: text
totalAmount: numeric(12,2)
createdAt, updatedAt: timestamp
```

### `order_items`
```ts
id: uuid PK
orderId: uuid FK → orders.id CASCADE
productId: uuid FK → concrete_products.id
quantityM3: numeric(6,2)
unitPrice: numeric(10,2)    // snapshot of price at order time
lineTotal: numeric(12,2)
```

### `trucks`
Fleet of mixer trucks (รถโม่).
```ts
id: uuid PK
registration: text UNIQUE   // e.g. "82-3041"
licensePlateArea: text      // e.g. "กทม" | "สป" | "นบ"
truckType: text             // "โม่ใหญ่" | "โม่เล็ก"
capacity: numeric(6,2)      // max คิว (m³) per load
colorHex: text              // display colour for schedule board & map
isActive: boolean default true
```

### `delivery_schedules`
Dispatcher assigns an order to a truck + driver with a confirmed time window. Multiple rows per order are allowed (multi-truck split delivery).
```ts
id: uuid PK
orderId: uuid FK → orders.id   // NOT UNIQUE — multiple rows per order for multi-truck
truckId: uuid FK → trucks.id
driverId: text FK → users.id
scheduledDate: date
scheduledStartTime: time    // e.g. "08:00"
scheduledEndTime: time      // e.g. "10:00"
dispatcherNotes: text
status: text default "scheduled"
  // scheduled | in_transit | completed | failed
createdAt, updatedAt: timestamp
```

---

## Time Slots

Customers choose a preferred slot when placing an order:

| Key | Thai label | Range |
|---|---|---|
| `morning` | ช่วงเช้า | 08:00–12:00 |
| `afternoon` | ช่วงบ่าย | 13:00–17:00 |
| `evening` | ช่วงเย็น | 17:00–19:00 |

**Dispatcher confirm flow**: before confirming a pending order the dispatcher sets a specific ETA time (e.g. `13:30`) via an inline panel in the `DispatcherDashboard`. This overwrites `preferredTimeSlot` with the exact time string and saves it alongside `preferredDate` in the same `PATCH /api/orders/:id/status` call. The precise `scheduledStartTime` / `scheduledEndTime` (30-min increments 07:00–19:00) is then set separately in the `AssignDrawer` when assigning the truck.

---

## Order Status State Machine

```
รอยืนยัน (pending)
  └─► ยืนยันแล้ว (confirmed)    dispatcher ยืนยัน
        └─► จัดคิวแล้ว (scheduled)  dispatcher assign truck + driver
              └─► กำลังจัดส่ง (in_transit)  driver ออกรถ
                    └─► ส่งสำเร็จ (delivered)   driver ยืนยันส่ง

Any state ──► ยกเลิก (cancelled)
```

Each transition sends an automated LINE message to the customer (see LINE Integration section).

---

## API Endpoints (`backend/src/routes/`)

### Auth / Users — `userRoutes.ts`
```
POST   /api/users/sync          Clerk webhook — upsert user on sign-up
GET    /api/users/me            Returns current user profile + role
PATCH  /api/users/me            Update phone number
GET    /api/users               [admin] List all users
PATCH  /api/users/:id/role      [admin] Change a user's role
```

### Concrete Products — `concreteProductRoutes.ts`
```
GET    /api/concrete-products             Public — list all active products
GET    /api/concrete-products/:id         Public — product detail
POST   /api/concrete-products             [admin] Create product
PATCH  /api/concrete-products/:id         [admin] Update product
DELETE /api/concrete-products/:id         [admin] Soft-delete (isActive=false)
```

### Orders — `orderRoutes.ts`
```
POST   /api/orders                        [customer] Place new order (with contact + geo + photos)
GET    /api/orders                        [dispatcher|admin] All orders (filterable by status/date)
GET    /api/orders/my                     [customer] Current user's orders
GET    /api/orders/:id                    Owner or dispatcher — order detail with items + schedule
PATCH  /api/orders/:id/status             [dispatcher|admin] Update order status → triggers LINE notification; also accepts optional `preferredDate` + `preferredTimeSlot` (dispatcher sets ETA when confirming)
DELETE /api/orders/:id                    [customer] Cancel pending order
```

### Delivery Schedule — `scheduleRoutes.ts`
```
GET    /api/schedule                      [dispatcher|admin] Full schedule (with order+items+truck+driver joins)
POST   /api/schedule                      [dispatcher] Assign order → assignments[] (multi-truck); qty + conflict validated
PUT    /api/schedule                      [dispatcher] Replace all schedule rows for an order (edit mode); blocks if any row in_transit
PATCH  /api/schedule/:id/status           [driver|dispatcher] Update single delivery status (in_transit → completed)
DELETE /api/schedule/:id                  [dispatcher] Delete a single schedule row
```

**Multi-truck body shape** (`POST` and `PUT`):
```json
{
  "orderId": "uuid",
  "assignments": [
    { "truckId": "uuid", "quantityM3": 3, "scheduledDate": "2026-06-17", "scheduledStartTime": "08:00", "scheduledEndTime": "10:00" }
  ],
  "dispatcherNotes": "optional"
}
```

### Trucks — `truckRoutes.ts`
```
GET    /api/trucks                        [dispatcher|admin] List trucks
POST   /api/trucks                        [admin] Add truck
PATCH  /api/trucks/:id                    [admin] Update truck
```

---

## LINE Official Account Integration

LINE is the **primary customer communication channel**. All status transitions fire an automated OA message. The customer's LINE thread mirrors the order lifecycle.

### Automated message triggers

| Trigger | Message type | Content |
|---|---|---|
| Order placed | Text + Order summary card | รับคำสั่งซื้อ + สรุปออเดอร์ (grade, คิว, หน้างาน, รอบส่ง, ยอดรวม) |
| Status → confirmed | Text | ยืนยันออเดอร์แล้ว กำลังจัดคิวรถโม่ |
| Status → scheduled | Text + **Dispatch confirmation card** | ยืนยันการจัดรถ: ทะเบียนรถ, คนขับ, เบอร์โทร, ช่วงเวลาจัดส่ง |
| Status → in_transit | Text + **Live tracking card** | รถออกจากโรงงาน + mini-map with ETA progress |
| Status → delivered | Live card (updated) + Text + Rating quick-reply | ส่งสำเร็จ + prompt ให้คะแนน |

### LINE card designs
- **Order card**: Blue gradient header (`#3D7BF7 → #1F52C9`), order summary KV rows
- **Dispatch card**: Green gradient header (`#06C755 → #05954A`), truck reg + driver + time window highlight
- **Live card**: Mini Bangkok map + ETA counter + progress bar. Updates in real-time when `progress` changes.

### LINE env vars needed
```
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

Backend fires LINE Messaging API (`/v2/bot/message/push`) on status change. Phone number stored in `users.phone` is used to look up the customer's LINE userId (or fall back to a webhook flow).

---

## Customer Order Form UX (3-step flow)

### Step 1 — เลือกคอนกรีต (Product & Quantity)
- Grid of product cards (2-col): grade in ksc, use-case blurb, ฿/คิว
- Selected card gets primary-coloured border + ring
- Range slider for quantity (min = product.minM3, max = 12, step = 0.5)
- Running subtotal shown in footer
- *Planned simplification*: replace card grid → `<select>` dropdown; replace slider → number input + ±0.5 stepper buttons

### Step 2 — หน้างาน & เวลา (Job Site & Time)
- Site picker (2-col grid of Bangkok areas with area + label)
- Date input (defaults to today)
- Time-slot buttons: ช่วงเช้า / ช่วงบ่าย / ช่วงเย็น
- Delivery note textarea

**Location attachment** (required by default, configurable):
- Tab 1 — **วางลิงก์ Google Maps**: paste URL or raw coords (e.g. `13.7234, 100.5678`).
  Parses: `@lat,lng`, `?q=lat,lng`, `!3d…!4d…`, bare coordinate strings, short-links (maps.app.goo.gl — accepted as approximate)
- Tab 2 — **ปักหมุดบนแผนที่**: tap to pin on the stylised Bangkok map
- Confirmed state shows mini-map with pin + badge (จากลิงก์ / ปักหมุด) + coords

**Job-site photos** (1–4 slots, configurable):
- Drag-drop or click-to-upload per slot, 4:3 aspect ratio thumbnails
- Remove button overlaid on thumbnail

"ถัดไป" disabled + hint message until required attachments provided.

### Step 3 — ติดต่อ & ยืนยัน (Contact & Confirm)
- **Contact name** (required): text input with person icon
- **Mobile number** (required): tel input, validates Thai format (`0[0-9]{8,9}`)
- Inline validation error blocks order placement until filled
- Order summary table: grade, คิว, หน้างาน, วันที่, ผู้ติดต่อ, พิกัด, หมายเหตุ
- Attached photos thumbnail row
- Price breakdown: grade × คิว + ค่าจัดส่งฟรี + ยอดรวม (excl. VAT)
- LINE info strip: "หลังยืนยัน คุณจะได้รับการอัปเดตทุกขั้นตอนทาง LINE"

---

## Dispatcher Dashboard

### Stats bar (5 tiles)
รอยืนยัน · รอจัดคิว · กำลังจัดส่ง · ปริมาณวันนี้ (คิว) · ยอดขายวันนี้ (฿)

### Order queue (left column)
- **รอจัดคิวรถ** (confirmed): each row has "จัดคิว" button → opens AssignDrawer
- **ออเดอร์ใหม่ รอยืนยัน** (pending): "ยืนยันออเดอร์" button expands an **inline ETA panel** — dispatcher picks delivery date + specific ETA time (e.g. `13:30`) before confirming → saves date+time to DB and moves order to confirmed queue
- **จัดคิวแล้ว / กำลังส่ง**: read-only rows

### AssignDrawer (right slide-in panel, 430 px wide)
1. Order summary card (customer name, grade, คิว, หน้างาน, time slot, note)
2. **ข้อมูลอ้างอิงหน้างาน** — if order has `geo` or `sitePhotoUrls`: shows clickable Maps link + photo thumbnails
3. Truck picker (card list): shows reg, type, capacity; conflict-checked (ติดคิว badge if time overlaps), capacity warning if qty > cap
4. Driver select dropdown
5. Time-window selects (start/end from 30-min slots 07:00–19:00); "ช่วงเวลานี้จะถูกส่งให้ลูกค้าทาง LINE" note
6. Dispatcher notes textarea
7. Submit: "ยืนยันจัดคิว & แจ้งลูกค้า" — posts to `/api/schedule`, fires LINE dispatch card; toast confirmation

### Right column (sticky)
- Live Bangkok map (mini, 250 px tall) — truck positions + delivery pins
- Fleet utilisation list: truck reg + status for each truck

---

## Schedule Board (ตารางจัดส่ง)

- Grid: **columns = trucks** (one per รถโม่), **rows = time slots** (07:00–19:00, each row = 54 px/hour)
- Delivery blocks positioned absolutely by `scheduledStartTime` / `scheduledEndTime`
- Block colour = order status colour; white pulsing dot for in_transit
- Horizontal scroll when trucks overflow viewport (min column width 132 px)
- Header shows: truck reg + plate + type + capacity

---

## Live Monitoring (ติดตามการจัดส่งสด)

- Full-width Bangkok map (400 px tall) with animated truck glyphs moving along L-shaped routes
- Delivery track cards below map (2-col grid): truck reg, status badge, destination, ETA countdown, progress bar
- "เดินรถ" (advance) and "ถึงแล้ว" (mark delivered) controls on each card
- Right column: LINE chat mirror of selected order — updates live as progress changes
- "จำลองเดินรถ" toggle auto-advances all in-transit trucks every 1.7 s

---

## Driver Dashboard (งานจัดส่งวันนี้)

- Driver header card (gradient blue): name, date, driver selector dropdown
- Summary stats: เที่ยวรวม · คิวรวม · ส่งสำเร็จ/ทั้งหมด
- Trip cards (sorted by scheduledStartTime):
  - Time rail (left side): trip number + start/end time, coloured by status
  - Body: area, address, grade, คิว, truck reg, customer name, note
  - "ออกรถ" → `in_transit`; "ส่งสำเร็จ" → `delivered`; each fires a LINE notification toast

---

## Bangkok Delivery Areas (seed data)

| Key | Thai area | Label |
|---|---|---|
| sathorn | สาทร | อาคารสำนักงานสาทร |
| ladprao | ลาดพร้าว | คอนโดลาดพร้าว 71 |
| bangna | บางนา | โกดังบางนา กม.5 |
| rama9 | พระราม 9 | มิกซ์ยูสพระราม 9 |
| thonglor | ทองหล่อ | บ้านเดี่ยวทองหล่อ 13 |
| rangsit | รังสิต | หมู่บ้านรังสิตคลอง 3 |
| charoen | เจริญนคร | ริเวอร์ไซด์ เจริญนคร |
| ratchada | รัชดา | อาคารชุดรัชดา 17 |

Plant origin: **โรงงานพระราม 2** (x:50, y:78 in the 0–100 viewBox).
The map is a **stylised Bangkok SVG** — not a real map tile API.

---

## Design System & Visual Language

### Typography
```css
--font: 'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif;
--mono: 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace;
```
Monospace is used for order numbers, truck registrations, prices, and times.

### Colour tokens
```css
--bg: #EAEEF4           /* page background */
--surface: #FFFFFF       /* card background */
--surface-2: #F6F8FC     /* sidebar, drawer */
--surface-3: #EFF3F9     /* inset panels, field backgrounds */
--border: #E2E8F2
--border-2: #D3DBE8

--ink: #0F1B2D           /* primary text */
--ink-2: #46536A         /* secondary text */
--ink-3: #8A97AC         /* muted/labels */
--ink-4: #B4BECD         /* placeholders */

/* Brand / primary */
--primary: #2B6CF0       /* blue — default accent */
--primary-600: #1B57D6
--primary-700: #1547B5
--primary-50: #EAF1FE    /* tint bg for selected states */
--primary-100: #D8E5FD   /* focus ring */

/* LINE brand (green) */
--line: #06C755
--line-600: #05B14C
--line-50: #E7F9EE
--line-ink: #0A3D1E

/* Status colours */
--st-pending: #E08A00        bg: #FDF3E0  /* รอยืนยัน — amber */
--st-confirmed: #2B6CF0      bg: #E8F0FE  /* ยืนยันแล้ว — blue */
--st-scheduled: #7C3AED      bg: #F1EAFE  /* จัดคิวแล้ว — purple */
--st-transit: #0E97D4        bg: #E2F4FC  /* กำลังจัดส่ง — sky */
--st-delivered: #16A34A      bg: #E6F6EC  /* ส่งสำเร็จ — green */
--st-cancelled: #7A879B      bg: #EEF1F6  /* ยกเลิก — grey */
--danger: #E0443E            bg: #FCEBEA
```

### Border radii
`--r-xs:8px` `--r-sm:10px` `--r:14px` `--r-lg:18px` `--r-xl:24px`

### Key component patterns

**Cards** — `background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); box-shadow: var(--sh-sm)`
**Selected state** — `border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-100)`
**Buttons** — primary (blue fill), ghost (outlined), soft (primary tint fill), line (green fill). Heights: sm 32 px, default 38 px, lg 46 px.
**Badges** — colour-coded per status, 24 px tall with leading dot
**Chips** — `background: var(--surface-3)`, 26 px, for inline metadata tags
**Fields** — `border: 1px solid var(--border-2); border-radius: 10px; height: 42 px`; focus ring `0 0 0 3px var(--primary-100)`

**Animations**:
- `fade-in` — translateY(7px) → none on mount (0.4s)
- `pop-in` — scale(.96)+translateY(6px) → none (0.34s, spring easing)
- `pulse` — opacity 1↔0.45 loop (1.8s) — used on live status dots
- `ring-pulse` — scale+opacity ring expand (1.6s) — truck position ring on map

### Sidebar layout
- Width: 248 px fixed
- Brand header: gradient blue logo mark + "ConcreteFlow" + sub-brand
- Nav items: icon + label + optional badge (pending count) or live dot
- Demo role switcher section at bottom of nav
- User profile footer

---

## Backend File Structure

```
backend/src/
├── config/
│   └── env.ts                   ENV vars (PORT, DATABASE_URL, CLERK_*, FRONTEND_URL, LINE_*)
├── db/
│   ├── index.ts                 Drizzle client (pg Pool + drizzle())
│   ├── schema.ts                All table definitions + relations + inferred types  ✅ ConcreteFlow tables added
│   ├── queries.ts               Reusable query helpers (legacy Productify)
│   └── seed.ts                  One-time seed script for 7 ksc grades (run via npm run db:seed)  ✅
├── middleware/
│   ├── requireAuth.ts           Clerk userId guard — 401 if not authenticated  ✅
│   └── requireRole.ts           DB role check — 403 if wrong role  ✅
├── routes/
│   ├── userRoutes.ts            (legacy Productify)
│   ├── productRoutes.ts         (legacy Productify)
│   ├── commentRoutes.ts         (legacy Productify)
│   ├── concreteProductRoutes.ts GET (public) + POST/PATCH/DELETE (admin) + /seed  ✅
│   ├── orderRoutes.ts           POST + GET /my + GET / + PATCH /:id/status  ✅
│   ├── scheduleRoutes.ts        GET · POST · PUT · PATCH/:id/status · DELETE  ✅
│   └── truckRoutes.ts           GET · POST/seed · POST · PATCH/:id  ✅
├── controllers/
│   ├── userController.ts        syncUser · getMe · updateMe · getAllUsers · updateUserRole  ✅
│   ├── productController.ts     (legacy Productify)
│   ├── commentController.ts     (legacy Productify)
│   ├── concreteProductController.ts  ✅
│   ├── orderController.ts       createOrder (uploads photos → Cloudinary) · getMyOrders (with joins) · getAllOrders · updateOrderStatus  ✅
│   ├── scheduleController.ts    getSchedule · createSchedule (qty+conflict check) · replaceSchedule (PUT, edit mode) · updateScheduleStatus · deleteSchedule  ✅
│   └── truckController.ts       getTrucks · seedTrucks (5 trucks) · createTruck · updateTruck  ✅
├── services/
│   ├── cloudinaryUpload.ts      uploadImage · uploadImages — uploads base64 data URLs to Cloudinary, returns secure_url  ✅
│   └── lineNotify.ts            LINE Messaging API push helper  ⬜ pending
└── index.ts                     Express app entry; body limit raised to 10 mb for photo payloads
```

---

## Frontend File Structure

```
frontend/src/
├── lib/
│   ├── axios.js                 Axios instance with Clerk token interceptor
│   └── api.js                   API helpers — concrete-products, orders, dispatcher (trucks, schedules, drivers), users  ✅
├── hooks/
│   ├── useAuthReq.js            Clerk loaded + signed-in state
│   ├── useUserSync.js           Sync Clerk user → backend on sign-in
│   ├── useProducts.js           (legacy Productify)
│   ├── useComments.js           (legacy Productify)
│   ├── useConcreteProducts.js   TanStack Query — GET /api/concrete-products  ✅
│   ├── useOrders.js             useMyOrders + useCreateOrder + useDeleteOrder  ✅
│   └── useDispatcher.js         useAllOrders · useConfirmOrder · useTrucks · useSeedTrucks · useDrivers · useSchedules · useCreateSchedule · useReplaceSchedule · useUpdateScheduleStatus · useSwitchRole  ✅
├── components/
│   ├── Navbar.jsx               Updated for ConcreteFlow nav
│   ├── ConcreteShell.jsx        Full-screen sidebar shell for ConcreteFlow pages  ✅
│   ├── LoadingSpinner.jsx
│   ├── OrderStatusBadge.jsx     ⬜ pending (inline styled in pages for now)
│   ├── ConcreteProductCard.jsx  ⬜ pending (product selection inline in OrderPage for now)
│   ├── GeoAttach.jsx            ⬜ pending (inline in OrderPage for now)
│   ├── PhotoDrop.jsx            ⬜ pending (inline in OrderPage for now)
│   ├── OrderForm.jsx            ⬜ pending (logic lives in OrderPage for now)
│   ├── OrderTracker.jsx         ⬜ pending (inline in MyOrdersPage for now)
│   ├── OrderRow.jsx             ⬜ pending
│   ├── AssignDrawer.jsx         ⬜ pending (inlined inside DispatcherDashboard.jsx for now)
│   ├── ScheduleBoard.jsx        ⬜ pending
│   ├── MapView.jsx              ⬜ pending
│   ├── LineChat.jsx             ⬜ pending
│   └── DeliveryTrackCard.jsx    ⬜ pending
├── pages/
│   ├── HomePage.jsx             Public — hero + legacy product grid (Productify)
│   ├── ProductPage.jsx          Legacy Productify product detail
│   ├── CreatePage.jsx           Legacy Productify create product
│   ├── EditProductPage.jsx      Legacy Productify edit product
│   ├── ProfilePage.jsx          Legacy Productify profile
│   ├── OrderPage.jsx            [customer] 3-step order form — wired to real API  ✅
│   ├── MyOrdersPage.jsx         [customer] Order list; multi-truck schedules[], toUiOrder normaliser, null guards  ✅
│   ├── DispatcherDashboard.jsx  [dispatcher] Stats · order queues · inline AssignDrawer · multi-truck assign · edit mode (PUT) · fleet panel  ✅
│   ├── TruckView.jsx            [dispatcher] 24-hr side-by-side Gantt (today + tomorrow); sticky labels; auto-scroll to now  ✅  (route: /trucks)
│   ├── ScheduleBoardPage.jsx    ⬜ pending — classic truck-column Gantt (columns=trucks, rows=timeslots)
│   ├── LiveMonitor.jsx          ⬜ pending
│   ├── DriverDashboard.jsx      ⬜ pending
│   └── AdminPage.jsx            ⬜ pending
├── concreteflow.css             ConcreteFlow design-system tokens + utility classes  ✅
└── App.jsx                      Routes: legacy layout + /order + /my-orders + /dispatch + /trucks  ✅
```

---

## Key Frontend Flows

### 1. Customer Places an Order
1. Browse `HomePage` → product card → `ProductDetailPage`
2. "Order Now" → `OrderPage` (requires sign-in)
3. **Step 1** — Pick ksc grade + drag quantity slider (min enforced per product)
4. **Step 2** — Pick Bangkok delivery area + date + time slot + note; attach Google Maps location (paste or pin); upload 1–4 job-site photos
5. **Step 3** — Enter contact name + Thai mobile; review full summary + price; submit → `POST /api/orders`
6. Redirect to `MyOrdersPage` — order appears as **รอยืนยัน**; LINE confirmation fires

### 2. Dispatcher Manages Schedule
1. `DispatcherDashboard` shows confirmed orders in "รอจัดคิวรถ" queue
2. Click order row / "จัดคิว" button → `AssignDrawer` slides in
3. Drawer shows: order summary + customer's attached geo link + photos
4. Dispatcher selects truck (conflict + capacity checked), driver, and precise time window
5. Submit → `POST /api/schedule` → order moves to **จัดคิวแล้ว**; LINE dispatch confirmation card sent automatically
6. `ScheduleBoardPage` renders the timeline grid for the full day

### 3. Live Monitoring
1. `LiveMonitor` loads all scheduled/in-transit/delivered orders
2. Bangkok map shows truck glyphs animating along L-shaped routes
3. Dispatcher can advance trips ("เดินรถ"), complete them ("ถึงแล้ว"), or toggle auto-sim
4. Right panel mirrors the **LINE chat thread** of the selected order, updating live

### 4. Driver Views Deliveries
1. `DriverDashboard` loads `GET /api/schedule/driver/me?date=today`
2. Trip cards show time window, area, grade/คิว, truck, customer, notes
3. "ออกรถ" → `in_transit`; "ส่งสำเร็จ" → `delivered`; each triggers LINE push

---

## Role-Based Route Guards (`App.jsx`)

```jsx
<Route path="/order"       element={<OrderPage />} />         {/* customer */}
<Route path="/my-orders"   element={<MyOrdersPage />} />      {/* customer */}
<Route path="/dispatch"    element={<DispatcherDashboard />} /> {/* dispatcher — ✅ live */}
<Route path="/trucks"      element={<TruckView />} />           {/* dispatcher — ✅ live (24-hr Gantt) */}
{/* pending routes — add when pages are built: */}
{/* <Route path="/schedule"  element={<ScheduleBoardPage />} /> */}
{/* <Route path="/monitor"   element={<LiveMonitor />} /> */}
{/* <Route path="/driver"    element={<DriverDashboard />} /> */}
{/* <Route path="/admin"     element={<AdminPage />} /> */}
```

Role guards are enforced by the ConcreteShell sidebar nav and backend `requireRole` middleware; a `RequireRole` wrapper component is planned but not yet added to the routes.

---

## Environment Variables

Both `.env` files are listed in `.gitignore` (`.env` / `.env.*` pattern) and must never be committed.

### Backend (`backend/.env`)
```
PORT=3000
DATABASE_URL=postgresql://user:pass@host/dbname
NODE_ENV=development

CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

FRONTEND_URL=http://localhost:5173

LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

CLOUDINARY_CLOUD_NAME=dsy5t9vju
CLOUDINARY_API_KEY=<your_api_key>
CLOUDINARY_API_SECRET=<your_api_secret>
```

### Frontend (`frontend/.env`)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3000/api
```

> **Cloudinary note:** API key + secret live in `backend/.env` only. The backend SDK uploads photos server-side and returns `secure_url` strings. The frontend packages `@cloudinary/react` + `@cloudinary/url-gen` are for displaying/transforming Cloudinary images in the UI.

---

## Development Commands

```bash
# Backend
cd backend
npm install
npm run dev            # nodemon + ts-node, hot reload on :3000
npm run db:push        # push schema changes to PostgreSQL via drizzle-kit
npm run db:seed        # seed 7 ksc grades into concrete_products (idempotent)

# Frontend
cd frontend
npm install
npm run dev            # Vite dev server on :5173

# Production build (from repo root)
npm run build          # installs + builds both sides
npm run start          # runs DB push then starts Express (serves frontend/dist)
```

---

## Drizzle Schema Update Workflow

1. Edit `backend/src/db/schema.ts`
2. Run `npm run db:push --prefix backend` — applies changes to the connected DB
3. TypeScript inference updates automatically; no separate migration file needed for development
4. For production: use `drizzle-kit generate` + `drizzle-kit migrate` to create versioned SQL migrations

---

## Scheduling System Design Notes

- **No double-booking**: `createSchedule` and `replaceSchedule` both check that the same `truckId` + `scheduledDate` + overlapping time window does not already exist (skips completed/failed rows).
- **Multi-truck split delivery**: A single order can be assigned to multiple trucks by submitting `assignments[]` with more than one entry. `delivery_schedules` has no UNIQUE constraint on `orderId`.
- **Qty over-allocation guard**: Total `quantityM3` across all `assignments[]` must not exceed the order's `order_items` total. Enforced server-side (0.001 float tolerance) and in the `AssignDrawer` UI (`remaining < 0` blocks submit).
- **Edit mode (PUT)**: `replaceSchedule` atomically deletes all existing rows for the order and re-inserts the new `assignments[]`. Blocked if any existing row has `status = "in_transit"`.
- **Conflict check in edit mode**: Both server (`s.orderId === orderId` skip) and client (`isEdit && s.orderId === order.id` skip) exclude the order's own existing rows when checking for time overlaps.
- **Capacity check**: Sum of `order_items.quantityM3` for all orders assigned to a truck on a given day must not exceed `trucks.capacity`. Fleet panel in `DispatcherDashboard` shows 3 states: ว่าง (green) / ติดคิวพรุ่งนี้ (amber) / ติดคิววันนี้ (sky).
- **ETA on confirm**: `preferredTimeSlot` starts as a customer hint (morning / afternoon / evening). When the dispatcher confirms a pending order they overwrite it with a specific time string (e.g. `"13:30"`) via the inline ETA panel. The precise `scheduledStartTime` / `scheduledEndTime` for the truck is then set separately in the `AssignDrawer` (30-min increments 07:00–19:00).
- **Small trucks**: รถโม่เล็ก (cap 2 คิว) are appropriate for narrow-alley sites (ซอยแคบ). AssignDrawer shows ⚠ warning when `quantityM3 > truck.capacity`.
- **Real-time updates**: Use TanStack Query polling (`refetchInterval: 30_000`) on the `LiveMonitor` and `ScheduleBoardPage`. WebSocket layer is a future enhancement.

---

## Implementation Order

1. ✅ **Schema** — Extended `users` (role, phone); added `concrete_products`, `orders`, `order_items`, `trucks`, `delivery_schedules`; `db:push` applied
2. ✅ **Middleware** — `requireAuth.ts` (Clerk userId guard) + `requireRole.ts` (DB role check)
3. ✅ **Concrete Products CRUD** — 7 ksc grades seeded via `npm run db:seed`; public GET routes live; admin write routes ready (no admin UI yet)
4. ✅ **Orders backend** — `POST /api/orders` (auto order number, creates order + order item, uploads photos → Cloudinary); `GET /api/orders/my` (joined: items + product + schedules + trucks + driver); dispatcher `GET /api/orders`; `PATCH /api/orders/:id/status`
5. ✅ **User routes** — `POST /sync`; `GET /me`; `PATCH /me` (phone + role); `GET /` (admin); `PATCH /:id/role` (admin); `GET /drivers` (dispatcher)
6. ✅ **Cloudinary** — `backend/src/services/cloudinaryUpload.ts`; `createOrder` uploads base64 photos server-side before DB insert; `sitePhotoUrls` now stores `https://res.cloudinary.com/…` URLs
7. ✅ **Truck routes** — `GET /api/trucks`; `POST /api/trucks/seed` (5 trucks); `POST` + `PATCH/:id` (admin); `truckController.ts`
8. ✅ **Schedule routes** — `GET`, `POST` (multi-truck, qty+conflict check), `PUT` (replace-all edit mode, blocks in_transit), `PATCH/:id/status`, `DELETE/:id`; `scheduleController.ts`
9. ✅ **OrderPage** — 3-step form wired to real API; fetches grades from DB; submits to `POST /api/orders`; loading + error states
10. ✅ **MyOrdersPage** — `useMyOrders` hook; `toUiOrder` + `mapSched` normaliser; all trucks in `schedules[]` array; null-safe `orderNumber`; loading + error + empty states
11. ✅ **DispatcherDashboard** — stats bar; pending/confirmed/scheduled queues; inline ETA confirm panel (date + specific time picker before confirm, saves to `preferredDate`+`preferredTimeSlot`); inline `AssignDrawer` with multi-truck rows, qty allocation guard, conflict check; edit mode via PUT; fleet panel (3-state busy)
12. ✅ **TruckView** — 24-hr side-by-side Gantt (today + tomorrow); 64px/hr; sticky truck labels; auto-scroll to current time; block click → status actions
13. ⬜ **LINE service** — `lineNotify.ts` push helper wired to status changes
14. ⬜ **Schedule Board Page** (`ScheduleBoardPage.jsx`) — classic truck-column Gantt (columns = trucks, rows = 07:00–19:00 timeslots)
15. ⬜ **Live Monitor** — `LiveMonitor.jsx` with animated Bangkok map, delivery track cards, LINE chat mirror
16. ⬜ **Driver UI** — `DriverDashboard.jsx` — trip cards, ออกรถ / ส่งสำเร็จ actions
17. ⬜ **Admin UI** — `AdminPage.jsx` — manage products (ksc grades), trucks (รถโม่), user roles
