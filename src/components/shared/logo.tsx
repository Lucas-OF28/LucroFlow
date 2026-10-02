import { cn } from "@/lib/utils";

/** Marca: um fluxo ascendente (movimento + crescimento) dentro de um quadrado arredondado. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M7 21.5c3.2 0 4.4-5 7.6-5s3.6 2.6 6.4 2.6c2.4 0 3.4-4.6 4-8.1" fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-primary-foreground" />
      <circle cx="25" cy="11" r="2.2" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">
        Lucro<span className="text-primary">Flow</span>
      </span>
    </span>
  );
}
