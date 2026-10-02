"use client";

import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput, QuantityInput } from "@/components/shared/inputs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adjustStockAction } from "@/server/actions/domain";

const TYPES = [
  { value: "ADJUSTMENT_IN", label: "Entrada (correção)", help: "Inclui unidades que não vieram de compra. Não gera lucro." },
  { value: "ADJUSTMENT_OUT", label: "Saída (correção)", help: "Remove unidades pelo custo médio. Não gera prejuízo." },
  { value: "LOSS", label: "Perda / avaria", help: "Remove pelo custo médio e reduz o lucro líquido." },
  { value: "COST_ADJUSTMENT", label: "Agregar custo", help: "Ex.: manutenção ou reparo. Muda o custo médio, não a quantidade." },
] as const;

/** Ajuste manual de estoque — sempre com justificativa e registrado nas movimentações (§19). */
export function StockAdjustDialog({ productId, unit }: { productId: string; unit: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("ADJUSTMENT_IN");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [amount, setAmount] = useState("");
  const [reduce, setReduce] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await adjustStockAction({
        productId,
        type,
        quantity: type === "COST_ADJUSTMENT" ? "0" : quantity,
        unitCost: type === "ADJUSTMENT_IN" && unitCost ? unitCost : null,
        amount: type === "COST_ADJUSTMENT" ? (reduce ? `-${amount || "0"}` : amount || "0") : "0",
        notes,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Estoque ajustado.");
      setOpen(false);
      setQuantity(""); setUnitCost(""); setAmount(""); setNotes("");
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><SlidersHorizontal className="size-4" /> Ajustar estoque</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar estoque</DialogTitle>
          <DialogDescription>O ajuste fica registrado nas movimentações, com sua justificativa.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <RadioGroup value={type} onValueChange={(v) => setType(v as typeof type)} className="grid gap-2">
            {TYPES.map((t) => (
              <Label key={t.value} htmlFor={t.value} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary">
                <RadioGroupItem id={t.value} value={t.value} className="mt-0.5" />
                <span><span className="font-medium">{t.label}</span><span className="block text-xs text-muted-foreground">{t.help}</span></span>
              </Label>
            ))}
          </RadioGroup>
          {type === "COST_ADJUSTMENT" ? (
            <div className="grid gap-2">
              <Label htmlFor="adj-amount">Valor</Label>
              <MoneyInput id="adj-amount" value={amount} onValueChange={setAmount} />
              <label className="flex items-center gap-2 text-sm"><Switch checked={reduce} onCheckedChange={setReduce} /> Reduzir custo (em vez de agregar)</label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="adj-qty">Quantidade ({unit})</Label>
                <QuantityInput id="adj-qty" unit={unit} value={quantity} onValueChange={setQuantity} />
              </div>
              {type === "ADJUSTMENT_IN" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="adj-cost">Custo unitário</Label>
                  <MoneyInput id="adj-cost" value={unitCost} onValueChange={setUnitCost} placeholder="custo médio" />
                </div>
              )}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="adj-notes">Justificativa *</Label>
            <Textarea id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: contagem de inventário, aparelho com tela quebrada…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !notes.trim()}>{pending ? "Salvando…" : "Confirmar ajuste"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
