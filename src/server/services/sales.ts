import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import {
  InsufficientStockError,
  SaleCalculationError,
  ZERO,
  calculateSale,
  dec,
  money,
  moneyToDb,
  quantityToDb,
  receivableStatus,
  salePaymentStatus,
  stockState,
  sum,
  unitCostToDb,
  type SaleCalc,
} from "@/lib/finance";
import { can } from "@/lib/permissions";
import { todayIn } from "@/lib/dates";
import { cancelSchema, pagination, saleSchema } from "@/lib/validations";
import type { Transaction } from "../db/client";
import {
  accountsReceivable,
  customers,
  inventoryMovements,
  payments,
  products,

  returns,
  saleItems,
  sales,
  users,
} from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, likePattern, nextDocumentNumber, pageOf, parse, ref } from "./_base";
import { type LockedProduct, lockProducts, postMovements } from "./inventory-ledger";

type SaleData = ReturnType<typeof saleSchema.parse>;

function runCalculation(data: SaleData, locked: Map<string, LockedProduct>): SaleCalc {
  try {
    return calculateSale(data, new Map([...locked].map(([id, p]) => [id, p.state])));
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      // identifica o produto: recalcula linha a linha para achar quem estourou
      const used = new Map<string, ReturnType<typeof dec>>();
      for (const it of data.items) {
        const total = (used.get(it.productId) ?? ZERO).plus(dec(it.quantity));
        used.set(it.productId, total);
        const p = locked.get(it.productId)!;
        if (total.greaterThan(p.state.quantity)) {
          throw new AppError("INSUFFICIENT_STOCK", `Estoque insuficiente de ${p.name}. Disponível: ${p.state.quantity.toFixed(p.unit === "un" ? 0 : 3)}.`, {
            productId: p.id,
            available: p.state.quantity.toFixed(3),
          });
        }
      }
      throw new AppError("INSUFFICIENT_STOCK", "Estoque insuficiente.");
    }
    if (e instanceof SaleCalculationError) throw new AppError("VALIDATION", e.message);
    throw e;
  }
}

function summarize(calc: SaleCalc) {
  return {
    totalRevenue: calc.totalRevenue.toFixed(2),
    totalCost: calc.totalCost.toFixed(2),
    grossProfit: calc.grossProfit.toFixed(2),
    saleCosts: calc.saleCosts.toFixed(2),
    netProfit: calc.netProfit.toFixed(2),
    marginPercent: calc.marginPercent?.toFixed(2) ?? null,
    roiPercent: calc.roiPercent?.toFixed(2) ?? null,
    items: calc.items.map((i) => ({
      productId: i.productId,
      netRevenue: i.netRevenue.toFixed(2),
      totalCost: i.totalCost.toFixed(2),
      grossProfit: i.grossProfit.toFixed(2),
    })),
  };
}

/**
 * Pré-visualização (sem gravar) para a tela de nova venda: lucro estimado e alerta de prejuízo.
 * NÃO é a validação definitiva — essa acontece em createSale, com lock.
 */
export async function previewSale(ctx: TenantContext, input: unknown) {
  const data = parse(saleSchema, { ...(input as object), payments: [] });
  return withTenant(ctx, async (tx) => {
    const ids = [...new Set(data.items.map((i) => i.productId))];
    const rows = await tx.select({
      id: products.id, name: products.name, unit: products.unit, status: products.status, archivedAt: products.archivedAt,
      minimumPrice: products.minimumPrice, stockQuantity: products.stockQuantity, stockValue: products.stockValue,
    }).from(products).where(and(eq(products.businessId, ctx.businessId), inArray(products.id, ids)));
    if (rows.length !== ids.length) throw notFound("Produto");
    const locked = new Map(rows.map((r) => [r.id, { ...r, state: stockState(r.stockQuantity, r.stockValue) }]));
    const calc = runCalculation(data, locked);
    const belowMinimum = data.items
      .filter((it) => {
        const min = locked.get(it.productId)?.minimumPrice;
        return min !== null && min !== undefined && dec(it.unitPrice).lessThan(dec(min));
      })
      .map((it) => locked.get(it.productId)!.name);
    return { ...summarize(calc), isLoss: calc.netProfit.isNegative(), belowMinimum };
  });
}

