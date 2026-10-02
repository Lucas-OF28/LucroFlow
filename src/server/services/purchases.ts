import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { PurchaseCalculationError, calculatePurchase, moneyToDb, quantityToDb, unitCostToDb, dec } from "@/lib/finance";
import { todayIn } from "@/lib/dates";
import { cancelSchema, pagination, purchaseSchema } from "@/lib/validations";
import { inventoryMovements, products, purchaseItems, purchases, suppliers } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, likePattern, nextDocumentNumber, pageOf, parse, ref } from "./_base";
import { lockProducts, postMovements } from "./inventory-ledger";

/**
 * Registra uma compra confirmada (transação única):
 * compra → itens com custo rateado → movimentações PURCHASE → saldo e custo médio dos produtos → auditoria.
 */
export async function createPurchase(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(purchaseSchema, input);
  const purchaseDate = data.purchaseDate ?? todayIn(ctx.timezone);

  let calc;
  try {
    calc = calculatePurchase(data);
  } catch (e) {
    if (e instanceof PurchaseCalculationError) throw new AppError("VALIDATION", e.message);
    throw e;
  }

  return withTenant(ctx, async (tx) => {
    if (data.supplierId) {
      const [s] = await tx.select({ id: suppliers.id }).from(suppliers)
        .where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, data.supplierId)));
      if (!s) throw notFound("Fornecedor");
    }

    const locked = await lockProducts(tx, ctx.businessId, calc.items.map((i) => i.productId));
    for (const p of locked.values()) {
      if (p.archivedAt) throw new AppError("VALIDATION", `O produto ${p.name} está arquivado.`);
    }

    const { number, code } = await nextDocumentNumber(tx, ctx.businessId, "PURCHASE");
    const [purchase] = await tx.insert(purchases).values({
      businessId: ctx.businessId,
      number,
      code,
      supplierId: data.supplierId,
      purchaseDate,
      reference: data.reference,
      paymentMethod: data.paymentMethod ?? null,
      itemsSubtotal: moneyToDb(calc.itemsSubtotal),
      itemsDiscount: moneyToDb(calc.itemsDiscount),
      itemsAdditionalCosts: moneyToDb(calc.itemsAdditionalCosts),
      freight: moneyToDb(calc.freight),
      taxes: moneyToDb(calc.taxes),
      otherCosts: moneyToDb(calc.otherCosts),
      discount: moneyToDb(calc.discount),
      total: moneyToDb(calc.total),
      notes: data.notes,
      createdBy: ctx.userId,
    }).returning({ id: purchases.id });

    const items = await tx.insert(purchaseItems).values(
      calc.items.map((i, position) => ({
        businessId: ctx.businessId,
        purchaseId: purchase.id,
        productId: i.productId,
        quantity: quantityToDb(i.quantity),
        unitCost: moneyToDb(i.unitCost),
        subtotal: moneyToDb(i.subtotal),
        discount: moneyToDb(i.discount),
        additionalCosts: moneyToDb(i.additionalCosts),
        allocatedCosts: moneyToDb(i.allocatedCosts),
        allocatedDiscount: moneyToDb(i.allocatedDiscount),
        landedTotal: moneyToDb(i.landedTotal),
        landedUnitCost: unitCostToDb(i.landedUnitCost),
        position,
      })),
    ).returning({ id: purchaseItems.id, position: purchaseItems.position });

    const byPosition = new Map(items.map((r) => [r.position, r.id]));
    await postMovements(tx, ctx, locked, calc.items.map((i, position) => ({
      productId: i.productId,
      type: "PURCHASE",
      quantityDelta: i.quantity,
      valueDelta: i.landedTotal,
      movementDate: purchaseDate,
      referenceType: "PURCHASE",
      referenceId: purchase.id,
      referenceItemId: byPosition.get(position),
    })));

    await audit(tx, ctx, {
      action: "purchase.created",
      entityType: "purchase",
      entityId: purchase.id,
      summary: `Compra ${code} registrada — ${calc.items.length} item(ns), total ${calc.total.toFixed(2)}`,
      metadata: { code, total: calc.total.toFixed(2), items: calc.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toFixed(3), landedTotal: i.landedTotal.toFixed(2) })) },
    });

    return { id: purchase.id, code, total: calc.total.toFixed(2) };
  });
}

/**
 * Cancela uma compra. Permitido somente se nenhum produto teve SAÍDA depois desta compra
 * (senão o custo médio já foi consumido por vendas — usar ajuste de estoque). Ver ARQUITETURA R6.
 */
