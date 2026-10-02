"use client";

import { useState, useTransition } from "react";
import { HandCoins, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { CancelDocumentButton } from "@/components/shared/cancel-document";
import { DateInput, MoneyInput, QuantityInput } from "@/components/shared/inputs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS, formatMoney, formatQuantity } from "@/lib/format";
import { cancelSaleAction, createReturnAction, receivePaymentAction } from "@/server/actions/domain";

function MethodSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Recebimento total ou parcial de uma parcela. */
export function ReceivePaymentDialog({ receivableId, open: openAmount, method, today, label = "Receber" }: { receivableId: string; open: string; method: string | null; today: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(Number(openAmount).toFixed(2));
  const [m, setM] = useState(method ?? "PIX");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await receivePaymentAction({ receivableId, amount, method: m, paidOn: date });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data.status === "PAID" ? "Parcela quitada." : `Recebimento registrado. Restam ${formatMoney(r.data.open)}.`);
      setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><HandCoins className="size-4" /> {label}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>Saldo da parcela: {formatMoney(openAmount)}. Pode ser parcial.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="rp-amount">Valor recebido</Label><MoneyInput id="rp-amount" value={amount} onValueChange={setAmount} /></div>
          <div className="grid gap-1.5"><Label htmlFor="rp-date">Data</Label><DateInput id="rp-date" value={date} onValueChange={setDate} max={today} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="rp-method">Forma</Label><MethodSelect id="rp-method" value={m} onChange={setM} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Salvando…" : "Confirmar recebimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ReturnableItem {
  saleItemId: string;
  name: string;
  unit: string;
  available: string;
  refundPerUnit: string;
}

/** Devolução total ou parcial (D2: entra no resultado na data da devolução). */
export function ReturnDialog({ saleId, items, today }: { saleId: string; items: ReturnableItem[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("PIX");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const selected = items.filter((i) => Number(qty[i.saleItemId] || 0) > 0);
  const estimate = selected.reduce((a, i) => a + Number(qty[i.saleItemId]) * Number(i.refundPerUnit), 0);

  const submit = () =>
    start(async () => {
      const r = await createReturnAction({
        saleId,
        returnDate: date,
        reason,
        refundMethod: method,
        items: selected.map((i) => ({ saleItemId: i.saleItemId, quantity: qty[i.saleItemId], restock: restock[i.saleItemId] ?? true })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Devolução ${r.data.code} registrada. Reembolso: ${formatMoney(r.data.refundTotal)}${Number(r.data.receivableReduction) > 0 ? ` (${formatMoney(r.data.receivableReduction)} abatido do saldo a receber)` : ""}.`);
      setOpen(false);
      setQty({});
      setReason("");
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Undo2 className="size-4" /> Devolução</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar devolução</DialogTitle>
          <DialogDescription>O reembolso abate primeiro o saldo a receber da venda; o excedente é devolvido ao cliente.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.saleItemId} className="rounded-lg border p-3">
              <p className="font-medium">{i.name}</p>
              <p className="mb-2 text-xs text-muted-foreground">Pode devolver até {formatQuantity(i.available, i.unit)} {i.unit}</p>
              <div className="flex flex-wrap items-center gap-3">
                <QuantityInput aria-label={`Quantidade devolvida de ${i.name}`} unit={i.unit} value={qty[i.saleItemId] ?? ""} onValueChange={(v) => setQty((q) => ({ ...q, [i.saleItemId]: v }))} className="w-24" placeholder="0" />
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={restock[i.saleItemId] ?? true} onCheckedChange={(v) => setRestock((r) => ({ ...r, [i.saleItemId]: v }))} /> Volta ao estoque
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="ret-date">Data</Label><DateInput id="ret-date" value={date} onValueChange={setDate} max={today} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ret-method">Forma do reembolso</Label><MethodSelect id="ret-method" value={method} onChange={setMethod} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="ret-reason">Motivo *</Label><Textarea id="ret-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        {selected.length > 0 && <p className="text-sm">Reembolso estimado: <strong className="tabular">{formatMoney(estimate)}</strong></p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || selected.length === 0 || !reason.trim()}>{pending ? "Salvando…" : "Confirmar devolução"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SaleCancel({ id, code }: { id: string; code: string }) {
  return (
    <CancelDocumentButton
      title={`Cancelar venda ${code}?`}
      description={<p>Esta ação devolverá os itens ao estoque e ajustará os indicadores financeiros. Valores já recebidos serão registrados como estorno. A venda continua no histórico.</p>}
      askRefundMethod
      action={(input) => cancelSaleAction(id, input)}
    />
  );
}
