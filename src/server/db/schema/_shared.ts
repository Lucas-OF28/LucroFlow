import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tipos de coluna padronizados. NUNCA usar real/double para dinheiro.
 * Drizzle devolve NUMERIC como string → convertida para Decimal em src/lib/finance.
 */
export const moneyCol = (name: string) => numeric(name, { precision: 14, scale: 2 });
export const quantityCol = (name: string) => numeric(name, { precision: 14, scale: 3 });
export const unitCostCol = (name: string) => numeric(name, { precision: 18, scale: 6 });
export const percentCol = (name: string) => numeric(name, { precision: 7, scale: 2 });

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
