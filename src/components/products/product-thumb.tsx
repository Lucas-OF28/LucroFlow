import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Miniatura da foto (URL assinada) ou placeholder. */
export function ProductThumb({ url, name, className }: { url?: string; name: string; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração (não otimizável pelo next/image)
        <img src={url} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        <Package className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
