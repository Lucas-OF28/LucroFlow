import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { SignedMoney } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getCustomer } from "@/server/services/partners";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: PageProps<"/clientes/[id]">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const c = await getCustomer(ctx, id);
  if (!c) notFound();
  const wa = c.whatsapp?.replace(/\D/g, "");
  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.whatsapp && `WhatsApp ${c.whatsapp}`, c.phone, c.email, c.document].filter(Boolean).join(" · ") || undefined}
        back={{ href: "/clientes", label: "Clientes" }}
        actions={
          <>
            {wa && <Button variant="outline" asChild><a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>}
            {can(ctx.role, "write") && (
              <PartnerDialog kind="customer" id={c.id} initial={{ name: c.name, phone: c.phone ?? "", whatsapp: c.whatsapp ?? "", email: c.email ?? "", document: c.document ?? "", notes: c.notes ?? "" }} />
            )}
          </>
        }
      />
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Compras" value={c.saleCount} />
        <MetricCard label="Total comprado" value={formatMoney(c.totalBought)} />
        <MetricCard label="Ticket médio" value={formatMoney(c.averageTicket)} />
        <MetricCard label="Última compra" value={formatDate(c.lastPurchase)} />
        <MetricCard label="Valores pendentes" value={formatMoney(c.pending)} tone={Number(c.overdue) > 0 ? "negative" : undefined} footer={Number(c.overdue) > 0 ? `${formatMoney(c.overdue)} vencido` : undefined} />
      </section>
      {c.notes && <p className="mb-4 text-sm text-muted-foreground">{c.notes}</p>}
      {c.recent.length > 0 && (
        <div className="rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Venda</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Lucro</TableHead></TableRow></TableHeader>
            <TableBody>
              {c.recent.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link href={`/vendas/${s.id}`} className="font-medium hover:underline">{s.code}</Link>{s.status === "CANCELLED" && <StatusBadge status="CANCELLED" className="ml-2" />}</TableCell>
                  <TableCell>{formatDate(s.date)}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(s.total)}</TableCell>
                  <TableCell className="text-right"><SignedMoney value={s.netProfit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
