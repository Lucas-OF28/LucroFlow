import "server-only";
import { sql } from "drizzle-orm";
import { type Decimal, average, dec, margin, percentChange, roi, share } from "@/lib/finance";
import { addDays, daysBetween, endOfMonth, monthsInRange, previousPeriod, startOfMonth, todayIn, type Period } from "@/lib/dates";
import type { Transaction } from "../db/client";
import { type TenantContext, withTenant } from "../db/tenant";
import { stockAgingForProducts } from "./products";

/**
 * FÓRMULAS (docs/ARQUITETURA.md §7) — fonte única para dashboard, relatórios e inteligência:
 *   faturamento        = Σ faturamento das vendas confirmadas no período − reembolsos de devoluções no período (D2)
 *   CMV                = Σ custo histórico das vendas − custo devolvido ao estoque no período
 *   lucro bruto        = faturamento − CMV
 *   custos das vendas  = frete pago + taxas + comissões + outras despesas das vendas
 *   lucro líquido      = lucro bruto − custos das vendas − despesas operacionais − perdas de estoque (LOSS)
 *   margem média       = lucro líquido / faturamento
 *   compras            = Σ compras confirmadas (NÃO é despesa: vira estoque)
 *   recebido           = Σ pagamentos recebidos no período (caixa ≠ lucro)
 */
export interface PeriodSummary {
  from: string;
  to: string;
  revenue: string;
  grossSalesRevenue: string;
  refunds: string;
  cogs: string;
  grossProfit: string;
  saleCosts: string;
  expenses: string;
  losses: string;
  netProfit: string;
  purchases: string;
  purchaseCount: number;
  saleCount: number;
  unitsSold: string;
  averageTicket: string | null;
  marginPercent: string | null;
  grossMarginPercent: string | null;
  roiPercent: string | null;
  cashIn: string;
  cashOut: string;
  stockValueAtEnd: string;
  stockQuantityAtEnd: string;
}

type RawSummary = {
  sales_revenue: string; sales_cost: string; sale_costs: string; sale_count: number; units_sold: string;
  refunds: string; cost_reversals: string; units_returned: string; expenses: string; losses: string;
  purchases: string; purchase_count: number; cash_in: string; cash_out: string; stock_value: string; stock_qty: string;
};

async function rawSummary(tx: Transaction, businessId: string, from: string, to: string): Promise<RawSummary> {
  const rows = await tx.execute<RawSummary>(sql`
    with s as (
      select * from sales where business_id = ${businessId} and status = 'CONFIRMED' and sale_date between ${from} and ${to}
    ), r as (
      select r.* from returns r join sales s2 on s2.id = r.sale_id
      where r.business_id = ${businessId} and s2.status = 'CONFIRMED' and r.return_date between ${from} and ${to}
    )
    select
      (select coalesce(sum(total_revenue), 0) from s) as sales_revenue,
      (select coalesce(sum(total_cost), 0) from s) as sales_cost,
      (select coalesce(sum(freight_paid + fees + commission + other_expenses), 0) from s) as sale_costs,
      (select count(*)::int from s) as sale_count,
      (select coalesce(sum(si.quantity), 0) from sale_items si join s on s.id = si.sale_id) as units_sold,
      (select coalesce(sum(refund_total), 0) from r) as refunds,
      (select coalesce(sum(cost_reversal_total), 0) from r) as cost_reversals,
      (select coalesce(sum(ri.quantity), 0) from return_items ri join r on r.id = ri.return_id) as units_returned,
      (select coalesce(sum(amount), 0) from expenses where business_id = ${businessId} and cancelled_at is null and expense_date between ${from} and ${to}) as expenses,
      (select coalesce(sum(-value_delta), 0) from inventory_movements where business_id = ${businessId} and type = 'LOSS' and movement_date between ${from} and ${to}) as losses,
      (select coalesce(sum(total), 0) from purchases where business_id = ${businessId} and status = 'CONFIRMED' and purchase_date between ${from} and ${to}) as purchases,
      (select count(*)::int from purchases where business_id = ${businessId} and status = 'CONFIRMED' and purchase_date between ${from} and ${to}) as purchase_count,
      (select coalesce(sum(amount), 0) from payments where business_id = ${businessId} and direction = 'IN' and paid_on between ${from} and ${to}) as cash_in,
      (select coalesce(sum(amount), 0) from payments where business_id = ${businessId} and direction = 'OUT' and paid_on between ${from} and ${to}) as cash_out,
      (select coalesce(sum(value_delta), 0) from inventory_movements where business_id = ${businessId} and movement_date <= ${to}) as stock_value,
      (select coalesce(sum(quantity_delta), 0) from inventory_movements where business_id = ${businessId} and movement_date <= ${to}) as stock_qty
  `);
  return rows[0];
}

