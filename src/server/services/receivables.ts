import "server-only";
import { and, asc, count, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { dec, money, moneyToDb, openAmount, receivableStatus } from "@/lib/finance";
import { addDays, todayIn } from "@/lib/dates";
import { pagination, receivePaymentSchema } from "@/lib/validations";
import { accountsReceivable, customers, payments, sales } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, likePattern, pageOf, parse } from "./_base";

/** Registra um recebimento (total ou parcial) de uma parcela. */
export async function receivePayment(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(receivePaymentSchema, input);
  const paidOn = data.paidOn ?? todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ rec: accountsReceivable, saleStatus: sales.status, saleCode: sales.code, saleDate: sales.saleDate })
      .from(accountsReceivable)
      .innerJoin(sales, eq(sales.id, accountsReceivable.saleId))
      .where(and(eq(accountsReceivable.businessId, ctx.businessId), eq(accountsReceivable.id, data.receivableId)))
      .for("update", { of: accountsReceivable });
    if (!row) throw notFound("Parcela");
    if (row.saleStatus !== "CONFIRMED") throw new AppError("CONFLICT", "A venda desta parcela foi cancelada.");
    if (paidOn < row.saleDate) throw new AppError("VALIDATION", "O pagamento não pode ser anterior à venda.");

    const open = openAmount(row.rec);
    const amount = money(data.amount);
    if (open.lessThanOrEqualTo(0)) throw new AppError("CONFLICT", "Esta parcela já está quitada.");
    if (amount.greaterThan(open)) {
      throw new AppError("VALIDATION", `Valor maior que o saldo da parcela (R$ ${open.toFixed(2).replace(".", ",")}).`);
    }

    const amountPaid = dec(row.rec.amountPaid).plus(amount);
    const status = receivableStatus({ amount: row.rec.amount, amountPaid, amountCancelled: row.rec.amountCancelled });
    await tx.update(accountsReceivable)
      .set({ amountPaid: moneyToDb(amountPaid), status })
      .where(eq(accountsReceivable.id, row.rec.id));
    await tx.insert(payments).values({
      businessId: ctx.businessId,
      direction: "IN",
      kind: "SALE_RECEIPT",
      saleId: row.rec.saleId,
      receivableId: row.rec.id,
      amount: moneyToDb(amount),
      method: data.method,
      paidOn,
      notes: data.notes,
      createdBy: ctx.userId,
    });
    await audit(tx, ctx, {
      action: "receivable.paid",
      entityType: "sale",
      entityId: row.rec.saleId,
      summary: `Recebimento de ${amount.toFixed(2)} na venda ${row.saleCode} (parcela ${row.rec.installmentNumber})`,
      metadata: { receivableId: row.rec.id, amount: amount.toFixed(2), status },
    });
    return { status, open: open.minus(amount).toFixed(2) };
  });
}

export type ReceivableFilter = "open" | "overdue" | "due_soon" | "paid" | "all";

export async function listReceivables(
  ctx: TenantContext,
  opts: { page?: number; pageSize?: number; filter?: ReceivableFilter; q?: string; customerId?: string } = {},
) {
  const { page, pageSize } = pagination.parse(opts);
  const today = todayIn(ctx.timezone);
  const filter = opts.filter ?? "open";
  return withTenant(ctx, async (tx) => {
    const isOpen = inArray(accountsReceivable.status, ["PENDING", "PARTIAL"]);
    const where = and(
      eq(accountsReceivable.businessId, ctx.businessId),
      eq(sales.status, "CONFIRMED"),
      filter === "open" ? isOpen : undefined,
      filter === "overdue" ? and(isOpen, lt(accountsReceivable.dueDate, today)) : undefined,
      filter === "due_soon" ? and(isOpen, gte(accountsReceivable.dueDate, today), lte(accountsReceivable.dueDate, addDays(today, 7))) : undefined,
      filter === "paid" ? eq(accountsReceivable.status, "PAID") : undefined,
      opts.customerId ? eq(accountsReceivable.customerId, opts.customerId) : undefined,
      opts.q ? or(ilike(sales.code, likePattern(opts.q)), ilike(customers.name, likePattern(opts.q))) : undefined,
    );
    const base = tx.select({ total: count() }).from(accountsReceivable)
      .innerJoin(sales, eq(sales.id, accountsReceivable.saleId))
      .leftJoin(customers, eq(customers.id, accountsReceivable.customerId));
    const [{ total }] = await base.where(where);
    const rows = await tx
      .select({
        id: accountsReceivable.id,
        saleId: sales.id,
        saleCode: sales.code,
        saleDate: sales.saleDate,
        customerName: customers.name,
        customerPhone: customers.whatsapp,
        installmentNumber: accountsReceivable.installmentNumber,
        dueDate: accountsReceivable.dueDate,
        amount: accountsReceivable.amount,
        amountPaid: accountsReceivable.amountPaid,
        amountCancelled: accountsReceivable.amountCancelled,
        status: accountsReceivable.status,
        expectedMethod: accountsReceivable.expectedMethod,
      })
      .from(accountsReceivable)
      .innerJoin(sales, eq(sales.id, accountsReceivable.saleId))
      .leftJoin(customers, eq(customers.id, accountsReceivable.customerId))
      .where(where)
      .orderBy(asc(accountsReceivable.dueDate), asc(sales.number))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return pageOf(
      rows.map((r) => ({
        ...r,
        open: openAmount(r).toFixed(2),
        overdue: (r.status === "PENDING" || r.status === "PARTIAL") && r.dueDate < today,
      })),
      total,
      page,
      pageSize,
    );
  });
}

/** Totais de contas a receber (situação atual, não depende de período). */
export async function receivablesSummary(ctx: TenantContext) {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [r] = await tx
      .select({
        open: sql<string>`coalesce(sum(${accountsReceivable.amount} - ${accountsReceivable.amountPaid} - ${accountsReceivable.amountCancelled}), 0)`,
        overdue: sql<string>`coalesce(sum(case when ${accountsReceivable.dueDate} < ${today} then ${accountsReceivable.amount} - ${accountsReceivable.amountPaid} - ${accountsReceivable.amountCancelled} else 0 end), 0)`,
        dueSoon: sql<string>`coalesce(sum(case when ${accountsReceivable.dueDate} between ${today} and ${addDays(today, 7)} then ${accountsReceivable.amount} - ${accountsReceivable.amountPaid} - ${accountsReceivable.amountCancelled} else 0 end), 0)`,
        overdueCount: sql<number>`count(*) filter (where ${accountsReceivable.dueDate} < ${today})::int`,
        openCount: sql<number>`count(*)::int`,
      })
      .from(accountsReceivable)
      .innerJoin(sales, eq(sales.id, accountsReceivable.saleId))
      .where(and(
        eq(accountsReceivable.businessId, ctx.businessId),
        eq(sales.status, "CONFIRMED"),
        inArray(accountsReceivable.status, ["PENDING", "PARTIAL"]),
      ));
    return r;
  });
}
