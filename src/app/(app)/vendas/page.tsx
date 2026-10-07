import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";
import { ListFilters } from "@/components/shared/list-filters";
import { SignedMoney } from "@/components/shared/money";
import { DownloadLink } from "@/components/shared/download-link";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { PeriodSelector } from "@/components/shared/period-selector";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { int, periodFrom, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listSales } from "@/server/services/sales";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: PageProps<"/vendas">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const period = periodFrom(sp, ctx.timezone, "this_month");
  const list = await listSales(ctx, {
    page: int(sp, "page"),
    q: str(sp, "q"),
    from: period.from,
    to: period.to,
    status: str(sp, "status") as "CONFIRMED" | "CANCELLED" | undefined,
    lossOnly: str(sp, "prejuizo") === "1",
  });
  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <>
            <DownloadLink href={`/api/export/vendas?de=${period.from}&ate=${period.to}`}>CSV</DownloadLink>
            <Button asChild><Link href="/vendas/nova"><Plus className="size-4" /> Nova venda</Link></Button>
          </>
        }
      />
      <ListFilters
        searchPlaceholder="Código ou cliente"
        selects={[
          { name: "status", label: "Status", options: [{ value: "CONFIRMED", label: "Confirmadas" }, { value: "CANCELLED", label: "Canceladas" }] },
          { name: "prejuizo", label: "Resultado", allLabel: "Todas", options: [{ value: "1", label: "Só com prejuízo" }] },
        ]}
      >
        <PeriodSelector preset={period.preset} from={period.from} to={period.to} />
      </ListFilters>
      {list.rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Nenhuma venda no período." action={{ href: "/vendas/nova", label: "Registrar venda" }} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead className="hidden sm:table-cell">Data</TableHead>
                <TableHead className="hidden md:table-cell">Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="hidden lg:table-cell">Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((s) => {
                const pay = s.status === "CANCELLED" ? null : Number(s.open) === 0 ? "PAID" : s.overdue ? "OVERDUE" : Number(s.received) > 0 ? "PARTIAL" : "PENDING";
                return (
                  <TableRow key={s.id} className={s.status === "CANCELLED" ? "opacity-60" : undefined}>
                    <TableCell>
                      <Link href={`/vendas/${s.id}`} className="row-link font-medium hover:underline">{s.code}</Link>
                      {s.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}
                      <span className="block text-xs text-muted-foreground sm:hidden">{formatDate(s.saleDate)}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(s.saleDate)}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.customerName ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(s.totalRevenue)}
                      {Number(s.refunded) > 0 && <span className="block text-xs text-muted-foreground">−{formatMoney(s.refunded)} dev.</span>}
                    </TableCell>
                    <TableCell className="text-right"><SignedMoney value={s.netProfit} /></TableCell>
                    <TableCell className="hidden lg:table-cell">{pay && <StatusBadge status={pay} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/vendas" params={sp} />
    </>
  );
}
