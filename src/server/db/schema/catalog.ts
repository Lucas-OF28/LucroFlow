import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { id, moneyCol, percentCol, quantityCol, timestamps } from "./_shared";
import { businesses, users } from "./core";
import { productStatus } from "./enums";

const tenant = () => ({
  businessId: uuid("business_id").notNull().references(() => businesses.id),
});

export const categories = pgTable("categories", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  unique("categories_business_id_id_unique").on(t.businessId, t.id),
  uniqueIndex("categories_business_name_unique").on(t.businessId, sql`lower(${t.name})`),
  check("categories_name_not_blank", sql`length(trim(${t.name})) > 0`),
]);

export const suppliers = pgTable("suppliers", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  document: text("document"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  unique("suppliers_business_id_id_unique").on(t.businessId, t.id),
  index("suppliers_business_name_idx").on(t.businessId, t.name),
  check("suppliers_name_not_blank", sql`length(trim(${t.name})) > 0`),
]);

export const customers = pgTable("customers", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  document: text("document"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  unique("customers_business_id_id_unique").on(t.businessId, t.id),
  index("customers_business_name_idx").on(t.businessId, t.name),
  check("customers_name_not_blank", sql`length(trim(${t.name})) > 0`),
]);

/**
 * Produto + saldo de estoque.
 * stock_quantity / stock_value são o "pool" do custo médio ponderado e só mudam junto com uma
 * inventory_movement (invariante testada: saldo = Σ movimentações).
 */
export const products = pgTable("products", {
  id: id(),
  ...tenant(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: uuid("category_id"),
  sku: text("sku"),
  barcode: text("barcode"),
  unit: text("unit").notNull().default("un"),
  minStock: quantityCol("min_stock").notNull().default("0"),
  referencePrice: moneyCol("reference_price"),
  minimumPrice: moneyCol("minimum_price"),
  /** Margem desejada (sobre a receita) para sugestão de preço. */
  targetMargin: percentCol("target_margin"),
  location: text("location"),
  mainSupplierId: uuid("main_supplier_id"),
  notes: text("notes"),
  status: productStatus("status").notNull().default("ACTIVE"),
  stockQuantity: quantityCol("stock_quantity").notNull().default("0"),
  stockValue: moneyCol("stock_value").notNull().default("0"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  unique("products_business_id_id_unique").on(t.businessId, t.id),
  foreignKey({ name: "products_category_fk", columns: [t.businessId, t.categoryId], foreignColumns: [categories.businessId, categories.id] }),
  foreignKey({ name: "products_main_supplier_fk", columns: [t.businessId, t.mainSupplierId], foreignColumns: [suppliers.businessId, suppliers.id] }),
  uniqueIndex("products_business_sku_unique").on(t.businessId, sql`lower(${t.sku})`).where(sql`${t.sku} is not null`),
  index("products_business_barcode_idx").on(t.businessId, t.barcode),
  index("products_business_name_idx").on(t.businessId, t.name),
  index("products_business_category_idx").on(t.businessId, t.categoryId),
  index("products_business_supplier_idx").on(t.businessId, t.mainSupplierId),
  check("products_name_not_blank", sql`length(trim(${t.name})) > 0`),
  check("products_stock_quantity_non_negative", sql`${t.stockQuantity} >= 0`),
  check("products_stock_value_non_negative", sql`${t.stockValue} >= 0`),
  check("products_no_value_without_stock", sql`${t.stockQuantity} > 0 or ${t.stockValue} = 0`),
  check("products_min_stock_non_negative", sql`${t.minStock} >= 0`),
  check("products_prices_non_negative", sql`coalesce(${t.referencePrice}, 0) >= 0 and coalesce(${t.minimumPrice}, 0) >= 0`),
  check("products_target_margin_range", sql`${t.targetMargin} is null or (${t.targetMargin} >= 0 and ${t.targetMargin} < 100)`),
]);

export const productImages = pgTable("product_images", {
  id: id(),
  ...tenant(),
  productId: uuid("product_id").notNull(),
  storagePath: text("storage_path").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  position: integer("position").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
}, (t) => [
  foreignKey({ name: "product_images_product_fk", columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  index("product_images_product_idx").on(t.productId, t.position),
  uniqueIndex("product_images_one_primary").on(t.productId).where(sql`${t.isPrimary}`),
  check("product_images_size_positive", sql`${t.sizeBytes} > 0`),
]);
