"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Package, Search, ShoppingBag, ShoppingCart, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { globalSearchAction } from "@/server/actions/domain";
import type { SearchHit } from "@/server/services/search";

const GROUPS: Record<SearchHit["type"], { label: string; icon: typeof Package }> = {
  product: { label: "Produtos", icon: Package },
  customer: { label: "Clientes", icon: Users },
  supplier: { label: "Fornecedores", icon: Truck },
  sale: { label: "Vendas", icon: ShoppingBag },
  purchase: { label: "Compras", icon: ShoppingCart },
};

/** Pesquisa global (Ctrl/⌘ + K). */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      start(async () => {
        const r = await globalSearchAction(q);
        setHits(r.ok ? r.data : []);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <Button variant="outline" className="w-full justify-start gap-2 text-muted-foreground sm:w-64" onClick={() => setOpen(true)}>
        <Search className="size-4" aria-hidden />
        <span className="truncate">Buscar produtos, vendas…</span>
        <kbd className="ml-auto hidden rounded border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Pesquisa global</DialogTitle>
          <DialogDescription className="sr-only">Busque produtos, clientes, fornecedores, vendas e compras</DialogDescription>
          <Command shouldFilter={false}>
        <CommandInput placeholder="Nome, SKU, código de barras, VEN-000123…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{pending ? "Buscando…" : q.trim().length < 2 ? "Digite ao menos 2 caracteres." : "Nada encontrado."}</CommandEmpty>
          {(Object.keys(GROUPS) as SearchHit["type"][]).map((type) => {
            const group = q.trim().length < 2 ? [] : hits.filter((h) => h.type === type);
            if (group.length === 0) return null;
            const { label, icon: Icon } = GROUPS[type];
            return (
              <CommandGroup key={type} heading={label}>
                {group.map((h) => (
                  <CommandItem key={h.id} value={`${type}-${h.id}`} onSelect={() => { setOpen(false); router.push(h.href); }}>
                    <Icon className="size-4" aria-hidden />
                    <span className="truncate">{h.title}</span>
                    {h.subtitle && <span className="ml-auto truncate text-xs text-muted-foreground">{h.subtitle}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
