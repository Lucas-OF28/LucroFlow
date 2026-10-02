"use client";

import { useState, useTransition } from "react";
import { Archive, Check, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveCategoryAction,
  createCategoryAction,
  createExpenseCategoryAction,
  renameCategoryAction,
  updateBusinessAction,
} from "@/server/actions/domain";

const TIMEZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Campo_Grande", "America/Belem", "America/Fortaleza",
  "America/Recife", "America/Bahia", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "America/Boa_Vista",
  "America/Araguaina", "America/Maceio", "America/Santarem", "Europe/Lisbon", "UTC",
];

export function BusinessForm({ initial, canEdit }: { initial: { name: string; timezone: string; staleDays: number }; canEdit: boolean }) {
  const [v, setV] = useState({ ...initial, staleDays: String(initial.staleDays) });
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateBusinessAction(v);
          if (r.ok) toast.success("Configurações salvas.");
          else toast.error(r.error);
        });
      }}
    >
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="b-name">Nome da empresa</Label><Input id="b-name" value={v.name} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid gap-1.5">
        <Label htmlFor="b-tz">Fuso horário (datas comerciais)</Label>
        <select id="b-tz" className="h-8 rounded-lg border bg-transparent px-2 text-sm" value={v.timezone} disabled={!canEdit} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
          {(TIMEZONES.includes(v.timezone) ? TIMEZONES : [v.timezone, ...TIMEZONES]).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="b-stale">Produto parado após (dias sem venda)</Label>
        <Input id="b-stale" inputMode="numeric" value={v.staleDays} disabled={!canEdit} onChange={(e) => setV({ ...v, staleDays: e.target.value.replace(/\D/g, "") })} />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Moeda: BRL (R$) · Idioma: Português (Brasil) · Custeio: custo médio ponderado.</p>
      {canEdit && <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button></div>}
    </form>
  );
}

export function CategoryManager({ kind, items, canEdit, canArchive }: { kind: "product" | "expense"; items: { id: string; name: string; count?: number }[]; canEdit: boolean; canArchive: boolean }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = kind === "product" ? await createCategoryAction({ name }) : await createExpenseCategoryAction({ name });
      if (!r.ok) return void toast.error(r.error);
      setName("");
      toast.success("Categoria criada.");
    });
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {items.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma categoria.</li>}
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-2 p-2 pl-3 text-sm">
            {editing?.id === c.id ? (
              <>
                <Input aria-label="Novo nome" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-7" autoFocus />
                <Button size="icon-sm" aria-label="Salvar nome" disabled={pending} onClick={() => start(async () => {
                  const r = await renameCategoryAction(c.id, { name: editing.name });
                  if (!r.ok) return void toast.error(r.error);
                  setEditing(null);
                })}><Check className="size-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1">{c.name}{c.count !== undefined && <span className="ml-2 text-xs text-muted-foreground">{c.count} produto(s)</span>}</span>
                {kind === "product" && canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Renomear ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}><Pencil className="size-3.5" /></Button>}
                {kind === "product" && canArchive && (
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon-sm" aria-label={`Arquivar ${c.name}`}><Archive className="size-3.5" /></Button>}
                    title={`Arquivar categoria ${c.name}?`}
                    description={<p>Os produtos dela ficarão sem categoria. Vendas passadas não mudam.</p>}
                    confirmLabel="Arquivar"
                    onConfirm={async () => { const r = await archiveCategoryAction(c.id); if (!r.ok) { toast.error(r.error); return false; } }}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex gap-2">
          <Input aria-label="Nova categoria" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Button variant="outline" onClick={add} disabled={pending || !name.trim()}><Plus className="size-4" /> Adicionar</Button>
        </div>
      )}
    </div>
  );
}
