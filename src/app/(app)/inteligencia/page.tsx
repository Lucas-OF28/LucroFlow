import type { Metadata } from "next";
import { AlertTriangle, Info, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, todayIn } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { generateInsights } from "@/server/services/insights";
import { daysToSell } from "@/server/services/reports";

export const metadata: Metadata = { title: "Inteligência do negócio" };

const TONE = {
  positive: { icon: TrendingUp, cls: "text-success", label: "Positivo" },
  negative: { icon: TrendingDown, cls: "text-danger", label: "Atenção" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Alerta" },
  neutral: { icon: Info, cls: "text-primary", label: "Informação" },
} as const;

export default async function InsightsPage() {
  const ctx = await requireTenant();
  const today = todayIn(ctx.timezone);
  const [insights, speed] = await Promise.all([generateInsights(ctx), daysToSell(ctx, addDays(today, -179), today)]);
  return (
    <>
      <PageHeader
        title="Inteligência do negócio"
        description="Conclusões calculadas a partir dos seus dados reais — cada uma mostra em que se baseia. Sem dados suficientes, nada é afirmado."
      />
      {insights.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Ainda não há dados suficientes." description="Registre compras e vendas por algumas semanas para ver comparações e tendências confiáveis." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => {
            const t = TONE[i.tone];
            return (
              <li key={i.id}>
                <Card className="h-full">
                  <CardContent className="flex gap-3 pt-6">
                    <t.icon className={cn("mt-0.5 size-5 shrink-0", t.cls)} aria-label={t.label} />
                    <div>
                      <p className="font-medium">{i.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Base: {i.basis}</p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {speed.products.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Tempo médio até a venda (últimos 180 dias)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="hidden sm:table-cell">Categoria</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Dias (média)</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...speed.products].sort((a, b) => (a.averageDays ?? 0) - (b.averageDays ?? 0)).map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{p.categoryName ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(p.units)}</TableCell>
                    <TableCell className="tabular text-right">{p.averageDays ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Calculado pareando entradas e vendas reais (premissa: unidades mais antigas são vendidas primeiro).</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
