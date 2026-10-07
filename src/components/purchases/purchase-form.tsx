"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DateInput, MoneyInput, QuantityStepper } from "@/components/shared/inputs";
import { type ProductOption, ProductSelector } from "@/components/shared/selectors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculatePurchase } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS, formatMoney } from "@/lib/format";
import { createPurchaseAction } from "@/server/actions/domain";

type Line = { key: string; product: Pick<ProductOption, "id" | "name" | "unit">; quantity: string; unitCost: string; discount: string; additionalCosts: string };
const NONE = "__none__";

/**
 * Nova compra: itens + custos globais. O resumo usa a MESMA função de cálculo do servidor
 * (src/lib/finance/purchase.ts) — só para exibição; o servidor recalcula tudo ao salvar.
 */
export function PurchaseForm({
  suppliers,
  today,
  initialProduct,
}: {
  suppliers: { id: string; name: string }[];
  today: string;
  initialProduct?: ProductOption | null;
}) {
  const router = useRouter();
  const newLine = (p: Pick<ProductOption, "id" | "name" | "unit">, cost = ""): Line => ({ key: crypto.randomUUID(), product: p, quantity: "1", unitCost: cost, discount: "", additionalCosts: "" });
  const [lines, setLines] = useState<Line[]>(initialProduct ? [newLine(initialProduct, initialProduct.lastUnitCost ? Number(initialProduct.lastUnitCost).toFixed(2) : "")] : []);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [costs, setCosts] = useState({ freight: "", taxes: "", otherCosts: "", discount: "" });
  const [notes, setNotes] = useState("");
  const [showLineExtras, setShowLineExtras] = useState(false);
  const [pending, start] = useTransition();

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const summary = useMemo(() => {
    try {
      if (lines.length === 0) return null;
      return calculatePurchase({
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity || "0", unitCost: l.unitCost || "0", discount: l.discount || "0", additionalCosts: l.additionalCosts || "0" })),
        freight: costs.freight || "0", taxes: costs.taxes || "0", otherCosts: costs.otherCosts || "0", discount: costs.discount || "0",
      });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [lines, costs]);

  const submit = () =>
    start(async () => {
      const r = await createPurchaseAction({
        supplierId: supplierId || null,
        purchaseDate: date,
        reference,
        paymentMethod: paymentMethod || null,
        ...Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, v || "0"])),
        notes,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitCost: l.unitCost || "0", discount: l.discount || "0", additionalCosts: l.additionalCosts || "0" })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Compra ${r.data.code} registrada. Estoque atualizado.`);
      router.push(`/compras/${r.data.id}`);
    });

  const valid = summary && !("error" in summary);

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[1fr_320px] lg:gap-6 lg:pb-0">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ProductSelector placeholder="Adicionar produto à compra…" onSelect={(p) => setLines((ls) => {
              // mesmo produto de novo = +1 na linha existente
              const existing = ls.find((l) => l.product.id === p.id);
              if (existing) return ls.map((l) => (l.key === existing.key ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
              return [...ls, newLine(p, p.lastUnitCost ? Number(p.lastUnitCost).toFixed(2) : "")];
            })} />
            {lines.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum item. Busque um produto acima — ou <Link href="/produtos/novo" className="underline">cadastre um novo</Link>.</p>}
            <ul className="space-y-3">
              {lines.map((l, i) => {
                const calc = valid ? summary.items[i] : null;
                return (
                  <li key={l.key} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{l.product.name}</span>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remover ${l.product.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <QuantityStepper label={`quantidade de ${l.product.name} (${l.product.unit})`} unit={l.product.unit} value={l.quantity} onValueChange={(v) => update(l.key, { quantity: v })} onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                      <div className="grid min-w-32 flex-1 gap-1"><Label className="text-xs" htmlFor={`c-${l.key}`}>Custo unitário</Label><MoneyInput id={`c-${l.key}`} value={l.unitCost} onValueChange={(v) => update(l.key, { unitCost: v })} /></div>
                      {showLineExtras && (
                        <>
                          <div className="grid gap-1"><Label className="text-xs" htmlFor={`d-${l.key}`}>Desconto do item</Label><MoneyInput id={`d-${l.key}`} value={l.discount} onValueChange={(v) => update(l.key, { discount: v })} /></div>
                          <div className="grid gap-1"><Label className="text-xs" htmlFor={`a-${l.key}`}>Custos adicionais</Label><MoneyInput id={`a-${l.key}`} value={l.additionalCosts} onValueChange={(v) => update(l.key, { additionalCosts: v })} /></div>
                        </>
                      )}
                    </div>
                    {calc && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Custo final no estoque: <span className="tabular font-medium text-foreground">{formatMoney(calc.landedTotal.toFixed(2))}</span>
                        {" "}({formatMoney(calc.landedUnitCost.toFixed(2))}/{l.product.unit}, inclui {formatMoney(calc.allocatedCosts.minus(calc.allocatedDiscount).toFixed(2))} de rateio)
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {lines.length > 0 && (
              <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowLineExtras((s) => !s)} aria-expanded={showLineExtras}>
                <ChevronDown className={`size-3 ${showLineExtras ? "rotate-180" : ""}`} /> Desconto e custos por item
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dados da compra</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="supplier">Fornecedor</Label>
              <Select value={supplierId || NONE} onValueChange={(v) => setSupplierId(v === NONE ? "" : v)}>
                <SelectTrigger id="supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="date">Data</Label><DateInput id="date" value={date} onValueChange={setDate} max={today} /></div>
            <div className="grid gap-1.5"><Label htmlFor="ref">Número / referência</Label><Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder="NF, pedido…" /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="pm">Forma de pagamento</Label>
              <Select value={paymentMethod || NONE} onValueChange={(v) => setPaymentMethod(v === NONE ? "" : v)}>
                <SelectTrigger id="pm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informada</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="freight">Frete</Label><MoneyInput id="freight" value={costs.freight} onValueChange={(v) => setCosts((c) => ({ ...c, freight: v }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="taxes">Impostos</Label><MoneyInput id="taxes" value={costs.taxes} onValueChange={(v) => setCosts((c) => ({ ...c, taxes: v }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="other">Outros custos</Label><MoneyInput id="other" value={costs.otherCosts} onValueChange={(v) => setCosts((c) => ({ ...c, otherCosts: v }))} /></div>
            <div className="grid gap-1.5"><Label htmlFor="discount">Desconto</Label><MoneyInput id="discount" value={costs.discount} onValueChange={(v) => setCosts((c) => ({ ...c, discount: v }))} /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Frete, impostos, outros custos e desconto são rateados entre os itens proporcionalmente ao valor de cada um e entram no custo do estoque.</p>
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {summary && "error" in summary ? (
              <p className="text-danger" role="alert">{summary.error}</p>
            ) : summary ? (
              <>
                <Row label="Itens" value={summary.itemsSubtotal.toFixed(2)} />
                {!summary.itemsDiscount.isZero() && <Row label="Descontos dos itens" value={summary.itemsDiscount.negated().toFixed(2)} />}
                {!summary.itemsAdditionalCosts.isZero() && <Row label="Custos dos itens" value={summary.itemsAdditionalCosts.toFixed(2)} />}
                {!summary.freight.isZero() && <Row label="Frete" value={summary.freight.toFixed(2)} />}
                {!summary.taxes.isZero() && <Row label="Impostos" value={summary.taxes.toFixed(2)} />}
                {!summary.otherCosts.isZero() && <Row label="Outros custos" value={summary.otherCosts.toFixed(2)} />}
                {!summary.discount.isZero() && <Row label="Desconto" value={summary.discount.negated().toFixed(2)} />}
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="tabular">{formatMoney(summary.total.toFixed(2))}</span></div>
                <p className="text-xs text-muted-foreground">Este valor entra no estoque (capital investido). Compra não é despesa.</p>
              </>
            ) : (
              <p className="text-muted-foreground">Adicione itens.</p>
            )}
            <Button className="mt-2 hidden w-full lg:flex" size="lg" disabled={!valid || pending} onClick={submit}>{pending ? "Registrando…" : "Confirmar compra"}</Button>
          </CardContent>
        </Card>
      </aside>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="tabular text-lg leading-tight font-semibold">{formatMoney(valid ? summary.total.toFixed(2) : "0")}</p>
            <p className="text-xs text-muted-foreground">{lines.length} item(ns) · vai para o estoque</p>
          </div>
          <Button size="lg" className="min-w-40" disabled={!valid || pending} onClick={submit}>{pending ? "Registrando…" : "Confirmar compra"}</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular">{formatMoney(value)}</span></div>;
}
