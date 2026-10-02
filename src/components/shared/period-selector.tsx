"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/dates";
import { DateInput } from "./inputs";

/** Seletor de período (presets + personalizado). Atualiza a URL; a página recalcula no servidor. */
export function PeriodSelector({ preset, from, to }: { preset: PeriodPreset; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState({ from, to });

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    start(() => router.push(`${pathname}?${sp.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-end gap-2" aria-busy={pending}>
      <div className="grid gap-1">
        <span className="sr-only" id="periodo-label">Período</span>
        <Select value={preset} onValueChange={(v) => (v === "custom" ? go({ periodo: "custom", de: custom.from, ate: custom.to }) : go({ periodo: v, de: null, ate: null }))}>
          <SelectTrigger className="w-48" aria-labelledby="periodo-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {preset === "custom" && (
        <>
          <DateInput aria-label="De" value={custom.from} onValueChange={(v) => setCustom((c) => ({ ...c, from: v }))} className="w-40" />
          <DateInput aria-label="Até" value={custom.to} onValueChange={(v) => setCustom((c) => ({ ...c, to: v }))} className="w-40" />
          <Button variant="outline" onClick={() => go({ periodo: "custom", de: custom.from, ate: custom.to })}>Aplicar</Button>
        </>
      )}
    </div>
  );
}
