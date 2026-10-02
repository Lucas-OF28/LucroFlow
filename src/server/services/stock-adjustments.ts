import "server-only";
import { dec, money, quantity } from "@/lib/finance";
import { todayIn } from "@/lib/dates";
import { stockAdjustmentSchema } from "@/lib/validations";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { assertCan, audit, parse } from "./_base";
import { currentAverageCost, lockProducts, postMovements } from "./inventory-ledger";

const LABEL = {
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de saída",
  LOSS: "Perda",
  COST_ADJUSTMENT: "Ajuste de custo",
} as const;

/**
 * Ajustes manuais de estoque — sempre com justificativa e movimentação registrada.
 * - ADJUSTMENT_IN: entra pelo custo informado (padrão: custo médio atual).
 * - ADJUSTMENT_OUT / LOSS: saem pelo custo médio atual. LOSS reduz o lucro líquido (ARQUITETURA R5).
 * - COST_ADJUSTMENT: soma/subtrai valor sem mudar quantidade (ex.: manutenção capitalizada).
 */
export async function adjustStock(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "cancel", "Somente proprietário, administrador ou gerente pode ajustar o estoque.");
  const data = parse(stockAdjustmentSchema, input);
  const movementDate = data.movementDate ?? todayIn(ctx.timezone);

  return withTenant(ctx, async (tx) => {
    const locked = await lockProducts(tx, ctx.businessId, [data.productId]);
    const p = locked.get(data.productId)!;
    const qty = quantity(data.quantity);
    let quantityDelta = qty;
    let valueDelta;

    switch (data.type) {
      case "ADJUSTMENT_IN": {
        const unit = data.unitCost !== null && data.unitCost !== undefined ? dec(data.unitCost) : currentAverageCost(p);
        if (data.unitCost == null && p.state.quantity.isZero()) {
          throw new AppError("VALIDATION", "Produto sem estoque: informe o custo unitário da entrada.");
        }
        valueDelta = money(unit.times(qty));
        break;
      }
      case "ADJUSTMENT_OUT":
      case "LOSS": {
        if (qty.greaterThan(p.state.quantity)) {
          throw new AppError("INSUFFICIENT_STOCK", `Estoque insuficiente de ${p.name}. Disponível: ${p.state.quantity.toFixed(3)}.`);
        }
        quantityDelta = qty.negated();
        valueDelta = qty.equals(p.state.quantity) ? p.state.value.negated() : money(p.state.value.times(qty).dividedBy(p.state.quantity)).negated();
        break;
      }
      case "COST_ADJUSTMENT": {
        if (p.state.quantity.isZero()) throw new AppError("VALIDATION", "Não é possível ajustar o custo de um produto sem estoque.");
        quantityDelta = dec(0);
        valueDelta = money(data.amount);
        if (p.state.value.plus(valueDelta).isNegative()) throw new AppError("VALIDATION", "O ajuste deixaria o valor do estoque negativo.");
        break;
      }
    }

    await postMovements(tx, ctx, locked, [{
      productId: p.id,
      type: data.type,
      quantityDelta,
      valueDelta,
      movementDate,
      referenceType: "ADJUSTMENT",
      notes: data.notes,
    }]);
    await audit(tx, ctx, {
      action: "inventory.adjusted",
      entityType: "product",
      entityId: p.id,
      summary: `${LABEL[data.type]} em ${p.name}: qtd ${quantityDelta.toFixed(3)}, valor ${valueDelta.toFixed(2)} — ${data.notes}`,
      metadata: { type: data.type, quantityDelta: quantityDelta.toFixed(3), valueDelta: valueDelta.toFixed(2) },
    });
    return { quantity: p.state.quantity.toFixed(3), value: p.state.value.toFixed(2) };
  });
}
