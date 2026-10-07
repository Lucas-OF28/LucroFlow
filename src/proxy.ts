import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp, newNonce, sessionCookieOptions } from "@/lib/security";

const PUBLIC_PATHS = ["/login", "/cadastro", "/recuperar-senha", "/auth", "/offline"];

/**
 * Antes de cada página:
 * 1. gera um nonce e aplica a Content Security Policy (o Next lê o nonce do cabeçalho da requisição);
 * 2. renova a sessão do Supabase, regravando os cookies como httpOnly (o token nunca fica acessível ao JS);
 * 3. protege as rotas privadas. A autorização de verdade (empresa/papel) acontece no servidor, em cada página/ação.
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const withCsp = <T extends NextResponse>(res: T) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!url || !anonKey) {
    // Sem configuração não há como autenticar: só as telas públicas (que explicam o setup) abrem.
    return isPublic ? withCsp(next()) : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = next();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: sessionCookieOptions({}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = next();
        for (const { name, value, options } of list) response.cookies.set(name, value, sessionCookieOptions(options));
      },
    },
  });

  // getClaims valida a assinatura do JWT (não confia cegamente no cookie).
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  const redirect = (to: URL) => {
    const res = NextResponse.redirect(to);
    // preserva a sessão renovada no redirecionamento
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };
  if (!isAuthenticated && !isPublic) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
    return redirect(login);
  }
  if (isAuthenticated && (pathname === "/login" || pathname === "/cadastro")) {
    return redirect(new URL("/", request.url));
  }
  return withCsp(response);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      // prefetch do next/link não precisa de CSP/sessão nova (evita trabalho dobrado)
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
