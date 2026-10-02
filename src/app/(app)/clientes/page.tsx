import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { listCustomers } from "@/server/services/partners";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const list = await listCustomers(ctx, { page: int(sp, "page"), q: str(sp, "q") });
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cliente é opcional na venda rápida."
        actions={
          <>
            <DownloadLink href={"/api/export/clientes"}>CSV</DownloadLink>
            {can(ctx.role, "write") && <PartnerDialog kind="customer" />}
          </>
        }
      />
      <ListFilters searchPlaceholder="Nome, telefone, e-mail ou documento" />
      {list.rows.length === 0 ? (
        <EmptyState icon={Users} title={str(sp, "q") ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Compras</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead className="hidden text-right md:table-cell">Ticket médio</TableHead>
                <TableHead className="hidden md:table-cell">Última compra</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <span className="block text-xs text-muted-foreground">{c.whatsapp ?? c.phone ?? c.email ?? ""}</span>
                  </TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{c.saleCount}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(c.totalBought)}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{formatMoney(c.averageTicket)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(c.lastPurchase)}</TableCell>
                  <TableCell className={cn("tabular text-right", Number(c.overdue) > 0 && "text-danger")}>
                    {Number(c.pending) > 0 ? formatMoney(c.pending) : "—"}
                    {Number(c.overdue) > 0 && <span className="block text-xs">vencido {formatMoney(c.overdue)}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/clientes" params={sp} />
    </>
  );
}
