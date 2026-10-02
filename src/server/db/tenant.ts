import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Transaction } from "./client";

export type MemberRole = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

/** Identidade do usuário autenticado — SEMPRE obtida da sessão no servidor. */
export interface UserContext {
  userId: string;
}

/**
 * Contexto de empresa validado no servidor (sessão + membership).
 * `businessId` nunca vem de formulário/requisição sem passar por `resolveTenant`.
 */
export interface TenantContext extends UserContext {
  businessId: string;
  role: MemberRole;
  timezone: string;
}

/**
 * Executa `fn` numa transação com a identidade do usuário aplicada ao Postgres:
 *   SET LOCAL ROLE lucroflow_app  → RLS passa a valer
 *   app.user_id                    → políticas filtram pelas empresas do usuário
 * Qualquer erro → ROLLBACK de tudo.
 */
export async function withUser<T>(ctx: UserContext, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`set local role lucroflow_app`);
    return fn(tx);
  });
}

/** Igual a `withUser`, para operações dentro de uma empresa. */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withUser(ctx, fn);
}
