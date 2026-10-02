import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function normalizeDecimal(v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : v;
  if (typeof v !== "string") return v;
  let s = v.trim().replace(/\s|R\$/g, "");
  if (s === "") return "0";
  // "1.234,56" → "1234.56" ; "1234,56" → "1234.56"
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return s;
}

function decimalString(maxScale: number, opts: { min?: "positive" | "nonnegative" | "any"; label: string }) {
  return z.preprocess(
    normalizeDecimal,
    z
      .string()
      .regex(DECIMAL_RE, `${opts.label}: valor inválido.`)
      .refine((s) => (s.split(".")[1]?.length ?? 0) <= maxScale, `${opts.label}: máximo de ${maxScale} casas decimais.`)
      .refine((s) => s.replace("-", "").split(".")[0].length <= 12, `${opts.label}: valor muito alto.`)
      .refine(
        (s) => opts.min === "any" || (opts.min === "positive" ? Number(s) > 0 : !s.startsWith("-")),
        opts.min === "positive" ? `${opts.label}: deve ser maior que zero.` : `${opts.label}: não pode ser negativo.`,
      ),
  );
}

export const money = (label = "Valor") => decimalString(2, { min: "nonnegative", label });
export const positiveMoney = (label = "Valor") => decimalString(2, { min: "positive", label });
export const signedMoney = (label = "Valor") => decimalString(2, { min: "any", label });
export const positiveQuantity = (label = "Quantidade") => decimalString(3, { min: "positive", label });
export const quantity = (label = "Quantidade") => decimalString(3, { min: "nonnegative", label });
export const percent = (label = "Percentual") =>
  decimalString(2, { min: "nonnegative", label }).refine((s) => Number(s) < 100, `${label}: deve ser menor que 100.`);

export const isoDate = (label = "Data") =>
  z.string().refine(isIsoDate, `${label}: data inválida.`);

export const uuid = () => z.uuid("Identificador inválido.");

export const optionalUuid = () =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid("Identificador inválido.").nullable());

export const optionalText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
    z.string().max(max, `Máximo de ${max} caracteres.`).nullable(),
  );

export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} é obrigatório.` }).trim().min(1, `${label} é obrigatório.`).max(max, `${label}: máximo de ${max} caracteres.`);

export const optionalMoney = (label = "Valor") =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), money(label).nullable());

export const PAYMENT_METHODS = [
  "CASH",
  "PIX",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "BOLETO",
  "STORE_CREDIT",
  "OTHER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethod = () => z.enum(PAYMENT_METHODS, { error: "Forma de pagamento inválida." });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof pagination>;
