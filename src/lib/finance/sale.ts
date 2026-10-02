import { allocateProportionally } from "./allocation";
import { type Decimal, type DecimalInput, ZERO, money, quantity, sum, unitCost } from "./decimal";
import { type StockState, applyOutbound } from "./inventory";
import { margin, roi } from "./metrics";

export interface SaleItemInput {
  productId: string;
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discount?: DecimalInput;
}

export interface SaleInput {
  items: readonly SaleItemInput[];
  discount?: DecimalInput;
  freightCharged?: DecimalInput;
  freightPaid?: DecimalInput;
  fees?: DecimalInput;
  commission?: DecimalInput;
  otherExpenses?: DecimalInput;
}

export interface SaleItemCalc {
  productId: string;
  quantity: Decimal;
  unitPrice: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  allocatedDiscount: Decimal;
  /** Receita líquida do item = subtotal − desconto do item − desconto global rateado. */
  netRevenue: Decimal;
  /** Custo histórico da venda (custo médio no momento). NUNCA recalculado depois. */
  totalCost: Decimal;
  unitCostAtSale: Decimal;
  grossProfit: Decimal;
}

export interface SaleCalc {
  items: SaleItemCalc[];
  itemsSubtotal: Decimal;
  itemsDiscount: Decimal;
  discount: Decimal;
  productsRevenue: Decimal;
  freightCharged: Decimal;
  /** Faturamento da venda = receita de produtos + frete cobrado (decisão D1). Valor devido pelo cliente. */
  totalRevenue: Decimal;
  /** CMV = Σ custo histórico dos itens. */
  totalCost: Decimal;
  /** Lucro bruto = faturamento − CMV. */
  grossProfit: Decimal;
  freightPaid: Decimal;
  fees: Decimal;
  commission: Decimal;
  otherExpenses: Decimal;
  /** Custos da venda = frete pago + taxas + comissão + outras despesas. */
  saleCosts: Decimal;
  /** Lucro da venda = lucro bruto − custos da venda. */
  netProfit: Decimal;
  marginPercent: Decimal | null;
  roiPercent: Decimal | null;
  /** Estoque resultante por produto após as saídas. */
  stockAfter: Map<string, StockState>;
}

export class SaleCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleCalculationError";
  }
}

/**
 * Calcula a venda usando o estado ATUAL do estoque (lido com lock na transação).
 * Linhas repetidas do mesmo produto são processadas em sequência sobre o mesmo saldo.
 * Lança InsufficientStockError se alguma linha exceder o estoque.
 */
export function calculateSale(input: SaleInput, stock: ReadonlyMap<string, StockState>): SaleCalc {
  if (input.items.length === 0) throw new SaleCalculationError("Adicione ao menos um produto à venda.");

  const discount = money(input.discount);
  const freightCharged = money(input.freightCharged);
  const freightPaid = money(input.freightPaid);
  const fees = money(input.fees);
  const commission = money(input.commission);
  const otherExpenses = money(input.otherExpenses);
  for (const v of [discount, freightCharged, freightPaid, fees, commission, otherExpenses]) {
    if (v.isNegative()) throw new SaleCalculationError("Valores da venda não podem ser negativos.");
  }

  const base = input.items.map((it) => {
    const q = quantity(it.quantity);
    const price = money(it.unitPrice);
    const d = money(it.discount);
    if (q.lessThanOrEqualTo(0)) throw new SaleCalculationError("Quantidade deve ser maior que zero.");
    if (price.isNegative() || d.isNegative()) throw new SaleCalculationError("Preço e desconto não podem ser negativos.");
    const subtotal = money(q.times(price));
    const afterDiscount = subtotal.minus(d);
    if (afterDiscount.isNegative()) throw new SaleCalculationError("O desconto do item é maior que o seu valor.");
    return { productId: it.productId, quantity: q, unitPrice: price, subtotal, discount: d, afterDiscount };
  });

  const discountShares = allocateProportionally(
    discount,
    base.map((b) => b.afterDiscount),
    base.map((b) => b.quantity),
  );

  const working = new Map<string, StockState>();
  for (const b of base) {
    if (!working.has(b.productId)) {
      const s = stock.get(b.productId);
      if (!s) throw new SaleCalculationError("Produto não encontrado.");
      working.set(b.productId, { ...s });
    }
  }

  const items: SaleItemCalc[] = base.map((b, i) => {
    const netRevenue = b.afterDiscount.minus(discountShares[i]);
    if (netRevenue.isNegative()) throw new SaleCalculationError("O desconto da venda é maior que o valor dos produtos.");
    const { cost, state } = applyOutbound(working.get(b.productId)!, b.quantity);
    working.set(b.productId, state);
    return {
      productId: b.productId,
      quantity: b.quantity,
      unitPrice: b.unitPrice,
      subtotal: b.subtotal,
      discount: b.discount,
      allocatedDiscount: discountShares[i],
      netRevenue,
      totalCost: cost,
      unitCostAtSale: unitCost(cost.dividedBy(b.quantity)),
      grossProfit: netRevenue.minus(cost),
    };
  });

  const itemsSubtotal = sum(items.map((i) => i.subtotal));
  const itemsDiscount = sum(items.map((i) => i.discount));
  const productsRevenue = sum(items.map((i) => i.netRevenue));
  const totalRevenue = productsRevenue.plus(freightCharged);
  const totalCost = sum(items.map((i) => i.totalCost));
  const grossProfit = totalRevenue.minus(totalCost);
  const saleCosts = freightPaid.plus(fees).plus(commission).plus(otherExpenses);
  const netProfit = grossProfit.minus(saleCosts);

  return {
    items,
    itemsSubtotal,
    itemsDiscount,
    discount,
    productsRevenue,
    freightCharged,
    totalRevenue,
    totalCost,
    grossProfit,
    freightPaid,
    fees,
    commission,
    otherExpenses,
    saleCosts,
    netProfit,
    marginPercent: margin(netProfit, totalRevenue),
    roiPercent: roi(netProfit, totalCost),
    stockAfter: working,
  };
}