export async function cancelPurchase(ctx: TenantContext, purchaseId: string, input: unknown) {
  assertCan(ctx, "cancel");
  const data = parse(cancelSchema, input);
  return withTenant(ctx, async (tx) => {
    const [purchase] = await tx.select().from(purchases)
      .where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.id, purchaseId)))
      .for("update");
    if (!purchase) throw notFound("Compra");
    if (purchase.status === "CANCELLED") throw new AppError("CONFLICT", "Esta compra já foi cancelada.");

    const items = await tx.select().from(purchaseItems)
      .where(and(eq(purchaseItems.businessId, ctx.businessId), eq(purchaseItems.purchaseId, purchaseId)))
      .orderBy(asc(purchaseItems.position));
    const locked = await lockProducts(tx, ctx.businessId, items.map((i) => i.productId));

    const blocked = await tx.execute<{ name: string }>(sql`
      select distinct p.name
      from inventory_movements pm
      join inventory_movements later on later.product_id = pm.product_id
        and later.business_id = pm.business_id
        and later.occurred_at > pm.occurred_at
        and (later.quantity_delta < 0 or later.type = 'COST_ADJUSTMENT')
      join products p on p.id = pm.product_id
      where pm.business_id = ${ctx.businessId} and pm.reference_type = 'PURCHASE'
        and pm.reference_id = ${purchaseId} and pm.type = 'PURCHASE'`);
    if (blocked.length > 0) {
      throw new AppError(
        "CONFLICT",
        `Não é possível cancelar: ${blocked.map((b) => b.name).join(", ")} já teve saídas depois desta compra. Use um ajuste de estoque.`,
      );
    }

    const today = todayIn(ctx.timezone);
    // Simula o saldo linha a linha (a mesma compra pode ter o produto repetido).
    const sim = new Map([...locked].map(([id, p]) => [id, { ...p.state }]));
    await postMovements(tx, ctx, locked, items.map((i) => {
      const s = sim.get(i.productId)!;
      const qty = dec(i.quantity);
      // Se o estoque zera, remove o valor inteiro restante (pool não pode ficar com valor sem quantidade).
      const value = s.quantity.minus(qty).isZero() ? s.value : dec(i.landedTotal);
      s.quantity = s.quantity.minus(qty);
      s.value = s.value.minus(value);
      return {
        productId: i.productId,
        type: "PURCHASE_CANCEL" as const,
        quantityDelta: qty.negated(),
        valueDelta: value.negated(),
        movementDate: today,
        referenceType: "PURCHASE" as const,
        referenceId: purchaseId,
        referenceItemId: i.id,
        notes: data.reason,
      };
    }));

    await tx.update(purchases).set({
      status: "CANCELLED",
      cancelledAt: sql`now()`,
      cancelledBy: ctx.userId,
      cancelReason: data.reason,
    }).where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.id, purchaseId)));

    await audit(tx, ctx, {
      action: "purchase.cancelled",
      entityType: "purchase",
      entityId: purchaseId,
      summary: `Compra ${purchase.code} cancelada — ${data.reason}`,
      metadata: { total: purchase.total },
    });
  });
}

export async function listPurchases(
  ctx: TenantContext,
  opts: { page?: number; pageSize?: number; q?: string; from?: string; to?: string; supplierId?: string; status?: "CONFIRMED" | "CANCELLED" } = {},
) {
  const { page, pageSize } = pagination.parse(opts);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(purchases.businessId, ctx.businessId),
      opts.from ? gte(purchases.purchaseDate, opts.from) : undefined,
      opts.to ? lte(purchases.purchaseDate, opts.to) : undefined,
      opts.supplierId ? eq(purchases.supplierId, opts.supplierId) : undefined,
      opts.status ? eq(purchases.status, opts.status) : undefined,
      opts.q ? or(ilike(purchases.code, likePattern(opts.q)), ilike(purchases.reference, likePattern(opts.q)), ilike(suppliers.name, likePattern(opts.q))) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(purchases).leftJoin(suppliers, eq(suppliers.id, purchases.supplierId)).where(where);
    const rows = await tx
      .select({
        id: purchases.id,
        code: purchases.code,
        purchaseDate: purchases.purchaseDate,
        supplierName: suppliers.name,
        total: purchases.total,
        status: purchases.status,
        reference: purchases.reference,
        itemCount: sql<number>`(select count(*)::int from purchase_items pi where pi.purchase_id = ${ref(purchases.id)})`,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where)
      .orderBy(desc(purchases.purchaseDate), desc(purchases.number))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return pageOf(rows, total, page, pageSize);
  });
}

export async function getPurchase(ctx: TenantContext, purchaseId: string) {
  return withTenant(ctx, async (tx) => {
    const [purchase] = await tx
      .select({ purchase: purchases, supplierName: suppliers.name })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.id, purchaseId)));
    if (!purchase) return null;
    const items = await tx
      .select({ item: purchaseItems, productName: products.name, productUnit: products.unit, sku: products.sku })
      .from(purchaseItems)
      .innerJoin(products, eq(products.id, purchaseItems.productId))
      .where(and(eq(purchaseItems.businessId, ctx.businessId), eq(purchaseItems.purchaseId, purchaseId)))
      .orderBy(asc(purchaseItems.position));
    const movements = await tx.select().from(inventoryMovements)
      .where(and(eq(inventoryMovements.businessId, ctx.businessId), eq(inventoryMovements.referenceType, "PURCHASE"), eq(inventoryMovements.referenceId, purchaseId)))
      .orderBy(asc(inventoryMovements.occurredAt));
    return { ...purchase.purchase, supplierName: purchase.supplierName, items, movements };
  });
}
