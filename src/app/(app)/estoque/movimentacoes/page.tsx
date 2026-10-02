import type { Metadata } from "next";
import Link from "next/link";
import { ListFilters } from "@/components/shared/list-filters";
import { SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { EmptyState } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney, formatQuantity, MOVEMENT_LABELS } from "@/lib/format";
import { int, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listMovements } from "@/server/services/products";

export const metadata: Metadata = { title: "Movimentações de estoque" };

const REF_HREF: Record<string, string | null> = { SALE: "/vendas", PURCHASE: "/compras", RETURN: null, ADJUSTMENT: null };

export default async function MovementsPage({ searchParams }: PageProps<"/estoque/movimentacoes">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const list = await listMovements(ctx, { page: int(sp, "page"), pageSize: 30, type: str(sp, "tipo") });
  const types = Object.entries(MOVEMENT_LABELS).filter(([k]) => k !== "TRANSFER").map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader title="Movimentações" description="Todo o histórico de entradas e saídas. O estoque nunca muda sem uma linha aqui." back={{ href: "/estoque", label: "Estoque" }} />
      <ListFilters selects={[{ name: "tipo", label: "Tipo", options: types }]} />
      {list.rows.length === 0 ? (
        <EmptyState title="Nenhuma movimentação." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden text-right md:table-cell">Saldo após</TableHead>
                <TableHead className="hidden lg:table-cell">Responsável</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map(({ m, productName, unit, userName, referenceCode }) => {
                const base = REF_HREF[m.referenceType];
                return (
                  <TableRow key={m.id}>
                    <TableCell title={formatDateTime(m.occurredAt, ctx.timezone)}>{formatDate(m.movementDate)}</TableCell>
                    <TableCell><Link href={`/produtos/${m.productId}`} className="hover:underline">{productName}</Link></TableCell>
                    <TableCell>
                      {MOVEMENT_LABELS[m.type]}
                      {referenceCode && (base
                        ? <Link href={`${base}/${m.referenceId}`} className="ml-1 text-xs text-muted-foreground hover:underline">{referenceCode}</Link>
                        : <span className="ml-1 text-xs text-muted-foreground">{referenceCode}</span>)}
                      {m.notes && <span className="block max-w-xs truncate text-xs text-muted-foreground">{m.notes}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{Number(m.quantityDelta) > 0 ? "+" : ""}{formatQuantity(m.quantityDelta, unit)}</TableCell>
                    <TableCell className="text-right"><SignedMoney value={m.valueDelta} /></TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{formatQuantity(m.quantityAfter, unit)} · {formatMoney(m.valueAfter)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{userName ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/estoque/movimentacoes" params={sp} />
    </>
  );
}