/**
 * Registra uma venda confirmada (transação única):
 * trava produtos → valida estoque → calcula custo histórico/lucro → venda + itens → movimentações SALE
 * → baixa de estoque → parcelas a receber + pagamentos recebidos → auditoria. Qualquer falha: ROLLBACK.
 */
export async function createSale(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(saleSchema, input);
  const saleDate = data.saleDate ?? todayIn(ctx.timezone);

  return withTenant(ctx, async (tx) => {
    if (data.customerId) {
      const [c] = await tx.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, data.customerId)));
      if (!c) throw notFound("Cliente");
    }

    const locked = await lockProducts(tx, ctx.businessId, data.items.map((i) => i.productId));
    for (const p of locked.values()) {
      if (p.archivedAt) throw new AppError("VALIDATION", `O produto ${p.name} está arquivado.`);
    }
    const calc = runCalculation(data, locked);

    // D4: venda com prejuízo exige confirmação explícita de OWNER/ADMIN/MANAGER.
    const isLoss = calc.netProfit.isNegative();
    if (isLoss) {
      if (!data.acknowledgeLoss) {
        throw new AppError(
          "BELOW_COST_CONFIRMATION_REQUIRED",
          `Esta venda resultará em prejuízo estimado de R$ ${calc.netProfit.abs().toFixed(2).replace(".", ",")}.`,
          { netProfit: calc.netProfit.toFixed(2), canApprove: can(ctx.role, "approveLoss") },
        );
      }
      assertCan(ctx, "approveLoss", "Somente proprietário, administrador ou gerente pode confirmar venda com prejuízo.");
    }

    // Pagamentos: Σ linhas = faturamento, exato em centavos (o servidor recalcula; o cliente não define o total).
    const paymentLines = data.payments.filter((p) => dec(p.amount).greaterThan(0));
    const paymentsTotal = sum(paymentLines.map((p) => money(p.amount)));
    if (!paymentsTotal.equals(calc.totalRevenue)) {
      throw new AppError(
        "VALIDATION",
        `A soma das formas de pagamento (R$ ${paymentsTotal.toFixed(2).replace(".", ",")}) deve ser igual ao total da venda (R$ ${calc.totalRevenue.toFixed(2).replace(".", ",")}).`,
      );
    }
    for (const p of paymentLines) {
      if (!p.received && !p.dueDate) throw new AppError("VALIDATION", "Informe o vencimento dos valores a receber.");
    }

    const { number, code } = await nextDocumentNumber(tx, ctx.businessId, "SALE");
    const [sale] = await tx.insert(sales).values({
      businessId: ctx.businessId,
      number,
      code,
      customerId: data.customerId,
      saleDate,
      itemsSubtotal: moneyToDb(calc.itemsSubtotal),
      itemsDiscount: moneyToDb(calc.itemsDiscount),
      discount: moneyToDb(calc.discount),
      productsRevenue: moneyToDb(calc.productsRevenue),
      freightCharged: moneyToDb(calc.freightCharged),
      totalRevenue: moneyToDb(calc.totalRevenue),
      totalCost: moneyToDb(calc.totalCost),
      freightPaid: moneyToDb(calc.freightPaid),
      fees: moneyToDb(calc.fees),
      commission: moneyToDb(calc.commission),
      otherExpenses: moneyToDb(calc.otherExpenses),
      grossProfit: moneyToDb(calc.grossProfit),
      netProfit: moneyToDb(calc.netProfit),
      belowCost: isLoss,
      belowCostApprovedBy: isLoss ? ctx.userId : null,
      notes: data.notes,
      createdBy: ctx.userId,
    }).returning({ id: sales.id });

    const items = await tx.insert(saleItems).values(
      calc.items.map((i, position) => ({
        businessId: ctx.businessId,
        saleId: sale.id,
        productId: i.productId,
        quantity: quantityToDb(i.quantity),
        unitPrice: moneyToDb(i.unitPrice),
        subtotal: moneyToDb(i.subtotal),
        discount: moneyToDb(i.discount),
        allocatedDiscount: moneyToDb(i.allocatedDiscount),
        netRevenue: moneyToDb(i.netRevenue),
        unitCostAtSale: unitCostToDb(i.unitCostAtSale),
        totalCost: moneyToDb(i.totalCost),
        position,
      })),
    ).returning({ id: saleItems.id, position: saleItems.position });
    const byPosition = new Map(items.map((r) => [r.position, r.id]));

    await postMovements(tx, ctx, locked, calc.items.map((i, position) => ({
      productId: i.productId,
      type: "SALE",
      quantityDelta: i.quantity.negated(),
      valueDelta: i.totalCost.negated(),
      movementDate: saleDate,
      referenceType: "SALE",
      referenceId: sale.id,
      referenceItemId: byPosition.get(position),
    })));

    // Parcelas: cada linha de pagamento vira uma parcela; as recebidas já nascem pagas com um pagamento IN.
    for (const [idx, line] of paymentLines.entries()) {
      const amount = money(line.amount);
      const [rec] = await tx.insert(accountsReceivable).values({
        businessId: ctx.businessId,
        saleId: sale.id,
        customerId: data.customerId,
        installmentNumber: idx + 1,
        dueDate: line.received ? saleDate : line.dueDate!,
        amount: moneyToDb(amount),
        amountPaid: line.received ? moneyToDb(amount) : "0",
        expectedMethod: line.method,
        status: line.received ? "PAID" : "PENDING",
      }).returning({ id: accountsReceivable.id });
      if (line.received) {
        await tx.insert(payments).values({
          businessId: ctx.businessId,
          direction: "IN",
          kind: "SALE_RECEIPT",
          saleId: sale.id,
          receivableId: rec.id,
          amount: moneyToDb(amount),
          method: line.method,
          paidOn: saleDate,
          createdBy: ctx.userId,
        });
      }
    }

    await audit(tx, ctx, {
      action: isLoss ? "sale.created_below_cost" : "sale.created",
      entityType: "sale",
      entityId: sale.id,
      summary: `Venda ${code} registrada — total ${calc.totalRevenue.toFixed(2)}, lucro ${calc.netProfit.toFixed(2)}${isLoss ? " (PREJUÍZO aprovado)" : ""}`,
      metadata: { code, ...summarize(calc) },
    });

    return { id: sale.id, code, ...summarize(calc) };
  });
}

