"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateInput, MoneyInput, QuantityInput } from "@/components/shared/inputs";
import { SignedMoney } from "@/components/shared/money";
import { CustomerSelector, type ProductOption, ProductSelector } from "@/components/shared/selectors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { addMonths } from "@/lib/dates";
import { allocateProportionally, calculateSale, dec, stockState, sum } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS, formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { createSaleAction } from "@/server/actions/domain";

type Line = { key: string; product: ProductOption; quantity: string; unitPrice: string; discount: string };
type Pay = { key: string; method: string; amount: string; received: boolean; dueDate: string };

const blankPay = (amount: string, today: string): Pay => ({ key: crypto.randomUUID(), method: "PIX", amount, received: true, dueDate: today });

export function SaleForm({ today, initialProduct, canApproveLoss }: { today: string; initialProduct?: ProductOption | null; canApproveLoss: boolean }) {
  const router = useRouter();
  const lineOf = (p: ProductOption): Line => ({ key: crypto.randomUUID(), product: p, quantity: "1", unitPrice: p.referencePrice ? Number(p.referencePrice).toFixed(2) : "", discount: "" });
  const [lines, setLines] = useState<Line[]>(initialProduct ? [lineOf(initialProduct)] : []);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(today);
  const [extras, setExtras] = useState({ discount: "", freightCharged: "", freightPaid: "", fees: "", commission: "", otherExpenses: "" });
  const [showExtras, setShowExtras] = useState(false);
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<Pay[]>([blankPay("", today)]);
  const [payTouched, setPayTouched] = useState(false);
  const [lossPrompt, setLossPrompt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));


  // Estimativa (mesma função do servidor). O servidor recalcula com lock ao confirmar.
  const calc = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      const stock = new Map(lines.map((l) => [l.product.id, stockState(l.product.stockQuantity, l.product.stockValue)]));
      return calculateSale(
        {
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity || "0", unitPrice: l.unitPrice || "0", discount: l.discount || "0" })),
          ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, v || "0"])),
        },
        stock,
      );
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [lines, extras]);
  const ok = calc && !("error" in calc) ? calc : null;
  const total = ok ? ok.totalRevenue.toFixed(2) : "0.00";

  // Pagamento único acompanha o total até o usuário editar as formas de pagamento (estado derivado).
  const shownPayments = !payTouched && payments.length === 1 ? [{ ...payments[0], amount: total }] : payments;
  const updatePay = (key: string, patch: Partial<Pay>) => {
    setPayTouched(true);
    setPayments(shownPayments.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const paid = sum(shownPayments.map((p) => p.amount || "0"));
  const diff = dec(total).minus(paid);

  const installments = (n: number, downPayment: string) => {
    setPayTouched(true);
    const rest = dec(total).minus(dec(downPayment || "0"));
    if (rest.isNegative()) return void toast.error("Entrada maior que o total.");
    const parts = allocateProportionally(rest, Array.from({ length: n }, () => 1));
    const list: Pay[] = [];
    if (dec(downPayment || "0").greaterThan(0)) list.push({ ...blankPay(dec(downPayment).toFixed(2), today) });
    parts.forEach((a, i) => list.push({ key: crypto.randomUUID(), method: "PIX", amount: a.toFixed(2), received: false, dueDate: addMonths(date, i + 1) }));
    setPayments(list);
  };

  const submit = (acknowledgeLoss = false) =>
    start(async () => {
      const r = await createSaleAction({
        customerId: customer?.id ?? null,
        saleDate: date,
        ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, v || "0"])),
        notes,
        acknowledgeLoss,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice || "0", discount: l.discount || "0" })),
        payments: shownPayments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: p.amount, received: p.received, dueDate: p.received ? null : p.dueDate })),
      });
      if (!r.ok) {
        if (r.code === "BELOW_COST_CONFIRMATION_REQUIRED") {
          if (r.details?.canApprove) setLossPrompt(r.error);
          else toast.error(`${r.error} Somente gerente, administrador ou proprietário pode confirmar.`);
          return;
        }
        return void toast.error(r.error);
      }
      toast.success(`Venda ${r.data.code} registrada.`);
      router.push(`/vendas/${r.data.id}`);
    });

  const canSubmit = ok && lines.length > 0 && diff.isZero() && !pending;
  const isLoss = ok?.netProfit.isNegative();
  const belowMin = lines.filter((l) => l.product.minimumPrice && dec(l.unitPrice || "0").lessThan(dec(l.product.minimumPrice)));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Produtos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ProductSelector inStockOnly autoFocus={!initialProduct} onSelect={(p) => setLines((ls) => [...ls, lineOf(p)])} placeholder="Buscar produto para vender…" />
            {lines.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Busque um produto pelo nome, SKU ou código de barras.</p>}
            <ul className="space-y-3">
              {lines.map((l, i) => {
                const item = ok?.items[i];
                return (
                  <li key={l.key} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{l.product.name}</span>
                        <span className="text-xs text-muted-foreground">Disponível: {formatQuantity(l.product.stockQuantity, l.product.unit)} {l.product.unit}</span>
                      </span>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remover ${l.product.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1"><Label className="text-xs" htmlFor={`q-${l.key}`}>Qtd.</Label><QuantityInput id={`q-${l.key}`} unit={l.product.unit} value={l.quantity} onValueChange={(v) => updateLine(l.key, { quantity: v })} /></div>
                      <div className="grid gap-1"><Label className="text-xs" htmlFor={`p-${l.key}`}>Preço unit.</Label><MoneyInput id={`p-${l.key}`} value={l.unitPrice} onValueChange={(v) => updateLine(l.key, { unitPrice: v })} /></div>
                      <div className="grid gap-1"><Label className="text-xs" htmlFor={`d-${l.key}`}>Desconto</Label><MoneyInput id={`d-${l.key}`} value={l.discount} onValueChange={(v) => updateLine(l.key, { discount: v })} /></div>
                    </div>
                    {item && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Custo estimado {formatMoney(item.totalCost.toFixed(2))} · lucro bruto <SignedMoney value={item.grossProfit.toFixed(2)} />
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-3">
              {shownPayments.map((p) => (
                <li key={p.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_1fr_auto]">
                  <div className="grid gap-1">
                    <Label className="text-xs" htmlFor={`m-${p.key}`}>Forma</Label>
                    <Select value={p.method} onValueChange={(v) => updatePay(p.key, { method: v })}>
                      <SelectTrigger id={`m-${p.key}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1"><Label className="text-xs" htmlFor={`a-${p.key}`}>Valor</Label><MoneyInput id={`a-${p.key}`} value={p.amount} onValueChange={(v) => updatePay(p.key, { amount: v })} /></div>
                  <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={p.received} onCheckedChange={(v) => updatePay(p.key, { received: v })} /> Recebido</label>
                  {!p.received ? (
                    <div className="grid gap-1"><Label className="text-xs" htmlFor={`v-${p.key}`}>Vencimento</Label><DateInput id={`v-${p.key}`} value={p.dueDate} onValueChange={(v) => updatePay(p.key, { dueDate: v })} /></div>
                  ) : <span className="hidden sm:block" />}
                  {shownPayments.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="Remover pagamento" onClick={() => { setPayTouched(true); setPayments(shownPayments.filter((x) => x.key !== p.key)); }}><Trash2 className="size-4" /></Button>}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPayTouched(true); setPayments([...shownPayments, blankPay(diff.greaterThan(0) ? diff.toFixed(2) : "", today)]); }}><Plus className="size-4" /> Forma de pagamento</Button>
              <InstallmentsHelper onApply={installments} />
            </div>
            {!diff.isZero() && lines.length > 0 && (
              <p className="text-sm text-danger" role="alert">
                {diff.greaterThan(0) ? `Faltam ${formatMoney(diff.toFixed(2))} para fechar o total.` : `Pagamentos excedem o total em ${formatMoney(diff.abs().toFixed(2))}.`}
              </p>
            )}
          </CardContent>
        </Card>

        <button type="button" className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowExtras((s) => !s)} aria-expanded={showExtras}>
          <ChevronDown className={`size-4 ${showExtras ? "rotate-180" : ""}`} /> Cliente, data, frete, taxas e comissão
        </button>
        {showExtras && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2"><Label>Cliente</Label><CustomerSelector value={customer} onChange={setCustomer} /></div>
              <div className="grid gap-1.5"><Label htmlFor="date">Data da venda</Label><DateInput id="date" value={date} onValueChange={setDate} max={today} /></div>
              <div className="grid gap-1.5"><Label htmlFor="discount">Desconto na venda</Label><MoneyInput id="discount" value={extras.discount} onValueChange={(v) => setExtras((e) => ({ ...e, discount: v }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="fc">Frete cobrado do cliente</Label><MoneyInput id="fc" value={extras.freightCharged} onValueChange={(v) => setExtras((e) => ({ ...e, freightCharged: v }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="fp">Frete pago por você</Label><MoneyInput id="fp" value={extras.freightPaid} onValueChange={(v) => setExtras((e) => ({ ...e, freightPaid: v }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="fees">Taxas (cartão, marketplace)</Label><MoneyInput id="fees" value={extras.fees} onValueChange={(v) => setExtras((e) => ({ ...e, fees: v }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="comm">Comissão</Label><MoneyInput id="comm" value={extras.commission} onValueChange={(v) => setExtras((e) => ({ ...e, commission: v }))} /></div>
              <div className="grid gap-1.5"><Label htmlFor="oth">Outras despesas da venda</Label><MoneyInput id="oth" value={extras.otherExpenses} onValueChange={(v) => setExtras((e) => ({ ...e, otherExpenses: v }))} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {calc && "error" in calc && <Alert variant="destructive"><AlertDescription>{calc.error}</AlertDescription></Alert>}
            {ok ? (
              <>
                <Row label="Produtos" value={ok.productsRevenue.toFixed(2)} />
                {!ok.freightCharged.isZero() && <Row label="Frete cobrado" value={ok.freightCharged.toFixed(2)} />}
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="tabular">{formatMoney(total)}</span></div>
                <Row label="Custo dos produtos" value={ok.totalCost.negated().toFixed(2)} muted />
                {!ok.saleCosts.isZero() && <Row label="Custos da venda" value={ok.saleCosts.negated().toFixed(2)} muted />}
                <div className="flex justify-between"><span>Lucro estimado</span><SignedMoney value={ok.netProfit.toFixed(2)} className="font-semibold" /></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Margem · ROI</span><span className="tabular">{formatPercent(ok.marginPercent?.toFixed(2))} · {formatPercent(ok.roiPercent?.toFixed(2))}</span></div>
                {isLoss && (
                  <Alert variant="destructive" role="alert">
                    <AlertTriangle className="size-4" />
                    <AlertDescription>Esta venda resultará em prejuízo estimado de {formatMoney(ok.netProfit.abs().toFixed(2))}.</AlertDescription>
                  </Alert>
                )}
                {belowMin.length > 0 && <p className="text-xs text-warning" role="status">Abaixo do preço mínimo: {belowMin.map((l) => l.product.name).join(", ")}.</p>}
              </>
            ) : (
              !calc && <p className="text-muted-foreground">Adicione produtos.</p>
            )}
            <Button className="mt-2 w-full" size="lg" disabled={!canSubmit} onClick={() => submit(false)}>{pending ? "Registrando…" : "Finalizar venda"}</Button>
            {!canApproveLoss && isLoss && <p className="text-xs text-muted-foreground">Vendas com prejuízo exigem aprovação de gerente ou superior.</p>}
          </CardContent>
        </Card>
      </aside>

      <ConfirmDialog
        open={lossPrompt !== null}
        onOpenChange={(o) => !o && setLossPrompt(null)}
        title="Confirmar venda com prejuízo?"
        description={<p>{lossPrompt} A confirmação ficará registrada no histórico.</p>}
        confirmLabel="Confirmar mesmo assim"
        onConfirm={() => { setLossPrompt(null); submit(true); }}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}><span>{label}</span><span className="tabular">{formatMoney(value)}</span></div>;
}

function InstallmentsHelper({ onApply }: { onApply: (n: number, down: string) => void }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState("3");
  const [down, setDown] = useState("");
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Entrada + parcelas</Button>;
  return (
    <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border p-3">
      <div className="grid gap-1"><Label className="text-xs" htmlFor="down">Entrada (recebida)</Label><MoneyInput id="down" value={down} onValueChange={setDown} className="w-36" /></div>
      <div className="grid gap-1"><Label className="text-xs" htmlFor="n">Parcelas mensais</Label><QuantityInput id="n" value={n} onValueChange={setN} className="w-20" /></div>
      <Button size="sm" onClick={() => { const k = Math.min(48, Math.max(1, Number(n) || 1)); onApply(k, down); setOpen(false); }}>Gerar</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
    </div>
  );
}
