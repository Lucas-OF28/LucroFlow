import { pgEnum } from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE", "VIEWER"]);
export const memberStatus = pgEnum("member_status", ["ACTIVE", "INVITED", "DISABLED"]);
export const costingMethod = pgEnum("costing_method", ["WEIGHTED_AVERAGE"]);

/** Status do CADASTRO do produto. "Sem estoque" é derivado do saldo (ver ARQUITETURA R7). */
export const productStatus = pgEnum("product_status", ["ACTIVE", "INACTIVE", "OUT_OF_STOCK"]);

export const documentStatus = pgEnum("document_status", ["CONFIRMED", "CANCELLED"]);

export const paymentMethod = pgEnum("payment_method", [
  "CASH",
  "PIX",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "BOLETO",
  "STORE_CREDIT",
  "OTHER",
]);

export const movementType = pgEnum("movement_type", [
  "PURCHASE",
  "PURCHASE_CANCEL",
  "SALE",
  "SALE_CANCEL",
  "RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "LOSS",
  "COST_ADJUSTMENT",
  "TRANSFER",
]);

export const movementReference = pgEnum("movement_reference", ["PURCHASE", "SALE", "RETURN", "ADJUSTMENT"]);

export const receivableStatus = pgEnum("receivable_status", ["PENDING", "PARTIAL", "PAID", "CANCELLED"]);

export const paymentDirection = pgEnum("payment_direction", ["IN", "OUT"]);
export const paymentKind = pgEnum("payment_kind", ["SALE_RECEIPT", "SALE_CANCEL_REFUND", "RETURN_REFUND"]);
