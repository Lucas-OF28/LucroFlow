import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMoney, formatSignedMoney, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Valor monetário com sinal TEXTUAL (+/−) e cor — nunca só cor (§92). */
export function SignedMoney({ value, className }: { value: string | number | null | undefined; className?: string }) {
  const n = Number(value ?? 0);
  return (
    <span className={cn("tabular whitespace-nowrap", n > 0 && "text-success", n < 0 && "text-danger", className)}>
      {formatSignedMoney(value)}
    </span>
  );
}

export function Money({ value, className }: { value: string | number | null | undefined; className?: string }) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatMoney(value)}</span>;
}

/**
 * Variação vs. período anterior. `positiveIsGood=false` para custos/despesas (subir é ruim).
 * Ícone + sinal + texto acessível; a cor só reforça.
 */
export function ChangeIndicator({
  value,
  positiveIsGood = true,
  suffix = "%",
  label = "vs. período anterior",
}: {
  value: string | null | undefined;
  positiveIsGood?: boolean;
  suffix?: "%" | "pp";
  label?: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">sem base de comparação</span>;
  }
  const n = Number(value);
  const good = n === 0 ? null : (n > 0) === positiveIsGood;
  const Icon = n > 0 ? ArrowUpRight : n < 0 ? ArrowDownRight : Minus;
  const text = suffix === "%" ? formatSignedPercent(value) : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1).replace(".", ",")} p.p.`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good === true && "text-success", good === false && "text-danger", good === null && "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular">{text}</span>
      <span className="sr-only"> {label}</span>
    </span>
  );
}
