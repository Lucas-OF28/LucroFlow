import { Decimal, type DecimalInput, PERCENT_SCALE, dec, money } from "./decimal";

/**
 * Indicadores financeiros. Fonte ÚNICA das fórmulas — componentes nunca recalculam isto.
 * Percentuais são retornados em pontos percentuais (12.79 = 12,79%) ou `null` quando
 * o denominador é zero (indicador indefinido, não "0%").
 */

/** Margem = lucro / receita × 100. Indefinida (null) quando a receita é zero ou negativa (ex.: mês só com devoluções). */
export function margin(profit: DecimalInput, revenue: DecimalInput): Decimal | null {
  const r = dec(revenue);
  if (r.lessThanOrEqualTo(0)) return null;
  return dec(profit).dividedBy(r).times(100).toDecimalPlaces(PERCENT_SCALE);
}

/** ROI = lucro / custo × 100. Nunca chamar de margem. Indefinido quando o custo é zero ou negativo. */
export function roi(profit: DecimalInput, cost: DecimalInput): Decimal | null {
  const c = dec(cost);
  if (c.lessThanOrEqualTo(0)) return null;
  return dec(profit).dividedBy(c).times(100).toDecimalPlaces(PERCENT_SCALE);
}

/** Markup = preço / custo (multiplicador, ex.: 1.5×). Nunca apresentar como margem. */
export function markup(price: DecimalInput, cost: DecimalInput): Decimal | null {
  const c = dec(cost);
  if (c.isZero()) return null;
  return dec(price).dividedBy(c).toDecimalPlaces(4);
}

/**
 * Preço necessário para atingir uma margem desejada sobre a receita:
 * preço = custo / (1 − margem). Ex.: custo 100, margem 30% → 142,86 (e não 130, que seria markup de 30%).
 */
export function priceForTargetMargin(cost: DecimalInput, targetMarginPercent: DecimalInput): Decimal | null {
  const m = dec(targetMarginPercent).dividedBy(100);
  if (m.greaterThanOrEqualTo(1) || m.isNegative()) return null;
  return money(dec(cost).dividedBy(new Decimal(1).minus(m)));
}

/** Variação percentual entre períodos: (atual − anterior) / |anterior| × 100. */
export function percentChange(current: DecimalInput, previous: DecimalInput): Decimal | null {
  const p = dec(previous);
  if (p.isZero()) return null;
  return dec(current).minus(p).dividedBy(p.abs()).times(100).toDecimalPlaces(PERCENT_SCALE);
}

/** Participação de uma parte no todo, em %. */
export function share(part: DecimalInput, whole: DecimalInput): Decimal | null {
  const w = dec(whole);
  if (w.isZero()) return null;
  return dec(part).dividedBy(w).times(100).toDecimalPlaces(PERCENT_SCALE);
}

/** Divisão monetária segura (ex.: ticket médio). */
export function average(total: DecimalInput, count: DecimalInput): Decimal | null {
  const c = dec(count);
  if (c.isZero()) return null;
  return money(dec(total).dividedBy(c));
}
