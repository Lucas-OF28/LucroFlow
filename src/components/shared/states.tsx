import Link from "next/link";
import { AlertTriangle, type LucideIcon, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string } | ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && typeof action === "object" && "href" in (action as object) ? (
        <Button asChild>
          <Link href={(action as { href: string }).href}>{(action as { label: string }).label}</Link>
        </Button>
      ) : (
        (action as ReactNode)
      )}
    </div>
  );
}

export function ErrorState({ title = "Algo deu errado.", description, retry }: { title?: string; description?: string; retry?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {retry}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6, cards = 0 }: { rows?: number; cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    </div>
  );
}
