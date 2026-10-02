import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ShoppingBag, ShoppingCart } from "lucide-react";
import { ImageManager } from "@/components/products/image-manager";
import { StockAdjustDialog } from "@/components/products/stock-adjust-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { Money, SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatQuantity, MOVEMENT_LABELS } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getProductDetail } from "@/server/services/products";
import { isStorageConfigured, signedUrlsSafe } from "@/server/storage";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({ params }: PageProps<"/produtos/[id]">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const p = await getProductDetail(ctx, id);
  if (!p) notFound();
  const urls = await signedUrlsSafe(p.images.map((i) => i.storagePath));
  const qty = Number(p.stockQuantity);
  const low = Number(p.minStock) > 0 && qty <= Number(p.minStock);

  return (
    <>
      <PageHeader
        title={p.name}
        description={[p.sku && `SKU ${p.sku}`, p.categoryName, p.supplierName && `Fornecedor: ${p.supplierName}`].filter(Boolean).join(" · ") || undefined}
        back={{ href: "/produtos", label: "Produtos" }}
        actions={
          <>
            {can(ctx.role, "cancel") && <StockAdjustDialog productId={p.id} unit={p.unit} />}
            {can(ctx.role, "write") && <Button variant="outline" asChild><Link href={`/compras/nova?produto=${p.id}`}><ShoppingCart className="size-4" /> Comprar</Link></Button>}
            {can(ctx.role, "write") && qty > 0 && <Button asChild><Link href={`/vendas/nova?produto=${p.id}`}><ShoppingBag className="size-4" /> Vender</Link></Button>}
            {can(ctx.role, "write") && <Button variant="ghost" size="icon" asChild aria-label="Editar produto"><Link href={`/produtos/${p.id}/editar`}><Pencil className="size-4" /></Link></Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <ImageManager
            productId={p.id}
            name={p.name}
            images={p.images.map((i) => ({ id: i.id, url: urls.get(i.storagePath), isPrimary: i.isPrimary }))}
            canEdit={can(ctx.role, "write")}
            storageReady={isStorageConfigured()}
          />
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={p.status === "INACTIVE" ? "INACTIVE" : "ACTIVE"} />
            {qty === 0 && <StatusBadge status="OUT_OF_STOCK" />}
            {qty > 0 && low && <StatusBadge status="LOW_STOCK" />}
          </div>
          {p.location && <p className="text-sm text-muted-foreground">Localização: {p.location}</p>}
          {p.description && <p className="text-sm whitespace-pre-line">{p.description}</p>}
        </div>

        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Estoque e custo">
            <MetricCard label="Quantidade" value={`${formatQuantity(p.stockQuantity, p.unit)} ${p.unit}`} footer={`Mínimo: ${formatQuantity(p.minStock, p.unit)}`} />
            <MetricCard label="Custo médio" value={formatMoney(p.averageCost)} hint="Custo médio ponderado de todas as entradas (inclui frete/custos rateados)." />
            <MetricCard label="Capital investido" value={formatMoney(p.stockValue)} hint="Quantidade × custo médio. Não é lucro." />
            <MetricCard label="Dias em estoque" value={p.oldestDaysInStock ?? "—"} footer={p.averageDaysInStock !== null ? `média ${p.averageDaysInStock} dias` : undefined}
              hint="Idade da unidade mais antiga ainda em estoque (premissa: as mais antigas saem primeiro)." />
            <MetricCard label="Preço de referência" value={formatMoney(p.referencePrice)} footer={p.minimumPrice ? `mínimo ${formatMoney(p.minimumPrice)}` : undefined} />
            <MetricCard label="Margem potencial" value={formatPercent(p.potentialMargin)} footer={p.potentialUnitProfit ? <SignedMoney value={p.potentialUnitProfit} /> : undefined}
              hint="(Preço de referência − custo médio) ÷ preço de referência." tone={p.potentialMargin && Number(p.potentialMargin) < 0 ? "negative" : undefined} />
            <MetricCard label="Preço sugerido" value={formatMoney(p.suggestedPrice)} footer={p.targetMargin ? `para ${formatPercent(p.targetMargin)} de margem` : "defina a margem desejada"}
              hint="Custo médio ÷ (1 − margem desejada). Margem sobre o preço, não markup." />
            <MetricCard label="Lucro gerado" value={formatMoney(p.history.profit)} tone={Number(p.history.profit) < 0 ? "negative" : undefined}
              footer={`${formatQuantity(p.history.quantitySold, p.unit)} vendido(s)`} hint="Lucro bruto histórico: receita das vendas − custo histórico, líquido de devoluções." />
          </section>

          {Number(p.history.quantitySold) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Resultado histórico</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div><p className="text-muted-foreground">Receita</p><Money value={p.history.revenue} className="text-lg font-semibold" /></div>
                <div><p className="text-muted-foreground">Custo</p><Money value={p.history.cost} className="text-lg font-semibold" /></div>
                <div><p className="text-muted-foreground">Lucro</p><SignedMoney value={p.history.profit} className="text-lg font-semibold" /></div>
                <div><p className="text-muted-foreground">Margem</p><span className="tabular text-lg font-semibold">{formatPercent(p.history.margin)}</span></div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="sales">
            <TabsList>
              <TabsTrigger value="sales">Vendas ({p.saleHistory.length})</TabsTrigger>
              <TabsTrigger value="purchases">Compras ({p.purchaseHistory.length})</TabsTrigger>
              <TabsTrigger value="movements">Movimentações</TabsTrigger>
            </TabsList>
            <TabsContent value="sales">
              <HistoryTable
                empty="Nenhuma venda deste produto."
                head={["Venda", "Data", "Qtd.", "Preço", "Custo unit.", "Lucro"]}
                rows={p.saleHistory.map((s) => [
                  <Link key="c" href={`/vendas/${s.saleId}`} className="font-medium hover:underline">{s.code}{s.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}</Link>,
                  formatDate(s.date),
                  `${formatQuantity(s.quantity, p.unit)}${Number(s.returnedQuantity) > 0 ? ` (−${formatQuantity(s.returnedQuantity, p.unit)} dev.)` : ""}`,
                  formatMoney(s.unitPrice),
                  formatMoney(s.unitCostAtSale),
                  <SignedMoney key="l" value={Number(s.netRevenue) - Number(s.totalCost)} />,
                ])}
              />
            </TabsContent>
            <TabsContent value="purchases">
              <HistoryTable
                empty="Nenhuma compra deste produto."
                head={["Compra", "Data", "Fornecedor", "Qtd.", "Custo unit.", "Custo final unit."]}
                rows={p.purchaseHistory.map((c) => [
                  <Link key="c" href={`/compras/${c.purchaseId}`} className="font-medium hover:underline">{c.code}{c.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}</Link>,
                  formatDate(c.date),
                  c.supplierName ?? "—",
                  formatQuantity(c.quantity, p.unit),
                  formatMoney(c.unitCost),
                  formatMoney(c.landedUnitCost),
                ])}
              />
            </TabsContent>
            <TabsContent value="movements">
              <HistoryTable
                empty="Nenhuma movimentação."
                head={["Quando", "Tipo", "Qtd.", "Valor", "Saldo", "Por"]}
                rows={p.movements.map(({ m, userName }) => [
                  <span key="d" title={formatDateTime(m.occurredAt, ctx.timezone)}>{formatDate(m.movementDate)}</span>,
                  <span key="t">{MOVEMENT_LABELS[m.type]}{m.notes && <span className="block text-xs text-muted-foreground">{m.notes}</span>}</span>,
                  `${Number(m.quantityDelta) > 0 ? "+" : ""}${formatQuantity(m.quantityDelta, p.unit)}`,
                  <SignedMoney key="v" value={m.valueDelta} />,
                  `${formatQuantity(m.quantityAfter, p.unit)} · ${formatMoney(m.valueAfter)}`,
                  userName ?? "—",
                ])}
              />
            </TabsContent>
          </Tabs>
          {p.notes && <p className="text-sm text-muted-foreground">Observações: {p.notes}</p>}
        </div>
      </div>
    </>
  );
}

function HistoryTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader><TableRow>{head.map((h, i) => <TableHead key={h} className={i >= 2 ? "text-right" : undefined}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j >= 2 ? "tabular text-right" : undefined}>{c}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
