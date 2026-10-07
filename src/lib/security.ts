/**
 * Políticas de segurança centralizadas (usadas pelo proxy e pelo cliente Supabase do servidor).
 * Nada aqui é segredo: são regras que o navegador aplica.
 */

/** Cookies de sessão: invisíveis ao JavaScript (httpOnly), só via HTTPS em produção, não enviados em POST cross-site. */
export function sessionCookieOptions<T extends object>(options?: T) {
  return {
    ...((options ?? {}) as T),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Content Security Policy com nonce por requisição:
 * - scripts: só os do próprio app com o nonce da resposta ('strict-dynamic' propaga para os chunks do Next);
 *   script injetado (XSS) não executa;
 * - conexões (fetch/XHR): só o próprio app e o Supabase (upload direto de fotos) — dados não podem ser enviados
 *   para domínios de terceiros mesmo que algum script consiga rodar;
 * - imagens: app + URLs assinadas do Supabase Storage;
 * - frame-ancestors 'none': o app não pode ser embutido em iframe (clickjacking);
 * - form-action 'self': formulários só enviam para o próprio app.
 * Estilos inline são permitidos (atributos style de bibliotecas de UI/gráficos); estilo não executa código.
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabase}`,
    `font-src 'self'`,
    `connect-src 'self' ${supabase}${isDev ? " ws: wss:" : ""}`,
    `media-src 'self'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ").replace(/\s{2,}/g, " ");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
