import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { ListFilters } from "@/components/shared/list-filters";
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
import { listSupplierOptions } from "@/server/services/partners";
import { listPurchases } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compras" };

export default async function PurchasesPage({ searchParams }: PageProps<"/compras">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const period = periodFrom(sp, ctx.timezone, "this_year");
  const [list, suppliers] = await Promise.all([
    listPurchases(ctx, {
      page: int(sp, "page"), q: str(sp, "q"), from: period.from, to: period.to,
      supplierId: str(sp, "fornecedor"), status: str(sp, "status") as "CONFIRMED" | "CANCELLED" | undefined,
    }),
    listSupplierOptions(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Compras"
        description="Compras dão entrada no estoque e atualizam o custo médio."
        actions={
          <>
            <DownloadLink href={`/api/export/compras?de=${period.from}&ate=${period.to}`}>CSV</DownloadLink>
            <Button asChild><Link href="/compras/nova"><Plus className="size-4" /> Nova compra</Link></Button>
          </>
        }
      />
      <ListFilters
        searchPlaceholder="Código, referência ou fornecedor"
        selects={[
          { name: "fornecedor", label: "Fornecedor", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
          { name: "status", label: "Status", options: [{ value: "CONFIRMED", label: "Confirmadas" }, { value: "CANCELLED", label: "Canceladas" }] },
        ]}
      >
        <PeriodSelector preset={period.preset} from={period.from} to={period.to} />
      </ListFilters>
      {list.rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nenhuma compra no período." action={{ href: "/compras/nova", label: "Registrar compra" }} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compra</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/compras/${p.id}`} className="font-medium hover:underline">{p.code}</Link>
                    {p.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}
                    {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                  </TableCell>
                  <TableCell>{formatDate(p.purchaseDate)}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.supplierName ?? "—"}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{p.itemCount}</TableCell>
                  <TableCell className="tabular text-right font-medium">{formatMoney(p.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/compras" params={sp} />
    </>
  );
}