async function receivedNet(tx: Transaction, businessId: string, saleId: string) {
  const [r] = await tx.select({
    inflow: sql<string>`coalesce(sum(case when ${payments.direction} = 'IN' then ${payments.amount} else 0 end), 0)`,
    outflow: sql<string>`coalesce(sum(case when ${payments.direction} = 'OUT' then ${payments.amount} else 0 end), 0)`,
  }).from(payments).where(and(eq(payments.businessId, businessId), eq(payments.saleId, saleId)));
  return dec(r.inflow).minus(dec(r.outflow));
}

/**
 * Cancela uma venda (nunca apaga): status + motivo, estoque volta pelo custo histórico gravado,
 * parcelas abertas são canceladas e valores recebidos são estornados (pagamento OUT).
 */
export async function cancelSale(ctx: TenantContext, saleId: string, input: unknown) {
  assertCan(ctx, "cancel");
  const data = parse(cancelSchema, input);
  return withTenant(ctx, async (tx) => {
    const [sale] = await tx.select().from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, saleId))).for("update");
    if (!sale) throw notFound("Venda");
    if (sale.status === "CANCELLED") throw new AppError("CONFLICT", "Esta venda já foi cancelada.");
    const [ret] = await tx.select({ n: count() }).from(returns).where(and(eq(returns.businessId, ctx.businessId), eq(returns.saleId, saleId)));
    if (ret.n > 0) throw new AppError("CONFLICT", "Esta venda possui devoluções. Registre a devolução dos itens restantes em vez de cancelar.");

    const items = await tx.select().from(saleItems)
      .where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId))).orderBy(asc(saleItems.position));
    const locked = await lockProducts(tx, ctx.businessId, items.map((i) => i.productId));
    const today = todayIn(ctx.timezone);

    await postMovements(tx, ctx, locked, items.map((i) => ({
      productId: i.productId,
      type: "SALE_CANCEL" as const,
      quantityDelta: dec(i.quantity),
      valueDelta: dec(i.totalCost),
      movementDate: today,
      referenceType: "SALE" as const,
      referenceId: saleId,
      referenceItemId: i.id,
      notes: data.reason,
    })));

    const recs = await tx.select().from(accountsReceivable)
      .where(and(eq(accountsReceivable.businessId, ctx.businessId), eq(accountsReceivable.saleId, saleId))).for("update");
    for (const r of recs) {
      const open = dec(r.amount).minus(dec(r.amountPaid)).minus(dec(r.amountCancelled));
      if (open.greaterThan(0)) {
        const amountCancelled = dec(r.amountCancelled).plus(open);
        await tx.update(accountsReceivable).set({
          amountCancelled: moneyToDb(amountCancelled),
          status: receivableStatus({ amount: r.amount, amountPaid: r.amountPaid, amountCancelled }),
        }).where(eq(accountsReceivable.id, r.id));
      }
    }

    const refund = await receivedNet(tx, ctx.businessId, saleId);
    if (refund.greaterThan(0)) {
      const method = data.refundMethod ?? recs.find((r) => r.expectedMethod)?.expectedMethod ?? "OTHER";
      await tx.insert(payments).values({
        businessId: ctx.businessId,
        direction: "OUT",
        kind: "SALE_CANCEL_REFUND",
        saleId,
        amount: moneyToDb(refund),
        method,
        paidOn: today,
        notes: `Estorno do cancelamento: ${data.reason}`,
        createdBy: ctx.userId,
      });
    }

    await tx.update(sales).set({
      status: "CANCELLED",
      cancelledAt: sql`now()`,
      cancelledBy: ctx.userId,
      cancelReason: data.reason,
    }).where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, saleId)));

    await audit(tx, ctx, {
      action: "sale.cancelled",
      entityType: "sale",
      entityId: saleId,
      summary: `Venda ${sale.code} cancelada — ${data.reason}${refund.greaterThan(0) ? ` (estorno ${refund.toFixed(2)})` : ""}`,
      metadata: { totalRevenue: sale.totalRevenue, refund: refund.toFixed(2) },
    });
    return { refunded: refund.toFixed(2) };
  });
}

