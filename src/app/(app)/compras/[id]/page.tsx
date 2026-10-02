import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseCancel } from "@/components/purchases/purchase-cancel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney, formatQuantity, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getPurchase } from "@/server/services/purchases";

export const metadata: Metadata = { title: "Compra" };

export default async function PurchasePage({ params }: PageProps<"/compras/[id]">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const p = await getPurchase(ctx, id);
  if (!p) notFound();
  const lines: [string, string][] = [
    ["Itens", p.itemsSubtotal],
    ["Descontos dos itens", `-${p.itemsDiscount}`],
    ["Custos dos itens", p.itemsAdditionalCosts],
    ["Frete", p.freight],
    ["Impostos", p.taxes],
    ["Outros custos", p.otherCosts],
    ["Desconto", `-${p.discount}`],
  ];
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{p.code} <StatusBadge status={p.status} /></span>}
        description={`${formatDate(p.purchaseDate)} · ${p.supplierName ?? "Fornecedor não informado"}${p.reference ? ` · Ref. ${p.reference}` : ""}`}
        back={{ href: "/compras", label: "Compras" }}
        actions={p.status === "CONFIRMED" && can(ctx.role, "cancel") ? <PurchaseCancel id={p.id} code={p.code} /> : undefined}
      />
      {p.status === "CANCELLED" && (
        <p className="mb-4 rounded-lg border bg-muted px-3 py-2 text-sm">Cancelada em {formatDateTime(p.cancelledAt, ctx.timezone)}: {p.cancelReason}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead className="hidden text-right md:table-cell">Rateio</TableHead>
                <TableHead className="text-right">Custo final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.map(({ item, productName, productUnit }) => (
                <TableRow key={item.id}>
                  <TableCell><Link href={`/produtos/${item.productId}`} className="hover:underline">{productName}</Link></TableCell>
                  <TableCell className="tabular text-right">{formatQuantity(item.quantity, productUnit)}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(item.unitCost)}</TableCell>
                  <TableCell className="tabular hidden text-right md:table-cell">{formatMoney(Number(item.allocatedCosts) - Number(item.allocatedDiscount) + Number(item.additionalCosts) - Number(item.discount))}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatMoney(item.landedTotal)}
                    <span className="block text-xs font-normal text-muted-foreground">{formatMoney(item.landedUnitCost)}/{productUnit}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Totais</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {lines.filter(([, v]) => Number(v) !== 0).map(([l, v]) => (
              <div key={l} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className="tabular">{formatMoney(v)}</span></div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="tabular">{formatMoney(p.total)}</span></div>
            {p.paymentMethod && <p className="pt-2 text-muted-foreground">Pagamento: {PAYMENT_METHOD_LABELS[p.paymentMethod]}</p>}
            {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
