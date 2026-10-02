import "server-only";
import { sql } from "drizzle-orm";
import { dec } from "@/lib/finance";
import { addDays, addMonths, endOfMonth, startOfMonth, todayIn } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import { type TenantContext, withTenant } from "../db/tenant";
import { daysToSell, groupByCategory, periodSummary, productPerformance, staleValue, stockAging } from "./reports";
import { receivablesSummary } from "./receivables";
import { businessSettings } from "./_base";

export type InsightTone = "positive" | "negative" | "neutral" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  /** Base de dados que sustenta o insight (transparência: nada é inventado). */
  basis: string;
}

/**
 * Inteligência do negócio por REGRAS sobre dados reais.
 * Cada regra só gera texto se houver dados suficientes (limiares explícitos abaixo).
 */
export async function generateInsights(ctx: TenantContext): Promise<Insight[]> {
  const today = todayIn(ctx.timezone);
  const thisMonthFrom = startOfMonth(today);
  const lastMonthFrom = addMonths(thisMonthFrom, -1);
  const lastMonthTo = endOfMonth(lastMonthFrom);
  const prevMonthFrom = addMonths(thisMonthFrom, -2);
  const prevMonthTo = endOfMonth(prevMonthFrom);
  const from90 = addDays(today, -89);
  const from180 = addDays(today, -179);

  const { staleDays } = await withTenant(ctx, (tx) => businessSettings(tx, ctx));

  const [lastMonth, prevMonth, perf90, perfLast, perfPrev, aging, dts, receivables, lossSales] = await Promise.all([
    periodSummary(ctx, lastMonthFrom, lastMonthTo),
    periodSummary(ctx, prevMonthFrom, prevMonthTo),
    productPerformance(ctx, from90, today),
    productPerformance(ctx, lastMonthFrom, lastMonthTo),
    productPerformance(ctx, prevMonthFrom, prevMonthTo),
    stockAging(ctx),
    daysToSell(ctx, from180, today),
    receivablesSummary(ctx),
    withTenant(ctx, async (tx) => {
      const [r] = await tx.execute<{ n: number; total: string }>(sql`
        select count(*)::int as n, coalesce(sum(-net_profit), 0) as total from sales
        where business_id = ${ctx.businessId} and status = 'CONFIRMED' and net_profit < 0 and sale_date >= ${addDays(today, -29)}`);
      return r;
    }),
  ]);

  const out: Insight[] = [];
  const monthName = (d: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  // 1. Lucro do último mês fechado vs. o anterior (exige vendas nos dois meses)
  if (lastMonth.saleCount > 0 && prevMonth.saleCount > 0 && !dec(prevMonth.netProfit).isZero()) {
    const change = dec(lastMonth.netProfit).minus(dec(prevMonth.netProfit)).dividedBy(dec(prevMonth.netProfit).abs()).times(100);
    if (change.abs().greaterThanOrEqualTo(1)) {
      out.push({
        id: "profit-change",
        tone: change.isPositive() ? "positive" : "negative",
        title: `Seu lucro líquido ${change.isPositive() ? "aumentou" : "diminuiu"} ${formatPercent(change.abs().toFixed(2))} em ${monthName(lastMonthFrom)} em relação a ${monthName(prevMonthFrom)}.`,
        basis: `${formatMoney(lastMonth.netProfit)} vs. ${formatMoney(prevMonth.netProfit)} (${lastMonth.saleCount} e ${prevMonth.saleCount} vendas).`,
      });
    }
  }

  // 2. Capital parado
  const stale = dec(staleValue(aging, 60));
  if (stale.greaterThan(0)) {
    out.push({
      id: "stale-capital",
      tone: "warning",
      title: `${formatMoney(stale.toFixed(2))} estão em produtos parados há mais de 60 dias.`,
      basis: "Idade calculada pelas entradas reais de estoque (premissa: unidades mais antigas saem primeiro).",
    });
  }

  // 3. Categoria dominante no lucro (≥ 2 categorias com lucro e lucro total positivo)
  const cats90 = groupByCategory(perf90).filter((c) => dec(c.profit).greaterThan(0));
  if (cats90.length >= 2 && cats90[0].profitShare && dec(cats90[0].profitShare).greaterThanOrEqualTo(30)) {
    out.push({
      id: "top-category",
      tone: "neutral",
      title: `${cats90[0].categoryName} representa ${formatPercent(cats90[0].profitShare)} do seu lucro bruto nos últimos 90 dias.`,
      basis: `Lucro bruto da categoria: ${formatMoney(cats90[0].profit)}.`,
    });
  }

  // 4. Variação de margem por categoria (mês fechado vs. anterior; mínimo R$ 1 de receita e 2+ unidades em cada mês)
  const lastCats = new Map(groupByCategory(perfLast).map((c) => [c.categoryName, c]));
  let biggest: { name: string; from: string; to: string; delta: number } | null = null;
  for (const prev of groupByCategory(perfPrev)) {
    const cur = lastCats.get(prev.categoryName);
    if (!cur || cur.marginPercent === null || prev.marginPercent === null) continue;
    if (dec(cur.units).lessThan(2) || dec(prev.units).lessThan(2)) continue;
    const delta = dec(cur.marginPercent).minus(dec(prev.marginPercent)).toNumber();
    if (Math.abs(delta) >= 3 && (!biggest || Math.abs(delta) > Math.abs(biggest.delta))) {
      biggest = { name: prev.categoryName, from: prev.marginPercent, to: cur.marginPercent, delta };
    }
  }
  if (biggest) {
    out.push({
      id: "category-margin",
      tone: biggest.delta > 0 ? "positive" : "negative",
      title: `A margem bruta de ${biggest.name} ${biggest.delta > 0 ? "subiu" : "caiu"} de ${formatPercent(biggest.from)} para ${formatPercent(biggest.to)}.`,
      basis: `${monthName(prevMonthFrom)} vs. ${monthName(lastMonthFrom)}.`,
    });
  }

  // 5. Tempo médio até a venda por categoria (mínimo 3 unidades vendidas em 180 dias)
  const speed = dts.categories.filter((c) => c.averageDays !== null && dec(c.units).greaterThanOrEqualTo(3))
    .sort((a, b) => a.averageDays! - b.averageDays!);
  if (speed.length >= 1) {
    const fast = speed[0];
    out.push({
      id: "fastest-category",
      tone: "neutral",
      title: `${fast.categoryName} leva em média ${fast.averageDays} dia(s) para vender.`,
      basis: `${dec(fast.units).toFixed(0)} unidades vendidas nos últimos 180 dias.`,
    });
    if (speed.length >= 2) {
      const slow = speed[speed.length - 1];
      out.push({
        id: "slowest-category",
        tone: slow.averageDays! > staleDays ? "warning" : "neutral",
        title: `${slow.categoryName} leva em média ${slow.averageDays} dia(s) para vender.`,
        basis: `${dec(slow.units).toFixed(0)} unidades vendidas nos últimos 180 dias.`,
      });
    }
  }

  // 6. Vendas com prejuízo
  if (lossSales.n > 0) {
    out.push({
      id: "loss-sales",
      tone: "negative",
      title: `${lossSales.n} venda(s) com prejuízo nos últimos 30 dias, somando ${formatMoney(lossSales.total)}.`,
      basis: "Vendas confirmadas com lucro da venda negativo.",
    });
  }

  // 7. Recebíveis vencidos
  if (dec(receivables.overdue).greaterThan(0)) {
    out.push({
      id: "overdue",
      tone: "warning",
      title: `Você tem ${formatMoney(receivables.overdue)} em parcelas vencidas.`,
      basis: `${receivables.overdueCount} parcela(s) com vencimento anterior a hoje.`,
    });
  }

  return out;
}
