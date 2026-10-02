import { PERIOD_LABELS, type Period, type PeriodPreset, resolvePeriod, todayIn } from "./dates";

export type SP = Record<string, string | string[] | undefined>;

export function str(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function int(sp: SP, key: string, fallback = 1): number {
  const n = Number(str(sp, key));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function periodFrom(sp: SP, timezone: string, fallback: PeriodPreset = "this_month"): Period {
  const raw = str(sp, "periodo");
  const preset = raw && raw in PERIOD_LABELS ? (raw as PeriodPreset) : fallback;
  return resolvePeriod(preset, todayIn(timezone), { from: str(sp, "de"), to: str(sp, "ate") });
}
