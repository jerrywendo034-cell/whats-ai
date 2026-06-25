// Whats AI — Drizzle Schema (Next.js + Vercel Postgres + Better Auth)
// File: db/schema.ts
//
// This assumes Better Auth's standard tables already exist (user, session,
// account, verification) — generated via `npx @better-auth/cli generate`.
// Everything below is Whats AI's own schema, linked to Better Auth's
// `user` table via owner_id on `business`.
//
// Install:
//   npm install drizzle-orm pg
//   npm install -D drizzle-kit
//
// Migrate:
//   npx drizzle-kit generate
//   npx drizzle-kit migrate

import {
  pgTable, text, varchar, integer, numeric, boolean, timestamp,
  jsonb, pgEnum, uuid, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth-schema";

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const subscriptionPlanEnum = pgEnum("subscription_plan", ["STARTER", "GROWTH", "ENTERPRISE"]);
export const businessStatusEnum = pgEnum("business_status", ["ACTIVE", "SUSPENDED", "CANCELLED"]);
export const businessModeEnum = pgEnum("business_mode", ["SIMPLE", "COMPLEX"]);
export const autonomyLevelEnum = pgEnum("autonomy_level", ["VERY_LOW", "LOW", "MEDIUM", "HIGH"]);
export const staffRoleEnum = pgEnum("staff_role", ["OWNER", "MANAGER", "STAFF"]);
export const customerTypeEnum = pgEnum("customer_type", ["NEW", "RETURNING", "VIP"]);
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING", "AWAITING_WEIGHT_CONFIRMATION", "PAID", "PACKED",
  "DISPATCHED", "DELIVERED", "CANCELLED", "REFUNDED",
]);
export const closedByEnum = pgEnum("closed_by", ["AI", "MANUAL"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "SUCCESS", "FAILED", "TIMEOUT", "REFUNDED", "PARTIAL"]);
export const fulfillmentTypeEnum = pgEnum("fulfillment_type", ["DELIVERY", "PICKUP", "CUT_TO_ORDER", "INSTALL"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["PENDING", "ASSIGNED", "IN_TRANSIT", "READY_FOR_PICKUP", "DELIVERED", "FAILED"]);
export const negotiationStatusEnum = pgEnum("negotiation_status", ["ACTIVE", "ACCEPTED", "REJECTED", "EXPIRED"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["ACTIVE", "RESOLVED", "ESCALATED"]);
export const messageSenderEnum = pgEnum("message_sender", ["CUSTOMER", "AI", "OWNER", "SYSTEM"]);
export const messageTypeEnum = pgEnum("message_type", ["TEXT", "IMAGE", "VOICE", "SYSTEM"]);
export const fraudSignalEnum = pgEnum("fraud_signal", [
  "REPEATED_FAILED_PAYMENT", "NEGOTIATE_NEVER_BUY", "RECEIVING_ACCOUNT_MISMATCH",
  "BULK_NO_HISTORY", "REFUND_PATTERN", "PAYMENT_CLAIM_UNVERIFIED",
]);
export const fraudSeverityEnum = pgEnum("fraud_severity", ["SOFT", "HARD"]);

// ─────────────────────────────────────────────
// BUSINESSES
// owner_id references Better Auth's `user.id` — the dashboard login.
// ─────────────────────────────────────────────

export const business = pgTable("business", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  whatsappNumber: varchar("whatsapp_number", { length: 20 }).notNull(),
  mpesaTill: varchar("mpesa_till", { length: 20 }),
  mpesaPaybill: varchar("mpesa_paybill", { length: 20 }),
  mpesaAccount: varchar("mpesa_account", { length: 100 }),
  subscriptionPlan: subscriptionPlanEnum("subscription_plan").notNull().default("STARTER"),
  status: businessStatusEnum("status").notNull().default("ACTIVE"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  businessMode: businessModeEnum("business_mode").notNull().default("SIMPLE"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  whatsappIdx: uniqueIndex("business_whatsapp_idx").on(t.whatsappNumber),
  ownerIdx: index("business_owner_idx").on(t.ownerId),
}));

export const businessRelations = relations(business, ({ many }) => ({
  products: many(product),
  customers: many(customer),
  orders: many(order),
  conversations: many(conversation),
  negotiations: many(negotiation),
  staff: many(staff),
  sectors: many(sector),
  fraudFlags: many(fraudFlag),
  auditLogs: many(auditLog),
}));

// ─────────────────────────────────────────────
// STAFF — dashboard team members for a business
// (separate from Better Auth `user` — staff.email links to a user account
// for login purposes, but staff carries the business-role data)
// ─────────────────────────────────────────────

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id), // links to Better Auth user, nullable until they accept invite
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  role: staffRoleEnum("role").notNull().default("STAFF"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  businessEmailIdx: uniqueIndex("staff_business_email_idx").on(t.businessId, t.email),
}));

// ─────────────────────────────────────────────
// SECTORS — departments for COMPLEX-mode businesses
// ─────────────────────────────────────────────

