/**
 * Logger estruturado (JSON em uma linha) — pronto para qualquer coletor (Vercel, Datadog, Loki…).
 * Nunca registrar tokens, senhas ou chaves. Campos sensíveis conhecidos são mascarados, e erros de banco perdem os
 * VALORES das consultas (parâmetros com nomes, telefones, valores) — fica só a estrutura da query, suficiente para diagnóstico.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|key|^(parameters|params|args)$/i;

/** Remove o trecho "params: …" que o Drizzle anexa às mensagens de erro de query. */
function scrubMessage(message: string): string {
  return message.replace(/\nparams:[\s\S]*$/, "\nparams: [redacted]");
}

function threshold(): number {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[l] ?? ORDER.info;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (value instanceof Error) {
    const extra: Record<string, unknown> = {};
    for (const k of ["code", "constraint_name", "table_name", "column_name", "severity", "routine"]) {
      if (k in value) extra[k] = (value as unknown as Record<string, unknown>)[k];
    }
    return {
      name: value.name,
      message: scrubMessage(value.message),
      stack: value.stack ? scrubMessage(value.stack) : undefined,
      ...extra,
      cause: sanitize((value as { cause?: unknown }).cause, depth + 1),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    return out;
  }
  if (typeof value === "string") return scrubMessage(value);
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(sanitize(fields ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

export function newErrorId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export const __test = { sanitize };
