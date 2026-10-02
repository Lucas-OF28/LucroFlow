import "server-only";
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, sql } from "drizzle-orm";
import { moneyToDb } from "@/lib/finance";
import { todayIn } from "@/lib/dates";
import { expenseCategorySchema, expenseSchema, pagination } from "@/lib/validations";
import { expenseCategories, expenses } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, likePattern, pageOf, parse } from "./_base";

export async function listExpenseCategories(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx.select({ id: expenseCategories.id, name: expenseCategories.name })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.businessId, ctx.businessId), isNull(expenseCategories.archivedAt)))
      .orderBy(asc(expenseCategories.name)),
  );
}

export async function createExpenseCategory(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(expenseCategorySchema, input);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.insert(expenseCategories).values({ businessId: ctx.businessId, name: data.name })
      .onConflictDoNothing().returning({ id: expenseCategories.id });
    if (!row) throw new AppError("CONFLICT", "Já existe uma categoria com esse nome.");
    return row;
  });
}

export async function createExpense(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(expenseSchema, input);
  const expenseDate = data.expenseDate ?? todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [cat] = await tx.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories)
      .where(and(eq(expenseCategories.businessId, ctx.businessId), eq(expenseCategories.id, data.categoryId)));
    if (!cat) throw notFound("Categoria de despesa");
    const [row] = await tx.insert(expenses).values({
      businessId: ctx.businessId,
      categoryId: data.categoryId,
      description: data.description,
      amount: moneyToDb(data.amount),
      expenseDate,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes,
      createdBy: ctx.userId,
    }).returning({ id: expenses.id });
    await audit(tx, ctx, {
      action: "expense.created",
      entityType: "expense",
      entityId: row.id,
      summary: `Despesa registrada: ${data.description} (${cat.name}) — ${data.amount}`,
      metadata: { amount: data.amount, expenseDate },
    });
    return row;
  });
}

/** Despesas nunca são apagadas: são canceladas (saem dos indicadores, ficam no histórico). */
export async function cancelExpense(ctx: TenantContext, expenseId: string) {
  assertCan(ctx, "cancel");
  return withTenant(ctx, async (tx) => {
    const [e] = await tx.select().from(expenses)
      .where(and(eq(expenses.businessId, ctx.businessId), eq(expenses.id, expenseId))).for("update");
    if (!e) throw notFound("Despesa");
    if (e.cancelledAt) throw new AppError("CONFLICT", "Esta despesa já foi cancelada.");
    await tx.update(expenses).set({ cancelledAt: sql`now()`, cancelledBy: ctx.userId }).where(eq(expenses.id, expenseId));
    await audit(tx, ctx, {
      action: "expense.cancelled",
      entityType: "expense",
      entityId: expenseId,
      summary: `Despesa cancelada: ${e.description} — ${e.amount}`,
    });
  });
}

export async function listExpenses(
  ctx: TenantContext,
  opts: { page?: number; pageSize?: number; from?: string; to?: string; categoryId?: string; q?: string; includeCancelled?: boolean } = {},
) {
  const { page, pageSize } = pagination.parse(opts);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(expenses.businessId, ctx.businessId),
      opts.from ? gte(expenses.expenseDate, opts.from) : undefined,
      opts.to ? lte(expenses.expenseDate, opts.to) : undefined,
      opts.categoryId ? eq(expenses.categoryId, opts.categoryId) : undefined,
      opts.includeCancelled ? undefined : isNull(expenses.cancelledAt),
      opts.q ? ilike(expenses.description, likePattern(opts.q)) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(expenses).where(where);
    const [{ amount }] = await tx.select({ amount: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.cancelledAt} is null), 0)` }).from(expenses).where(where);
    const rows = await tx
      .select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        paymentMethod: expenses.paymentMethod,
        categoryName: expenseCategories.name,
        cancelledAt: expenses.cancelledAt,
        notes: expenses.notes,
      })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { ...pageOf(rows, total, page, pageSize), totalAmount: amount };
  });
}
