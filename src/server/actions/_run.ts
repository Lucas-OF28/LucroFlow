import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import type { TenantContext } from "../db/tenant";
import { requireTenant } from "../auth/session";
import { isAppError, pgConstraint, pgErrorCode } from "../errors";
import { logger, newErrorId } from "../logger";

/**
 * Executa uma ação com tratamento centralizado de erros:
 * - erros de domínio → mensagem amigável (segura) ao usuário;
 * - violações de integridade do banco → mensagem genérica de conflito;
 * - qualquer outro erro → "Não foi possível…", e o detalhe técnico vai para o log com um id de correlação.
 */
export async function runAction<T>(
  operation: string,
  fn: () => Promise<T>,
  friendly = "Não foi possível concluir a operação. Tente novamente.",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err); // redirect()/notFound() do Next não são erros
    if (isAppError(err)) {
      const fieldErrors = Array.isArray(err.details?.issues)
        ? Object.fromEntries((err.details.issues as { path: string; message: string }[]).map((i) => [i.path, i.message]))
        : undefined;
      const details = { ...err.details };
      delete details.issues;
      return { ok: false, error: err.message, code: err.code, fieldErrors, details };
    }
    const errorId = newErrorId();
    const code = pgErrorCode(err);
    logger.error("action.failed", { operation, errorId, pgCode: code, constraint: pgConstraint(err), err });
    if (code === "23505") return { ok: false, error: "Já existe um registro com esses dados.", code: "CONFLICT" };
    if (code === "23514" || code === "23503") {
      return { ok: false, error: "Os dados violam uma regra de consistência e não foram salvos.", code: "CONFLICT" };
    }
    if (code === "42501") return { ok: false, error: "Você não tem permissão para esta ação.", code: "FORBIDDEN" };
    return { ok: false, error: `${friendly} (código ${errorId})`, code: "INTERNAL" };
  }
}

/** Atalho: resolve o contexto da empresa (sessão + membership) e executa a ação. */
export async function tenantAction<T>(operation: string, fn: (ctx: TenantContext) => Promise<T>, friendly?: string) {
  return runAction(operation, async () => fn(await requireTenant()), friendly);
}