export function buildSummary(from: string, to: string, r: RawSummary): PeriodSummary {
  const revenue = dec(r.sales_revenue).minus(dec(r.refunds));
  const cogs = dec(r.sales_cost).minus(dec(r.cost_reversals));
  const gross = revenue.minus(cogs);
  const net = gross.minus(dec(r.sale_costs)).minus(dec(r.expenses)).minus(dec(r.losses));
  const f = (d: Decimal | null) => (d === null ? null : d.toFixed(2));
  return {
    from,
    to,
    revenue: revenue.toFixed(2),
    grossSalesRevenue: dec(r.sales_revenue).toFixed(2),
    refunds: dec(r.refunds).toFixed(2),
    cogs: cogs.toFixed(2),
    grossProfit: gross.toFixed(2),
    saleCosts: dec(r.sale_costs).toFixed(2),
    expenses: dec(r.expenses).toFixed(2),
    losses: dec(r.losses).toFixed(2),
    netProfit: net.toFixed(2),
    purchases: dec(r.purchases).toFixed(2),
    purchaseCount: Number(r.purchase_count),
    saleCount: Number(r.sale_count),
    unitsSold: dec(r.units_sold).minus(dec(r.units_returned)).toFixed(3),
    averageTicket: f(average(r.sales_revenue, r.sale_count)),
    marginPercent: f(margin(net, revenue)),
    grossMarginPercent: f(margin(gross, revenue)),
    roiPercent: f(roi(gross.minus(dec(r.sale_costs)), cogs)),
    cashIn: dec(r.cash_in).toFixed(2),
    cashOut: dec(r.cash_out).toFixed(2),
    stockValueAtEnd: dec(r.stock_value).toFixed(2),
    stockQuantityAtEnd: dec(r.stock_qty).toFixed(3),
  };
}

export async function periodSummary(ctx: TenantContext, from: string, to: string): Promise<PeriodSummary> {
  return withTenant(ctx, async (tx) => buildSummary(from, to, await rawSummary(tx, ctx.businessId, from, to)));
}

export type Comparison = Record<
  "revenue" | "grossProfit" | "netProfit" | "purchases" | "expenses" | "saleCount" | "unitsSold" | "averageTicket" | "marginPercent",
  string | null
>;

export function compareSummaries(current: PeriodSummary, previous: PeriodSummary): Comparison {
  const pc = (a: string | number | null, b: string | number | null) => (a === null || b === null ? null : percentChange(a, b)?.toFixed(2) ?? null);
  return {
    revenue: pc(current.revenue, previous.revenue),
    grossProfit: pc(current.grossProfit, previous.grossProfit),
    netProfit: pc(current.netProfit, previous.netProfit),
    purchases: pc(current.purchases, previous.purchases),
    expenses: pc(current.expenses, previous.expenses),
    saleCount: pc(current.saleCount, previous.saleCount),
    unitsSold: pc(current.unitsSold, previous.unitsSold),
    averageTicket: pc(current.averageTicket, previous.averageTicket),
    // margem: diferença em pontos percentuais (não variação %)
    marginPercent:
      current.marginPercent !== null && previous.marginPercent !== null
        ? dec(current.marginPercent).minus(dec(previous.marginPercent)).toFixed(2)
        : null,
  };
}

// ─── Séries temporais ───────────────────────────────────────────────────────

export interface SeriesPoint {
  bucket: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  netProfit: string;
  purchases: string;
  expenses: string;
  saleCount: number;
  marginPercent: string | null;
  stockValue: string;
}

