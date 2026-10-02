"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateInput, MoneyInput } from "@/components/shared/inputs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { cancelExpenseAction, createExpenseAction } from "@/server/actions/domain";

const NONE = "__none__";

export function ExpenseDialog({ categories, today, defaultOpen }: { categories: { id: string; name: string }[]; today: string; defaultOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [v, setV] = useState({ description: "", categoryId: categories[0]?.id ?? "", amount: "", expenseDate: today, paymentMethod: "", notes: "" });
  const [pending, start] = useTransition();

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && params.get("nova")) router.replace(pathname);
  };

  const submit = () =>
    start(async () => {
      const r = await createExpenseAction({ ...v, paymentMethod: v.paymentMethod || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Despesa registrada.");
      setV((p) => ({ ...p, description: "", amount: "", notes: "" }));
      close(false);
    });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Nova despesa</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
          <DialogDescription>Despesas operacionais reduzem o lucro líquido do mês em que ocorrem.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="e-desc">Descrição *</Label><Input id="e-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={200} autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="e-amount">Valor *</Label><MoneyInput id="e-amount" value={v.amount} onValueChange={(x) => setV({ ...v, amount: x })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="e-date">Data</Label><DateInput id="e-date" value={v.expenseDate} onValueChange={(x) => setV({ ...v, expenseDate: x })} /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-cat">Categoria</Label>
            <Select value={v.categoryId} onValueChange={(x) => setV({ ...v, categoryId: x })}>
              <SelectTrigger id="e-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-pm">Forma de pagamento</Label>
            <Select value={v.paymentMethod || NONE} onValueChange={(x) => setV({ ...v, paymentMethod: x === NONE ? "" : x })}>
              <SelectTrigger id="e-pm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informada</SelectItem>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="e-notes">Observações</Label><Textarea id="e-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !v.description.trim() || !Number(v.amount)}>{pending ? "Salvando…" : "Registrar despesa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelExpenseButton({ id, description }: { id: string; description: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="icon-sm" aria-label={`Cancelar despesa ${description}`}><Trash2 className="size-4" /></Button>}
      title="Cancelar despesa?"
      description={<p>&quot;{description}&quot; deixará de contar no lucro. O registro permanece no histórico.</p>}
      confirmLabel="Cancelar despesa"
      cancelLabel="Voltar"
      onConfirm={async () => {
        const r = await cancelExpenseAction(id);
        if (!r.ok) { toast.error(r.error); return false; }
        toast.success("Despesa cancelada.");
      }}
    />
  );
}
