import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLogs, users } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { likePattern, pageOf } from "./_base";
import { pagination } from "@/lib/validations";

export interface SearchHit {
  type: "product" | "customer" | "supplier" | "sale" | "purchase";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/** Pesquisa global (produtos, clientes, fornecedores, vendas e compras), limitada e paginada por tipo. */
export async function globalSearch(ctx: TenantContext, q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const p = likePattern(term);
  return withTenant(ctx, async (tx) => {
    const rows = await tx.execute<{ type: SearchHit["type"]; id: string; title: string; subtitle: string | null }>(sql`
      (select 'product' as type, id, name as title, coalesce(sku, barcode) as subtitle from products
        where business_id = ${ctx.businessId} and archived_at is null and (name ilike ${p} or sku ilike ${p} or barcode = ${term}) order by name limit 8)
      union all
      (select 'customer', id, name, coalesce(whatsapp, phone, email) from customers
        where business_id = ${ctx.businessId} and archived_at is null and (name ilike ${p} or whatsapp ilike ${p} or phone ilike ${p} or email ilike ${p} or document ilike ${p}) order by name limit 5)
      union all
      (select 'supplier', id, name, company_name from suppliers
        where business_id = ${ctx.businessId} and archived_at is null and (name ilike ${p} or company_name ilike ${p} or document ilike ${p}) order by name limit 5)
      union all
      (select 'sale', s.id, s.code, coalesce(c.name, 'Venda sem cliente') from sales s left join customers c on c.id = s.customer_id
        where s.business_id = ${ctx.businessId} and (s.code ilike ${p} or c.name ilike ${p}) order by s.sale_date desc limit 5)
      union all
      (select 'purchase', pu.id, pu.code, coalesce(su.name, pu.reference) from purchases pu left join suppliers su on su.id = pu.supplier_id
        where pu.business_id = ${ctx.businessId} and (pu.code ilike ${p} or pu.reference ilike ${p} or su.name ilike ${p}) order by pu.purchase_date desc limit 5)
    `);
    const href = { product: "/produtos", customer: "/clientes", supplier: "/fornecedores", sale: "/vendas", purchase: "/compras" } as const;
    return rows.map((r) => ({ ...r, href: `${href[r.type]}/${r.id}` }));
  });
}

/** Histórico/auditoria paginado. */
export async function listAuditLogs(ctx: TenantContext, opts: { page?: number; pageSize?: number; entityType?: string } = {}) {
  const { page, pageSize } = pagination.parse(opts);
  return withTenant(ctx, async (tx) => {
    const where = and(eq(auditLogs.businessId, ctx.businessId), opts.entityType ? eq(auditLogs.entityType, opts.entityType) : undefined);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        createdAt: auditLogs.createdAt,
        userName: sql<string | null>`coalesce(${users.fullName}, ${users.email})`,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return pageOf(rows, total, page, pageSize);
  });
}
