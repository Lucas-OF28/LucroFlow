"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact, formatMonthShort, formatPercent } from "@/lib/format";

/**
 * Gráficos do LucroFlow (regras da skill dataviz):
 * - até 3 séries, cores categóricas em ORDEM FIXA (series-1 azul, series-2 laranja, series-3 aqua);
 * - linhas de 2px, grade recessiva, um único eixo Y; legenda sempre que houver ≥ 2 séries;
 * - tooltip lista todas as séries no X (valor em destaque, nome secundário, chave em traço);
 * - toda série tem uma "tabela de dados" acessível (os valores nunca dependem só do hover).
 */
import type { SeriesDef } from "./series";

export type { SeriesDef };

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function fmt(v: unknown, f: SeriesDef["format"] = "money") {
  if (v === null || v === undefined) return "—";
  return f === "percent" ? formatPercent(v as number) : formatMoney(v as number);
}

function bucketLabel(b: string, granularity: "day" | "month") {
  return granularity === "month" ? formatMonthShort(b) : `${b.slice(8, 10)}/${b.slice(5, 7)}`;
}

type TooltipData = { active?: boolean; payload?: readonly { dataKey?: unknown; value?: unknown }[]; label?: unknown };

function ChartTooltip({ active, payload, label, series, granularity }: TooltipData & { series: SeriesDef[]; granularity: "day" | "month" | "category" }) {
  if (!active || !payload?.length) return null;
  const title = granularity === "category" ? String(label) : bucketLabel(String(label), granularity);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{title}</p>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        if (!item) return null;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
            <span className="tabular font-semibold text-foreground">{fmt(item.value, s.format)}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ series, shape }: { series: SeriesDef[]; shape: "line" | "rect" }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={shape === "line" ? "h-0.5 w-3 rounded" : "size-2.5 rounded-sm"} style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ rows, series, xKey, xLabel }: { rows: Record<string, unknown>[]; series: SeriesDef[]; xKey: string; xLabel: (v: string) => string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver dados em tabela</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Período</th>
              {series.map((s) => <th key={s.key} className="py-1 pr-2 text-right font-medium">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[xKey])} className="border-t">
                <td className="py-1 pr-2">{xLabel(String(r[xKey]))}</td>
                {series.map((s) => <td key={s.key} className="tabular py-1 pr-2 text-right">{fmt(r[s.key], s.format)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartCard({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function toNumbers(input: readonly object[], keys: string[]) {
  return (input as Record<string, unknown>[]).map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of keys) o[k] = r[k] === null || r[k] === undefined ? null : Number(r[k]);
    return o;
  });
}

/** Linhas ao longo do tempo (ex.: faturamento × lucro líquido). */
export function TimeLineChart({
  data,
  series,
  granularity,
  height = 260,
  zeroLine = true,
}: {
  data: readonly object[];
  series: SeriesDef[];
  granularity: "day" | "month";
  height?: number;
  zeroLine?: boolean;
}) {
  const rows = toNumbers(data, series.map((s) => s.key));
  const percent = series.every((s) => s.format === "percent");
  return (
    <div>
      <Legend series={series} shape="line" />
      <div style={{ height }} role="img" aria-label={`Gráfico de linhas: ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" {...AXIS} tickFormatter={(v) => bucketLabel(v, granularity)} minTickGap={16} />
            <YAxis {...AXIS} width={64} tickFormatter={(v) => (percent ? `${v}%` : formatMoneyCompact(v))} />
            {zeroLine && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />}
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={(p: TooltipData) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} granularity={granularity} />} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} series={series} xKey="bucket" xLabel={(v) => bucketLabel(v, granularity)} />
    </div>
  );
}

/** Barras agrupadas ao longo do tempo (ex.: compras × faturamento). */
export function TimeBarChart({
  data,
  series,
  granularity,
  height = 260,
}: {
  data: readonly object[];
  series: SeriesDef[];
  granularity: "day" | "month";
  height?: number;
}) {
  const rows = toNumbers(data, series.map((s) => s.key));
  return (
    <div>
      <Legend series={series} shape="rect" />
      <div style={{ height }} role="img" aria-label={`Gráfico de barras: ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" {...AXIS} tickFormatter={(v) => bucketLabel(v, granularity)} minTickGap={8} />
            <YAxis {...AXIS} width={64} tickFormatter={(v) => formatMoneyCompact(v)} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p: TooltipData) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={series} granularity={granularity} />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} series={series} xKey="bucket" xLabel={(v) => bucketLabel(v, granularity)} />
    </div>
  );
}

/** Área de uma série (ex.: capital em estoque ao longo do tempo). */
export function TimeAreaChart({ data, serie, granularity, height = 220 }: { data: readonly object[]; serie: SeriesDef; granularity: "day" | "month"; height?: number }) {
  const rows = toNumbers(data, [serie.key]);
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`Evolução: ${serie.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" {...AXIS} tickFormatter={(v) => bucketLabel(v, granularity)} minTickGap={16} />
            <YAxis {...AXIS} width={64} tickFormatter={(v) => formatMoneyCompact(v)} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={(p: TooltipData) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={[serie]} granularity={granularity} />} />
            <Area type="monotone" dataKey={serie.key} stroke={serie.color} strokeWidth={2} fill={serie.color} fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} series={[serie]} xKey="bucket" xLabel={(v) => bucketLabel(v, granularity)} />
    </div>
  );
}

/**
 * Barras horizontais por categoria (uma série → uma cor; categorias nominais NÃO recebem rampa).
 * `colors` opcional só para dados ORDINAIS (ex.: faixas de idade do estoque).
 */
export function CategoryBarChart({
  data,
  serie,
  labelKey,
  colors,
  height,
}: {
  data: readonly object[];
  serie: SeriesDef;
  labelKey: string;
  colors?: string[];
  height?: number;
}) {
  const rows = toNumbers(data, [serie.key]);
  const h = height ?? Math.max(120, rows.length * 36 + 24);
  return (
    <div>
      <div style={{ height: h }} role="img" aria-label={`${serie.label} por ${labelKey}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...AXIS} tickFormatter={(v) => (serie.format === "percent" ? `${v}%` : formatMoneyCompact(v))} />
            <YAxis type="category" dataKey={labelKey} {...AXIS} width={110} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p: TooltipData) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} series={[serie]} granularity="category" />} />
            <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <Bar dataKey={serie.key} fill={serie.color} radius={4} maxBarSize={22} isAnimationActive={false}>
              {colors && rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} series={[serie]} xKey={labelKey} xLabel={(v) => v} />
    </div>
  );
}
