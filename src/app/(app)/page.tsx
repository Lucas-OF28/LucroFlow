import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Coins,
  HandCoins,
  Info,
  Lightbulb,
  Package,
  Percent,
  Plus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { CategoryBarChart, ChartCard, TimeAreaChart, TimeBarChart, TimeLineChart } from "@/components/charts/charts";
import { AGING_COLORS, SERIES } from "@/components/charts/series";
import { MetricCard } from "@/components/shared/metric-card";
import { SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodSelector } from "@/components/shared/period-selector";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERIOD_LABELS } from "@/lib/dates";
import { formatDate, formatMoney, formatNumber, formatPercent, formatQuantity } from "@/lib/format";
import { periodFrom } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { getAlerts } from "@/server/services/alerts";
import { generateInsights } from "@/server/services/insights";
import { listProducts } from "@/server/services/products";
import { receivablesSummary } from "@/server/services/receivables";
import { dashboardData, staleValue } from "@/server/services/reports";
import { listSales } from "@/server/services/sales";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const ctx = await requireTenant();
  const period = periodFrom(await searchParams, ctx.timezone);
  const [data, receivables, recent, alerts, insights, stock, replenish] = await Promise.all([
    dashboardData(ctx, period),
    receivablesSummary(ctx),
    listSales(ctx, { pageSize: 5, status: "CONFIRMED" }),
    getAlerts(ctx),
    generateInsights(ctx),
    listProducts(ctx, { pageSize: 1, includeInactive: true }),
    listProducts(ctx, { filter: "low", pageSize: 5, sort: "quantity" }),
  ]);
  const { current: c, comparison: cmp, series } = data;
  const isEmpty = c.saleCount === 0 && c.purchaseCount === 0 && stock.total === 0;
  const stale60 = staleValue(data.aging, 60);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${PERIOD_LABELS[period.preset]} · ${formatDate(period.from)} a ${formatDate(period.to)} — comparado a ${formatDate(data.previousPeriod.from)}–${formatDate(data.previousPeriod.to)}`}
        actions={
          <>
            <PeriodSelector preset={period.preset} from={period.from} to={period.to} />
            <Button asChild className="max-md:w-full"><Link href="/vendas/nova"><Plus className="size-4" /> Nova venda</Link></Button>
          </>
        }
      />

      {isEmpty && (
        <div className="mb-6">
          <EmptyState
            icon={Package}
            title="Seu negócio ainda não tem movimentações."
            description="Cadastre um produto, registre uma compra para dar entrada no estoque e depois sua primeira venda."
            action={{ href: "/produtos/novo", label: "Cadastrar primeiro produto" }}
          />
        </div>
      )}

      {/* Prioridade no celular: faturamento, lucro líquido, estoque, a receber (§103) */}
      <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Faturamento" icon={TrendingUp} value={formatMoney(c.revenue)} change={cmp.revenue}
          hint="Total vendido no período (produtos − descontos + frete cobrado), já descontadas as devoluções. Faturamento NÃO é lucro." />
        <MetricCard label="Lucro líquido" icon={Coins} value={formatMoney(c.netProfit)} change={cmp.netProfit}
          tone={Number(c.netProfit) < 0 ? "negative" : undefined}
          hint="Lucro bruto − custos das vendas (taxas, frete pago, comissões) − despesas − perdas de estoque." />
        <MetricCard label="Capital em estoque" icon={Boxes} value={formatMoney(stock.totals.value)}
          footer={`${formatQuantity(stock.totals.quantity)} unidades · não é lucro`}
          hint="Quantidade disponível × custo médio. É dinheiro investido em mercadoria, não lucro." />
        <MetricCard label="A receber" icon={HandCoins} value={formatMoney(receivables.open)}
          footer={Number(receivables.overdue) > 0 ? <span className="text-danger">{formatMoney(receivables.overdue)} vencido</span> : "Nada vencido"}
          hint="Parcelas em aberto de vendas confirmadas (situação atual)." />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-label="Mais indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Lucro bruto" value={formatMoney(c.grossProfit)} change={cmp.grossProfit} hint="Faturamento − custo das mercadorias vendidas (custo histórico)." />
            <MetricCard label="Total comprado" icon={ShoppingCart} value={formatMoney(c.purchases)} change={cmp.purchases} positiveIsGood={false} hint="Compras viram estoque; não são despesa." />
            <MetricCard label="Despesas" icon={Receipt} value={formatMoney(c.expenses)} change={cmp.expenses} positiveIsGood={false} />
            <MetricCard label="Margem média" icon={Percent} value={formatPercent(c.marginPercent)} change={cmp.marginPercent} changeSuffix="pp" hint="Lucro líquido ÷ faturamento." />
            <MetricCard label="Produtos vendidos" value={formatQuantity(c.unitsSold)} change={cmp.unitsSold} />
            <MetricCard label="Vendas" icon={ShoppingBag} value={formatNumber(c.saleCount)} change={cmp.saleCount} />
            <MetricCard label="Ticket médio" value={formatMoney(c.averageTicket)} change={cmp.averageTicket} />
            <MetricCard label="Recebido (caixa)" icon={Wallet} value={formatMoney(c.cashIn)} footer={Number(c.cashOut) > 0 ? `${formatMoney(c.cashOut)} estornado` : undefined}
              hint="Dinheiro que efetivamente entrou no período. Caixa ≠ lucro." />
          </section>

          <ChartCard title="Faturamento × lucro líquido" description="Evolução mensal">
            <TimeLineChart data={series.points} series={[SERIES.revenue, SERIES.netProfit]} granularity={series.granularity} />
          </ChartCard>
          <ChartCard title="Compras × faturamento" description="Quanto entrou em estoque vs. quanto foi vendido">
            <TimeBarChart data={series.points} series={[SERIES.revenue, SERIES.purchases]} granularity={series.granularity} />
          </ChartCard>
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="Margem média" description="Lucro líquido ÷ faturamento">
              <TimeLineChart data={series.points} series={[SERIES.margin]} granularity={series.granularity} height={200} />
            </ChartCard>
            <ChartCard title="Despesas" description="Despesas operacionais por mês">
              <TimeBarChart data={series.points} series={[SERIES.expenses]} granularity={series.granularity} height={200} />
            </ChartCard>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="Capital em estoque" description="Valor do estoque ao fim de cada mês">
              <TimeAreaChart data={series.points} serie={SERIES.stock} granularity={series.granularity} />
            </ChartCard>
            <ChartCard title="Idade do estoque" description={Number(stale60) > 0 ? `${formatMoney(stale60)} parados há mais de 60 dias.` : "Valor por tempo em estoque"}>
              <CategoryBarChart data={data.aging} labelKey="label" serie={{ key: "value", label: "Valor em estoque", color: "var(--chart-3)" }} colors={AGING_COLORS} />
            </ChartCard>
          </div>
          <ChartCard title="Lucro bruto por categoria" description={`${PERIOD_LABELS[period.preset]}`}>
            {data.categories.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
            ) : (
              <CategoryBarChart data={data.categories.slice(0, 8)} labelKey="categoryName" serie={{ key: "profit", label: "Lucro bruto", color: "var(--series-1)" }} />
            )}
          </ChartCard>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Alertas</CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum alerta. Tudo em ordem.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => {
                    const Icon = a.severity === "critical" ? AlertCircle : a.severity === "warning" ? AlertTriangle : Info;
                    return (
                      <li key={a.kind}>
                        <Link href={a.href} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted">
                          <Icon className={cn("size-4 shrink-0", a.severity === "critical" && "text-danger", a.severity === "warning" && "text-warning")} aria-hidden />
                          <span className="sr-only">{a.severity === "critical" ? "Crítico:" : a.severity === "warning" ? "Atenção:" : "Info:"}</span>
                          {a.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Vendas recentes</CardTitle>
              <Link href="/vendas" className="text-sm text-muted-foreground hover:underline">Ver todas</Link>
            </CardHeader>
            <CardContent>
              {recent.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda ainda.</p>
              ) : (
                <ul className="divide-y">
                  {recent.rows.map((s) => (
                    <li key={s.id}>
                      <Link href={`/vendas/${s.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:bg-muted/50">
                        <span className="min-w-0">
                          <span className="block font-medium">{s.code}</span>
                          <span className="block truncate text-xs text-muted-foreground">{formatDate(s.saleDate)} · {s.customerName ?? "Sem cliente"}</span>
                        </span>
                        <span className="text-right">
                          <span className="tabular block font-medium">{formatMoney(s.totalRevenue)}</span>
                          <SignedMoney value={s.netProfit} className="text-xs" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Produtos para reposição</CardTitle>
              <Link href="/estoque?filtro=low" className="text-sm text-muted-foreground hover:underline">Ver</Link>
            </CardHeader>
            <CardContent>
              {replenish.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto abaixo do estoque mínimo.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {replenish.rows.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/produtos/${p.id}`} className="truncate hover:underline">{p.name}</Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-muted-foreground">{formatQuantity(p.stockQuantity, p.unit)} / mín. {formatQuantity(p.minStock, p.unit)}</span>
                        <StatusBadge status="LOW_STOCK" label="Baixo" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="size-4 text-primary" aria-hidden /> Inteligência</CardTitle>
              <Link href="/inteligencia" className="text-sm text-muted-foreground hover:underline">Ver tudo</Link>
            </CardHeader>
            <CardContent>
              {insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há dados suficientes para gerar conclusões confiáveis.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {insights.slice(0, 3).map((i) => <li key={i.id}>{i.title}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