export type SaleListFilters = {
  page?: number;
  pageSize?: number;
  q?: string;
  from?: string;
  to?: string;
  customerId?: string;
  status?: "CONFIRMED" | "CANCELLED";
  productId?: string;
  lossOnly?: boolean;
};

export async function listSales(ctx: TenantContext, opts: SaleListFilters = {}) {
  const { page, pageSize } = pagination.parse(opts);
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(sales.businessId, ctx.businessId),
      opts.from ? gte(sales.saleDate, opts.from) : undefined,
      opts.to ? lte(sales.saleDate, opts.to) : undefined,
      opts.customerId ? eq(sales.customerId, opts.customerId) : undefined,
      opts.status ? eq(sales.status, opts.status) : undefined,
      opts.lossOnly ? sql`${sales.netProfit} < 0` : undefined,
      opts.productId ? sql`exists (select 1 from sale_items si where si.sale_id = ${ref(sales.id)} and si.product_id = ${opts.productId})` : undefined,
      opts.q ? or(ilike(sales.code, likePattern(opts.q)), ilike(customers.name, likePattern(opts.q))) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(sales).leftJoin(customers, eq(customers.id, sales.customerId)).where(where);
    const rows = await tx
      .select({
        id: sales.id,
        code: sales.code,
        saleDate: sales.saleDate,
        customerName: customers.name,
        totalRevenue: sales.totalRevenue,
        netProfit: sales.netProfit,
        status: sales.status,
        belowCost: sales.belowCost,
        received: sql<string>`(select coalesce(sum(ar.amount_paid), 0) from accounts_receivable ar where ar.sale_id = ${ref(sales.id)})`,
        open: sql<string>`(select coalesce(sum(ar.amount - ar.amount_paid - ar.amount_cancelled), 0) from accounts_receivable ar where ar.sale_id = ${ref(sales.id)})`,
        overdue: sql<boolean>`exists (select 1 from accounts_receivable ar where ar.sale_id = ${ref(sales.id)} and ar.status in ('PENDING','PARTIAL') and ar.due_date < ${today})`,
        refunded: sql<string>`(select coalesce(sum(r.refund_total), 0) from returns r where r.sale_id = ${ref(sales.id)})`,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(where)
      .orderBy(desc(sales.saleDate), desc(sales.number))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return pageOf(rows, total, page, pageSize);
  });
}

