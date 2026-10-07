import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "./db/client";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Limites de tentativa (janela fixa, contador no Postgres — funciona com várias instâncias serverless).
 * Chaves são hashes SHA-256: nem IP nem e-mail ficam gravados em claro.
 */
export const LIMITS = {
  signInIp: { limit: 20, windowSeconds: 10 * 60 },
  signInEmail: { limit: 8, windowSeconds: 15 * 60 },
  signUpIp: { limit: 5, windowSeconds: 60 * 60 },
  resetIp: { limit: 5, windowSeconds: 60 * 60 },
  resetEmail: { limit: 3, windowSeconds: 60 * 60 },
  uploadUser: { limit: 60, windowSeconds: 60 * 60 },
  exportUser: { limit: 30, windowSeconds: 10 * 60 },
} as const;
export type LimitName = keyof typeof LIMITS;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** IP do cliente. Na Vercel, x-forwarded-for é definido pela própria plataforma (o primeiro valor é o cliente). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** true = permitido. Em caso de falha do banco, permite (não bloqueia o usuário por erro de infraestrutura) e registra. */
export async function hit(name: LimitName, subject: string): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[name];
  try {
    const rows = await getDb().execute<{ ok: boolean }>(
      sql`select app.rate_limit_hit(${`${name}:${hash(subject.toLowerCase())}`}, ${limit}, ${windowSeconds}) as ok`,
    );
    const ok = Boolean(rows[0]?.ok);
    if (!ok) logger.warn("rate_limit.blocked", { limit: name });
    return ok;
  } catch (err) {
    logger.error("rate_limit.failed", { limit: name, err });
    return true;
  }
}

export const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

/** Versão que lança erro de domínio (para uso dentro de serviços/ações). */
export async function enforce(name: LimitName, subject: string) {
  if (!(await hit(name, subject))) throw new AppError("FORBIDDEN", TOO_MANY);
}