export async function timeSeries(ctx: TenantContext, from: string, to: string): Promise<{ granularity: "day" | "month"; points: SeriesPoint[] }> {
  const granularity = daysBetween(from, to) <= 62 ? "day" : "month";
  const b = (col: string) => (granularity === "day" ? sql.raw(`${col}::date`) : sql.raw(`date_trunc('month', ${col})::date`));
  return withTenant(ctx, async (tx) => {
    const id = ctx.businessId;
    const [salesRows, returnRows, expenseRows, lossRows, purchaseRows, stockRows, stockBefore] = await Promise.all([
      tx.execute<{ k: string; revenue: string; cost: string; costs: string; n: number }>(sql`
        select ${b("sale_date")} as k, sum(total_revenue) as revenue, sum(total_cost) as cost,
          sum(freight_paid + fees + commission + other_expenses) as costs, count(*)::int as n
        from sales where business_id = ${id} and status = 'CONFIRMED' and sale_date between ${from} and ${to} group by 1`),
      tx.execute<{ k: string; refund: string; reversal: string }>(sql`
        select ${b("r.return_date")} as k, sum(r.refund_total) as refund, sum(r.cost_reversal_total) as reversal
        from returns r join sales s on s.id = r.sale_id
        where r.business_id = ${id} and s.status = 'CONFIRMED' and r.return_date between ${from} and ${to} group by 1`),
      tx.execute<{ k: string; amount: string }>(sql`
        select ${b("expense_date")} as k, sum(amount) as amount from expenses
        where business_id = ${id} and cancelled_at is null and expense_date between ${from} and ${to} group by 1`),
      tx.execute<{ k: string; amount: string }>(sql`
        select ${b("movement_date")} as k, sum(-value_delta) as amount from inventory_movements
        where business_id = ${id} and type = 'LOSS' and movement_date between ${from} and ${to} group by 1`),
      tx.execute<{ k: string; amount: string }>(sql`
        select ${b("purchase_date")} as k, sum(total) as amount from purchases
        where business_id = ${id} and status = 'CONFIRMED' and purchase_date between ${from} and ${to} group by 1`),
      tx.execute<{ k: string; amount: string }>(sql`
        select ${b("movement_date")} as k, sum(value_delta) as amount from inventory_movements
        where business_id = ${id} and movement_date between ${from} and ${to} group by 1`),
      tx.execute<{ amount: string }>(sql`
        select coalesce(sum(value_delta), 0) as amount from inventory_movements where business_id = ${id} and movement_date < ${from}`),
    ]);

    const keyOf = (v: unknown) => String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
    const buckets: string[] = [];
    if (granularity === "day") for (let d = from; d <= to; d = addDays(d, 1)) buckets.push(d);
    else buckets.push(...monthsInRange(from, to));

    const idx = <T extends { k: unknown }>(rows: T[]) => new Map(rows.map((r) => [keyOf(r.k), r]));
    const s = idx(salesRows), r = idx(returnRows), e = idx(expenseRows), l = idx(lossRows), p = idx(purchaseRows), st = idx(stockRows);

    let stock = dec(stockBefore[0].amount);
    const points = buckets.map((k) => {
      const sr = s.get(k), rr = r.get(k);
      const revenue = dec(sr?.revenue).minus(dec(rr?.refund));
      const cogs = dec(sr?.cost).minus(dec(rr?.reversal));
      const gross = revenue.minus(cogs);
      const net = gross.minus(dec(sr?.costs)).minus(dec(e.get(k)?.amount)).minus(dec(l.get(k)?.amount));
      stock = stock.plus(dec(st.get(k)?.amount));
      return {
        bucket: k,
        revenue: revenue.toFixed(2),
        cogs: cogs.toFixed(2),
        grossProfit: gross.toFixed(2),
        netProfit: net.toFixed(2),
        purchases: dec(p.get(k)?.amount).toFixed(2),
        expenses: dec(e.get(k)?.amount).toFixed(2),
        saleCount: Number(sr?.n ?? 0),
        marginPercent: margin(net, revenue)?.toFixed(2) ?? null,
        stockValue: stock.toFixed(2),
      };
    });
    return { granularity, points };
  });
}

// ─── Produtos e categorias ──────────────────────────────────────────────────

export interface ProductPerformance {
  productId: string;
  name: string;
  categoryName: string | null;
  units: string;
  revenue: string;
  cost: string;
  profit: string;
  unitProfit: string | null;
  marginPercent: string | null;
}

