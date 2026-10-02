import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { ListFilters } from "@/components/shared/list-filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { EmptyState } from "@/components/shared/states";
import { formatDateTime } from "@/lib/format";
import { int, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listAuditLogs } from "@/server/services/search";

export const metadata: Metadata = { title: "Histórico" };

const HREF: Record<string, string> = { sale: "/vendas", purchase: "/compras", product: "/produtos", customer: "/clientes", supplier: "/fornecedores" };
const TYPES = [
  { value: "sale", label: "Vendas" }, { value: "purchase", label: "Compras" }, { value: "product", label: "Produtos" },
  { value: "expense", label: "Despesas" }, { value: "return", label: "Devoluções" }, { value: "customer", label: "Clientes" },
  { value: "supplier", label: "Fornecedores" }, { value: "business", label: "Empresa" },
];

export default async function HistoryPage({ searchParams }: PageProps<"/historico">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const list = await listAuditLogs(ctx, { page: int(sp, "page"), pageSize: 30, entityType: str(sp, "tipo") });
  return (
    <>
      <PageHeader title="Histórico" description="Registro de tudo o que aconteceu no negócio. Nada financeiro é apagado." />
      <ListFilters selects={[{ name: "tipo", label: "Tipo", options: TYPES }]} />
      {list.rows.length === 0 ? (
        <EmptyState icon={History} title="Nenhum evento registrado." />
      ) : (
        <ol className="relative space-y-4 border-l pl-6">
          {list.rows.map((e) => {
            const href = e.entityId && HREF[e.entityType] ? `${HREF[e.entityType]}/${e.entityId}` : null;
            return (
              <li key={e.id} className="relative">
                <span className="absolute top-1.5 -left-[29px] size-2.5 rounded-full bg-primary" aria-hidden />
                <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, ctx.timezone)}</time>
                <p className="text-sm">
                  <span className="font-medium">{e.userName ?? "Sistema"}</span> — {href ? <Link href={href} className="hover:underline">{e.summary}</Link> : e.summary}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/historico" params={sp} />
    </>
  );
}