export const sector = pgTable("sector", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }),
  specialization: text("specialization"),
  autonomyLevel: autonomyLevelEnum("autonomy_level").notNull().default("MEDIUM"),
  negotiationEnabled: boolean("negotiation_enabled").notNull().default(false),
  maxNegotiationRounds: integer("max_negotiation_rounds").notNull().default(0),
  negotiationAlternative: text("negotiation_alternative"),
  imageStrategy: text("image_strategy"),
  specialFields: jsonb("special_fields"),
  operatingHoursStart: varchar("operating_hours_start", { length: 5 }),
  operatingHoursEnd: varchar("operating_hours_end", { length: 5 }),
  managerStaffId: uuid("manager_staff_id").references(() => staff.id),
  isPaused: boolean("is_paused").notNull().default(false),
  pausedUntil: timestamp("paused_until"),
  escalationRole: varchar("escalation_role", { length: 100 }),
  complianceNotes: text("compliance_notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  businessNameIdx: uniqueIndex("sector_business_name_idx").on(t.businessId, t.name),
}));

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").references(() => sector.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  minimumPrice: numeric("minimum_price", { precision: 10, scale: 2 }),
  stock: integer("stock").notNull().default(0),
  isWeightBased: boolean("is_weight_based").notNull().default(false),
  negotiationEnabled: boolean("negotiation_enabled").notNull().default(false),
  maxNegotiationRounds: integer("max_negotiation_rounds").notNull().default(5),
  imageUrl: text("image_url"),
  imageBytes: integer("image_bytes"), // tracks Device Empathy compression target
  isActive: boolean("is_active").notNull().default(true),

  // Sector-specific optional fields
  expiryDate: timestamp("expiry_date"),
  countryOfOrigin: varchar("country_of_origin", { length: 100 }),
  isOrganic: boolean("is_organic"),
  warrantyMonths: integer("warranty_months"),
  compatibilityNotes: text("compatibility_notes"),
  bakedAt: varchar("baked_at", { length: 50 }),
  allergens: text("allergens"),
  sizeChartUrl: text("size_chart_url"),
  fabricCare: text("fabric_care"),
  requiresPharmacist: boolean("requires_pharmacist"),
  otcDosage: text("otc_dosage"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  businessIdx: index("product_business_idx").on(t.businessId),
  sectorIdx: index("product_sector_idx").on(t.sectorId),
}));

export const productVariant = pgTable("product_variant", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  size: varchar("size", { length: 50 }),
  color: varchar("color", { length: 50 }),
  sku: varchar("sku", { length: 100 }),
  stock: integer("stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  productIdx: index("variant_product_idx").on(t.productId),
}));

// ─────────────────────────────────────────────
// CUSTOMERS — WhatsApp shoppers. Distinct from Better Auth `user`:
// customers never log into the dashboard, they only chat via WhatsApp.
// ─────────────────────────────────────────────

export const customer = pgTable("customer", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  customerType: customerTypeEnum("customer_type").notNull().default("NEW"),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  ordersCount: integer("orders_count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at"),
  optedIn: boolean("opted_in").notNull().default(false),
  fraudScore: integer("fraud_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  businessPhoneIdx: uniqueIndex("customer_business_phone_idx").on(t.businessId, t.phone),
  businessIdx: index("customer_business_idx").on(t.businessId),
}));

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

export const order = pgTable("order", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customer.id),
  primarySectorId: uuid("primary_sector_id").references(() => sector.id),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  isWeightAdjusted: boolean("is_weight_adjusted").notNull().default(false),
  finalTotal: numeric("final_total", { precision: 10, scale: 2 }),
  status: orderStatusEnum("status").notNull().default("PENDING"),
  closedBy: closedByEnum("closed_by").notNull().default("AI"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  businessIdx: index("order_business_idx").on(t.businessId),
  customerIdx: index("order_customer_idx").on(t.customerId),
  sectorIdx: index("order_sector_idx").on(t.primarySectorId),
}));

export const orderItem = pgTable("order_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => order.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => product.id),
  sectorId: uuid("sector_id").references(() => sector.id),
  variantId: uuid("variant_id").references(() => productVariant.id),
  quantity: integer("quantity").notNull(),
  estimatedWeightKg: numeric("estimated_weight_kg", { precision: 6, scale: 3 }),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  finalPrice: numeric("final_price", { precision: 10, scale: 2 }).notNull(),
}, (t) => ({
  orderIdx: index("order_item_order_idx").on(t.orderId),
  sectorIdx: index("order_item_sector_idx").on(t.sectorId),
}));

// ─────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().unique().references(() => order.id, { onDelete: "cascade" }),
  mpesaReceipt: varchar("mpesa_receipt", { length: 50 }),
  phone: varchar("phone", { length: 20 }).notNull(), // the PAYING number — may differ from customer's WhatsApp number
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  checkoutRequestId: varchar("checkout_request_id", { length: 100 }),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }),
  balanceDue: numeric("balance_due", { precision: 10, scale: 2 }),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// DELIVERY
// ─────────────────────────────────────────────

