import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { ReceivePaymentDialog } from "@/components/sales/sale-actions";
import { ListFilters } from "@/components/shared/list-filters";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { PeriodSelector } from "@/components/shared/period-selector";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { int, periodFrom, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { type ReceivableFilter, listReceivables, receivablesSummary } from "@/server/services/receivables";
import { periodSummary } from "@/server/services/reports";

export const metadata: Metadata = { title: "Financeiro" };

const FILTERS: { value: ReceivableFilter; label: string }[] = [
  { value: "overdue", label: "Vencidas" },
  { value: "due_soon", label: "Vencem em 7 dias" },
  { value: "paid", label: "Pagas" },
  { value: "all", label: "Todas" },
];

export default async function FinancePage({ searchParams }: PageProps<"/financeiro">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const period = periodFrom(sp, ctx.timezone, "this_month");
  const filter = (str(sp, "filtro") as ReceivableFilter | undefined) ?? "open";
  const today = todayIn(ctx.timezone);
  const [summary, period$, list] = await Promise.all([
    receivablesSummary(ctx),
    periodSummary(ctx, period.from, period.to),
    listReceivables(ctx, { page: int(sp, "page"), filter, q: str(sp, "q") }),
  ]);

  return (
    <>
      <PageHeader title="Financeiro" description="Faturamento, caixa e lucro são coisas diferentes — aqui elas aparecem separadas." actions={<PeriodSelector preset={period.preset} from={period.from} to={period.to} />} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumo do período">
        <MetricCard label="Receita reconhecida" value={formatMoney(period$.revenue)} hint="Vendas confirmadas no período (competência), líquidas de devoluções." />
        <MetricCard label="Recebido (entradas)" value={formatMoney(period$.cashIn)} hint="Dinheiro que efetivamente entrou no período." />
        <MetricCard label="Estornos/reembolsos" value={formatMoney(period$.cashOut)} hint="Dinheiro devolvido a clientes no período." />
        <MetricCard label="Lucro líquido" value={formatMoney(period$.netProfit)} tone={Number(period$.netProfit) < 0 ? "negative" : undefined} />
        <MetricCard label="Despesas" value={formatMoney(period$.expenses)} />
      </section>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Contas a receber (hoje)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-muted-foreground">A receber</p><p className="tabular text-xl font-semibold">{formatMoney(summary.open)}</p><p className="text-xs text-muted-foreground">{summary.openCount} parcela(s)</p></div>
          <div><p className="text-muted-foreground">Vencido</p><p className="tabular text-xl font-semibold text-danger">{formatMoney(summary.overdue)}</p><p className="text-xs text-muted-foreground">{summary.overdueCount} parcela(s)</p></div>
          <div><p className="text-muted-foreground">Vence em 7 dias</p><p className="tabular text-xl font-semibold">{formatMoney(summary.dueSoon)}</p></div>
        </CardContent>
      </Card>

      <ListFilters searchPlaceholder="Venda ou cliente" selects={[{ name: "filtro", label: "Situação", allLabel: "Em aberto", options: FILTERS }]} />
      {list.rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma parcela neste filtro." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="hidden text-right md:table-cell">Valor</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead><span className="sr-only">Situação e ação</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/vendas/${r.saleId}`} className="font-medium hover:underline">{r.saleCode}</Link>
                    <span className="block text-xs text-muted-foreground">parcela {r.installmentNumber}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.customerName ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.dueDate)}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{formatMoney(r.amount)}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(r.open)}</TableCell>
                  <TableCell>
                    <span className="flex items-center justify-end gap-2">
                      <StatusBadge status={r.overdue ? "OVERDUE" : r.status} />
                      {Number(r.open) > 0 && can(ctx.role, "write") && <ReceivePaymentDialog receivableId={r.id} open={r.open} method={r.expectedMethod} today={today} />}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/financeiro" params={sp} />
    </>
  );
}