/** Desempenho por produto no período (lucro bruto do produto, líquido de devoluções do período). */
export async function productPerformance(ctx: TenantContext, from: string, to: string): Promise<ProductPerformance[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.execute<{ product_id: string; name: string; category_name: string | null; units: string; revenue: string; cost: string }>(sql`
      with sold as (
        select si.product_id, sum(si.quantity) as units, sum(si.net_revenue) as revenue, sum(si.total_cost) as cost
        from sale_items si join sales s on s.id = si.sale_id
        where s.business_id = ${ctx.businessId} and s.status = 'CONFIRMED' and s.sale_date between ${from} and ${to}
        group by si.product_id
      ), returned as (
        select ri.product_id, sum(ri.quantity) as units, sum(ri.refund_amount) as revenue, sum(ri.cost_reversal) as cost
        from return_items ri join returns r on r.id = ri.return_id join sales s on s.id = r.sale_id
        where r.business_id = ${ctx.businessId} and s.status = 'CONFIRMED' and r.return_date between ${from} and ${to}
        group by ri.product_id
      )
      select p.id as product_id, p.name, c.name as category_name,
        coalesce(sold.units, 0) - coalesce(returned.units, 0) as units,
        coalesce(sold.revenue, 0) - coalesce(returned.revenue, 0) as revenue,
        coalesce(sold.cost, 0) - coalesce(returned.cost, 0) as cost
      from products p
      left join categories c on c.id = p.category_id
      left join sold on sold.product_id = p.id
      left join returned on returned.product_id = p.id
      where p.business_id = ${ctx.businessId} and (sold.product_id is not null or returned.product_id is not null)`);
    return rows.map((r) => {
      const profit = dec(r.revenue).minus(dec(r.cost));
      return {
        productId: r.product_id,
        name: r.name,
        categoryName: r.category_name,
        units: dec(r.units).toFixed(3),
        revenue: dec(r.revenue).toFixed(2),
        cost: dec(r.cost).toFixed(2),
        profit: profit.toFixed(2),
        unitProfit: dec(r.units).greaterThan(0) ? profit.dividedBy(dec(r.units)).toFixed(2) : null,
        marginPercent: margin(profit, r.revenue)?.toFixed(2) ?? null,
      };
    });
  });
}

export interface CategoryPerformance {
  categoryName: string;
  units: string;
  revenue: string;
  cost: string;
  profit: string;
  marginPercent: string | null;
  profitShare: string | null;
}

export function groupByCategory(products: ProductPerformance[]): CategoryPerformance[] {
  const map = new Map<string, { units: Decimal; revenue: Decimal; cost: Decimal }>();
  for (const p of products) {
    const k = p.categoryName ?? "Sem categoria";
    const cur = map.get(k) ?? { units: dec(0), revenue: dec(0), cost: dec(0) };
    map.set(k, { units: cur.units.plus(dec(p.units)), revenue: cur.revenue.plus(dec(p.revenue)), cost: cur.cost.plus(dec(p.cost)) });
  }
  const totalProfit = [...map.values()].reduce((a, v) => a.plus(v.revenue.minus(v.cost)), dec(0));
  return [...map.entries()]
    .map(([categoryName, v]) => {
      const profit = v.revenue.minus(v.cost);
      return {
        categoryName,
        units: v.units.toFixed(3),
        revenue: v.revenue.toFixed(2),
        cost: v.cost.toFixed(2),
        profit: profit.toFixed(2),
        marginPercent: margin(profit, v.revenue)?.toFixed(2) ?? null,
        profitShare: totalProfit.greaterThan(0) ? share(profit, totalProfit)?.toFixed(2) ?? null : null,
      };
    })
    .sort((a, b) => dec(b.profit).comparedTo(dec(a.profit)));
}

// ─── Estoque ────────────────────────────────────────────────────────────────

export interface AgingBucket { label: string; minDays: number; maxDays: number | null; quantity: string; value: string }

