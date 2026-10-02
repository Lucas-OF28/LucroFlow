CREATE TYPE "public"."costing_method" AS ENUM('WEIGHTED_AVERAGE');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INVITED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."movement_reference" AS ENUM('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('PURCHASE', 'PURCHASE_CANCEL', 'SALE', 'SALE_CANCEL', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'LOSS', 'COST_ADJUSTMENT', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('SALE_RECEIPT', 'SALE_CANCEL_REFUND', 'RETURN_REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'BOLETO', 'STORE_CREDIT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"costing_method" "costing_method" DEFAULT 'WEIGHTED_AVERAGE' NOT NULL,
	"plan" text DEFAULT 'FREE' NOT NULL,
	"feature_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stale_days" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "businesses_name_not_blank" CHECK (length(trim("businesses"."name")) > 0),
	CONSTRAINT "businesses_stale_days_positive" CHECK ("businesses"."stale_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"business_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_sequences_business_id_doc_type_pk" PRIMARY KEY("business_id","doc_type")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"last_business_id" uuid,
	"compact_tables" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_theme" CHECK ("user_preferences"."theme" in ('light','dark','system'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "categories_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "categories_name_not_blank" CHECK (length(trim("categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"document" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "customers_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "customers_name_not_blank" CHECK (length(trim("customers"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "product_images_size_positive" CHECK ("product_images"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"sku" text,
	"barcode" text,
	"unit" text DEFAULT 'un' NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reference_price" numeric(14, 2),
	"minimum_price" numeric(14, 2),
	"target_margin" numeric(7, 2),
	"location" text,
	"main_supplier_id" uuid,
	"notes" text,
	"status" "product_status" DEFAULT 'ACTIVE' NOT NULL,
	"stock_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"stock_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "products_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "products_name_not_blank" CHECK (length(trim("products"."name")) > 0),
	CONSTRAINT "products_stock_quantity_non_negative" CHECK ("products"."stock_quantity" >= 0),
	CONSTRAINT "products_stock_value_non_negative" CHECK ("products"."stock_value" >= 0),
	CONSTRAINT "products_no_value_without_stock" CHECK ("products"."stock_quantity" > 0 or "products"."stock_value" = 0),
	CONSTRAINT "products_min_stock_non_negative" CHECK ("products"."min_stock" >= 0),
	CONSTRAINT "products_prices_non_negative" CHECK (coalesce("products"."reference_price", 0) >= 0 and coalesce("products"."minimum_price", 0) >= 0),
	CONSTRAINT "products_target_margin_range" CHECK ("products"."target_margin" is null or ("products"."target_margin" >= 0 and "products"."target_margin" < 100))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"document" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "suppliers_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "suppliers_name_not_blank" CHECK (length(trim("suppliers"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"customer_id" uuid,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_cancelled" numeric(14, 2) DEFAULT '0' NOT NULL,
	"expected_method" "payment_method",
	"status" "receivable_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_receivable_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "accounts_receivable_sale_installment_unique" UNIQUE("sale_id","installment_number"),
	CONSTRAINT "accounts_receivable_amounts" CHECK ("accounts_receivable"."amount" > 0 and "accounts_receivable"."amount_paid" >= 0 and "accounts_receivable"."amount_cancelled" >= 0 and "accounts_receivable"."amount_paid" + "accounts_receivable"."amount_cancelled" <= "accounts_receivable"."amount"),
	CONSTRAINT "accounts_receivable_status_consistent" CHECK (case
      when "accounts_receivable"."amount_paid" + "accounts_receivable"."amount_cancelled" = "accounts_receivable"."amount" then (case when "accounts_receivable"."amount_paid" > 0 then "accounts_receivable"."status" = 'PAID' else "accounts_receivable"."status" = 'CANCELLED' end)
      when "accounts_receivable"."amount_paid" > 0 then "accounts_receivable"."status" = 'PARTIAL'
      else "accounts_receivable"."status" = 'PENDING' end)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"value_delta" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(18, 6) NOT NULL,
	"quantity_after" numeric(14, 3) NOT NULL,
	"value_after" numeric(14, 2) NOT NULL,
	"movement_date" date NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference_type" "movement_reference" NOT NULL,
	"reference_id" uuid,
	"reference_item_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	CONSTRAINT "inventory_movements_after_non_negative" CHECK ("inventory_movements"."quantity_after" >= 0 and "inventory_movements"."value_after" >= 0),
	CONSTRAINT "inventory_movements_sign_by_type" CHECK (("inventory_movements"."type" in ('PURCHASE','SALE_CANCEL','RETURN','ADJUSTMENT_IN') and "inventory_movements"."quantity_delta" > 0 and "inventory_movements"."value_delta" >= 0)
      or ("inventory_movements"."type" in ('SALE','PURCHASE_CANCEL','ADJUSTMENT_OUT','LOSS') and "inventory_movements"."quantity_delta" < 0 and "inventory_movements"."value_delta" <= 0)
      or ("inventory_movements"."type" = 'COST_ADJUSTMENT' and "inventory_movements"."quantity_delta" = 0 and "inventory_movements"."value_delta" <> 0)
      or ("inventory_movements"."type" = 'TRANSFER'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"direction" "payment_direction" NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"sale_id" uuid,
	"receivable_id" uuid,
	"return_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_kind_direction" CHECK (("payments"."kind" = 'SALE_RECEIPT' and "payments"."direction" = 'IN' and "payments"."receivable_id" is not null)
      or ("payments"."kind" in ('SALE_CANCEL_REFUND','RETURN_REFUND') and "payments"."direction" = 'OUT'))
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"additional_costs" numeric(14, 2) DEFAULT '0' NOT NULL,
	"allocated_costs" numeric(14, 2) DEFAULT '0' NOT NULL,
	"allocated_discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"landed_total" numeric(14, 2) NOT NULL,
	"landed_unit_cost" numeric(18, 6) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_items_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "purchase_items_quantity_positive" CHECK ("purchase_items"."quantity" > 0),
	CONSTRAINT "purchase_items_amounts_non_negative" CHECK ("purchase_items"."unit_cost" >= 0 and "purchase_items"."discount" >= 0 and "purchase_items"."additional_costs" >= 0 and "purchase_items"."allocated_costs" >= 0 and "purchase_items"."allocated_discount" >= 0 and "purchase_items"."landed_total" >= 0),
	CONSTRAINT "purchase_items_subtotal_consistent" CHECK ("purchase_items"."subtotal" = round("purchase_items"."quantity" * "purchase_items"."unit_cost", 2)),
	CONSTRAINT "purchase_items_landed_consistent" CHECK ("purchase_items"."landed_total" = "purchase_items"."subtotal" - "purchase_items"."discount" + "purchase_items"."additional_costs" + "purchase_items"."allocated_costs" - "purchase_items"."allocated_discount")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"supplier_id" uuid,
	"purchase_date" date NOT NULL,
	"reference" text,
	"payment_method" "payment_method",
	"items_subtotal" numeric(14, 2) NOT NULL,
	"items_discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"items_additional_costs" numeric(14, 2) DEFAULT '0' NOT NULL,
	"freight" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxes" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_costs" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" "document_status" DEFAULT 'CONFIRMED' NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "purchases_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "purchases_business_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "purchases_amounts_non_negative" CHECK ("purchases"."items_subtotal" >= 0 and "purchases"."items_discount" >= 0 and "purchases"."items_additional_costs" >= 0 and "purchases"."freight" >= 0 and "purchases"."taxes" >= 0 and "purchases"."other_costs" >= 0 and "purchases"."discount" >= 0 and "purchases"."total" >= 0),
	CONSTRAINT "purchases_total_consistent" CHECK ("purchases"."total" = "purchases"."items_subtotal" - "purchases"."items_discount" + "purchases"."items_additional_costs" + "purchases"."freight" + "purchases"."taxes" + "purchases"."other_costs" - "purchases"."discount"),
	CONSTRAINT "purchases_cancel_consistent" CHECK (("purchases"."status" = 'CANCELLED') = ("purchases"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"refund_amount" numeric(14, 2) NOT NULL,
	"restock" boolean NOT NULL,
	"proportional_cost" numeric(14, 2) NOT NULL,
	"cost_reversal" numeric(14, 2) NOT NULL,
	CONSTRAINT "return_items_quantity_positive" CHECK ("return_items"."quantity" > 0),
	CONSTRAINT "return_items_amounts_non_negative" CHECK ("return_items"."refund_amount" >= 0 and "return_items"."cost_reversal" >= 0 and "return_items"."proportional_cost" >= 0),
	CONSTRAINT "return_items_restock_cost" CHECK ("return_items"."cost_reversal" = case when "return_items"."restock" then "return_items"."proportional_cost" else 0 end)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"return_date" date NOT NULL,
	"reason" text NOT NULL,
	"refund_total" numeric(14, 2) NOT NULL,
	"cost_reversal_total" numeric(14, 2) NOT NULL,
	"receivable_reduction" numeric(14, 2) DEFAULT '0' NOT NULL,
	"refund_method" "payment_method",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "returns_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "returns_business_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "returns_amounts_non_negative" CHECK ("returns"."refund_total" >= 0 and "returns"."cost_reversal_total" >= 0 and "returns"."receivable_reduction" >= 0 and "returns"."receivable_reduction" <= "returns"."refund_total"),
	CONSTRAINT "returns_reason_not_blank" CHECK (length(trim("returns"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"allocated_discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(14, 2) NOT NULL,
	"unit_cost_at_sale" numeric(18, 6) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sale_items_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_amounts_non_negative" CHECK ("sale_items"."unit_price" >= 0 and "sale_items"."discount" >= 0 and "sale_items"."allocated_discount" >= 0 and "sale_items"."net_revenue" >= 0 and "sale_items"."total_cost" >= 0 and "sale_items"."unit_cost_at_sale" >= 0),
	CONSTRAINT "sale_items_subtotal_consistent" CHECK ("sale_items"."subtotal" = round("sale_items"."quantity" * "sale_items"."unit_price", 2)),
	CONSTRAINT "sale_items_net_consistent" CHECK ("sale_items"."net_revenue" = "sale_items"."subtotal" - "sale_items"."discount" - "sale_items"."allocated_discount")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid,
	"sale_date" date NOT NULL,
	"items_subtotal" numeric(14, 2) NOT NULL,
	"items_discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"products_revenue" numeric(14, 2) NOT NULL,
	"freight_charged" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_revenue" numeric(14, 2) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"freight_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fees" numeric(14, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_expenses" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(14, 2) NOT NULL,
	"net_profit" numeric(14, 2) NOT NULL,
	"below_cost" boolean DEFAULT false NOT NULL,
	"below_cost_approved_by" uuid,
	"status" "document_status" DEFAULT 'CONFIRMED' NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "sales_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "sales_business_number_unique" UNIQUE("business_id","number"),
	CONSTRAINT "sales_amounts_non_negative" CHECK ("sales"."items_subtotal" >= 0 and "sales"."items_discount" >= 0 and "sales"."discount" >= 0 and "sales"."products_revenue" >= 0 and "sales"."freight_charged" >= 0 and "sales"."total_revenue" >= 0 and "sales"."total_cost" >= 0 and "sales"."freight_paid" >= 0 and "sales"."fees" >= 0 and "sales"."commission" >= 0 and "sales"."other_expenses" >= 0),
	CONSTRAINT "sales_products_revenue_consistent" CHECK ("sales"."products_revenue" = "sales"."items_subtotal" - "sales"."items_discount" - "sales"."discount"),
	CONSTRAINT "sales_total_revenue_consistent" CHECK ("sales"."total_revenue" = "sales"."products_revenue" + "sales"."freight_charged"),
	CONSTRAINT "sales_gross_profit_consistent" CHECK ("sales"."gross_profit" = "sales"."total_revenue" - "sales"."total_cost"),
	CONSTRAINT "sales_net_profit_consistent" CHECK ("sales"."net_profit" = "sales"."gross_profit" - "sales"."freight_paid" - "sales"."fees" - "sales"."commission" - "sales"."other_expenses"),
	CONSTRAINT "sales_cancel_consistent" CHECK (("sales"."status" = 'CANCELLED') = ("sales"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "attachments_size_positive" CHECK ("attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_business_id_id_unique" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"payment_method" "payment_method",
	"notes" text,
	"recurrence" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "expenses_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_description_not_blank" CHECK (length(trim("expenses"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_last_business_id_businesses_id_fk" FOREIGN KEY ("last_business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_main_supplier_fk" FOREIGN KEY ("business_id","main_supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_sale_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivable_fk" FOREIGN KEY ("business_id","receivable_id") REFERENCES "public"."accounts_receivable"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_return_fk" FOREIGN KEY ("business_id","return_id") REFERENCES "public"."returns"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_fk" FOREIGN KEY ("business_id","purchase_id") REFERENCES "public"."purchases"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_fk" FOREIGN KEY ("business_id","supplier_id") REFERENCES "public"."suppliers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_fk" FOREIGN KEY ("business_id","return_id") REFERENCES "public"."returns"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_sale_item_fk" FOREIGN KEY ("business_id","sale_item_id") REFERENCES "public"."sale_items"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_fk" FOREIGN KEY ("business_id","sale_id") REFERENCES "public"."sales"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_fk" FOREIGN KEY ("business_id","product_id") REFERENCES "public"."products"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_below_cost_approved_by_users_id_fk" FOREIGN KEY ("below_cost_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."expense_categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_business_created_idx" ON "audit_logs" USING btree ("business_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("business_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_members_business_user_unique" ON "business_members" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "business_members_user_idx" ON "business_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_business_name_unique" ON "categories" USING btree ("business_id",lower("name"));--> statement-breakpoint
CREATE INDEX "customers_business_name_idx" ON "customers" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_sku_unique" ON "products" USING btree ("business_id",lower("sku")) WHERE "products"."sku" is not null;--> statement-breakpoint
CREATE INDEX "products_business_barcode_idx" ON "products" USING btree ("business_id","barcode");--> statement-breakpoint
CREATE INDEX "products_business_name_idx" ON "products" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "products_business_category_idx" ON "products" USING btree ("business_id","category_id");--> statement-breakpoint
CREATE INDEX "products_business_supplier_idx" ON "products" USING btree ("business_id","main_supplier_id");--> statement-breakpoint
CREATE INDEX "suppliers_business_name_idx" ON "suppliers" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "accounts_receivable_business_status_due_idx" ON "accounts_receivable" USING btree ("business_id","status","due_date");--> statement-breakpoint
CREATE INDEX "accounts_receivable_sale_idx" ON "accounts_receivable" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "accounts_receivable_customer_idx" ON "accounts_receivable" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_idx" ON "inventory_movements" USING btree ("business_id","product_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_business_date_idx" ON "inventory_movements" USING btree ("business_id","movement_date");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "payments_business_paid_on_idx" ON "payments" USING btree ("business_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_sale_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payments_receivable_idx" ON "payments" USING btree ("receivable_id");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_business_product_idx" ON "purchase_items" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "purchases_business_date_idx" ON "purchases" USING btree ("business_id","purchase_date");--> statement-breakpoint
CREATE INDEX "purchases_business_supplier_idx" ON "purchases" USING btree ("business_id","supplier_id");--> statement-breakpoint
CREATE INDEX "purchases_business_status_idx" ON "purchases" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "return_items_return_idx" ON "return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "return_items_sale_item_idx" ON "return_items" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "returns_business_date_idx" ON "returns" USING btree ("business_id","return_date");--> statement-breakpoint
CREATE INDEX "returns_sale_idx" ON "returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_business_product_idx" ON "sale_items" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "sales_business_date_idx" ON "sales" USING btree ("business_id","sale_date");--> statement-breakpoint
CREATE INDEX "sales_business_customer_idx" ON "sales" USING btree ("business_id","customer_id");--> statement-breakpoint
CREATE INDEX "sales_business_status_idx" ON "sales" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("business_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_business_name_unique" ON "expense_categories" USING btree ("business_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_business_date_idx" ON "expenses" USING btree ("business_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_business_category_idx" ON "expenses" USING btree ("business_id","category_id");