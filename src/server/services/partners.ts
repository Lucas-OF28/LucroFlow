import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { average, dec } from "@/lib/finance";
import { todayIn } from "@/lib/dates";
import { customerSchema, pagination, supplierSchema } from "@/lib/validations";
import { customers, purchases, sales, suppliers } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { notFound } from "../errors";
import { assertCan, audit, likePattern, pageOf, parse, ref } from "./_base";

// ─── Fornecedores ───────────────────────────────────────────────────────────

export async function createSupplier(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(supplierSchema, input);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.insert(suppliers).values({ businessId: ctx.businessId, ...data, email: data.email ?? null, createdBy: ctx.userId })
      .returning({ id: suppliers.id, name: suppliers.name });
    await audit(tx, ctx, { action: "supplier.created", entityType: "supplier", entityId: row.id, summary: `Fornecedor ${data.name} cadastrado` });
    return row;
  });
}

export async function updateSupplier(ctx: TenantContext, id: string, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(supplierSchema, input);
  return withTenant(ctx, async (tx) => {
    const r = await tx.update(suppliers).set({ ...data, email: data.email ?? null })
      .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, id))).returning({ id: suppliers.id });
    if (r.length === 0) throw notFound("Fornecedor");
  });
}

const supplierStats = {
  purchaseCount: sql<number>`(select count(*)::int from purchases p where p.supplier_id = ${ref(suppliers.id)} and p.status = 'CONFIRMED')`,
  totalPurchased: sql<string>`(select coalesce(sum(p.total), 0) from purchases p where p.supplier_id = ${ref(suppliers.id)} and p.status = 'CONFIRMED')`,
  lastPurchase: sql<string | null>`(select max(p.purchase_date) from purchases p where p.supplier_id = ${ref(suppliers.id)} and p.status = 'CONFIRMED')`,
  productCount: sql<number>`(select count(distinct pi.product_id)::int from purchase_items pi join purchases p on p.id = pi.purchase_id where p.supplier_id = ${ref(suppliers.id)} and p.status = 'CONFIRMED')`,
};

export async function listSuppliers(ctx: TenantContext, opts: { page?: number; pageSize?: number; q?: string } = {}) {
  const { page, pageSize } = pagination.parse(opts);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(suppliers.businessId, ctx.businessId),
      isNull(suppliers.archivedAt),
      opts.q ? or(ilike(suppliers.name, likePattern(opts.q)), ilike(suppliers.companyName, likePattern(opts.q)), ilike(suppliers.document, likePattern(opts.q))) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(suppliers).where(where);
    const rows = await tx.select({ id: suppliers.id, name: suppliers.name, companyName: suppliers.companyName, phone: suppliers.phone, whatsapp: suppliers.whatsapp, email: suppliers.email, ...supplierStats })
      .from(suppliers).where(where).orderBy(asc(suppliers.name)).limit(pageSize).offset((page - 1) * pageSize);
    return pageOf(rows, total, page, pageSize);
  });
}

export async function listSupplierOptions(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers)
      .where(and(eq(suppliers.businessId, ctx.businessId), isNull(suppliers.archivedAt))).orderBy(asc(suppliers.name)).limit(500),
  );
}

export async function getSupplier(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [s] = await tx.select({ supplier: suppliers, ...supplierStats }).from(suppliers)
      .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, id)));
    if (!s) return null;
    const recent = await tx.select({ id: purchases.id, code: purchases.code, date: purchases.purchaseDate, total: purchases.total, status: purchases.status })
      .from(purchases).where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.supplierId, id)))
      .orderBy(desc(purchases.purchaseDate), desc(purchases.number)).limit(20);
    const productsBought = await tx.execute<{ product_id: string; name: string; quantity: string; avg_unit_cost: string; last_date: string }>(sql`
      select pi.product_id, pr.name, sum(pi.quantity) as quantity,
        round(sum(pi.landed_total) / nullif(sum(pi.quantity), 0), 2) as avg_unit_cost,
        max(p.purchase_date) as last_date
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id
      join products pr on pr.id = pi.product_id
      where p.business_id = ${ctx.businessId} and p.supplier_id = ${id} and p.status = 'CONFIRMED'
      group by pi.product_id, pr.name order by sum(pi.landed_total) desc limit 50`);
    return {
      ...s.supplier,
      purchaseCount: s.purchaseCount,
      totalPurchased: s.totalPurchased,
      lastPurchase: s.lastPurchase,
      productCount: s.productCount,
      averagePurchase: average(s.totalPurchased, s.purchaseCount)?.toFixed(2) ?? null,
      recent,
      productsBought,
    };
  });
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export async function createCustomer(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(customerSchema, input);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.insert(customers).values({ businessId: ctx.businessId, ...data, email: data.email ?? null, createdBy: ctx.userId })
      .returning({ id: customers.id, name: customers.name });
    await audit(tx, ctx, { action: "customer.created", entityType: "customer", entityId: row.id, summary: `Cliente ${data.name} cadastrado` });
    return row;
  });
}

