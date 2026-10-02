import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getSupplier } from "@/server/services/partners";

export const metadata: Metadata = { title: "Fornecedor" };

export default async function SupplierPage({ params }: PageProps<"/fornecedores/[id]">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const s = await getSupplier(ctx, id);
  if (!s) notFound();
  return (
    <>
      <PageHeader
        title={s.name}
        description={[s.companyName, s.whatsapp && `WhatsApp ${s.whatsapp}`, s.phone, s.email, s.document].filter(Boolean).join(" · ") || undefined}
        back={{ href: "/fornecedores", label: "Fornecedores" }}
        actions={can(ctx.role, "write") ? (
          <PartnerDialog kind="supplier" id={s.id} initial={{ name: s.name, companyName: s.companyName ?? "", phone: s.phone ?? "", whatsapp: s.whatsapp ?? "", email: s.email ?? "", document: s.document ?? "", notes: s.notes ?? "" }} />
        ) : undefined}
      />
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Compras" value={s.purchaseCount} />
        <MetricCard label="Produtos" value={s.productCount} />
        <MetricCard label="Total comprado" value={formatMoney(s.totalPurchased)} />
        <MetricCard label="Compra média" value={formatMoney(s.averagePurchase)} />
        <MetricCard label="Última compra" value={formatDate(s.lastPurchase)} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Produtos comprados (preço médio)</CardTitle></CardHeader>
          <CardContent>
            {s.productsBought.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Custo médio</TableHead></TableRow></TableHeader>
                <TableBody>
                  {s.productsBought.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell><Link href={`/produtos/${p.product_id}`} className="hover:underline">{p.name}</Link></TableCell>
                      <TableCell className="tabular text-right">{formatQuantity(p.quantity)}</TableCell>
                      <TableCell className="tabular text-right">{formatMoney(p.avg_unit_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Compras recentes</CardTitle></CardHeader>
          <CardContent>
            {s.recent.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Compra</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {s.recent.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><Link href={`/compras/${p.id}`} className="font-medium hover:underline">{p.code}</Link>{p.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}</TableCell>
                      <TableCell>{formatDate(p.date)}</TableCell>
                      <TableCell className="tabular text-right">{formatMoney(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