/**
 * Devolução de parte de um item vendido (D2: reconhecida na data da devolução).
 * - receita estornada = reembolso do item (padrão: proporcional à receita líquida do item);
 * - custo estornado (só quando o item volta ao estoque) = proporcional ao custo histórico;
 * - ao devolver todo o saldo restante, usa o resíduo exato (sem centavos perdidos).
 */
export interface ReturnLineInput {
  soldQuantity: DecimalInput;
  previouslyReturnedQuantity: DecimalInput;
  netRevenue: DecimalInput;
  previouslyRefunded: DecimalInput;
  totalCost: DecimalInput;
  previouslyAttributedCost: DecimalInput;
  quantity: DecimalInput;
  restock: boolean;
  refundAmount?: DecimalInput | null;
}

export interface ReturnLineCalc {
  quantity: Decimal;
  refundAmount: Decimal;
  maxRefund: Decimal;
  costReversal: Decimal;
  /** Custo da parte devolvida (volta ao estoque se restock; senão permanece como CMV/perda). */
  proportionalCost: Decimal;
}

export function calculateReturnLine(line: ReturnLineInput): ReturnLineCalc {
  const sold = quantity(line.soldQuantity);
  const prevQty = quantity(line.previouslyReturnedQuantity);
  const q = quantity(line.quantity);
  const remainingQty = sold.minus(prevQty);
  if (q.lessThanOrEqualTo(0)) throw new SaleCalculationError("Quantidade devolvida deve ser maior que zero.");
  if (q.greaterThan(remainingQty)) throw new SaleCalculationError("Quantidade devolvida maior que a vendida.");

  const remainingRevenue = money(line.netRevenue).minus(money(line.previouslyRefunded));
  const remainingCost = money(line.totalCost).minus(money(line.previouslyAttributedCost));
  const isAll = q.equals(remainingQty);

  const proportionalRevenue = isAll ? remainingRevenue : money(money(line.netRevenue).times(q).dividedBy(sold));
  const proportionalCost = isAll ? remainingCost : money(money(line.totalCost).times(q).dividedBy(sold));
  const maxRefund = maxDecimal(remainingRevenue, ZERO);

  const refund = line.refundAmount === null || line.refundAmount === undefined
    ? minDecimal(proportionalRevenue, maxRefund)
    : money(line.refundAmount);
  if (refund.isNegative()) throw new SaleCalculationError("Reembolso não pode ser negativo.");
  if (refund.greaterThan(maxRefund)) throw new SaleCalculationError("Reembolso maior que o valor restante do item.");

  return {
    quantity: q,
    refundAmount: refund,
    maxRefund,
    proportionalCost,
    costReversal: line.restock ? proportionalCost : ZERO,
  };
}

function maxDecimal(a: Decimal, b: Decimal) {
  return a.greaterThan(b) ? a : b;
}
function minDecimal(a: Decimal, b: Decimal) {
  return a.lessThan(b) ? a : b;
}
