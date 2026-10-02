import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type Decimal,
  type StockState,
  averageCost,
  moneyToDb,
  quantityToDb,
  stockState,
  unitCostToDb,
} from "@/lib/finance";
import type { Transaction } from "../db/client";
import { inventoryMovements, products } from "../db/schema";
import type { TenantContext } from "../db/tenant";
import { AppError, notFound } from "../errors";

export interface LockedProduct {
  id: string;
  name: string;
  unit: string;
  status: string;
  archivedAt: Date | null;
  minimumPrice: string | null;
  state: StockState;
}

/**
 * Trava (SELECT … FOR UPDATE) os produtos envolvidos, SEMPRE em ordem de id para evitar deadlock.
 * A validação de estoque feita depois disso é definitiva: nenhuma outra transação altera esses saldos
 * até o COMMIT/ROLLBACK.
 */
export async function lockProducts(tx: Transaction, businessId: string, ids: string[]): Promise<Map<string, LockedProduct>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      unit: products.unit,
      status: products.status,
      archivedAt: products.archivedAt,
      minimumPrice: products.minimumPrice,
      stockQuantity: products.stockQuantity,
      stockValue: products.stockValue,
    })
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.id, unique)))
    .orderBy(products.id)
    .for("update");

  if (rows.length !== unique.length) throw notFound("Produto");
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        unit: r.unit,
        status: r.status,
        archivedAt: r.archivedAt,
        minimumPrice: r.minimumPrice,
        state: stockState(r.stockQuantity, r.stockValue),
      },
    ]),
  );
}

export type MovementType = (typeof inventoryMovements.$inferInsert)["type"];
export type MovementRef = (typeof inventoryMovements.$inferInsert)["referenceType"];

export interface MovementInput {
  productId: string;
  type: MovementType;
  quantityDelta: Decimal;
  valueDelta: Decimal;
  movementDate: string;
  referenceType: MovementRef;
  referenceId?: string | null;
  referenceItemId?: string | null;
  notes?: string | null;
}

/**
 * Livro-razão: registra cada movimentação com o saldo resultante e atualiza o saldo do produto.
 * O estoque NUNCA muda sem uma linha aqui. `states` é atualizado em memória (linhas repetidas do mesmo produto).
 */
export async function postMovements(
  tx: Transaction,
  ctx: TenantContext,
  states: Map<string, LockedProduct>,
  movements: MovementInput[],
) {
  if (movements.length === 0) return;
  const touched = new Set<string>();
  const rows: (typeof inventoryMovements.$inferInsert)[] = [];

  for (const m of movements) {
    const p = states.get(m.productId);
    if (!p) throw new Error(`Produto ${m.productId} não travado antes da movimentação.`);
    const quantity = p.state.quantity.plus(m.quantityDelta);
    // ao zerar a quantidade, nenhum valor pode sobrar no pool
    const value = p.state.value.plus(m.valueDelta);
    if (quantity.isNegative()) throw new AppError("INSUFFICIENT_STOCK", `Estoque insuficiente para ${p.name}.`);
    if (value.isNegative() || (quantity.isZero() && !value.isZero())) {
      throw new AppError("CONFLICT", `Movimentação deixaria o valor do estoque de ${p.name} inconsistente.`);
    }
    p.state = { quantity, value };
    touched.add(p.id);

    const unit = m.quantityDelta.isZero() ? m.valueDelta.abs() : m.valueDelta.dividedBy(m.quantityDelta).abs();
    rows.push({
      businessId: ctx.businessId,
      productId: m.productId,
      type: m.type,
      quantityDelta: quantityToDb(m.quantityDelta),
      valueDelta: moneyToDb(m.valueDelta),
      unitCost: unitCostToDb(unit),
      quantityAfter: quantityToDb(quantity),
      valueAfter: moneyToDb(value),
      movementDate: m.movementDate,
      referenceType: m.referenceType,
      referenceId: m.referenceId ?? null,
      referenceItemId: m.referenceItemId ?? null,
      notes: m.notes ?? null,
      createdBy: ctx.userId,
    });
  }

  await tx.insert(inventoryMovements).values(rows);

  for (const id of touched) {
    const p = states.get(id)!;
    await tx
      .update(products)
      .set({ stockQuantity: quantityToDb(p.state.quantity), stockValue: moneyToDb(p.state.value), updatedAt: sql`now()` })
      .where(and(eq(products.businessId, ctx.businessId), eq(products.id, id)));
  }
}

export function currentAverageCost(p: LockedProduct): Decimal {
  return averageCost(p.state);
}
