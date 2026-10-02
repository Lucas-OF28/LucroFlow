import DecimalBase from "decimal.js";

/**
 * Instância isolada do decimal.js usada em TODO cálculo financeiro do LucroFlow.
 *
 * Estratégia única de dinheiro (ver docs/ARQUITETURA.md §7):
 * - banco: NUMERIC(14,2) para valores, NUMERIC(14,3) para quantidades, NUMERIC(18,6) para custos unitários;
 * - código: Decimal (nunca `number`) para qualquer valor que vá ser somado, multiplicado ou persistido;
 * - arredondamento: ROUND_HALF_UP.
 */
export const Decimal = DecimalBase.clone({
  precision: 40,
  rounding: DecimalBase.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});
export type Decimal = InstanceType<typeof Decimal>;

export type DecimalInput = Decimal | string | number;

export const MONEY_SCALE = 2;
export const QUANTITY_SCALE = 3;
export const UNIT_COST_SCALE = 6;
export const PERCENT_SCALE = 2;

export const ZERO = new Decimal(0);

export function dec(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  if (value instanceof Decimal) return value;
  const d = new Decimal(typeof value === "string" ? value.trim().replace(",", ".") : value);
  if (!d.isFinite()) throw new RangeError(`Valor numérico inválido: ${String(value)}`);
  return d;
}

/** Arredonda um valor monetário para centavos (half-up). */
export function money(value: DecimalInput | null | undefined): Decimal {
  return dec(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function quantity(value: DecimalInput | null | undefined): Decimal {
  return dec(value).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP);
}

export function unitCost(value: DecimalInput | null | undefined): Decimal {
  return dec(value).toDecimalPlaces(UNIT_COST_SCALE, Decimal.ROUND_HALF_UP);
}

/** Serializa para o formato aceito por colunas NUMERIC(…,2). */
export function moneyToDb(value: DecimalInput): string {
  return money(value).toFixed(MONEY_SCALE);
}

export function quantityToDb(value: DecimalInput): string {
  return quantity(value).toFixed(QUANTITY_SCALE);
}

export function unitCostToDb(value: DecimalInput): string {
  return unitCost(value).toFixed(UNIT_COST_SCALE);
}

export function sum(values: Iterable<DecimalInput>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(dec(v));
  return total;
}

export function toCents(value: DecimalInput): bigint {
  return BigInt(money(value).times(100).toFixed(0));
}

export function fromCents(cents: bigint): Decimal {
  return new Decimal(cents.toString()).dividedBy(100);
}
