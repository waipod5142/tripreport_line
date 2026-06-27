import { boolean, date, json, numeric, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // clerkId
  email: text("email").notNull().unique(),
  name: text("name"),
  imageUrl: text("image_url"),
  role: text("role").notNull().default("customer"), // customer | dispatcher | driver | admin
  phone: text("phone"),
  lineUserId: text("line_user_id"), // LINE Messaging API push target (nullable until linked)
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  content: text("content").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// 🔴 Relations define how tables connect to each other. This enables Drizzle's query API
// 🔴 to automatically join related data when using `with: { relationName: true }`

// 🔴 Users Relations: A user can have many products and many comments
// 🔴 `many()` means one user can have multiple related records

export const usersRelations = relations(users, ({ many }) => ({
  products: many(products), // 🔴 One user → many products
  comments: many(comments), // 🔴 One user → many comments
}));

// Products Relations: a product belongs to one user and can have many comments
// `one()` means a single related record, `many()` means multiple related records

export const productsRelations = relations(products, ({ one, many }) => ({
  comments: many(comments),
  // `fields` = the foreign key column in THIS table (products.userId)
  // `references` = the primary key column in the RELATED table (users.id)
  user: one(users, { fields: [products.userId], references: [users.id] }), // one product → one user
}));

// Comments Relations: A comment belongs to one user and one product
export const commentsRelations = relations(comments, ({ one }) => ({
  // `comments.userId` is the foreign key,  `users.id` is the primary key
  user: one(users, { fields: [comments.userId], references: [users.id] }), // One comment → one user
  // `comments.productId` is the foreign key,  `products.id` is the primary key
  product: one(products, { fields: [comments.productId], references: [products.id] }), // One comment → one product
}));

// ─── ConcreteFlow tables ───────────────────────────────────────────────────

export const concreteProducts = pgTable("concrete_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  grade: text("grade").notNull(),         // ksc value, e.g. "240"
  slump: text("slump").notNull(),         // cm, e.g. "10"
  useCase: text("use_case").notNull(),
  pricePerCubicMeter: numeric("price_per_cubic_meter", { precision: 10, scale: 2 }).notNull(),
  minOrderM3: numeric("min_order_m3", { precision: 6, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: text("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  // delivery location
  deliveryArea: text("delivery_area"),
  deliveryLabel: text("delivery_label"),
  deliveryLat: numeric("delivery_lat", { precision: 10, scale: 6 }),
  deliveryLng: numeric("delivery_lng", { precision: 10, scale: 6 }),
  deliveryGeoLink: text("delivery_geo_link"),
  deliveryGeoMethod: text("delivery_geo_method"),  // "link" | "pin"
  // job-site contact
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  // photos stored as JSON array of data-URL or upload URLs
  sitePhotoUrls: json("site_photo_urls"),
  preferredDate: date("preferred_date"),
  preferredTimeSlot: text("preferred_time_slot"),  // "morning" | "afternoon" | "evening"
  specialInstructions: text("special_instructions"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => concreteProducts.id),
  quantityM3: numeric("quantity_m3", { precision: 6, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
});

export const trucks = pgTable("trucks", {
  id: uuid("id").defaultRandom().primaryKey(),
  registration: text("registration").notNull().unique(),
  licensePlateArea: text("license_plate_area"),
  truckType: text("truck_type"),       // "โม่ใหญ่" | "โม่เล็ก"
  capacity: numeric("capacity", { precision: 6, scale: 2 }),
  colorHex: text("color_hex"),
  isActive: boolean("is_active").notNull().default(true),
});

export const deliverySchedules = pgTable("delivery_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),           // no .unique() — one order, many trucks
  truckId: uuid("truck_id").notNull().references(() => trucks.id),
  driverId: text("driver_id").references(() => users.id),                    // nullable — set aside for future
  quantityM3: numeric("quantity_m3", { precision: 6, scale: 2 }),            // cubic metres this truck carries
  scheduledDate: date("scheduled_date").notNull(),
  scheduledStartTime: time("scheduled_start_time"),
  scheduledEndTime: time("scheduled_end_time"),
  dispatcherNotes: text("dispatcher_notes"),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── ConcreteFlow relations ────────────────────────────────────────────────

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(users, { fields: [orders.customerId], references: [users.id] }),
  items: many(orderItems),
  schedules: many(deliverySchedules),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(concreteProducts, { fields: [orderItems.productId], references: [concreteProducts.id] }),
}));

export const concreteProductsRelations = relations(concreteProducts, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const trucksRelations = relations(trucks, ({ many }) => ({
  schedules: many(deliverySchedules),
}));

export const deliverySchedulesRelations = relations(deliverySchedules, ({ one }) => ({
  order: one(orders, { fields: [deliverySchedules.orderId], references: [orders.id] }),
  truck: one(trucks, { fields: [deliverySchedules.truckId], references: [trucks.id] }),
  driver: one(users, { fields: [deliverySchedules.driverId], references: [users.id] }),
}));

// ─── Type inference ────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type ConcreteProduct = typeof concreteProducts.$inferSelect;
export type NewConcreteProduct = typeof concreteProducts.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type Truck = typeof trucks.$inferSelect;
export type NewTruck = typeof trucks.$inferInsert;

export type DeliverySchedule = typeof deliverySchedules.$inferSelect;
export type NewDeliverySchedule = typeof deliverySchedules.$inferInsert;
