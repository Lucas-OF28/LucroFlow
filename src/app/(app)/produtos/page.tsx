import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { ProductThumb } from "@/components/products/product-thumb";
import { ListFilters } from "@/components/shared/list-filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatQuantity } from "@/lib/format";
import { int, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listCategories, listProducts } from "@/server/services/products";
import { signedUrlsSafe } from "@/server/storage";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const [list, categories] = await Promise.all([
    listProducts(ctx, { page: int(sp, "page"), q: str(sp, "q"), categoryId: str(sp, "categoria"), includeInactive: true, sort: "name" }),
    listCategories(ctx),
  ]);
  const urls = await signedUrlsSafe(list.rows.map((r) => r.imagePath));
  const filtered = Boolean(str(sp, "q") || str(sp, "categoria"));

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro de produtos. A quantidade entra pelo módulo de compras."
        actions={<Button asChild><Link href="/produtos/novo"><Plus className="size-4" /> Novo produto</Link></Button>}
      />
      <ListFilters
        searchPlaceholder="Nome, SKU ou código de barras"
        selects={[{ name: "categoria", label: "Categoria", options: categories.map((c) => ({ value: c.id, label: c.name })) }]}
      />
      {list.rows.length === 0 ? (
        filtered ? (
          <EmptyState title="Nenhum produto encontrado." description="Ajuste a busca ou os filtros." />
        ) : (
          <EmptyState icon={Package} title="Nenhum produto cadastrado." action={{ href: "/produtos/novo", label: "Cadastrar primeiro produto" }} />
        )
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Preço ref.</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/produtos/${p.id}`} className="flex items-center gap-3 font-medium hover:underline">
                      <ProductThumb url={p.imagePath ? urls.get(p.imagePath) : undefined} name={p.name} />
                      <span className="min-w-0">
                        <span className="block truncate">{p.name}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{p.sku ?? "sem SKU"}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.categoryName ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatQuantity(p.stockQuantity, p.unit)} {p.unit}
                    {p.isOut ? <StatusBadge status="OUT_OF_STOCK" className="ml-2 hidden lg:inline-flex" /> : p.isLow ? <StatusBadge status="LOW_STOCK" className="ml-2 hidden lg:inline-flex" /> : null}
                  </TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{formatMoney(p.referencePrice)}</TableCell>
                  <TableCell className="hidden md:table-cell"><StatusBadge status={p.status === "INACTIVE" ? "INACTIVE" : "ACTIVE"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/produtos" params={sp} />
    </>
  );
}
