"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Package, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchCustomersAction, searchProductsAction } from "@/server/actions/domain";

export interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQuantity: string;
  stockValue: string;
  referencePrice: string | null;
  minimumPrice: string | null;
  lastUnitCost: string | null;
}

function useRemoteSearch<T>(open: boolean, fetcher: (q: string) => Promise<{ ok: true; data: T[] } | { ok: false }>) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => start(async () => {
      const r = await fetcher(q);
      setItems(r.ok ? r.data : []);
    }), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);
  return { q, setQ, items, pending };
}

/** Seletor de produto com busca por nome, SKU ou código de barras (digitado ou leitor). */
export function ProductSelector({
  onSelect,
  inStockOnly = false,
  placeholder = "Buscar produto…",
  autoFocus,
}: {
  onSelect: (p: ProductOption) => void;
  inStockOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(autoFocus));
  const { q, setQ, items, pending } = useRemoteSearch<ProductOption>(open, (term) => searchProductsAction(term, inStockOnly));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-start gap-2 text-muted-foreground">
          <Package className="size-4" aria-hidden /> {placeholder}
          <ChevronsUpDown className="ml-auto size-4 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nome, SKU ou código de barras" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{pending ? "Buscando…" : inStockOnly ? "Nenhum produto com estoque encontrado." : "Nenhum produto encontrado."}</CommandEmpty>
            <CommandGroup>
              {items.map((p) => (
                <CommandItem key={p.id} value={p.id} onSelect={() => { onSelect(p); setOpen(false); setQ(""); }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{p.sku ?? "sem SKU"} · estoque {formatQuantity(p.stockQuantity, p.unit)}</span>
                  </span>
                  {p.referencePrice && <span className="tabular text-xs text-muted-foreground">{formatMoney(p.referencePrice)}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Seletor de cliente opcional (venda rápida não exige cliente). */
export function CustomerSelector({ value, onChange }: { value: { id: string; name: string } | null; onChange: (c: { id: string; name: string } | null) => void }) {
  const [open, setOpen] = useState(false);
  const { q, setQ, items, pending } = useRemoteSearch<{ id: string; name: string; phone: string | null }>(open, searchCustomersAction);
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className={cn("flex-1 justify-start gap-2", !value && "text-muted-foreground")}>
            <UserRound className="size-4" aria-hidden /> {value?.name ?? "Cliente (opcional)"}
            <ChevronsUpDown className="ml-auto size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Nome ou telefone" value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>{pending ? "Buscando…" : "Nenhum cliente encontrado."}</CommandEmpty>
              <CommandGroup>
                {items.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => { onChange({ id: c.id, name: c.name }); setOpen(false); }}>
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                    {value?.id === c.id && <Check className="size-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Remover cliente"><X className="size-4" /></Button>}
    </div>
  );
}
