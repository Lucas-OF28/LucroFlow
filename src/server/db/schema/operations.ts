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
  uuid,
} from "drizzle-orm/pg-core";
import { id, moneyCol, quantityCol, timestamps, unitCostCol } from "./_shared";
import { customers, products, suppliers } from "./catalog";
import { businesses, users } from "./core";
import {
  documentStatus,
  movementReference,
  movementType,
  paymentDirection,
  paymentKind,
  paymentMethod,
  receivableStatus,
} from "./enums";

const tenant = () => ({
  businessId: uuid("business_id").notNull().references(() => businesses.id),
});

const cancellation = {
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => users.id),
  cancelReason: text("cancel_reason"),
};

// ─── Compras ────────────────────────────────────────────────────────────────

export const purchases = pgTable("purchases", {
  id: id(),
  ...tenant(),
  number: integer("number").notNull(),
  code: text("code").notNull(),
  supplierId: uuid("supplier_id"),
  /** Data comercial da compra (fuso da empresa). */
  purchaseDate: date("purchase_date").notNull(),
  reference: text("reference"),
  paymentMethod: paymentMethod("payment_method"),
  itemsSubtotal: moneyCol("items_subtotal").notNull(),
  itemsDiscount: moneyCol("items_discount").notNull().default("0"),
  itemsAdditionalCosts: moneyCol("items_additional_costs").notNull().default("0"),
  freight: moneyCol("freight").notNull().default("0"),
  taxes: moneyCol("taxes").notNull().default("0"),
  otherCosts: moneyCol("other_costs").notNull().default("0"),
  discount: moneyCol("discount").notNull().default("0"),
  total: moneyCol("total").notNull(),
  status: documentStatus("status").notNull().default("CONFIRMED"),
  notes: text("notes"),
  ...cancellation,
  ...timestamps,
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  unique("purchases_business_id_id_unique").on(t.businessId, t.id),
  unique("purchases_business_number_unique").on(t.businessId, t.number),
  foreignKey({ name: "purchases_supplier_fk", columns: [t.businessId, t.supplierId], foreignColumns: [suppliers.businessId, suppliers.id] }),
  index("purchases_business_date_idx").on(t.businessId, t.purchaseDate),
  index("purchases_business_supplier_idx").on(t.businessId, t.supplierId),
  index("purchases_business_status_idx").on(t.businessId, t.status),
  check("purchases_amounts_non_negative", sql`${t.itemsSubtotal} >= 0 and ${t.itemsDiscount} >= 0 and ${t.itemsAdditionalCosts} >= 0 and ${t.freight} >= 0 and ${t.taxes} >= 0 and ${t.otherCosts} >= 0 and ${t.discount} >= 0 and ${t.total} >= 0`),
  check("purchases_total_consistent", sql`${t.total} = ${t.itemsSubtotal} - ${t.itemsDiscount} + ${t.itemsAdditionalCosts} + ${t.freight} + ${t.taxes} + ${t.otherCosts} - ${t.discount}`),
  check("purchases_cancel_consistent", sql`(${t.status} = 'CANCELLED') = (${t.cancelledAt} is not null)`),
]);

