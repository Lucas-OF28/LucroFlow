"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";

/** Cancelamento com motivo obrigatório (e forma de estorno, quando houver valor recebido). */
export function CancelDocumentButton({
  title,
  description,
  askRefundMethod = false,
  action,
}: {
  title: string;
  description: React.ReactNode;
  askRefundMethod?: boolean;
  action: (input: { reason: string; refundMethod?: string | null }) => Promise<ActionResult<unknown>>;
}) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("PIX");
  return (
    <ConfirmDialog
      trigger={<Button variant="destructive"><Ban className="size-4" /> Cancelar</Button>}
      title={title}
      description={description}
      cancelLabel="Voltar"
      confirmLabel="Confirmar cancelamento"
      onConfirm={async () => {
        if (!reason.trim()) {
          toast.error("Informe o motivo do cancelamento.");
          return false;
        }
        const r = await action({ reason, refundMethod: askRefundMethod ? method : null });
        if (!r.ok) {
          toast.error(r.error);
          return false;
        }
        toast.success("Cancelado com sucesso.");
      }}
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Motivo *</Label>
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        {askRefundMethod && (
          <div className="grid gap-1.5">
            <Label htmlFor="refund-method">Forma do estorno ao cliente (se houve recebimento)</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="refund-method"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
