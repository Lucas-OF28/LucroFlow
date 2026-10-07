import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, History } from "lucide-react";
import { ProductThumb } from "@/components/products/product-thumb";
import { ListFilters } from "@/components/shared/list-filters";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { int, str } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { listSupplierOptions } from "@/server/services/partners";
import { type StockFilter, listCategories, listProducts } from "@/server/services/products";
import { staleValue, stockAging } from "@/server/services/reports";
import { signedUrlsSafe } from "@/server/storage";

export const metadata: Metadata = { title: "Estoque" };

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "in_stock", label: "Em estoque" },
  { value: "low", label: "Estoque baixo" },
  { value: "out", label: "Sem estoque" },
  { value: "stale", label: "Produtos parados" },
];

export default async function InventoryPage({ searchParams }: PageProps<"/estoque">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const filter = (str(sp, "filtro") as StockFilter | undefined) ?? "all";
  const [list, all, aging, categories, suppliers] = await Promise.all([
    listProducts(ctx, {
      page: int(sp, "page"),
      q: str(sp, "q"),
      filter,
      categoryId: str(sp, "categoria"),
      supplierId: str(sp, "fornecedor"),
      sort: (str(sp, "ordem") as "name" | "value" | "quantity" | undefined) ?? "name",
    }),
    listProducts(ctx, { pageSize: 1 }),
    stockAging(ctx),
    listCategories(ctx),
    listSupplierOptions(ctx),
  ]);
  const urls = await signedUrlsSafe(list.rows.map((r) => r.imagePath));
  const stale60 = staleValue(aging, 60);

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Quantidade × custo médio = capital em estoque. Capital investido não é lucro."
        actions={<Button variant="outline" asChild><Link href="/estoque/movimentacoes"><History className="size-4" /> Movimentações</Link></Button>}
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Resumo do estoque">
        <MetricCard className="col-span-2" label="Capital em estoque" value={formatMoney(all.totals.value)} footer={`${formatQuantity(all.totals.quantity)} unidades em produtos ativos`} />
        {aging.map((b) => (
          <MetricCard key={b.label} label={b.label} value={formatMoney(b.value)} footer={`${formatQuantity(b.quantity)} un.`} />
        ))}
      </section>
      {Number(stale60) > 0 && (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">
          <strong>{formatMoney(stale60)}</strong> estão parados há mais de 60 dias.{" "}
          <Link href="/estoque?filtro=stale" className="underline">Ver produtos parados</Link>
        </p>
      )}

      <ListFilters
        searchPlaceholder="Nome, SKU ou código de barras"
        selects={[
          { name: "filtro", label: "Situação", allLabel: "Todos", options: FILTERS },
          { name: "categoria", label: "Categoria", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "fornecedor", label: "Fornecedor", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
          { name: "ordem", label: "Ordenar", allLabel: "Ordenar por nome", options: [{ value: "value", label: "Maior valor" }, { value: "quantity", label: "Maior quantidade" }] },
        ]}
      />

      {list.rows.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum produto neste filtro." description="Registre uma compra para dar entrada no estoque." action={{ href: "/compras/nova", label: "Registrar compra" }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Custo médio</TableHead>
                <TableHead className="text-right">Valor em estoque</TableHead>
                <TableHead className="hidden text-right md:table-cell">Preço ref.</TableHead>
                <TableHead className="hidden text-right md:table-cell">Margem potencial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/produtos/${p.id}`} className="row-link flex items-center gap-3 hover:underline">
                      <ProductThumb url={p.imagePath ? urls.get(p.imagePath) : undefined} name={p.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{p.sku ?? "—"}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{p.categoryName ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    <span className="block">{formatQuantity(p.stockQuantity, p.unit)}</span>
                    {p.isOut ? <StatusBadge status="OUT_OF_STOCK" /> : p.isLow ? <StatusBadge status="LOW_STOCK" /> : null}
                  </TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatMoney(p.averageCost)}</TableCell>
                  <TableCell className="tabular text-right font-medium">{formatMoney(p.stockValue)}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{formatMoney(p.referencePrice)}</TableCell>
                  <TableCell className={cn("tabular hidden text-right md:table-cell", p.potentialMargin && Number(p.potentialMargin) < 0 && "text-danger")}>
                    {formatPercent(p.potentialMargin)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total do filtro</TableCell>
                <TableCell className="hidden lg:table-cell" />
                <TableCell className="tabular text-right">{formatQuantity(list.totals.quantity)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell className="tabular text-right">{formatMoney(list.totals.value)}</TableCell>
                <TableCell colSpan={2} className="hidden md:table-cell" />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/estoque" params={sp} />
    </>
  );
}
