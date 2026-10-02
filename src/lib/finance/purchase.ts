import { allocateProportionally } from "./allocation";
import { type Decimal, type DecimalInput, ZERO, money, quantity, sum, unitCost } from "./decimal";

export interface PurchaseItemInput {
  productId: string;
  quantity: DecimalInput;
  unitCost: DecimalInput;
  discount?: DecimalInput;
  additionalCosts?: DecimalInput;
}

export interface PurchaseInput {
  items: readonly PurchaseItemInput[];
  freight?: DecimalInput;
  taxes?: DecimalInput;
  otherCosts?: DecimalInput;
  discount?: DecimalInput;
}

export interface PurchaseItemCalc {
  productId: string;
  quantity: Decimal;
  unitCost: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  additionalCosts: Decimal;
  /** Parte dos custos globais (frete + impostos + outros) atribuída ao item. */
  allocatedCosts: Decimal;
  /** Parte do desconto global atribuída ao item. */
  allocatedDiscount: Decimal;
  /** Custo final do item que entra no estoque. */
  landedTotal: Decimal;
  landedUnitCost: Decimal;
}

export interface PurchaseCalc {
  items: PurchaseItemCalc[];
  itemsSubtotal: Decimal;
  itemsDiscount: Decimal;
  itemsAdditionalCosts: Decimal;
  freight: Decimal;
  taxes: Decimal;
  otherCosts: Decimal;
  discount: Decimal;
  total: Decimal;
}

export class PurchaseCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseCalculationError";
  }
}

/**
 * Calcula a compra inteira no servidor (valores vindos do cliente nunca são confiados).
 *
 * subtotal do item   = round(qtd × custo unitário)
 * líquido do item    = subtotal − desconto do item + custos adicionais do item
 * custos globais     = frete + impostos + outros   → rateados proporcionalmente ao líquido
 * desconto global    → rateado proporcionalmente ao líquido
 * custo final (item) = líquido + custos rateados − desconto rateado
 * total da compra    = Σ custo final  (= Σ subtotais − descontos + custos, exato em centavos)
 */
export function calculatePurchase(input: PurchaseInput): PurchaseCalc {
  if (input.items.length === 0) throw new PurchaseCalculationError("Adicione ao menos um item à compra.");

  const freight = money(input.freight);
  const taxes = money(input.taxes);
  const otherCosts = money(input.otherCosts);
  const discount = money(input.discount);
  for (const [label, v] of [["Frete", freight], ["Impostos", taxes], ["Outros custos", otherCosts], ["Desconto", discount]] as const) {
    if (v.isNegative()) throw new PurchaseCalculationError(`${label} não pode ser negativo.`);
  }

  const base = input.items.map((it) => {
    const q = quantity(it.quantity);
    const uc = money(it.unitCost);
    const d = money(it.discount);
    const add = money(it.additionalCosts);
    if (q.lessThanOrEqualTo(0)) throw new PurchaseCalculationError("Quantidade deve ser maior que zero.");
    if (uc.isNegative()) throw new PurchaseCalculationError("Custo unitário não pode ser negativo.");
    if (d.isNegative() || add.isNegative()) throw new PurchaseCalculationError("Valores do item não podem ser negativos.");
    const subtotal = money(q.times(uc));
    const net = subtotal.minus(d).plus(add);
    if (net.isNegative()) throw new PurchaseCalculationError("O desconto do item é maior que o seu valor.");
    return { productId: it.productId, quantity: q, unitCost: uc, subtotal, discount: d, additionalCosts: add, net };
  });

  const weights = base.map((b) => b.net);
  const fallback = base.map((b) => b.quantity);
  const costShares = allocateProportionally(freight.plus(taxes).plus(otherCosts), weights, fallback);
  const discountShares = allocateProportionally(discount, weights, fallback);

  const items: PurchaseItemCalc[] = base.map((b, i) => {
    const landedTotal = b.net.plus(costShares[i]).minus(discountShares[i]);
    if (landedTotal.isNegative()) {
      throw new PurchaseCalculationError("O desconto da compra é maior que o valor dos itens.");
    }
    return {
      productId: b.productId,
      quantity: b.quantity,
      unitCost: b.unitCost,
      subtotal: b.subtotal,
      discount: b.discount,
      additionalCosts: b.additionalCosts,
      allocatedCosts: costShares[i],
      allocatedDiscount: discountShares[i],
      landedTotal,
      landedUnitCost: unitCost(landedTotal.dividedBy(b.quantity)),
    };
  });

  const itemsSubtotal = sum(items.map((i) => i.subtotal));
  const itemsDiscount = sum(items.map((i) => i.discount));
  const itemsAdditionalCosts = sum(items.map((i) => i.additionalCosts));
  const total = sum(items.map((i) => i.landedTotal));

  // Invariante: Σ itens + custos − descontos = total (sem centavos perdidos).
  const expected = itemsSubtotal.minus(itemsDiscount).plus(itemsAdditionalCosts).plus(freight).plus(taxes).plus(otherCosts).minus(discount);
  if (!expected.equals(total)) {
    throw new PurchaseCalculationError("Inconsistência no rateio da compra.");
  }

  return { items, itemsSubtotal, itemsDiscount, itemsAdditionalCosts, freight, taxes, otherCosts, discount, total: total.plus(ZERO) };
}
