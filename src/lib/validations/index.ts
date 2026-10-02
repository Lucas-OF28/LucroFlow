import { z } from "zod";
import {
  isoDate,
  money,
  optionalMoney,
  optionalText,
  optionalUuid,
  paymentMethod,
  percent,
  positiveMoney,
  positiveQuantity,
  quantity,
  requiredText,
  signedMoney,
  uuid,
} from "./common";

export * from "./common";

// ─── Empresa ────────────────────────────────────────────────────────────────
export const createBusinessSchema = z.object({
  name: requiredText("Nome da empresa", 120),
  timezone: z.string().min(1).default("America/Sao_Paulo"),
});

export const updateBusinessSchema = z.object({
  name: requiredText("Nome da empresa", 120),
  timezone: z.string().min(1),
  staleDays: z.coerce.number().int().min(1, "Mínimo 1 dia.").max(3650),
});

// ─── Cadastros ──────────────────────────────────────────────────────────────
export const categorySchema = z.object({ name: requiredText("Nome da categoria", 80) });

export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const productSchema = z.object({
  name: requiredText("Nome do produto", 160),
  description: optionalText(4000),
  categoryId: optionalUuid(),
  sku: optionalText(64),
  barcode: optionalText(64),
  unit: z.string().trim().min(1).max(10).default("un"),
  minStock: quantity("Estoque mínimo").default("0"),
  referencePrice: optionalMoney("Preço de referência"),
  minimumPrice: optionalMoney("Preço mínimo"),
  targetMargin: z.preprocess((v) => (v === "" || v === undefined ? null : v), percent("Margem desejada").nullable()),
  location: optionalText(120),
  mainSupplierId: optionalUuid(),
  notes: optionalText(4000),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
});
export type ProductInput = z.input<typeof productSchema>;

const contactFields = {
  phone: optionalText(40),
  whatsapp: optionalText(40),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email("E-mail inválido.").nullable().optional(),
  ),
  document: optionalText(32),
  notes: optionalText(4000),
};

export const supplierSchema = z.object({
  name: requiredText("Nome", 160),
  companyName: optionalText(160),
  ...contactFields,
});

export const customerSchema = z.object({
  name: requiredText("Nome", 160),
  ...contactFields,
});

// ─── Compras ────────────────────────────────────────────────────────────────
export const purchaseSchema = z.object({
  supplierId: optionalUuid(),
  purchaseDate: isoDate("Data da compra").optional(),
  reference: optionalText(80),
  paymentMethod: paymentMethod().nullable().optional(),
  freight: money("Frete").default("0"),
  taxes: money("Impostos").default("0"),
  otherCosts: money("Outros custos").default("0"),
  discount: money("Desconto").default("0"),
  notes: optionalText(2000),
  items: z
    .array(
      z.object({
        productId: uuid(),
        quantity: positiveQuantity(),
        unitCost: money("Custo unitário"),
        discount: money("Desconto do item").default("0"),
        additionalCosts: money("Custos adicionais").default("0"),
      }),
    )
    .min(1, "Adicione ao menos um item à compra.")
    .max(200),
});
export type PurchaseFormInput = z.input<typeof purchaseSchema>;

// ─── Vendas ─────────────────────────────────────────────────────────────────
export const salePaymentLineSchema = z.object({
  method: paymentMethod(),
  amount: positiveMoney("Valor do pagamento"),
  /** true = recebido na data da venda; false = a receber no vencimento. */
  received: z.boolean(),
  dueDate: isoDate("Vencimento").nullable().optional(),
});

export const saleSchema = z.object({
  customerId: optionalUuid(),
  saleDate: isoDate("Data da venda").optional(),
  discount: money("Desconto").default("0"),
  freightCharged: money("Frete cobrado").default("0"),
  freightPaid: money("Frete pago").default("0"),
  fees: money("Taxas").default("0"),
  commission: money("Comissão").default("0"),
  otherExpenses: money("Outras despesas").default("0"),
  notes: optionalText(2000),
  acknowledgeLoss: z.boolean().default(false),
  items: z
    .array(
      z.object({
        productId: uuid(),
        quantity: positiveQuantity(),
        unitPrice: money("Preço unitário"),
        discount: money("Desconto do item").default("0"),
      }),
    )
    .min(1, "Adicione ao menos um produto à venda.")
    .max(200),
  payments: z.array(salePaymentLineSchema).max(48, "Máximo de 48 parcelas."),
});
export type SaleFormInput = z.input<typeof saleSchema>;

export const cancelSchema = z.object({
  reason: requiredText("Motivo", 500),
  refundMethod: paymentMethod().nullable().optional(),
});

export const returnSchema = z.object({
  saleId: uuid(),
  returnDate: isoDate("Data da devolução").optional(),
  reason: requiredText("Motivo", 500),
  refundMethod: paymentMethod().nullable().optional(),
  notes: optionalText(2000),
  items: z
    .array(
      z.object({
        saleItemId: uuid(),
        quantity: positiveQuantity(),
        restock: z.boolean().default(true),
        refundAmount: optionalMoney("Reembolso"),
      }),
    )
    .min(1, "Selecione ao menos um item."),
});

export const receivePaymentSchema = z.object({
  receivableId: uuid(),
  amount: positiveMoney("Valor recebido"),
  method: paymentMethod(),
  paidOn: isoDate("Data do pagamento").optional(),
  notes: optionalText(500),
});

// ─── Estoque ────────────────────────────────────────────────────────────────
export const ADJUSTMENT_TYPES = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "LOSS", "COST_ADJUSTMENT"] as const;
export const stockAdjustmentSchema = z
  .object({
    productId: uuid(),
    type: z.enum(ADJUSTMENT_TYPES),
    quantity: quantity().default("0"),
    /** Custo unitário para ADJUSTMENT_IN (padrão: custo médio atual). */
    unitCost: optionalMoney("Custo unitário"),
    /** Valor para COST_ADJUSTMENT (positivo agrega custo; negativo reduz). */
    amount: signedMoney("Valor").default("0"),
    movementDate: isoDate().optional(),
    notes: requiredText("Justificativa", 500),
  })
  .superRefine((v, ctx) => {
    if (v.type === "COST_ADJUSTMENT") {
      if (Number(v.amount) === 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Informe o valor do ajuste de custo." });
    } else if (!(Number(v.quantity) > 0)) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantidade deve ser maior que zero." });
    }
  });

// ─── Despesas ───────────────────────────────────────────────────────────────
export const expenseSchema = z.object({
  description: requiredText("Descrição", 200),
  categoryId: uuid(),
  amount: positiveMoney("Valor"),
  expenseDate: isoDate("Data").optional(),
  paymentMethod: paymentMethod().nullable().optional(),
  notes: optionalText(2000),
});

export const expenseCategorySchema = z.object({ name: requiredText("Nome da categoria", 80) });
