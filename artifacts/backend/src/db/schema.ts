import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigint,
  timestamp,
  boolean,
  date,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", [
  "superadmin",
  "admin",
  "advisor",
  "technician",
]);

// Internal workshop status — full operational granularity
export const internalStatusEnum = pgEnum("internal_status", [
  "intake",
  "in_progress",
  "awaiting_parts",
  "denting",
  "painting",
  "polishing",
  "electrical",
  "washing",
  "quality_check",
  "ready",
  "delivered",
  "cancelled",
]);

// Customer-facing status — simplified, hides internal complexity
export const customerStatusEnum = pgEnum("customer_status", [
  "received",
  "in_repair",
  "final_inspection",
  "ready_for_delivery",
  "delivered",
]);

export const whatsappGroupStatusEnum = pgEnum("whatsapp_group_status", [
  "pending",
  "created",
  "failed",
  "retrying",
  "manual_required",
]);

// Every thing that happens on a case is an event
export const eventTypeEnum = pgEnum("event_type", [
  "intake_created",
  "case_edited",
  "technician_update",
  "customer_update",
  "internal_status_change",
  "customer_status_change",
  "image_uploaded",
  "image_deleted",
  "group_created",
  "group_failed",
  "message_sent",
  "delivery_completed",
]);

// ── departments ────────────────────────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── users ──────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  role: roleEnum("role").notNull().default("advisor"),
  departmentId: bigint("department_id", { mode: "number" }).references(
    () => departments.id
  ),
  pinHash: text("pin_hash"),
  pushToken: text("push_token"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── refresh_tokens ─────────────────────────────────────────────────────────────

export const refreshTokens = pgTable("refresh_tokens", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── daily case number sequences ────────────────────────────────────────────────

export const dailyCaseSequences = pgTable("daily_case_sequences", {
  date: date("date").primaryKey(),
  lastSeq: integer("last_seq").notNull().default(0),
});

// ── cases ──────────────────────────────────────────────────────────────────────

export const cases = pgTable("cases", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  caseNumber: text("case_number").notNull().unique(), // YM-240524-001
  vehicleNumber: text("vehicle_number").notNull(),
  carModel: text("car_model").notNull(),
  customerPhone: text("customer_phone"),
  customerName: text("customer_name"),
  kmCount: text("km_count"),
  dueDate: text("due_date"),
  deliveryType: text("delivery_type"),
  notes: text("notes"),
  // Two separate status tracks
  internalStatus: internalStatusEnum("internal_status").notNull().default("intake"),
  customerStatus: customerStatusEnum("customer_status").notNull().default("received"),
  // WhatsApp
  whatsappGroupId: text("whatsapp_group_id"),
  whatsappInviteLink: text("whatsapp_invite_link"),
  whatsappStatus: whatsappGroupStatusEnum("whatsapp_status"),
  // Ownership
  advisorId: bigint("advisor_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("cases_advisor_id_idx").on(table.advisorId),
  index("cases_deleted_at_idx").on(table.deletedAt),
]);

// ── case_events (the timeline) ─────────────────────────────────────────────────

export const caseEvents = pgTable("case_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  caseId: bigint("case_id", { mode: "number" })
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  eventType: eventTypeEnum("event_type").notNull(),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  message: text("message"),
  // Flexible per-event payload: status transitions, WA group IDs, etc.
  metadata: jsonb("metadata"),
  // For customer_update events: has the advisor sent this to the customer yet?
  sentToCustomer: boolean("sent_to_customer").notNull().default(false),
  // LLM-crafted customer message (populated later)
  customerMessage: text("customer_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("case_events_case_id_idx").on(table.caseId),
]);

// ── case_event_images — images belong to events ────────────────────────────────

export const caseEventImages = pgTable("case_event_images", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: bigint("event_id", { mode: "number" })
    .notNull()
    .references(() => caseEvents.id, { onDelete: "cascade" }),
  // Denormalized for direct case queries without joining through events
  caseId: bigint("case_id", { mode: "number" })
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  filename: text("filename").notNull(),
  // intake | repairs
  folder: text("folder").notNull().default("intake"),
  isPrimary: boolean("is_primary").notNull().default(false),
  // Device-reported click time vs server-confirmed save time
  timestampClick: timestamp("timestamp_click"),
  timestampSaved: timestamp("timestamp_saved").notNull().defaultNow(),
  // Optional GPS — stored if available, never blocks workflow
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("case_event_images_case_id_idx").on(table.caseId),
]);

// ── notifications ──────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  caseId: bigint("case_id", { mode: "number" }).references(() => cases.id, {
    onDelete: "cascade",
  }),
  eventId: bigint("event_id", { mode: "number" }).references(
    () => caseEvents.id,
    { onDelete: "cascade" }
  ),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  pushSent: boolean("push_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
]);
