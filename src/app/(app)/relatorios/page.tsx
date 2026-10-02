import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { CategoryBarChart, ChartCard } from "@/components/charts/charts";
import { ListFilters } from "@/components/shared/list-filters";
import { ChangeIndicator, SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addMonths, endOfMonth, startOfMonth, todayIn } from "@/lib/dates";
import { formatMoney, formatMonth, formatPercent, formatQuantity } from "@/lib/format";
import { str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { type PeriodSummary, compareRanges, monthlyReport } from "@/server/services/reports";
import { stockAging, staleValue } from "@/server/services/reports";
import { receivablesSummary } from "@/server/services/receivables";

export const metadata: Metadata = { title: "Relatórios" };

const ROWS: { key: keyof PeriodSummary; label: string; money?: boolean; good?: boolean; pp?: boolean }[] = [
  { key: "purchases", label: "Compras", money: true, good: false },
  { key: "revenue", label: "Faturamento", money: true },
  { key: "grossProfit", label: "Lucro bruto", money: true },
  { key: "expenses", label: "Despesas", money: true, good: false },
  { key: "netProfit", label: "Lucro líquido", money: true },
  { key: "unitsSold", label: "Produtos vendidos" },
  { key: "averageTicket", label: "Ticket médio", money: true },
  { key: "marginPercent", label: "Margem média", pp: true },
];

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const today = todayIn(ctx.timezone);
  const view = str(sp, "visao") === "comparar" ? "comparar" : "mensal";
  const months = Array.from({ length: 24 }, (_, i) => addMonths(startOfMonth(today), -i));
  const month = str(sp, "mes") && /^\d{4}-\d{2}$/.test(str(sp, "mes")!) ? `${str(sp, "mes")}-01` : startOfMonth(today);

  return (
    <>
      <PageHeader
        title="Relatórios"
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/export/mensal?mes=${month.slice(0, 7)}`}><Download className="size-4" /> Relatório mensal (CSV)</a>
          </Button>
        }
      />
      <Tabs value={view} className="mb-4">
        <TabsList>
          <TabsTrigger value="mensal" asChild><Link href="/relatorios">Mensal</Link></TabsTrigger>
          <TabsTrigger value="comparar" asChild><Link href="/relatorios?visao=comparar">Comparar períodos</Link></TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "mensal" ? <Monthly ctx={ctx} month={month} months={months} today={today} /> : <Compare ctx={ctx} sp={sp} months={months} today={today} />}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Exportações (CSV)</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ["estoque", "Estoque"], ["compras", "Compras"], ["vendas", "Vendas"], ["despesas", "Despesas"],
            ["lucro-produtos", "Lucro por produto"], ["clientes", "Clientes"], ["fornecedores", "Fornecedores"],
          ].map(([k, l]) => (
            <Button key={k} variant="outline" size="sm" asChild>
              <a href={`/api/export/${k}?de=${startOfMonth(month)}&ate=${endOfMonth(month)}`}><Download className="size-3.5" /> {l}</a>
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Compras, vendas, despesas e lucro por produto usam o mês selecionado. XLSX e PDF estão previstos para uma próxima versão.</p>
      </section>
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requireTenant>>;

async function Monthly({ ctx, month, months, today }: { ctx: Ctx; month: string; months: string[]; today: string }) {
  const isCurrent = month === startOfMonth(today);
  const [r, aging, rec] = await Promise.all([monthlyReport(ctx, month), stockAging(ctx), receivablesSummary(ctx)]);
  const s = r.summary;
  const h = r.highlights;
  return (
    <div className="space-y-6">
      <ListFilters selects={[{ name: "mes", label: "Mês", allLabel: formatMonth(startOfMonth(today)), options: months.slice(1).map((m) => ({ value: m.slice(0, 7), label: formatMonth(m) })) }]} />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-xl capitalize">{formatMonth(month)}</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {ROWS.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right">
                    <span className="tabular font-medium">{row.money ? formatMoney(s[row.key] as string) : row.pp ? formatPercent(s[row.key] as string) : formatQuantity(s[row.key] as string)}</span>
                    <span className="block"><ChangeIndicator value={r.comparison[row.key as keyof typeof r.comparison] ?? null} positiveIsGood={row.good ?? true} suffix={row.pp ? "pp" : "%"} label="vs. mês anterior" /></span>
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2"><dt className="text-muted-foreground">Capital em estoque (fim do mês)</dt><dd className="tabular font-medium">{formatMoney(s.stockValueAtEnd)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{isCurrent ? "Contas a receber (hoje)" : "Em aberto hoje das vendas do mês"}</dt>
                <dd className="tabular font-medium">{formatMoney(isCurrent ? rec.open : r.openReceivablesFromPeriod)}</dd>
              </div>
              {Number(s.losses) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Perdas de estoque</dt><dd className="tabular">{formatMoney(s.losses)}</dd></div>}
              {Number(s.refunds) > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Devoluções</dt><dd className="tabular">{formatMoney(s.refunds)}</dd></div>}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Destaques</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Highlight label="Produto mais vendido" value={h.topByUnits ? `${h.topByUnits.name} · ${formatQuantity(h.topByUnits.units)} un.` : null} />
              <Highlight label="Maior lucro total" value={h.topByProfit ? `${h.topByProfit.name} · ${formatMoney(h.topByProfit.profit)}` : null} />
              <Highlight label="Maior lucro unitário" value={h.topByUnitProfit ? `${h.topByUnitProfit.name} · ${formatMoney(h.topByUnitProfit.unitProfit)}` : null} />
              <Highlight label="Maior prejuízo" value={h.worstLoss ? `${h.worstLoss.name} · ${formatMoney(h.worstLoss.profit)}` : "Nenhum produto com prejuízo"} />
              <Highlight label="Categoria mais vendida" value={h.topCategoryByUnits ? `${h.topCategoryByUnits.categoryName} · ${formatQuantity(h.topCategoryByUnits.units)} un.` : null} />
              <Highlight label="Categoria com maior lucro" value={h.topCategoryByProfit ? `${h.topCategoryByProfit.categoryName} · ${formatMoney(h.topCategoryByProfit.profit)}` : null} />
              <Highlight label="Tempo médio até venda" value={h.averageDaysToSell !== null ? `${h.averageDaysToSell} dia(s)` : null} />
              <Highlight label="Produtos parados (+60 dias, hoje)" value={formatMoney(staleValue(aging, 60))} />
              <Highlight label="Margem média" value={formatPercent(s.marginPercent)} />
            </CardContent>
          </Card>
          {r.categories.length > 0 && (
            <ChartCard title="Lucro bruto por categoria">
              <CategoryBarChart data={r.categories.slice(0, 8)} labelKey="categoryName" serie={{ key: "profit", label: "Lucro bruto", color: "var(--series-1)" }} />
            </ChartCard>
          )}
        </div>
      </div>

      {r.products.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lucro por produto</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="hidden md:table-cell">Categoria</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Custo</TableHead>
                  <TableHead className="text-right">Lucro bruto</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.products.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell><Link href={`/produtos/${p.productId}`} className="hover:underline">{p.name}</Link></TableCell>
                    <TableCell className="hidden md:table-cell">{p.categoryName ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(p.units)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(p.revenue)}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatMoney(p.cost)}</TableCell>
                    <TableCell className="text-right"><SignedMoney value={p.profit} /></TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatPercent(p.marginPercent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "Sem dados no período"}</p>
    </div>
  );
}

async function Compare({ ctx, sp, months, today }: { ctx: Ctx; sp: Record<string, string | string[] | undefined>; months: string[]; today: string }) {
  const mode = str(sp, "modo") === "ano" ? "ano" : "mes";
  const year = Number(today.slice(0, 4));
  let a: { from: string; to: string; label: string };
  let b: { from: string; to: string; label: string };
  if (mode === "ano") {
    const ya = Number(str(sp, "a") ?? year - 1);
    const yb = Number(str(sp, "b") ?? year);
    a = { from: `${ya}-01-01`, to: `${ya}-12-31`, label: String(ya) };
    b = { from: `${yb}-01-01`, to: yb === year ? today : `${yb}-12-31`, label: String(yb) };
  } else {
    const ma = str(sp, "a") ? `${str(sp, "a")}-01` : addMonths(startOfMonth(today), -1);
    const mb = str(sp, "b") ? `${str(sp, "b")}-01` : startOfMonth(today);
    a = { from: ma, to: endOfMonth(ma), label: formatMonth(ma) };
    b = { from: mb, to: endOfMonth(mb) > today ? today : endOfMonth(mb), label: formatMonth(mb) };
  }
  const r = await compareRanges(ctx, a, b);
  const opts = mode === "ano"
    ? Array.from({ length: 5 }, (_, i) => ({ value: String(year - i), label: String(year - i) }))
    : months.map((m) => ({ value: m.slice(0, 7), label: formatMonth(m) }));

  return (
    <div className="space-y-6">
      <ListFilters
        selects={[
          { name: "modo", label: "Comparar", allLabel: "Mês × mês", options: [{ value: "ano", label: "Ano × ano" }] },
          { name: "a", label: "Período A", allLabel: `A: ${a.label}`, options: opts },
          { name: "b", label: "Período B", allLabel: `B: ${b.label}`, options: opts },
        ]}
      />
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead className="text-right capitalize">{a.label}</TableHead>
                <TableHead className="text-right capitalize">{b.label}</TableHead>
                <TableHead className="text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => {
                const fmt = (v: unknown) => (row.money ? formatMoney(v as string) : row.pp ? formatPercent(v as string) : formatQuantity(v as string));
                return (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="tabular text-right">{fmt(r.a[row.key])}</TableCell>
                    <TableCell className="tabular text-right">{fmt(r.b[row.key])}</TableCell>
                    <TableCell className="text-right"><ChangeIndicator value={r.change[row.key as keyof typeof r.change] ?? null} positiveIsGood={row.good ?? true} suffix={row.pp ? "pp" : "%"} label={`de ${a.label} para ${b.label}`} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        {[{ label: a.label, cats: r.categoriesA }, { label: b.label, cats: r.categoriesB }].map(({ label, cats }) => (
          <Card key={label}>
            <CardHeader><CardTitle className="text-base capitalize">Categorias · {label}</CardTitle></CardHeader>
            <CardContent>
              {cats.length === 0 ? <p className="text-sm text-muted-foreground">Sem vendas.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead className="text-right">Lucro bruto</TableHead><TableHead className="text-right">Margem</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cats.map((c) => (
                      <TableRow key={c.categoryName}>
                        <TableCell>{c.categoryName}</TableCell>
                        <TableCell className="text-right"><SignedMoney value={c.profit} /></TableCell>
                        <TableCell className="tabular text-right">{formatPercent(c.marginPercent)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