export const delivery = pgTable("delivery", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => order.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").references(() => sector.id),
  fulfillmentType: fulfillmentTypeEnum("fulfillment_type").notNull().default("DELIVERY"),
  riderName: varchar("rider_name", { length: 255 }),
  riderPhone: varchar("rider_phone", { length: 20 }),
  courierName: varchar("courier_name", { length: 100 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  status: deliveryStatusEnum("status").notNull().default("PENDING"),
  pickupWindow: varchar("pickup_window", { length: 50 }),
  pickupCounter: varchar("pickup_counter", { length: 20 }),
  pickerName: varchar("picker_name", { length: 255 }),
  itemsCollected: integer("items_collected"),
  itemsTotal: integer("items_total"),
  technicianName: varchar("technician_name", { length: 255 }),
  expectedAt: timestamp("expected_at"),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  orderIdx: index("delivery_order_idx").on(t.orderId),
}));

// ─────────────────────────────────────────────
// NEGOTIATIONS
// ─────────────────────────────────────────────

export const negotiation = pgTable("negotiation", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").references(() => sector.id),
  customerId: uuid("customer_id").notNull().references(() => customer.id),
  productId: uuid("product_id").notNull().references(() => product.id),
  startingPrice: numeric("starting_price", { precision: 10, scale: 2 }).notNull(),
  currentOffer: numeric("current_offer", { precision: 10, scale: 2 }).notNull(),
  minimumPrice: numeric("minimum_price", { precision: 10, scale: 2 }).notNull(),
  agreedPrice: numeric("agreed_price", { precision: 10, scale: 2 }),
  roundsUsed: integer("rounds_used").notNull().default(0),
  maxRounds: integer("max_rounds").notNull().default(5),
  status: negotiationStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  businessIdx: index("negotiation_business_idx").on(t.businessId),
  customerIdx: index("negotiation_customer_idx").on(t.customerId),
}));

// ─────────────────────────────────────────────
// CONVERSATIONS + MESSAGES
// ─────────────────────────────────────────────

export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customer.id),
  currentSectorId: uuid("current_sector_id").references(() => sector.id),
  channel: varchar("channel", { length: 20 }).notNull().default("whatsapp"),
  status: conversationStatusEnum("status").notNull().default("ACTIVE"),
  agentType: varchar("agent_type", { length: 30 }),
  humanOverrideUntil: timestamp("human_override_until"),
  deviceTipShown: boolean("device_tip_shown").notNull().default(false), // Device Empathy — show once
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
}, (t) => ({
  businessIdx: index("conversation_business_idx").on(t.businessId),
  customerIdx: index("conversation_customer_idx").on(t.customerId),
}));

export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
  sender: messageSenderEnum("sender").notNull(),
  messageType: messageTypeEnum("message_type").notNull().default("TEXT"),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  conversationIdx: index("message_conversation_idx").on(t.conversationId),
}));

// ─────────────────────────────────────────────
// FRAUD FLAGS
// ─────────────────────────────────────────────

export const fraudFlag = pgTable("fraud_flag", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customer.id),
  signalType: fraudSignalEnum("signal_type").notNull(),
  details: jsonb("details"),
  severity: fraudSeverityEnum("severity").notNull().default("SOFT"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  businessIdx: index("fraud_business_idx").on(t.businessId),
  customerIdx: index("fraud_customer_idx").on(t.customerId),
}));

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").notNull().references(() => business.id, { onDelete: "cascade" }),
  actor: varchar("actor", { length: 255 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  businessIdx: index("audit_business_idx").on(t.businessId),
  entityIdx: index("audit_entity_idx").on(t.entityId),
}));

// ─────────────────────────────────────────────
// RELATIONS (for Drizzle's relational query API)
// ─────────────────────────────────────────────

export const productRelations = relations(product, ({ one, many }) => ({
  business: one(business, { fields: [product.businessId], references: [business.id] }),
  sector: one(sector, { fields: [product.sectorId], references: [sector.id] }),
  variants: many(productVariant),
  orderItems: many(orderItem),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  business: one(business, { fields: [order.businessId], references: [business.id] }),
  customer: one(customer, { fields: [order.customerId], references: [customer.id] }),
  items: many(orderItem),
  payment: one(payment, { fields: [order.id], references: [payment.orderId] }),
  deliveries: many(delivery),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  business: one(business, { fields: [conversation.businessId], references: [business.id] }),
  customer: one(customer, { fields: [conversation.customerId], references: [customer.id] }),
  sector: one(sector, { fields: [conversation.currentSectorId], references: [sector.id] }),
  messages: many(message),
}));

export const customerRelations = relations(customer, ({ many }) => ({
  orders: many(order),
  conversations: many(conversation),
  negotiations: many(negotiation),
  fraudFlags: many(fraudFlag),
}));

// ─────────────────────────────────────────────
// drizzle.config.ts
// ─────────────────────────────────────────────

/*
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
*/

// ─────────────────────────────────────────────
// db/index.ts — connection setup for Vercel Postgres
// ─────────────────────────────────────────────

/*
import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
import * as schema from "./schema";

export const db = drizzle(sql, { schema });
*/
