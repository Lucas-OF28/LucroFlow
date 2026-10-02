import { Decimal, type DecimalInput, ZERO, dec, fromCents, toCents } from "./decimal";

/**
 * Rateio de um valor monetário entre N partes, proporcional aos pesos.
 *
 * Regra (docs/ARQUITETURA.md §7 "Rateio"):
 * - proporcional ao peso de cada parte (ex.: valor líquido do item);
 * - se todos os pesos forem zero, usa `fallbackWeights` (ex.: quantidades); se ainda zero, partes iguais;
 * - arredondamento pelo método do MAIOR RESTO em centavos, então Σ partes === total, sempre;
 * - empate no resto: a parte de menor índice recebe o centavo (determinístico).
 */
export function allocateProportionally(
  total: DecimalInput,
  weights: readonly DecimalInput[],
  fallbackWeights?: readonly DecimalInput[],
): Decimal[] {
  const n = weights.length;
  if (n === 0) {
    if (!dec(total).isZero()) throw new Error("Não há itens para ratear o valor.");
    return [];
  }

  let w = weights.map(dec);
  if (w.some((x) => x.isNegative())) throw new Error("Pesos de rateio não podem ser negativos.");
  if (w.every((x) => x.isZero())) {
    w = fallbackWeights && fallbackWeights.some((x) => !dec(x).isZero())
      ? fallbackWeights.map(dec)
      : weights.map(() => new Decimal(1));
  }

  const totalCents = toCents(total);
  if (totalCents === BigInt(0)) return weights.map(() => ZERO);

  const negative = totalCents < BigInt(0);
  const absCents = negative ? -totalCents : totalCents;
  const weightSum = w.reduce((a, b) => a.plus(b), ZERO);

  const exact = w.map((x) => new Decimal(absCents.toString()).times(x).dividedBy(weightSum));
  const floors = exact.map((x) => BigInt(x.floor().toFixed(0)));
  let remaining = absCents - floors.reduce((a, b) => a + b, BigInt(0));

  const order = exact
    .map((x, i) => ({ i, rem: x.minus(x.floor()) }))
    .sort((a, b) => b.rem.comparedTo(a.rem) || a.i - b.i);

  for (const { i } of order) {
    if (remaining <= BigInt(0)) break;
    floors[i] += BigInt(1);
    remaining -= BigInt(1);
  }

  return floors.map((c) => fromCents(negative ? -c : c));
}
