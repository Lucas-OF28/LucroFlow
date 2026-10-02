import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Paginação por links (funciona sem JS e preserva os filtros da URL). */
export function Pager({
  page,
  pageCount,
  total,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return <p className="mt-3 text-sm text-muted-foreground">{total} registro(s)</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        Página {page} de {pageCount} · {total} registro(s)
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1} aria-disabled={page <= 1}>
          {page <= 1 ? <span><ChevronLeft className="size-4" /> Anterior</span> : <Link href={href(page - 1)}><ChevronLeft className="size-4" /> Anterior</Link>}
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pageCount} aria-disabled={page >= pageCount}>
          {page >= pageCount ? <span>Próxima <ChevronRight className="size-4" /></span> : <Link href={href(page + 1)}>Próxima <ChevronRight className="size-4" /></Link>}
        </Button>
      </div>
    </nav>
  );
}