export async function getSale(ctx: TenantContext, saleId: string) {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ sale: sales, customerName: customers.name, createdByName: users.fullName, createdByEmail: users.email })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .leftJoin(users, eq(users.id, sales.createdBy))
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, saleId)));
    if (!row) return null;

    const items = await tx
      .select({
        item: saleItems,
        productName: products.name,
        productUnit: products.unit,
        sku: products.sku,
        returnedQuantity: sql<string>`(select coalesce(sum(ri.quantity), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
        refunded: sql<string>`(select coalesce(sum(ri.refund_amount), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
      })
      .from(saleItems)
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, saleId)))
      .orderBy(asc(saleItems.position));

    const receivables = await tx.select().from(accountsReceivable)
      .where(and(eq(accountsReceivable.businessId, ctx.businessId), eq(accountsReceivable.saleId, saleId)))
      .orderBy(asc(accountsReceivable.installmentNumber));
    const salePayments = await tx.select().from(payments)
      .where(and(eq(payments.businessId, ctx.businessId), eq(payments.saleId, saleId)))
      .orderBy(asc(payments.paidOn), asc(payments.createdAt));
    const saleReturns = await tx
      .select({ ret: returns, items: sql<{ productName: string; quantity: string; refundAmount: string; restock: boolean }[]>`(
        select coalesce(json_agg(json_build_object('productName', p.name, 'quantity', ri.quantity, 'refundAmount', ri.refund_amount, 'restock', ri.restock)), '[]'::json)
        from return_items ri join products p on p.id = ri.product_id where ri.return_id = ${ref(returns.id)})` })
      .from(returns)
      .where(and(eq(returns.businessId, ctx.businessId), eq(returns.saleId, saleId)))
      .orderBy(asc(returns.createdAt));
    const movements = await tx.select({ m: inventoryMovements, productName: products.name }).from(inventoryMovements)
      .innerJoin(products, eq(products.id, inventoryMovements.productId))
      .where(and(eq(inventoryMovements.businessId, ctx.businessId), eq(inventoryMovements.referenceId, saleId)))
      .orderBy(asc(inventoryMovements.occurredAt));

    const payment = salePaymentStatus(
      receivables.map((r) => ({ amount: r.amount, amountPaid: r.amountPaid, amountCancelled: r.amountCancelled, dueDate: r.dueDate })),
      today,
    );
    const refundedTotal = sum(saleReturns.map((r) => r.ret.refundTotal));
    const costReversed = sum(saleReturns.map((r) => r.ret.costReversalTotal));

    return {
      ...row.sale,
      customerName: row.customerName,
      createdByName: row.createdByName ?? row.createdByEmail,
      items,
      receivables,
      payments: salePayments,
      returns: saleReturns,
      movements,
      paymentStatus: payment.status,
      received: payment.received.toFixed(2),
      openAmount: payment.open.toFixed(2),
      refundedTotal: refundedTotal.toFixed(2),
      /** Resultado da venda líquido de devoluções (D2: as devoluções contam no período delas). */
      netProfitAfterReturns: dec(row.sale.netProfit).minus(refundedTotal).plus(costReversed).toFixed(2),
      today,
    };
  });
}