export async function updateCustomer(ctx: TenantContext, id: string, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(customerSchema, input);
  return withTenant(ctx, async (tx) => {
    const r = await tx.update(customers).set({ ...data, email: data.email ?? null })
      .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, id))).returning({ id: customers.id });
    if (r.length === 0) throw notFound("Cliente");
  });
}

function customerStats(today: string) {
  return {
    saleCount: sql<number>`(select count(*)::int from sales s where s.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED')`,
    totalBought: sql<string>`(select coalesce(sum(s.total_revenue), 0) from sales s where s.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED')
      - (select coalesce(sum(r.refund_total), 0) from returns r join sales s on s.id = r.sale_id where s.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED')`,
    lastPurchase: sql<string | null>`(select max(s.sale_date) from sales s where s.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED')`,
    pending: sql<string>`(select coalesce(sum(ar.amount - ar.amount_paid - ar.amount_cancelled), 0) from accounts_receivable ar join sales s on s.id = ar.sale_id where ar.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED' and ar.status in ('PENDING','PARTIAL'))`,
    overdue: sql<string>`(select coalesce(sum(ar.amount - ar.amount_paid - ar.amount_cancelled), 0) from accounts_receivable ar join sales s on s.id = ar.sale_id where ar.customer_id = ${ref(customers.id)} and s.status = 'CONFIRMED' and ar.status in ('PENDING','PARTIAL') and ar.due_date < ${today})`,
  };
}

export async function listCustomers(ctx: TenantContext, opts: { page?: number; pageSize?: number; q?: string } = {}) {
  const { page, pageSize } = pagination.parse(opts);
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(customers.businessId, ctx.businessId),
      isNull(customers.archivedAt),
      opts.q ? or(ilike(customers.name, likePattern(opts.q)), ilike(customers.phone, likePattern(opts.q)), ilike(customers.whatsapp, likePattern(opts.q)), ilike(customers.document, likePattern(opts.q)), ilike(customers.email, likePattern(opts.q))) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(customers).where(where);
    const rows = await tx.select({ id: customers.id, name: customers.name, phone: customers.phone, whatsapp: customers.whatsapp, email: customers.email, ...customerStats(today) })
      .from(customers).where(where).orderBy(asc(customers.name)).limit(pageSize).offset((page - 1) * pageSize);
    return pageOf(rows.map((r) => ({ ...r, averageTicket: average(r.totalBought, r.saleCount)?.toFixed(2) ?? null })), total, page, pageSize);
  });
}

export async function searchCustomersForSelector(ctx: TenantContext, q: string) {
  return withTenant(ctx, (tx) =>
    tx.select({ id: customers.id, name: customers.name, phone: customers.whatsapp })
      .from(customers)
      .where(and(
        eq(customers.businessId, ctx.businessId),
        isNull(customers.archivedAt),
        q.trim() ? or(ilike(customers.name, likePattern(q.trim())), ilike(customers.whatsapp, likePattern(q.trim())), ilike(customers.phone, likePattern(q.trim()))) : undefined,
      ))
      .orderBy(asc(customers.name)).limit(20),
  );
}

export async function getCustomer(ctx: TenantContext, id: string) {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [c] = await tx.select({ customer: customers, ...customerStats(today) }).from(customers)
      .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, id)));
    if (!c) return null;
    const recent = await tx.select({ id: sales.id, code: sales.code, date: sales.saleDate, total: sales.totalRevenue, netProfit: sales.netProfit, status: sales.status })
      .from(sales).where(and(eq(sales.businessId, ctx.businessId), eq(sales.customerId, id)))
      .orderBy(desc(sales.saleDate), desc(sales.number)).limit(20);
    return {
      ...c.customer,
      saleCount: c.saleCount,
      totalBought: dec(c.totalBought).toFixed(2),
      lastPurchase: c.lastPurchase,
      pending: c.pending,
      overdue: c.overdue,
      averageTicket: average(c.totalBought, c.saleCount)?.toFixed(2) ?? null,
      recent,
    };
  });
}
