import "server-only";
import { addMonths, isIsoDate, startOfMonth, todayIn } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { TenantContext } from "../db/tenant";
import { listExpenses } from "./expenses";
import { listCustomers, listSuppliers } from "./partners";
import { listProducts } from "./products";
import { listPurchases } from "./purchases";
import { monthlyReport, productPerformance } from "./reports";
import { listSales } from "./sales";

/**
 * Exportação CSV (pt-BR): separador ";", decimal com vírgula, BOM UTF-8 — abre direto no Excel/Sheets BR.
 * Células que começam com = + - @ recebem apóstrofo (proteção contra injeção de fórmula).
 * Formatos XLSX/PDF: a mesma estrutura de linhas pode alimentar um gerador futuro.
 */
type Cell = string | number | null | undefined;
const MAX_PAGES = 200; // até 20.000 linhas por exportação

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const num = (v: Cell) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
const date = (v: Cell) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

async function allPages<T>(fetch: (page: number) => Promise<{ rows: T[]; pageCount: number }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(page);
    out.push(...r.rows);
    if (page >= r.pageCount) break;
  }
  return out;
}

export const EXPORTS = ["estoque", "compras", "vendas", "despesas", "lucro-produtos", "clientes", "fornecedores", "mensal"] as const;
export type ExportKind = (typeof EXPORTS)[number];

export async function buildExport(ctx: TenantContext, kind: ExportKind, params: { de?: string; ate?: string; mes?: string }) {
  const today = todayIn(ctx.timezone);
  const from = params.de && isIsoDate(params.de) ? params.de : startOfMonth(addMonths(today, -11));
  const to = params.ate && isIsoDate(params.ate) ? params.ate : today;
  const suffix = `${from}_${to}`;

  switch (kind) {
    case "estoque": {
      const rows = await allPages((page) => listProducts(ctx, { page, pageSize: 100, includeInactive: true }));
      return {
        filename: `estoque_${today}.csv`,
        csv: toCsv(
          ["Produto", "SKU", "Código de barras", "Categoria", "Unidade", "Quantidade", "Custo médio", "Valor em estoque", "Preço de referência", "Margem potencial (%)", "Estoque mínimo", "Status"],
          rows.map((p) => [p.name, p.sku, p.barcode, p.categoryName, p.unit, num(p.stockQuantity), num(Number(p.averageCost).toFixed(2)), num(p.stockValue), num(p.referencePrice), num(p.potentialMargin), num(p.minStock), p.status]),
        ),
      };
    }
    case "compras": {
      const rows = await allPages((page) => listPurchases(ctx, { page, pageSize: 100, from, to }));
      return {
        filename: `compras_${suffix}.csv`,
        csv: toCsv(["Código", "Data", "Fornecedor", "Referência", "Itens", "Total", "Status"], rows.map((p) => [p.code, date(p.purchaseDate), p.supplierName, p.reference, p.itemCount, num(p.total), p.status === "CANCELLED" ? "Cancelada" : "Confirmada"])),
      };
    }
    case "vendas": {
      const rows = await allPages((page) => listSales(ctx, { page, pageSize: 100, from, to }));
      return {
        filename: `vendas_${suffix}.csv`,
        csv: toCsv(
          ["Código", "Data", "Cliente", "Faturamento", "Lucro da venda", "Recebido", "Em aberto", "Devolvido", "Status", "Prejuízo"],
          rows.map((s) => [s.code, date(s.saleDate), s.customerName, num(s.totalRevenue), num(s.netProfit), num(s.received), num(s.open), num(s.refunded), s.status === "CANCELLED" ? "Cancelada" : "Confirmada", s.belowCost ? "Sim" : "Não"]),
        ),
      };
    }
    case "despesas": {
      const rows = await allPages((page) => listExpenses(ctx, { page, pageSize: 100, from, to, includeCancelled: true }));
      return {
        filename: `despesas_${suffix}.csv`,
        csv: toCsv(["Data", "Descrição", "Categoria", "Valor", "Forma de pagamento", "Status"], rows.map((e) => [date(e.expenseDate), e.description, e.categoryName, num(e.amount), e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : "", e.cancelledAt ? "Cancelada" : "Ativa"])),
      };
    }
    case "lucro-produtos": {
      const rows = await productPerformance(ctx, from, to);
      return {
        filename: `lucro-por-produto_${suffix}.csv`,
        csv: toCsv(["Produto", "Categoria", "Quantidade", "Receita", "Custo", "Lucro bruto", "Lucro unitário", "Margem (%)"], rows.map((p) => [p.name, p.categoryName, num(p.units), num(p.revenue), num(p.cost), num(p.profit), num(p.unitProfit), num(p.marginPercent)])),
      };
    }
    case "clientes": {
      const rows = await allPages((page) => listCustomers(ctx, { page, pageSize: 100 }));
      return {
        filename: `clientes_${today}.csv`,
        csv: toCsv(["Nome", "WhatsApp", "Telefone", "E-mail", "Compras", "Total comprado", "Ticket médio", "Última compra", "Pendente", "Vencido"], rows.map((c) => [c.name, c.whatsapp, c.phone, c.email, c.saleCount, num(c.totalBought), num(c.averageTicket), date(c.lastPurchase), num(c.pending), num(c.overdue)])),
      };
    }
    case "fornecedores": {
      const rows = await allPages((page) => listSuppliers(ctx, { page, pageSize: 100 }));
      return {
        filename: `fornecedores_${today}.csv`,
        csv: toCsv(["Nome", "Empresa", "WhatsApp", "Telefone", "E-mail", "Compras", "Produtos", "Total comprado", "Última compra"], rows.map((s) => [s.name, s.companyName, s.whatsapp, s.phone, s.email, s.purchaseCount, s.productCount, num(s.totalPurchased), date(s.lastPurchase)])),
      };
    }
    case "mensal": {
      const month = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? `${params.mes}-01` : startOfMonth(today);
      const r = await monthlyReport(ctx, month);
      const s = r.summary;
      const rows: Cell[][] = [
        ["Período", `${date(r.from)} a ${date(r.to)}`],
        ["Compras", num(s.purchases)],
        ["Faturamento", num(s.revenue)],
        ["Devoluções", num(s.refunds)],
        ["Custo das mercadorias vendidas", num(s.cogs)],
        ["Lucro bruto", num(s.grossProfit)],
        ["Custos das vendas", num(s.saleCosts)],
        ["Despesas", num(s.expenses)],
        ["Perdas de estoque", num(s.losses)],
        ["Lucro líquido", num(s.netProfit)],
        ["Vendas", s.saleCount],
        ["Produtos vendidos", num(s.unitsSold)],
        ["Ticket médio", num(s.averageTicket)],
        ["Margem média (%)", num(s.marginPercent)],
        ["Recebido no período", num(s.cashIn)],
        ["Capital em estoque (fim do período)", num(s.stockValueAtEnd)],
        ["Em aberto hoje das vendas do período", num(r.openReceivablesFromPeriod)],
        [],
        ["Produto", "Quantidade", "Receita", "Custo", "Lucro bruto", "Margem (%)"],
        ...r.products.map((p) => [p.name, num(p.units), num(p.revenue), num(p.cost), num(p.profit), num(p.marginPercent)]),
      ];
      return { filename: `relatorio-mensal_${month.slice(0, 7)}.csv`, csv: toCsv(["Indicador", "Valor"], rows) };
    }
  }
}

