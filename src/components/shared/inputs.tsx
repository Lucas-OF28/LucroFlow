"use client";

import { forwardRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** "1234.5" → "1.234,50" */
function toDisplay(v: string): string {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/**
 * Campo monetário: digita-se como em app de banco (os dígitos preenchem os centavos).
 * O valor exposto é sempre uma string decimal normalizada ("1234.56") — sem float.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onValueChange: (v: string) => void }
>(function MoneyInput({ value, onValueChange, className, ...props }, ref) {
  const display = toDisplay(value);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={cn("tabular pl-9 text-right", className)}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 14);
          const cents = digits === "" ? "0" : digits;
          const padded = cents.padStart(3, "0");
          const normalized = `${padded.slice(0, -2)}.${padded.slice(-2)}`.replace(/^0+(?=\d)/, "");
          onValueChange(digits === "" ? "" : normalized);
        }}
        {...props}
      />
    </div>
  );
});

/** Quantidade: inteiro para "un", até 3 casas para kg/m/l (D3). */
export function QuantityInput({
  value,
  onValueChange,
  unit = "un",
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onValueChange: (v: string) => void; unit?: string }) {
  const decimals = unit === "un" ? 0 : 3;
  return (
    <Input
      inputMode={decimals ? "decimal" : "numeric"}
      className={cn("tabular text-right", className)}
      value={value}
      onChange={(e) => {
        let v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
        if (!decimals) v = v.replace(/\./g, "");
        else {
          const [i, d] = v.split(".");
          v = d !== undefined ? `${i}.${d.slice(0, decimals)}` : i;
        }
        onValueChange(v);
      }}
      {...props}
    />
  );
}

/** DatePicker acessível e nativo (teclado e leitores de tela; picker do sistema no celular). */
export function DateInput({ value, onValueChange, className, ...props }: Omit<ComponentProps<"input">, "type" | "onChange"> & { value: string; onValueChange: (v: string) => void }) {
  return <Input type="date" value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("tabular", className)} {...props} />;
}
