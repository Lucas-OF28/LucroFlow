"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}

/** Linha única de filtros acima da lista (busca + selects), sincronizada com a URL. */
export function ListFilters({ searchPlaceholder, selects = [], children }: { searchPlaceholder?: string; selects?: FilterSelect[]; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const push = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page");
    start(() => router.replace(`${pathname}?${sp.toString()}`));
  };

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => push("q", q.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-busy={pending}>
      {searchPlaceholder && (
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Buscar" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      )}
      {selects.map((s) => (
        <Select key={s.name} value={params.get(s.name) ?? ALL} onValueChange={(v) => push(s.name, v === ALL ? null : v)}>
          <SelectTrigger className="w-auto min-w-40" aria-label={s.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{s.allLabel ?? `${s.label}: todos`}</SelectItem>
            {s.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ))}
      {children}
    </div>
  );
}
