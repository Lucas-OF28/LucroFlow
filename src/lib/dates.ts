/**
 * Datas comerciais ("YYYY-MM-DD") sempre no fuso da EMPRESA — nunca UTC implícito.
 * Aritmética feita em UTC puro sobre datas sem hora, então independe do fuso do servidor.
 */
export type IsoDate = string;

export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function toUtc(d: IsoDate): Date {
  return new Date(`${d}T00:00:00Z`);
}
function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUtc(x);
}

export function addMonths(d: IsoDate, n: number): IsoDate {
  const x = toUtc(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return fromUtc(x);
}

export function startOfMonth(d: IsoDate): IsoDate {
  return `${d.slice(0, 7)}-01`;
}
export function endOfMonth(d: IsoDate): IsoDate {
  return addDays(addMonths(startOfMonth(d), 1), -1);
}
export function startOfYear(d: IsoDate): IsoDate {
  return `${d.slice(0, 4)}-01-01`;
}
/** Semana começando na segunda-feira. */
export function startOfWeek(d: IsoDate): IsoDate {
  const dow = toUtc(d).getUTCDay(); // 0 = domingo
  return addDays(d, -((dow + 6) % 7));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export type PeriodPreset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  this_week: "Esta semana",
  this_month: "Este mês",
  last_month: "Mês anterior",
  last_3_months: "Últimos 3 meses",
  last_6_months: "Últimos 6 meses",
  this_year: "Este ano",
  custom: "Período personalizado",
};

export interface Period {
  preset: PeriodPreset;
  from: IsoDate;
  to: IsoDate;
}

/** Resolve um período (inclusive nas duas pontas) relativo a "hoje" no fuso da empresa. */
export function resolvePeriod(preset: PeriodPreset, today: IsoDate, custom?: { from?: string; to?: string }): Period {
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "this_week":
      return { preset, from: startOfWeek(today), to: today };
    case "this_month":
      return { preset, from: startOfMonth(today), to: today };
    case "last_month": {
      const from = addMonths(startOfMonth(today), -1);
      return { preset, from, to: endOfMonth(from) };
    }
    case "last_3_months":
      return { preset, from: addMonths(startOfMonth(today), -2), to: today };
    case "last_6_months":
      return { preset, from: addMonths(startOfMonth(today), -5), to: today };
    case "this_year":
      return { preset, from: startOfYear(today), to: today };
    case "custom": {
      const from = custom?.from && isIsoDate(custom.from) ? custom.from : startOfMonth(today);
      const to = custom?.to && isIsoDate(custom.to) ? custom.to : today;
      return from <= to ? { preset, from, to } : { preset, from: to, to: from };
    }
  }
}

/**
 * Período anterior equivalente para comparação.
 * - períodos de mês(es) fechados ou "mês até hoje" comparam com o mesmo trecho do(s) mês(es) anterior(es);
 * - demais comparam com o mesmo número de dias imediatamente antes.
 */
export function previousPeriod(p: Period): { from: IsoDate; to: IsoDate } {
  const monthAligned = p.from === startOfMonth(p.from);
  if (monthAligned && p.preset !== "today" && p.preset !== "this_week" && p.preset !== "custom") {
    const months = (Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4))) * 12 + Number(p.to.slice(5, 7)) - Number(p.from.slice(5, 7)) + 1;
    const from = addMonths(p.from, -months);
    const toCandidate = addMonths(p.to, -months);
    // se o período atual termina no fim do mês, o anterior também termina no fim do mês
    const to = p.to === endOfMonth(p.to) ? endOfMonth(toCandidate) : toCandidate;
    return { from, to };
  }
  const len = daysBetween(p.from, p.to) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function monthsInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let m = startOfMonth(from);
  while (m <= to) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}
