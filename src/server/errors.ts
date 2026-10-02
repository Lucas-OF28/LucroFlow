export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "BELOW_COST_CONFIRMATION_REQUIRED"
  | "INTERNAL";

/**
 * Erro de domínio: a mensagem é SEGURA para mostrar ao usuário final.
 * Erros inesperados (bugs, banco) nunca chegam ao usuário — viram uma mensagem genérica + log.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Registro") => new AppError("NOT_FOUND", `${what} não encontrado.`);
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new AppError("FORBIDDEN", msg);
export const invalid = (msg: string, details?: Record<string, unknown>) => new AppError("VALIDATION", msg, details);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Códigos do Postgres que representam violação de regra (não bug). */
export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string") {
      const code = (e as { code: string }).code;
      if (/^[0-9A-Z]{5}$/.test(code)) return code;
    }
    e = (e as { cause?: unknown })?.cause;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    const c = (e as { constraint_name?: string; constraint?: string })?.constraint_name ?? (e as { constraint?: string })?.constraint;
    if (c) return c;
    e = (e as { cause?: unknown })?.cause;
  }
  return undefined;
}