/** Idade do estoque em faixas (0–30, 31–60, 61–90, 90+), valorizada pelo custo médio atual. */
export async function stockAging(ctx: TenantContext) {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const { layers } = await stockAgingForProducts(tx, ctx.businessId, today);
    const avg = await tx.execute<{ id: string; avg: string }>(sql`
      select id, case when stock_quantity > 0 then stock_value / stock_quantity else 0 end as avg
      from products where business_id = ${ctx.businessId}`);
    const avgMap = new Map(avg.map((a) => [a.id, dec(a.avg)]));
    const defs: [string, number, number | null][] = [["0–30 dias", 0, 30], ["31–60 dias", 31, 60], ["61–90 dias", 61, 90], ["Mais de 90 dias", 91, null]];
    const buckets = defs.map(([label, minDays, maxDays]) => ({ label, minDays, maxDays, quantity: dec(0), value: dec(0) }));
    for (const l of layers) {
      const days = daysBetween(String(l.movement_date).slice(0, 10), today);
      const bucket = buckets.find((b) => days >= b.minDays && (b.maxDays === null || days <= b.maxDays))!;
      bucket.quantity = bucket.quantity.plus(dec(l.remaining));
      bucket.value = bucket.value.plus(dec(l.remaining).times(avgMap.get(l.product_id) ?? dec(0)));
    }
    return buckets.map((b) => ({ ...b, quantity: b.quantity.toFixed(3), value: b.value.toFixed(2) })) satisfies AgingBucket[];
  });
}

/** Valor parado há mais de N dias (premissa FIFO analítica). */
export function staleValue(buckets: AgingBucket[], days: number): string {
  // Faixas são fixas; para 60 dias: 61–90 + 90+.
  return buckets.filter((b) => b.minDays > days).reduce((a, b) => a.plus(dec(b.value)), dec(0)).toFixed(2);
}

/**
 * Tempo médio até a venda (dias) por produto e categoria para vendas no período.
 * Pareamento FIFO analítico entre entradas e saídas por venda.
 */
export async function daysToSell(ctx: TenantContext, from: string, to: string) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.execute<{ product_id: string; name: string; category_name: string | null; matched: string; weighted_days: string }>(sql`
      with mv as (
        select m.id, m.product_id, m.movement_date, m.occurred_at, m.quantity_delta, m.type
        from inventory_movements m
        left join sales s on s.id = m.reference_id and m.reference_type = 'SALE'
        where m.business_id = ${ctx.businessId}
          and m.type not in ('SALE_CANCEL', 'COST_ADJUSTMENT', 'TRANSFER')
          and not (m.type = 'SALE' and s.status = 'CANCELLED')
      ),
      ins as (
        select product_id, movement_date,
          sum(quantity_delta) over w - quantity_delta as s0, sum(quantity_delta) over w as s1
        from mv where quantity_delta > 0
        window w as (partition by product_id order by occurred_at, id)
      ),
      outs as (
        select product_id, movement_date, type,
          sum(-quantity_delta) over w - (-quantity_delta) as s0, sum(-quantity_delta) over w as s1
        from mv where quantity_delta < 0
        window w as (partition by product_id order by occurred_at, id)
      ),
      matched as (
        select o.product_id,
          least(i.s1, o.s1) - greatest(i.s0, o.s0) as q,
          (o.movement_date - i.movement_date) as days
        from outs o join ins i on i.product_id = o.product_id and i.s0 < o.s1 and o.s0 < i.s1
        where o.type = 'SALE' and o.movement_date between ${from} and ${to}
      )
      select p.id as product_id, p.name, c.name as category_name,
        sum(m.q) as matched, sum(m.q * m.days) as weighted_days
      from matched m join products p on p.id = m.product_id left join categories c on c.id = p.category_id
      group by p.id, p.name, c.name`);

    const products = rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      categoryName: r.category_name,
      units: dec(r.matched).toFixed(3),
      averageDays: dec(r.matched).greaterThan(0) ? Math.round(dec(r.weighted_days).dividedBy(dec(r.matched)).toNumber()) : null,
    }));
    const cat = new Map<string, { units: Decimal; weighted: Decimal }>();
    for (const r of rows) {
      const k = r.category_name ?? "Sem categoria";
      const cur = cat.get(k) ?? { units: dec(0), weighted: dec(0) };
      cat.set(k, { units: cur.units.plus(dec(r.matched)), weighted: cur.weighted.plus(dec(r.weighted_days)) });
    }
    const categories = [...cat.entries()].map(([categoryName, v]) => ({
      categoryName,
      units: v.units.toFixed(3),
      averageDays: v.units.greaterThan(0) ? Math.round(v.weighted.dividedBy(v.units).toNumber()) : null,
    }));
    const all = [...cat.values()].reduce((a, v) => ({ units: a.units.plus(v.units), weighted: a.weighted.plus(v.weighted) }), { units: dec(0), weighted: dec(0) });
    return {
      products,
      categories,
      overallAverageDays: all.units.greaterThan(0) ? Math.round(all.weighted.dividedBy(all.units).toNumber()) : null,
    };
  });
}

