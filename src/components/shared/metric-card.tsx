import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChangeIndicator } from "./money";

export function MetricCard({
  label,
  value,
  icon: Icon,
  change,
  positiveIsGood = true,
  changeSuffix = "%",
  hint,
  footer,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  change?: string | null;
  positiveIsGood?: boolean;
  changeSuffix?: "%" | "pp";
  /** Explicação da fórmula (transparência dos números). */
  hint?: string;
  footer?: ReactNode;
  tone?: "positive" | "negative" | "neutral";
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex flex-col gap-1 px-4">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          {hint ? (
            <Tooltip>
              <TooltipTrigger className="cursor-help text-left underline decoration-dotted underline-offset-4">{label}</TooltipTrigger>
              <TooltipContent className="max-w-64">{hint}</TooltipContent>
            </Tooltip>
          ) : (
            <span>{label}</span>
          )}
          {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
        </div>
        <div className={cn("tabular text-2xl font-semibold tracking-tight", tone === "positive" && "text-success", tone === "negative" && "text-danger")}>
          {value}
        </div>
        {change !== undefined && <ChangeIndicator value={change} positiveIsGood={positiveIsGood} suffix={changeSuffix} />}
        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}
