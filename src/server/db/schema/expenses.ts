import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, moneyCol, timestamps } from "./_shared";
import { businesses, users } from "./core";
import { paymentMethod } from "./enums";

export const expenseCategories = pgTable("expense_categories", {
  id: id(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  unique("expense_categories_business_id_id_unique").on(t.businessId, t.id),
  uniqueIndex("expense_categories_business_name_unique").on(t.businessId, sql`lower(${t.name})`),
]);

/** Despesas operacionais. Nunca apagadas: cancelamento por cancelled_at. */
export const expenses = pgTable("expenses", {
  id: id(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  categoryId: uuid("category_id").notNull(),
  description: text("description").notNull(),
  amount: moneyCol("amount").notNull(),
  /** Data de competência (fuso da empresa). */
  expenseDate: date("expense_date").notNull(),
  paymentMethod: paymentMethod("payment_method"),
  notes: text("notes"),
  /** Preparação para recorrência futura (ex.: "monthly"). */
  recurrence: text("recurrence"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  ...timestamps,
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  unique("expenses_business_id_id_unique").on(t.businessId, t.id),
  foreignKey({ name: "expenses_category_fk", columns: [t.businessId, t.categoryId], foreignColumns: [expenseCategories.businessId, expenseCategories.id] }),
  index("expenses_business_date_idx").on(t.businessId, t.expenseDate),
  index("expenses_business_category_idx").on(t.businessId, t.categoryId),
  check("expenses_amount_positive", sql`${t.amount} > 0`),
  check("expenses_description_not_blank", sql`length(trim(${t.description})) > 0`),
]);

/** Arquivos genéricos (comprovantes etc.). Binário no Storage, metadados aqui. */
export const attachments = pgTable("attachments", {
  id: id(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  storagePath: text("storage_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  index("attachments_entity_idx").on(t.businessId, t.entityType, t.entityId),
  check("attachments_size_positive", sql`${t.sizeBytes} > 0`),
]);
