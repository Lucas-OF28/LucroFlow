import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { SaleCalculationError, calculateReturnLine, dec, moneyToDb, quantityToDb, receivableStatus, sum } from "@/lib/finance";
import { todayIn } from "@/lib/dates";
import { returnSchema } from "@/lib/validations";
import { accountsReceivable, payments, returnItems, returns, saleItems, sales } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, nextDocumentNumber, parse, ref } from "./_base";
import { lockProducts, postMovements } from "./inventory-ledger";

/**
 * Devolução total ou parcial (D2: reconhecida na data da devolução).
 * - itens com restock voltam ao estoque pelo custo histórico da venda (movimento RETURN);
 * - o reembolso abate primeiro as parcelas em aberto da venda (vencimento mais distante primeiro);
 *   o excedente vira um pagamento de saída (RETURN_REFUND).
 */
export async function createReturn(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "cancel", "Somente proprietário, administrador ou gerente pode registrar devoluções.");
  const data = parse(returnSchema, input);
  const returnDate = data.returnDate ?? todayIn(ctx.timezone);

  return withTenant(ctx, async (tx) => {
    // trava a venda: devoluções simultâneas da mesma venda são serializadas
    const [sale] = await tx.select().from(sales)
      .where(and(eq(sales.businessId, ctx.businessId), eq(sales.id, data.saleId))).for("update");
    if (!sale) throw notFound("Venda");
    if (sale.status !== "CONFIRMED") throw new AppError("CONFLICT", "Não é possível devolver itens de uma venda cancelada.");
    if (returnDate < sale.saleDate) throw new AppError("VALIDATION", "A devolução não pode ser anterior à venda.");

    const ids = [...new Set(data.items.map((i) => i.saleItemId))];
    if (ids.length !== data.items.length) throw new AppError("VALIDATION", "Item repetido na devolução.");
    const items = await tx
      .select({
        item: saleItems,
        returnedQty: sql<string>`(select coalesce(sum(ri.quantity), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
        refunded: sql<string>`(select coalesce(sum(ri.refund_amount), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
        attributedCost: sql<string>`(select coalesce(sum(ri.proportional_cost), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
      })
      .from(saleItems)
      .where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.saleId, sale.id), inArray(saleItems.id, ids)));
    if (items.length !== ids.length) throw notFound("Item da venda");
    const byId = new Map(items.map((r) => [r.item.id, r]));

    const lines = data.items.map((input) => {
      const r = byId.get(input.saleItemId)!;
      try {
        const calc = calculateReturnLine({
          soldQuantity: r.item.quantity,
          previouslyReturnedQuantity: r.returnedQty,
          netRevenue: r.item.netRevenue,
          previouslyRefunded: r.refunded,
          totalCost: r.item.totalCost,
          previouslyAttributedCost: r.attributedCost,
          quantity: input.quantity,
          restock: input.restock,
          refundAmount: input.refundAmount,
        });
        return { input, item: r.item, calc };
      } catch (e) {
        if (e instanceof SaleCalculationError) throw new AppError("VALIDATION", e.message);
        throw e;
      }
    });

    const refundTotal = sum(lines.map((l) => l.calc.refundAmount));
    const costReversalTotal = sum(lines.map((l) => l.calc.costReversal));

    // Abate parcelas em aberto (vencimento mais distante primeiro)
    const recs = await tx.select().from(accountsReceivable)
      .where(and(eq(accountsReceivable.businessId, ctx.businessId), eq(accountsReceivable.saleId, sale.id)))
      .orderBy(desc(accountsReceivable.dueDate), desc(accountsReceivable.installmentNumber))
      .for("update");
    let remaining = refundTotal;
    for (const r of recs) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const open = dec(r.amount).minus(dec(r.amountPaid)).minus(dec(r.amountCancelled));
      if (open.lessThanOrEqualTo(0)) continue;
      const take = open.lessThan(remaining) ? open : remaining;
      const amountCancelled = dec(r.amountCancelled).plus(take);
      await tx.update(accountsReceivable).set({
        amountCancelled: moneyToDb(amountCancelled),
        status: receivableStatus({ amount: r.amount, amountPaid: r.amountPaid, amountCancelled }),
      }).where(eq(accountsReceivable.id, r.id));
      remaining = remaining.minus(take);
    }
    const receivableReduction = refundTotal.minus(remaining);
    const cashRefund = remaining;
    if (cashRefund.greaterThan(0) && !data.refundMethod) {
      throw new AppError("VALIDATION", "Informe a forma de reembolso ao cliente.");
    }

    const { number, code } = await nextDocumentNumber(tx, ctx.businessId, "RETURN");
    const [ret] = await tx.insert(returns).values({
      businessId: ctx.businessId,
      number,
      code,
      saleId: sale.id,
      returnDate,
      reason: data.reason,
      refundTotal: moneyToDb(refundTotal),
      costReversalTotal: moneyToDb(costReversalTotal),
      receivableReduction: moneyToDb(receivableReduction),
      refundMethod: data.refundMethod ?? null,
      notes: data.notes,
      createdBy: ctx.userId,
    }).returning({ id: returns.id });

    await tx.insert(returnItems).values(lines.map((l) => ({
      businessId: ctx.businessId,
      returnId: ret.id,
      saleItemId: l.item.id,
      productId: l.item.productId,
      quantity: quantityToDb(l.calc.quantity),
      refundAmount: moneyToDb(l.calc.refundAmount),
      restock: l.input.restock,
      proportionalCost: moneyToDb(l.calc.proportionalCost),
      costReversal: moneyToDb(l.calc.costReversal),
    })));

    const restocked = lines.filter((l) => l.input.restock);
    if (restocked.length > 0) {
      const locked = await lockProducts(tx, ctx.businessId, restocked.map((l) => l.item.productId));
      await postMovements(tx, ctx, locked, restocked.map((l) => ({
        productId: l.item.productId,
        type: "RETURN" as const,
        quantityDelta: l.calc.quantity,
        valueDelta: l.calc.costReversal,
        movementDate: returnDate,
        referenceType: "RETURN" as const,
        referenceId: ret.id,
        referenceItemId: l.item.id,
        notes: data.reason,
      })));
    }

    if (cashRefund.greaterThan(0)) {
      await tx.insert(payments).values({
        businessId: ctx.businessId,
        direction: "OUT",
        kind: "RETURN_REFUND",
        saleId: sale.id,
        returnId: ret.id,
        amount: moneyToDb(cashRefund),
        method: data.refundMethod!,
        paidOn: returnDate,
        notes: `Reembolso da devolução ${code}`,
        createdBy: ctx.userId,
      });
    }

    await audit(tx, ctx, {
      action: "return.created",
      entityType: "return",
      entityId: ret.id,
      summary: `Devolução ${code} da venda ${sale.code} — reembolso ${refundTotal.toFixed(2)}`,
      metadata: { saleId: sale.id, refundTotal: refundTotal.toFixed(2), cashRefund: cashRefund.toFixed(2), receivableReduction: receivableReduction.toFixed(2) },
    });

    return { id: ret.id, code, refundTotal: refundTotal.toFixed(2), cashRefund: cashRefund.toFixed(2), receivableReduction: receivableReduction.toFixed(2) };
  });
}
