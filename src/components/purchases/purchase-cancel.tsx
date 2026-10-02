"use client";

import { CancelDocumentButton } from "@/components/shared/cancel-document";
import { cancelPurchaseAction } from "@/server/actions/domain";

export function PurchaseCancel({ id, code }: { id: string; code: string }) {
  return (
    <CancelDocumentButton
      title={`Cancelar compra ${code}?`}
      description={<p>Os itens serão retirados do estoque pelo custo desta compra. Só é possível se nenhum deles teve saída depois dela; caso contrário, use um ajuste de estoque.</p>}
      action={(input) => cancelPurchaseAction(id, input)}
    />
  );
}
