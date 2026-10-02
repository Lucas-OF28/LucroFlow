/**
 * Formatação centralizada (pt-BR / BRL hoje). Para internacionalizar, troque a configuração
 * aqui — nenhum componente deve chamar Intl/toLocaleString diretamente.
 */
export const LOCALE_CONFIG = {
  locale: "pt-BR",
  currency: "BRL",
  defaultTimezone: "America/Sao_Paulo",
} as const;

type Numeric = string | number | null | undefined;

const moneyFmt = new Intl.NumberFormat(LOCALE_CONFIG.locale, { style: "currency", currency: LOCALE_CONFIG.currency });
const moneyCompactFmt = new Intl.NumberFormat(LOCALE_CONFIG.locale, {
  style: "currency",
  currency: LOCALE_CONFIG.currency,
  notation: "compact",
  maximumFractionDigits: 1,
});
const percentFmt = new Intl.NumberFormat(LOCALE_CONFIG.locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/**
 * Valores chegam como string decimal exata (NUMERIC). A conversão para number aqui é SÓ para exibição
 * (precisão de exibição de centavos é segura até trilhões).
 */
function toNumber(v: Numeric): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(v: Numeric, fallback = "—"): string {
  const n = toNumber(v);
  return n === null ? fallback : moneyFmt.format(n);
}

/** "+ R$ 550,00" / "− R$ 180,00": o sinal é textual, não só cor (acessibilidade). */
export function formatSignedMoney(v: Numeric, fallback = "—"): string {
  const n = toNumber(v);
  if (n === null) return fallback;
  if (n === 0) return moneyFmt.format(0);
  return `${n > 0 ? "+" : "−"} ${moneyFmt.format(Math.abs(n))}`;
}

export function formatMoneyCompact(v: Numeric): string {
  const n = toNumber(v);
  return n === null ? "—" : moneyCompactFmt.format(n);
}

export function formatPercent(v: Numeric, fallback = "—"): string {
  const n = toNumber(v);
  return n === null ? fallback : `${percentFmt.format(n)}%`;
}

export function formatSignedPercent(v: Numeric, fallback = "—"): string {
  const n = toNumber(v);
  if (n === null) return fallback;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${percentFmt.format(Math.abs(n))}%`;
}

export function formatQuantity(v: Numeric, unit = "un"): string {
  const n = toNumber(v);
  if (n === null) return "—";
  const digits = unit === "un" && Number.isInteger(n) ? 0 : 3;
  return new Intl.NumberFormat(LOCALE_CONFIG.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatNumber(v: Numeric, digits = 0): string {
  const n = toNumber(v);
  return n === null ? "—" : new Intl.NumberFormat(LOCALE_CONFIG.locale, { maximumFractionDigits: digits }).format(n);
}

/** Data comercial "YYYY-MM-DD" → "DD/MM/YYYY" (sem conversão de fuso: já é a data da empresa). */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = iso instanceof Date ? iso.toISOString().slice(0, 10) : String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Timestamp técnico → data/hora no fuso da empresa. */
export function formatDateTime(ts: string | Date | null | undefined, timezone: string = LOCALE_CONFIG.defaultTimezone): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE_CONFIG.locale, { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(ts));
}

export function formatMonth(iso: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(LOCALE_CONFIG.locale, { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`));
}

export function formatMonthShort(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_CONFIG.locale, { month: "short", timeZone: "UTC" })
    .format(new Date(`${iso.slice(0, 7)}-15T12:00:00Z`))
    .replace(".", "");
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT_CARD: "Cartão de débito",
  CREDIT_CARD: "Cartão de crédito",
  BANK_TRANSFER: "Transferência",
  BOLETO: "Boleto",
  STORE_CREDIT: "Crédito na loja",
  OTHER: "Outro",
};

export const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  PURCHASE_CANCEL: "Cancelamento de compra",
  SALE: "Venda",
  SALE_CANCEL: "Cancelamento de venda",
  RETURN: "Devolução",
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de saída",
  LOSS: "Perda",
  COST_ADJUSTMENT: "Ajuste de custo",
  TRANSFER: "Transferência",
};