export const purchaseItems = pgTable("purchase_items", {
  id: id(),
  ...tenant(),
  purchaseId: uuid("purchase_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: quantityCol("quantity").notNull(),
  unitCost: moneyCol("unit_cost").notNull(),
  subtotal: moneyCol("subtotal").notNull(),
  discount: moneyCol("discount").notNull().default("0"),
  additionalCosts: moneyCol("additional_costs").notNull().default("0"),
  allocatedCosts: moneyCol("allocated_costs").notNull().default("0"),
  allocatedDiscount: moneyCol("allocated_discount").notNull().default("0"),
  /** Custo final do item que entrou no estoque (base do custo médio). */
  landedTotal: moneyCol("landed_total").notNull(),
  landedUnitCost: unitCostCol("landed_unit_cost").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [
  unique("purchase_items_business_id_id_unique").on(t.businessId, t.id),
  foreignKey({ name: "purchase_items_purchase_fk", columns: [t.businessId, t.purchaseId], foreignColumns: [purchases.businessId, purchases.id] }),
  foreignKey({ name: "purchase_items_product_fk", columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  index("purchase_items_purchase_idx").on(t.purchaseId),
  index("purchase_items_business_product_idx").on(t.businessId, t.productId),
  check("purchase_items_quantity_positive", sql`${t.quantity} > 0`),
  check("purchase_items_amounts_non_negative", sql`${t.unitCost} >= 0 and ${t.discount} >= 0 and ${t.additionalCosts} >= 0 and ${t.allocatedCosts} >= 0 and ${t.allocatedDiscount} >= 0 and ${t.landedTotal} >= 0`),
  check("purchase_items_subtotal_consistent", sql`${t.subtotal} = round(${t.quantity} * ${t.unitCost}, 2)`),
  check("purchase_items_landed_consistent", sql`${t.landedTotal} = ${t.subtotal} - ${t.discount} + ${t.additionalCosts} + ${t.allocatedCosts} - ${t.allocatedDiscount}`),
]);

// ─── Vendas ─────────────────────────────────────────────────────────────────

export const sales = pgTable("sales", {
  id: id(),
  ...tenant(),
  number: integer("number").notNull(),
  code: text("code").notNull(),
  customerId: uuid("customer_id"),
  /** Data comercial da venda (fuso da empresa). Receita é reconhecida nesta data. */
  saleDate: date("sale_date").notNull(),
  itemsSubtotal: moneyCol("items_subtotal").notNull(),
  itemsDiscount: moneyCol("items_discount").notNull().default("0"),
  discount: moneyCol("discount").notNull().default("0"),
  productsRevenue: moneyCol("products_revenue").notNull(),
  freightCharged: moneyCol("freight_charged").notNull().default("0"),
  /** Faturamento = receita de produtos + frete cobrado. */
  totalRevenue: moneyCol("total_revenue").notNull(),
  /** CMV histórico (Σ sale_items.total_cost). */
  totalCost: moneyCol("total_cost").notNull(),
  freightPaid: moneyCol("freight_paid").notNull().default("0"),
  fees: moneyCol("fees").notNull().default("0"),
  commission: moneyCol("commission").notNull().default("0"),
  otherExpenses: moneyCol("other_expenses").notNull().default("0"),
  grossProfit: moneyCol("gross_profit").notNull(),
  netProfit: moneyCol("net_profit").notNull(),
  /** Venda confirmada com prejuízo estimado (alerta aceito por usuário autorizado). */
  belowCost: boolean("below_cost").notNull().default(false),
  belowCostApprovedBy: uuid("below_cost_approved_by").references(() => users.id),
  status: documentStatus("status").notNull().default("CONFIRMED"),
  notes: text("notes"),
  ...cancellation,
  ...timestamps,
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  unique("sales_business_id_id_unique").on(t.businessId, t.id),
  unique("sales_business_number_unique").on(t.businessId, t.number),
  foreignKey({ name: "sales_customer_fk", columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
  index("sales_business_date_idx").on(t.businessId, t.saleDate),
  index("sales_business_customer_idx").on(t.businessId, t.customerId),
  index("sales_business_status_idx").on(t.businessId, t.status),
  check("sales_amounts_non_negative", sql`${t.itemsSubtotal} >= 0 and ${t.itemsDiscount} >= 0 and ${t.discount} >= 0 and ${t.productsRevenue} >= 0 and ${t.freightCharged} >= 0 and ${t.totalRevenue} >= 0 and ${t.totalCost} >= 0 and ${t.freightPaid} >= 0 and ${t.fees} >= 0 and ${t.commission} >= 0 and ${t.otherExpenses} >= 0`),
  check("sales_products_revenue_consistent", sql`${t.productsRevenue} = ${t.itemsSubtotal} - ${t.itemsDiscount} - ${t.discount}`),
  check("sales_total_revenue_consistent", sql`${t.totalRevenue} = ${t.productsRevenue} + ${t.freightCharged}`),
  check("sales_gross_profit_consistent", sql`${t.grossProfit} = ${t.totalRevenue} - ${t.totalCost}`),
  check("sales_net_profit_consistent", sql`${t.netProfit} = ${t.grossProfit} - ${t.freightPaid} - ${t.fees} - ${t.commission} - ${t.otherExpenses}`),
  check("sales_cancel_consistent", sql`(${t.status} = 'CANCELLED') = (${t.cancelledAt} is not null)`),
]);

export const saleItems = pgTable("sale_items", {
  id: id(),
  ...tenant(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: quantityCol("quantity").notNull(),
  unitPrice: moneyCol("unit_price").notNull(),
  subtotal: moneyCol("subtotal").notNull(),
  discount: moneyCol("discount").notNull().default("0"),
  allocatedDiscount: moneyCol("allocated_discount").notNull().default("0"),
  netRevenue: moneyCol("net_revenue").notNull(),
  /** REGRA CRÍTICA: custo médio no momento da venda. Nunca recalculado. */
  unitCostAtSale: unitCostCol("unit_cost_at_sale").notNull(),
  totalCost: moneyCol("total_cost").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [
  unique("sale_items_business_id_id_unique").on(t.businessId, t.id),
  foreignKey({ name: "sale_items_sale_fk", columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  foreignKey({ name: "sale_items_product_fk", columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  index("sale_items_sale_idx").on(t.saleId),
  index("sale_items_business_product_idx").on(t.businessId, t.productId),
  check("sale_items_quantity_positive", sql`${t.quantity} > 0`),
  check("sale_items_amounts_non_negative", sql`${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.allocatedDiscount} >= 0 and ${t.netRevenue} >= 0 and ${t.totalCost} >= 0 and ${t.unitCostAtSale} >= 0`),
  check("sale_items_subtotal_consistent", sql`${t.subtotal} = round(${t.quantity} * ${t.unitPrice}, 2)`),
  check("sale_items_net_consistent", sql`${t.netRevenue} = ${t.subtotal} - ${t.discount} - ${t.allocatedDiscount}`),
]);

// ─── Devoluções ─────────────────────────────────────────────────────────────

export const returns = pgTable("returns", {
  id: id(),
  ...tenant(),
  number: integer("number").notNull(),
  code: text("code").notNull(),
  saleId: uuid("sale_id").notNull(),
  /** D2: receita/CMV estornados nesta data. */
  returnDate: date("return_date").notNull(),
  reason: text("reason").notNull(),
  refundTotal: moneyCol("refund_total").notNull(),
  /** Custo devolvido ao estoque (itens com restock). */
  costReversalTotal: moneyCol("cost_reversal_total").notNull(),
  /** Parte do reembolso que abateu parcelas em aberto (o resto saiu como pagamento). */
  receivableReduction: moneyCol("receivable_reduction").notNull().default("0"),
  refundMethod: paymentMethod("refund_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  unique("returns_business_id_id_unique").on(t.businessId, t.id),
  unique("returns_business_number_unique").on(t.businessId, t.number),
  foreignKey({ name: "returns_sale_fk", columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  index("returns_business_date_idx").on(t.businessId, t.returnDate),
  index("returns_sale_idx").on(t.saleId),
  check("returns_amounts_non_negative", sql`${t.refundTotal} >= 0 and ${t.costReversalTotal} >= 0 and ${t.receivableReduction} >= 0 and ${t.receivableReduction} <= ${t.refundTotal}`),
  check("returns_reason_not_blank", sql`length(trim(${t.reason})) > 0`),
]);

export const returnItems = pgTable("return_items", {
  id: id(),
  ...tenant(),
  returnId: uuid("return_id").notNull(),
  saleItemId: uuid("sale_item_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: quantityCol("quantity").notNull(),
  refundAmount: moneyCol("refund_amount").notNull(),
  restock: boolean("restock").notNull(),
  /** Custo histórico proporcional à quantidade devolvida. */
  proportionalCost: moneyCol("proportional_cost").notNull(),
  /** Custo que voltou ao estoque (= proporcional se restock; 0 caso contrário). */
  costReversal: moneyCol("cost_reversal").notNull(),
}, (t) => [
  foreignKey({ name: "return_items_return_fk", columns: [t.businessId, t.returnId], foreignColumns: [returns.businessId, returns.id] }),
  foreignKey({ name: "return_items_sale_item_fk", columns: [t.businessId, t.saleItemId], foreignColumns: [saleItems.businessId, saleItems.id] }),
  foreignKey({ name: "return_items_product_fk", columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  index("return_items_return_idx").on(t.returnId),
  index("return_items_sale_item_idx").on(t.saleItemId),
  check("return_items_quantity_positive", sql`${t.quantity} > 0`),
  check("return_items_amounts_non_negative", sql`${t.refundAmount} >= 0 and ${t.costReversal} >= 0 and ${t.proportionalCost} >= 0`),
  check("return_items_restock_cost", sql`${t.costReversal} = case when ${t.restock} then ${t.proportionalCost} else 0 end`),
]);

// ─── Estoque ────────────────────────────────────────────────────────────────

/**
 * Livro-razão do estoque. Imutável (sem UPDATE/DELETE para o papel da aplicação).
 * quantity_delta / value_delta têm sinal. Σ deltas = saldo do produto.
 */
export const inventoryMovements = pgTable("inventory_movements", {
  id: id(),
  ...tenant(),
  productId: uuid("product_id").notNull(),
  type: movementType("type").notNull(),
  quantityDelta: quantityCol("quantity_delta").notNull(),
  valueDelta: moneyCol("value_delta").notNull(),
  unitCost: unitCostCol("unit_cost").notNull(),
  quantityAfter: quantityCol("quantity_after").notNull(),
  valueAfter: moneyCol("value_after").notNull(),
  /** Data comercial (fuso da empresa). */
  movementDate: date("movement_date").notNull(),
  /** Timestamp técnico do evento. */
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  referenceType: movementReference("reference_type").notNull(),
  referenceId: uuid("reference_id"),
  referenceItemId: uuid("reference_item_id"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  foreignKey({ name: "inventory_movements_product_fk", columns: [t.businessId, t.productId], foreignColumns: [products.businessId, products.id] }),
  index("inventory_movements_product_idx").on(t.businessId, t.productId, t.occurredAt),
  index("inventory_movements_business_date_idx").on(t.businessId, t.movementDate),
  index("inventory_movements_reference_idx").on(t.referenceType, t.referenceId),
  check("inventory_movements_after_non_negative", sql`${t.quantityAfter} >= 0 and ${t.valueAfter} >= 0`),
  check(
    "inventory_movements_sign_by_type",
    sql`(${t.type} in ('PURCHASE','SALE_CANCEL','RETURN','ADJUSTMENT_IN') and ${t.quantityDelta} > 0 and ${t.valueDelta} >= 0)
      or (${t.type} in ('SALE','PURCHASE_CANCEL','ADJUSTMENT_OUT','LOSS') and ${t.quantityDelta} < 0 and ${t.valueDelta} <= 0)
      or (${t.type} = 'COST_ADJUSTMENT' and ${t.quantityDelta} = 0 and ${t.valueDelta} <> 0)
      or (${t.type} = 'TRANSFER')`,
  ),
]);

// ─── Financeiro ─────────────────────────────────────────────────────────────

/** Parcelas a receber de uma venda. Σ amount das parcelas = faturamento da venda. */
export const accountsReceivable = pgTable("accounts_receivable", {
  id: id(),
  ...tenant(),
  saleId: uuid("sale_id").notNull(),
  customerId: uuid("customer_id"),
  installmentNumber: integer("installment_number").notNull(),
  dueDate: date("due_date").notNull(),
  amount: moneyCol("amount").notNull(),
  amountPaid: moneyCol("amount_paid").notNull().default("0"),
  amountCancelled: moneyCol("amount_cancelled").notNull().default("0"),
  expectedMethod: paymentMethod("expected_method"),
  status: receivableStatus("status").notNull().default("PENDING"),
  ...timestamps,
}, (t) => [
  unique("accounts_receivable_business_id_id_unique").on(t.businessId, t.id),
  unique("accounts_receivable_sale_installment_unique").on(t.saleId, t.installmentNumber),
  foreignKey({ name: "accounts_receivable_sale_fk", columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  foreignKey({ name: "accounts_receivable_customer_fk", columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }),
  index("accounts_receivable_business_status_due_idx").on(t.businessId, t.status, t.dueDate),
  index("accounts_receivable_sale_idx").on(t.saleId),
  index("accounts_receivable_customer_idx").on(t.businessId, t.customerId),
  check("accounts_receivable_amounts", sql`${t.amount} > 0 and ${t.amountPaid} >= 0 and ${t.amountCancelled} >= 0 and ${t.amountPaid} + ${t.amountCancelled} <= ${t.amount}`),
  check(
    "accounts_receivable_status_consistent",
    sql`case
      when ${t.amountPaid} + ${t.amountCancelled} = ${t.amount} then (case when ${t.amountPaid} > 0 then ${t.status} = 'PAID' else ${t.status} = 'CANCELLED' end)
      when ${t.amountPaid} > 0 then ${t.status} = 'PARTIAL'
      else ${t.status} = 'PENDING' end`,
  ),
]);

/** Dinheiro que entrou (IN) ou saiu (OUT). Caixa ≠ lucro. */
export const payments = pgTable("payments", {
  id: id(),
  ...tenant(),
  direction: paymentDirection("direction").notNull(),
  kind: paymentKind("kind").notNull(),
  saleId: uuid("sale_id"),
  receivableId: uuid("receivable_id"),
  returnId: uuid("return_id"),
  amount: moneyCol("amount").notNull(),
  method: paymentMethod("method").notNull(),
  /** Data do pagamento (fuso da empresa). */
  paidOn: date("paid_on").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [
  foreignKey({ name: "payments_sale_fk", columns: [t.businessId, t.saleId], foreignColumns: [sales.businessId, sales.id] }),
  foreignKey({ name: "payments_receivable_fk", columns: [t.businessId, t.receivableId], foreignColumns: [accountsReceivable.businessId, accountsReceivable.id] }),
  foreignKey({ name: "payments_return_fk", columns: [t.businessId, t.returnId], foreignColumns: [returns.businessId, returns.id] }),
  index("payments_business_paid_on_idx").on(t.businessId, t.paidOn),
  index("payments_sale_idx").on(t.saleId),
  index("payments_receivable_idx").on(t.receivableId),
  check("payments_amount_positive", sql`${t.amount} > 0`),
  check(
    "payments_kind_direction",
    sql`(${t.kind} = 'SALE_RECEIPT' and ${t.direction} = 'IN' and ${t.receivableId} is not null)
      or (${t.kind} in ('SALE_CANCEL_REFUND','RETURN_REFUND') and ${t.direction} = 'OUT')`,
  ),
]);
