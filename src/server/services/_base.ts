import "server-only";
import { eq, getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { type Permission, can } from "@/lib/permissions";
import type { Transaction } from "../db/client";
import { auditLogs, businesses } from "../db/schema";
import type { TenantContext } from "../db/tenant";
import { AppError, forbidden } from "../errors";

export function assertCan(ctx: TenantContext, permission: Permission, message?: string) {
  if (!can(ctx.role, permission)) throw forbidden(message);
}

/** Validação no servidor (sempre), com mensagem amigável do primeiro erro. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError("VALIDATION", first?.message ?? "Dados inválidos.", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

export async function audit(
  tx: Transaction,
  ctx: TenantContext,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(auditLogs).values({
    businessId: ctx.businessId,
    userId: ctx.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    metadata: entry.metadata ?? {},
  });
}

const PREFIX = { SALE: "VEN", PURCHASE: "COM", RETURN: "DEV" } as const;
export type DocumentType = keyof typeof PREFIX;

/**
 * Próximo número amigável por empresa. O UPSERT trava a linha da sequência até o fim da transação,
 * então duas vendas simultâneas nunca recebem o mesmo número (e não há buracos se houver rollback).
 */
export async function nextDocumentNumber(tx: Transaction, businessId: string, type: DocumentType) {
  const rows = await tx.execute<{ last_value: number }>(sql`
    insert into document_sequences (business_id, doc_type, last_value)
    values (${businessId}, ${type}, 1)
    on conflict (business_id, doc_type) do update set last_value = document_sequences.last_value + 1
    returning last_value`);
  const number = Number(rows[0].last_value);
  return { number, code: `${PREFIX[type]}-${String(number).padStart(6, "0")}` };
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function pageOf<T>(rows: T[], total: number, page: number, pageSize: number): Page<T> {
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escapa curingas do LIKE para buscas digitadas pelo usuário. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/**
 * Referência totalmente qualificada ("tabela"."coluna") para usar dentro de subqueries em sql``.
 * Em selects de uma tabela só o Drizzle renderiza `${t.id}` como "id" — dentro de uma subquery isso
 * seria resolvido contra a tabela INTERNA (bug silencioso). Sempre use ref(col) em subqueries correlacionadas.
 */
export function ref(column: AnyPgColumn) {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}

/** Configurações da empresa do contexto. Falha FECHADO se a empresa não for visível (RLS) ao usuário. */
export async function businessSettings(tx: Transaction, ctx: TenantContext) {
  const [b] = await tx
    .select({ name: businesses.name, timezone: businesses.timezone, staleDays: businesses.staleDays })
    .from(businesses)
    .where(eq(businesses.id, ctx.businessId));
  if (!b) throw forbidden();
  return b;
}
