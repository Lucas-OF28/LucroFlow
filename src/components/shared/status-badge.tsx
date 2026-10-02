import { AlertCircle, Ban, CheckCircle2, CircleDashed, Clock, PackageX, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  CONFIRMED: { label: "Confirmada", icon: CheckCircle2, cls: "bg-success/10 text-success" },
  CANCELLED: { label: "Cancelada", icon: Ban, cls: "bg-muted text-muted-foreground line-through decoration-1" },
  PAID: { label: "Pago", icon: CheckCircle2, cls: "bg-success/10 text-success" },
  PARTIAL: { label: "Parcial", icon: CircleDashed, cls: "bg-warning/15 text-warning-foreground dark:text-warning" },
  PENDING: { label: "Pendente", icon: Clock, cls: "bg-muted text-foreground" },
  OVERDUE: { label: "Vencido", icon: AlertCircle, cls: "bg-danger/10 text-danger" },
  ACTIVE: { label: "Ativo", icon: CheckCircle2, cls: "bg-success/10 text-success" },
  INACTIVE: { label: "Inativo", icon: Ban, cls: "bg-muted text-muted-foreground" },
  OUT_OF_STOCK: { label: "Sem estoque", icon: PackageX, cls: "bg-danger/10 text-danger" },
  LOW_STOCK: { label: "Estoque baixo", icon: AlertCircle, cls: "bg-warning/15 text-warning-foreground dark:text-warning" },
  LOSS: { label: "Prejuízo", icon: TrendingDown, cls: "bg-danger/10 text-danger" },
} as const;

export type StatusKey = keyof typeof STATUS;

/** Status com ícone + texto (nunca só cor). */
export function StatusBadge({ status, label, className }: { status: StatusKey; label?: string; className?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.cls, className)}>
      <Icon className="size-3" aria-hidden />
      {label ?? s.label}
    </span>
  );
}
