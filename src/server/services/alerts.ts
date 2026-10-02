import "server-only";
import { sql } from "drizzle-orm";
import { addDays, todayIn } from "@/lib/dates";
import { type TenantContext, withTenant } from "../db/tenant";
import { businessSettings } from "./_base";

export type AlertKind = "LOW_STOCK" | "OUT_OF_STOCK" | "OVERDUE" | "DUE_SOON" | "STALE_PRODUCT" | "NEGATIVE_MARGIN" | "LOSS_SALE";

export interface Alert {
  kind: AlertKind;
  severity: "info" | "warning" | "critical";
  title: string;
  href: string;
  count: number;
}

/**
 * Alertas internos calculados sob demanda (estrutura pronta para virar notificações push no futuro).
 */
export async function getAlerts(ctx: TenantContext): Promise<Alert[]> {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const b = await businessSettings(tx, ctx);
    const staleSince = addDays(today, -b.staleDays);
    const [r] = await tx.execute<Record<string, number>>(sql`
      select
        (select count(*)::int from products where business_id = ${ctx.businessId} and archived_at is null and status = 'ACTIVE'
           and min_stock > 0 and stock_quantity <= min_stock and stock_quantity > 0) as low_stock,
        (select count(*)::int from products where business_id = ${ctx.businessId} and archived_at is null and status = 'ACTIVE'
           and min_stock > 0 and stock_quantity = 0) as out_of_stock,
        (select count(*)::int from accounts_receivable ar join sales s on s.id = ar.sale_id
           where ar.business_id = ${ctx.businessId} and s.status = 'CONFIRMED' and ar.status in ('PENDING','PARTIAL') and ar.due_date < ${today}) as overdue,
        (select count(*)::int from accounts_receivable ar join sales s on s.id = ar.sale_id
           where ar.business_id = ${ctx.businessId} and s.status = 'CONFIRMED' and ar.status in ('PENDING','PARTIAL')
           and ar.due_date between ${today} and ${addDays(today, 7)}) as due_soon,
        (select count(*)::int from products p where p.business_id = ${ctx.businessId} and p.archived_at is null and p.stock_quantity > 0
           and coalesce((select max(m.movement_date) from inventory_movements m where m.product_id = p.id and m.type = 'SALE'), '0001-01-01') < ${staleSince}
           and coalesce((select max(m.movement_date) from inventory_movements m where m.product_id = p.id and m.type in ('PURCHASE','ADJUSTMENT_IN')), '0001-01-01') < ${staleSince}) as stale,
        (select count(*)::int from products where business_id = ${ctx.businessId} and archived_at is null and stock_quantity > 0
           and reference_price is not null and reference_price < stock_value / stock_quantity) as negative_margin,
        (select count(*)::int from sales where business_id = ${ctx.businessId} and status = 'CONFIRMED' and net_profit < 0
           and sale_date >= ${addDays(today, -6)}) as loss_sales`);

    const alerts: Alert[] = [];
    const push = (count: number, a: Omit<Alert, "count">) => count > 0 && alerts.push({ ...a, count });
    push(r.overdue, { kind: "OVERDUE", severity: "critical", title: `${r.overdue} parcela(s) vencida(s)`, href: "/financeiro?filtro=overdue" });
    push(r.out_of_stock, { kind: "OUT_OF_STOCK", severity: "critical", title: `${r.out_of_stock} produto(s) sem estoque`, href: "/estoque?filtro=out" });
    push(r.low_stock, { kind: "LOW_STOCK", severity: "warning", title: `${r.low_stock} produto(s) com estoque baixo`, href: "/estoque?filtro=low" });
    push(r.negative_margin, { kind: "NEGATIVE_MARGIN", severity: "warning", title: `${r.negative_margin} produto(s) com preço de referência abaixo do custo`, href: "/estoque" });
    push(r.loss_sales, { kind: "LOSS_SALE", severity: "warning", title: `${r.loss_sales} venda(s) com prejuízo nos últimos 7 dias`, href: "/vendas?prejuizo=1" });
    push(r.due_soon, { kind: "DUE_SOON", severity: "info", title: `${r.due_soon} parcela(s) vencem nos próximos 7 dias`, href: "/financeiro?filtro=due_soon" });
    push(r.stale, { kind: "STALE_PRODUCT", severity: "info", title: `${r.stale} produto(s) parado(s) há mais de ${b.staleDays} dias`, href: "/estoque?filtro=stale" });
    return alerts;
  });
}
