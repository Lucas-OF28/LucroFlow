import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { costingMethod, memberRole, memberStatus } from "./enums";

/** Perfil público do usuário. `id` = id do provedor de autenticação (Supabase Auth hoje). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  ...timestamps,
}, (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]);

export const businesses = pgTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  currency: text("currency").notNull().default("BRL"),
  locale: text("locale").notNull().default("pt-BR"),
  costingMethod: costingMethod("costing_method").notNull().default("WEIGHTED_AVERAGE"),
  /** Preparação SaaS: plano e limites. Sem cobrança no MVP. */
  plan: text("plan").notNull().default("FREE"),
  featureLimits: jsonb("feature_limits").$type<Record<string, number>>().notNull().default({}),
  /** Dias sem venda para considerar um produto "parado". */
  staleDays: integer("stale_days").notNull().default(60),
  ...timestamps,
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  check("businesses_name_not_blank", sql`length(trim(${t.name})) > 0`),
  check("businesses_stale_days_positive", sql`${t.staleDays} > 0`),
]);

export const businessMembers = pgTable("business_members", {
  id: id(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: memberRole("role").notNull(),
  status: memberStatus("status").notNull().default("ACTIVE"),
  ...timestamps,
}, (t) => [
  uniqueIndex("business_members_business_user_unique").on(t.businessId, t.userId),
  index("business_members_user_idx").on(t.userId),
]);

/** Numeração amigável por empresa (VEN-000001). Incrementada dentro da transação do documento. */
export const documentSequences = pgTable("document_sequences", {
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  docType: text("doc_type").notNull(),
  lastValue: integer("last_value").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.businessId, t.docType] })]);

/** Trilha de auditoria. Somente INSERT (sem UPDATE/DELETE para o papel da aplicação). */
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_logs_business_created_idx").on(t.businessId, t.createdAt.desc()),
  index("audit_logs_entity_idx").on(t.businessId, t.entityType, t.entityId),
]);

/** Preferências por usuário (tema etc.). */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  theme: text("theme").notNull().default("system"),
  lastBusinessId: uuid("last_business_id").references(() => businesses.id),
  compactTables: boolean("compact_tables").notNull().default(false),
  ...timestamps,
}, (t) => [check("user_preferences_theme", sql`${t.theme} in ('light','dark','system')`)]);
