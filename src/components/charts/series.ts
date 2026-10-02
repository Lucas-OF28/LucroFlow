/**
 * Definições de séries compartilhadas entre Server e Client Components.
 * (Fica fora do módulo "use client": objetos exportados de lá chegam ao servidor como referência, não como valor.)
 */
export type SeriesDef = { key: string; label: string; color: string; format?: "money" | "percent" };

export const SERIES = {
  revenue: { key: "revenue", label: "Faturamento", color: "var(--series-1)" },
  netProfit: { key: "netProfit", label: "Lucro líquido", color: "var(--series-3)" },
  purchases: { key: "purchases", label: "Compras", color: "var(--series-2)" },
  expenses: { key: "expenses", label: "Despesas", color: "var(--series-1)" },
  margin: { key: "marginPercent", label: "Margem média", color: "var(--series-1)", format: "percent" },
  stock: { key: "stockValue", label: "Capital em estoque", color: "var(--series-1)" },
  grossProfit: { key: "grossProfit", label: "Lucro bruto", color: "var(--series-1)" },
} satisfies Record<string, SeriesDef>;

/** Rampa ordinal azul (faixas de idade 0–30 → 90+), da skill dataviz. */
export const AGING_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)"];
