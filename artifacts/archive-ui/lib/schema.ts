import {
  pgTable, pgEnum, text, integer, bigint, timestamp,
  boolean, date, jsonb, numeric, index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["superadmin", "admin", "advisor", "technician"]);
export const internalStatusEnum = pgEnum("internal_status", [
  "intake","in_progress","awaiting_parts","denting","painting","polishing",
  "electrical","washing","quality_check","ready","delivered","cancelled",
]);
export const customerStatusEnum = pgEnum("customer_status", [
  "received","in_repair","final_inspection","ready_for_delivery","delivered",
]);
export const customerArrivalStatusEnum = pgEnum("customer_arrival_status", [
  "walk_in","pickup","customer_waiting","breakdown",
]);
export const serviceTypeEnum = pgEnum("service_type", ["service","repair"]);
export const serviceSubTypeEnum = pgEnum("service_sub_type", ["major","minor","breakdown","running"]);
export const whatsappGroupStatusEnum = pgEnum("whatsapp_group_status", [
  "pending","created","failed","retrying","manual_required",
]);
export const eventTypeEnum = pgEnum("event_type", [
  "intake_created","case_edited","technician_update","customer_update",
  "internal_status_change","customer_status_change","image_uploaded","image_deleted",
  "group_created","group_failed","message_sent","message_failed",
  "delivery_completed","case_transferred",
]);

export const departments = pgTable("departments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  role: roleEnum("role").notNull().default("advisor"),
  departmentId: bigint("department_id", { mode: "number" }).references(() => departments.id),
  pinHash: text("pin_hash"),
  pushToken: text("push_token"),
  avatarKey: text("avatar_key"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dailyCaseSequences = pgTable("daily_case_sequences", {
  date: date("date").primaryKey(),
  lastSeq: integer("last_seq").notNull().default(0),
});

export const cases = pgTable("cases", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  caseNumber: text("case_number").notNull().unique(),
  vehicleNumber: text("vehicle_number").notNull(),
  carModel: text("car_model").notNull(),
  customerPhone: text("customer_phone"),
  customerName: text("customer_name"),
  kmCount: text("km_count"),
  dueDate: text("due_date"),
  deliveryType: text("delivery_type"),
  notes: text("notes"),
  customerArrivalStatus: customerArrivalStatusEnum("customer_arrival_status"),
  serviceType: serviceTypeEnum("service_type"),
  serviceSubType: serviceSubTypeEnum("service_sub_type"),
  internalStatus: internalStatusEnum("internal_status").notNull().default("intake"),
  customerStatus: customerStatusEnum("customer_status").notNull().default("received"),
  whatsappGroupId: text("whatsapp_group_id"),
  whatsappInviteLink: text("whatsapp_invite_link"),
  whatsappStatus: whatsappGroupStatusEnum("whatsapp_status"),
  advisorId: bigint("advisor_id", { mode: "number" }).notNull().references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("cases_advisor_id_idx").on(t.advisorId),
  index("cases_deleted_at_idx").on(t.deletedAt),
]);

export const caseEvents = pgTable("case_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  caseId: bigint("case_id", { mode: "number" }).notNull().references(() => cases.id, { onDelete: "cascade" }),
  eventType: eventTypeEnum("event_type").notNull(),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  message: text("message"),
  metadata: jsonb("metadata"),
  sentToCustomer: boolean("sent_to_customer").notNull().default(false),
  customerMessage: text("customer_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("case_events_case_id_idx").on(t.caseId)]);

export const caseEventImages = pgTable("case_event_images", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: bigint("event_id", { mode: "number" }).notNull().references(() => caseEvents.id, { onDelete: "cascade" }),
  caseId: bigint("case_id", { mode: "number" }).notNull().references(() => cases.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  filename: text("filename").notNull(),
  folder: text("folder").notNull().default("intake"),
  mediaType: text("media_type").notNull().default("image"),
  isPrimary: boolean("is_primary").notNull().default(false),
  timestampClick: timestamp("timestamp_click"),
  timestampSaved: timestamp("timestamp_saved").notNull().defaultNow(),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("case_event_images_case_id_idx").on(t.caseId)]);
