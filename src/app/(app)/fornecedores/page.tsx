import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { ListFilters } from "@/components/shared/list-filters";
import { DownloadLink } from "@/components/shared/download-link";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { EmptyState } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { int, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listSuppliers } from "@/server/services/partners";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage({ searchParams }: PageProps<"/fornecedores">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const list = await listSuppliers(ctx, { page: int(sp, "page"), q: str(sp, "q") });
  return (
    <>
      <PageHeader
        title="Fornecedores"
        actions={
          <>
            <DownloadLink href={"/api/export/fornecedores"}>CSV</DownloadLink>
            {can(ctx.role, "write") && <PartnerDialog kind="supplier" />}
          </>
        }
      />
      <ListFilters searchPlaceholder="Nome, empresa ou documento" />
      {list.rows.length === 0 ? (
        <EmptyState icon={Truck} title={str(sp, "q") ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Compras</TableHead>
                <TableHead className="hidden text-right md:table-cell">Produtos</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead className="hidden md:table-cell">Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/fornecedores/${s.id}`} className="row-link font-medium hover:underline">{s.name}</Link>
                    <span className="block text-xs text-muted-foreground">{s.companyName ?? s.whatsapp ?? s.phone ?? ""}</span>
                  </TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{s.purchaseCount}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{s.productCount}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(s.totalPurchased)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(s.lastPurchase)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/fornecedores" params={sp} />
    </>
  );
}