// ─── Relatório mensal / comparativo ─────────────────────────────────────────

export async function monthlyReport(ctx: TenantContext, month: string) {
  const from = startOfMonth(month);
  const today = todayIn(ctx.timezone);
  const to = endOfMonth(month) > today && from <= today ? today : endOfMonth(month);
  const prev = previousPeriod({ preset: "last_month", from, to: endOfMonth(month) });
  const [summary, previous, perf, dts, receivable] = await Promise.all([
    periodSummary(ctx, from, to),
    periodSummary(ctx, prev.from, prev.to),
    productPerformance(ctx, from, to),
    daysToSell(ctx, from, to),
    withTenant(ctx, async (tx) => {
      const [r] = await tx.execute<{ open: string }>(sql`
        select coalesce(sum(ar.amount - ar.amount_paid - ar.amount_cancelled), 0) as open
        from accounts_receivable ar join sales s on s.id = ar.sale_id
        where ar.business_id = ${ctx.businessId} and s.status = 'CONFIRMED' and s.sale_date between ${from} and ${to}
          and ar.status in ('PENDING','PARTIAL')`);
      return r.open;
    }),
  ]);
  return {
    month: from,
    from,
    to,
    summary,
    previous,
    comparison: compareSummaries(summary, previous),
    /** Saldo em aberto HOJE das vendas feitas no mês. */
    openReceivablesFromPeriod: dec(receivable).toFixed(2),
    highlights: highlights(perf, dts),
    categories: groupByCategory(perf),
    products: perf.sort((a, b) => dec(b.profit).comparedTo(dec(a.profit))),
  };
}

export function highlights(perf: ProductPerformance[], dts: Awaited<ReturnType<typeof daysToSell>>) {
  const by = (fn: (p: ProductPerformance) => Decimal, dir: 1 | -1 = 1) =>
    perf.length === 0 ? null : [...perf].sort((a, b) => dir * fn(b).comparedTo(fn(a)))[0];
  const cats = groupByCategory(perf);
  const worst = by((p) => dec(p.profit), -1);
  return {
    topByUnits: by((p) => dec(p.units)),
    topByProfit: by((p) => dec(p.profit)),
    topByUnitProfit: (() => {
      const withUnit = perf.filter((p) => p.unitProfit !== null);
      return withUnit.length ? [...withUnit].sort((a, b) => dec(b.unitProfit!).comparedTo(dec(a.unitProfit!)))[0] : null;
    })(),
    worstLoss: worst && dec(worst.profit).isNegative() ? worst : null,
    topCategoryByUnits: cats.length ? [...cats].sort((a, b) => dec(b.units).comparedTo(dec(a.units)))[0] : null,
    topCategoryByProfit: cats[0] ?? null,
    averageDaysToSell: dts.overallAverageDays,
  };
}

export async function compareRanges(ctx: TenantContext, a: { from: string; to: string }, b: { from: string; to: string }) {
  const [first, second, perfA, perfB] = await Promise.all([
    periodSummary(ctx, a.from, a.to),
    periodSummary(ctx, b.from, b.to),
    productPerformance(ctx, a.from, a.to),
    productPerformance(ctx, b.from, b.to),
  ]);
  return {
    a: first,
    b: second,
    /** variação de B em relação a A */
    change: compareSummaries(second, first),
    categoriesA: groupByCategory(perfA),
    categoriesB: groupByCategory(perfB),
  };
}

export async function dashboardData(ctx: TenantContext, period: Period) {
  const prev = previousPeriod(period);
  const chartFrom = period.from < addDays(period.to, -330) ? period.from : startOfMonth(addDays(period.to, -330));
  const [current, previous, series, perf, aging] = await Promise.all([
    periodSummary(ctx, period.from, period.to),
    periodSummary(ctx, prev.from, prev.to),
    timeSeries(ctx, chartFrom, period.to),
    productPerformance(ctx, period.from, period.to),
    stockAging(ctx),
  ]);
  return {
    period,
    previousPeriod: prev,
    current,
    previous,
    comparison: compareSummaries(current, previous),
    series,
    categories: groupByCategory(perf),
    aging,
  };
}
