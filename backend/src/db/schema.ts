import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

// One row per LINE message (the full conversation archive, mirroring the
// Google Sheet). Trip reports also get a structured `trips` row and are linked
// here via isTripReport/tripId; everything else (chat, stickers) lives here only.
export const lineMessages = pgTable("line_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  lineMessageId: text("line_message_id").notNull().unique(), // DB-level dedupe
  lineUserId: text("line_user_id").notNull(),
  lineGroupId: text("line_group_id"),
  type: text("type").notNull(), // "text" | "image" | "sticker" | other LINE types
  text: text("text"),           // message text, null for non-text messages
  isTripReport: boolean("is_trip_report").notNull().default(false),
  tripId: uuid("trip_id"),      // set when this message was extracted into a trip
  reportedAt: timestamp("reported_at", { mode: "date" }).notNull().defaultNow(), // LINE event time
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const tripsRelations = relations(trips, ({ one }) => ({
  driver: one(lineDrivers, { fields: [trips.lineUserId], references: [lineDrivers.lineUserId] }),
}));

export const lineMessagesRelations = relations(lineMessages, ({ one }) => ({
  driver: one(lineDrivers, { fields: [lineMessages.lineUserId], references: [lineDrivers.lineUserId] }),
  trip: one(trips, { fields: [lineMessages.tripId], references: [trips.id] }),
}));

export const lineDriversRelations = relations(lineDrivers, ({ many }) => ({
  trips: many(trips),
  messages: many(lineMessages),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type LineDriver = typeof lineDrivers.$inferSelect;
export type NewLineDriver = typeof lineDrivers.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

export type LineMessage = typeof lineMessages.$inferSelect;
export type NewLineMessage = typeof lineMessages.$inferInsert;
