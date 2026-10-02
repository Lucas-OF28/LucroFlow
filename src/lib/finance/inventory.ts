import { Decimal, type DecimalInput, ZERO, dec, money, quantity, unitCost } from "./decimal";

/**
 * Custo médio ponderado como "pool de valor" (docs/ARQUITETURA.md §6).
 *
 * O produto guarda apenas `quantity` e `value` (valor contábil do estoque, em centavos exatos).
 * O custo médio é DERIVADO (value / quantity) e nunca acumulado à parte, evitando deriva de arredondamento.
 */
export interface StockState {
  quantity: Decimal;
  value: Decimal;
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly available: Decimal,
    public readonly requested: Decimal,
  ) {
    super("Estoque insuficiente.");
    this.name = "InsufficientStockError";
  }
}

export function stockState(qty: DecimalInput, value: DecimalInput): StockState {
  return { quantity: quantity(qty), value: money(value) };
}

/** Custo médio atual (6 casas). Zero quando não há estoque. */
export function averageCost(state: StockState): Decimal {
  if (state.quantity.lessThanOrEqualTo(0)) return ZERO;
  return unitCost(state.value.dividedBy(state.quantity));
}

/** Entrada de estoque (compra, ajuste de entrada, retorno ao estoque) com o custo total da entrada. */
export function applyInbound(state: StockState, qty: DecimalInput, totalCost: DecimalInput): StockState {
  const q = quantity(qty);
  const c = money(totalCost);
  if (q.lessThanOrEqualTo(0)) throw new Error("Quantidade de entrada deve ser maior que zero.");
  if (c.isNegative()) throw new Error("Custo de entrada não pode ser negativo.");
  return { quantity: state.quantity.plus(q), value: state.value.plus(c) };
}

/**
 * Custo de uma saída pelo custo médio: round(value × qty / quantity, 2).
 * Se a saída zera o estoque, o custo é o valor inteiro restante (nenhum centavo fica "preso").
 */
export function outboundCost(state: StockState, qty: DecimalInput): Decimal {
  const q = quantity(qty);
  if (q.lessThanOrEqualTo(0)) throw new Error("Quantidade de saída deve ser maior que zero.");
  if (q.greaterThan(state.quantity)) throw new InsufficientStockError(state.quantity, q);
  if (q.equals(state.quantity)) return state.value;
  return money(state.value.times(q).dividedBy(state.quantity));
}

export function applyOutbound(state: StockState, qty: DecimalInput): { state: StockState; cost: Decimal } {
  const cost = outboundCost(state, qty);
  const q = quantity(qty);
  return { cost, state: { quantity: state.quantity.minus(q), value: state.value.minus(cost) } };
}

/** Soma custo ao estoque sem alterar quantidade (ex.: manutenção/reparo de um item já em estoque). */
export function applyCostAdjustment(state: StockState, amount: DecimalInput): StockState {
  const a = money(amount);
  if (state.quantity.lessThanOrEqualTo(0)) throw new Error("Não é possível agregar custo a um produto sem estoque.");
  const value = state.value.plus(a);
  if (value.isNegative()) throw new Error("O ajuste deixaria o valor do estoque negativo.");
  return { quantity: state.quantity, value };
}

/** Margem potencial de um item em estoque, se vendido ao preço de referência. */
export function potentialUnitProfit(state: StockState, referencePrice: DecimalInput | null): Decimal | null {
  if (referencePrice === null || state.quantity.lessThanOrEqualTo(0)) return null;
  return money(dec(referencePrice).minus(averageCost(state)));
}

export { Decimal };
