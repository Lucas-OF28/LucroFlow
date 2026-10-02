import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ReceivePaymentDialog, ReturnDialog, SaleCancel } from "@/components/sales/sale-actions";
import { Money, SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { margin as marginOf, receivableDisplayStatus, roi as roiOf } from "@/lib/finance";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatQuantity, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getSale } from "@/server/services/sales";

export const metadata: Metadata = { title: "Venda" };

export default async function SalePage({ params }: PageProps<"/vendas/[id]">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const s = await getSale(ctx, id);
  if (!s) notFound();
  const confirmed = s.status === "CONFIRMED";
  const saleCosts = Number(s.freightPaid) + Number(s.fees) + Number(s.commission) + Number(s.otherExpenses);
  const returnable = s.items
    .map(({ item, productName, productUnit, returnedQuantity }) => ({
      saleItemId: item.id,
      name: productName,
      unit: productUnit,
      available: String(Number(item.quantity) - Number(returnedQuantity)),
      refundPerUnit: String(Number(item.netRevenue) / Number(item.quantity)),
    }))
    .filter((i) => Number(i.available) > 0);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{s.code} <StatusBadge status={s.status} />{confirmed && <StatusBadge status={s.paymentStatus} />}{s.belowCost && <StatusBadge status="LOSS" />}</span>}
        description={`${formatDate(s.saleDate)} · ${s.customerName ?? "Venda sem cliente"} · registrada por ${s.createdByName ?? "—"}`}
        back={{ href: "/vendas", label: "Vendas" }}
        actions={confirmed && can(ctx.role, "cancel") ? (
          <>
            {returnable.length > 0 && <ReturnDialog saleId={s.id} items={returnable} today={s.today} />}
            {s.returns.length === 0 && <SaleCancel id={s.id} code={s.code} />}
          </>
        ) : undefined}
      />
      {s.status === "CANCELLED" && (
        <p className="mb-4 rounded-lg border bg-muted px-3 py-2 text-sm">Cancelada em {formatDateTime(s.cancelledAt, ctx.timezone)}: {s.cancelReason}. Não entra nos indicadores.</p>
      )}
      {s.belowCost && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm"><AlertTriangle className="size-4 text-danger" aria-hidden /> Venda confirmada com prejuízo (aprovada e registrada no histórico).</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Receita</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Custo (na venda)</TableHead>
                  <TableHead className="text-right">Lucro bruto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.items.map(({ item, productName, productUnit, returnedQuantity }) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/produtos/${item.productId}`} className="hover:underline">{productName}</Link>
                      {Number(returnedQuantity) > 0 && <span className="block text-xs text-muted-foreground">{formatQuantity(returnedQuantity, productUnit)} devolvido(s)</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(item.quantity, productUnit)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(item.unitPrice)}</TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{formatMoney(item.netRevenue)}</TableCell>
                    <TableCell className="tabular hidden text-right md:table-cell">{formatMoney(item.totalCost)}<span className="block text-xs text-muted-foreground">{formatMoney(item.unitCostAtSale)}/{productUnit}</span></TableCell>
                    <TableCell className="text-right"><SignedMoney value={Number(item.netRevenue) - Number(item.totalCost)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Pagamentos e parcelas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-muted-foreground">Total</p><Money value={s.totalRevenue} className="font-semibold" /></div>
                <div><p className="text-muted-foreground">Recebido</p><Money value={s.received} className="font-semibold text-success" /></div>
                <div><p className="text-muted-foreground">A receber</p><Money value={s.openAmount} className="font-semibold" /></div>
              </div>
              {s.receivables.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {s.receivables.map((r) => {
                    const open = Number(r.amount) - Number(r.amountPaid) - Number(r.amountCancelled);
                    const st = receivableDisplayStatus(r, s.today);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <span>
                          <span className="font-medium">Parcela {r.installmentNumber}</span> · vence {formatDate(r.dueDate)} · {r.expectedMethod ? PAYMENT_METHOD_LABELS[r.expectedMethod] : "—"}
                          <span className="block text-xs text-muted-foreground">
                            {formatMoney(r.amount)}{Number(r.amountPaid) > 0 && ` · pago ${formatMoney(r.amountPaid)}`}{Number(r.amountCancelled) > 0 && ` · abatido ${formatMoney(r.amountCancelled)}`}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={st} />
                          {confirmed && open > 0 && can(ctx.role, "write") && <ReceivePaymentDialog receivableId={r.id} open={String(open)} method={r.expectedMethod} today={s.today} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {s.payments.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Movimentos de caixa</p>
                  <ul className="space-y-1 text-sm">
                    {s.payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>{formatDate(p.paidOn)} · {PAYMENT_METHOD_LABELS[p.method]} · {p.kind === "SALE_RECEIPT" ? "Recebimento" : p.kind === "RETURN_REFUND" ? "Reembolso de devolução" : "Estorno de cancelamento"}</span>
                        <SignedMoney value={p.direction === "IN" ? p.amount : `-${p.amount}`} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {s.returns.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Devoluções</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {s.returns.map(({ ret, items }) => (
                    <li key={ret.id} className="rounded-lg border p-3">
                      <p className="font-medium">{ret.code} · {formatDate(ret.returnDate)} · reembolso {formatMoney(ret.refundTotal)}</p>
                      <p className="text-muted-foreground">{ret.reason}</p>
                      <ul className="mt-1 text-xs text-muted-foreground">
                        {items.map((i, k) => <li key={k}>{formatQuantity(i.quantity)} × {i.productName} {i.restock ? "(voltou ao estoque)" : "(não voltou ao estoque)"}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:self-start">
          <CardHeader><CardTitle className="text-base">Resultado da venda</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Line label="Produtos (líquido de descontos)" value={s.productsRevenue} />
            {Number(s.freightCharged) > 0 && <Line label="Frete cobrado" value={s.freightCharged} />}
            <Line label="Faturamento" value={s.totalRevenue} strong />
            <Line label="Custo dos produtos (histórico)" value={`-${s.totalCost}`} />
            <Line label="Lucro bruto" value={s.grossProfit} strong />
            {Number(s.freightPaid) > 0 && <Line label="Frete pago" value={`-${s.freightPaid}`} />}
            {Number(s.fees) > 0 && <Line label="Taxas" value={`-${s.fees}`} />}
            {Number(s.commission) > 0 && <Line label="Comissão" value={`-${s.commission}`} />}
            {Number(s.otherExpenses) > 0 && <Line label="Outras despesas" value={`-${s.otherExpenses}`} />}
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Lucro da venda</span><SignedMoney value={s.netProfit} /></div>
            <div className="flex justify-between text-muted-foreground"><span>Margem</span><span className="tabular">{formatPercent(marginOf(s.netProfit, s.totalRevenue)?.toFixed(2))}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>ROI</span><span className="tabular">{formatPercent(roiOf(s.netProfit, s.totalCost)?.toFixed(2))}</span></div>
            {saleCosts === 0 && <p className="pt-1 text-xs text-muted-foreground">Sem custos de venda (frete/taxas/comissão).</p>}
            {Number(s.refundedTotal) > 0 && (
              <p className="border-t pt-2 text-xs text-muted-foreground">Após devoluções: <SignedMoney value={s.netProfitAfterReturns} /> (as devoluções entram no resultado na data em que ocorreram).</p>
            )}
            {s.notes && <p className="border-t pt-2 text-muted-foreground">{s.notes}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-medium" : "text-muted-foreground"}`}>
      <span>{label}</span><span className="tabular text-foreground">{formatMoney(value)}</span>
    </div>
  );
}
