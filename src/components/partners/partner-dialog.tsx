"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, createSupplierAction, updateCustomerAction, updateSupplierAction } from "@/server/actions/domain";

export interface PartnerValues {
  name: string;
  companyName?: string;
  phone: string;
  whatsapp: string;
  email: string;
  document: string;
  notes: string;
}

const EMPTY: PartnerValues = { name: "", companyName: "", phone: "", whatsapp: "", email: "", document: "", notes: "" };

/** Cadastro/edição de cliente ou fornecedor (mesmo componente, campos conforme o tipo). */
export function PartnerDialog({ kind, id, initial }: { kind: "customer" | "supplier"; id?: string; initial?: PartnerValues }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<PartnerValues>(initial ?? EMPTY);
  const [pending, start] = useTransition();
  const label = kind === "customer" ? "cliente" : "fornecedor";

  const submit = () =>
    start(async () => {
      const payload = kind === "customer" ? { ...v, companyName: undefined } : v;
      const r = id
        ? kind === "customer" ? await updateCustomerAction(id, payload) : await updateSupplierAction(id, payload)
        : kind === "customer" ? await createCustomerAction(payload) : await createSupplierAction(payload);
      if (!r.ok) return void toast.error(r.error);
      toast.success(id ? "Dados atualizados." : `${kind === "customer" ? "Cliente" : "Fornecedor"} cadastrado.`);
      if (!id) setV(EMPTY);
      setOpen(false);
    });

  const field = (k: keyof PartnerValues, text: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`p-${k}`}>{text}</Label>
      <Input id={`p-${k}`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? <Button variant="outline"><Pencil className="size-4" /> Editar</Button> : <Button><Plus className="size-4" /> Novo {label}</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{id ? `Editar ${label}` : `Novo ${label}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Nome *", { maxLength: 160, autoFocus: true })}</div>
          {kind === "supplier" && <div className="sm:col-span-2">{field("companyName", "Empresa", { maxLength: 160 })}</div>}
          {field("whatsapp", "WhatsApp", { inputMode: "tel", maxLength: 40 })}
          {field("phone", "Telefone", { inputMode: "tel", maxLength: 40 })}
          {field("email", "E-mail", { type: "email", maxLength: 200 })}
          {field("document", "CPF/CNPJ", { maxLength: 32 })}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="p-notes">Observações</Label>
            <Textarea id="p-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !v.name.trim()}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
