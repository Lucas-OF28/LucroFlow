import { type Decimal, type DecimalInput, ZERO, money } from "./decimal";

export type ReceivableStatus = "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
export type ReceivableDisplayStatus = ReceivableStatus | "OVERDUE";

export interface ReceivableAmounts {
  amount: DecimalInput;
  amountPaid: DecimalInput;
  amountCancelled: DecimalInput;
}

export function openAmount(r: ReceivableAmounts): Decimal {
  return money(r.amount).minus(money(r.amountPaid)).minus(money(r.amountCancelled));
}

/** Status persistido de uma parcela, derivado dos valores (nunca digitado pelo usuário). */
export function receivableStatus(r: ReceivableAmounts): ReceivableStatus {
  const open = openAmount(r);
  const paid = money(r.amountPaid);
  if (open.isNegative()) throw new Error("Parcela com valor pago maior que o devido.");
  if (open.isZero()) return paid.greaterThan(0) ? "PAID" : "CANCELLED";
  return paid.greaterThan(0) ? "PARTIAL" : "PENDING";
}

/** Status de exibição: OVERDUE quando há saldo aberto e o vencimento já passou (na data da empresa). */
export function receivableDisplayStatus(
  r: ReceivableAmounts & { dueDate: string },
  todayIso: string,
): ReceivableDisplayStatus {
  const status = receivableStatus(r);
  if ((status === "PENDING" || status === "PARTIAL") && r.dueDate < todayIso) return "OVERDUE";
  return status;
}

/** Situação de pagamento de uma venda inteira, a partir das parcelas. */
export function salePaymentStatus(
  rows: readonly (ReceivableAmounts & { dueDate: string })[],
  todayIso: string,
): { status: ReceivableDisplayStatus; received: Decimal; open: Decimal } {
  let received = ZERO;
  let open = ZERO;
  let overdue = false;
  for (const r of rows) {
    received = received.plus(money(r.amountPaid));
    const o = openAmount(r);
    open = open.plus(o);
    if (o.greaterThan(0) && r.dueDate < todayIso) overdue = true;
  }
  let status: ReceivableDisplayStatus;
  if (open.isZero()) status = received.greaterThan(0) ? "PAID" : "CANCELLED";
  else if (overdue) status = "OVERDUE";
  else status = received.greaterThan(0) ? "PARTIAL" : "PENDING";
  return { status, received, open };
}
