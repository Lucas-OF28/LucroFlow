import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp, newNonce, sessionCookieOptions } from "@/lib/security";
import { __test } from "@/server/logger";

describe("Content Security Policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("scripts só com nonce; conexões só para o app e o Supabase; sem iframe", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const csp = buildCsp("NONCE123");
    expect(csp).toContain("script-src 'self' 'nonce-NONCE123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("nonce é único por requisição", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});

describe("cookies de sessão", () => {
  it("sempre httpOnly e sameSite=lax, mesmo que a biblioteca peça o contrário", () => {
    const o = sessionCookieOptions({ httpOnly: false, sameSite: "none", maxAge: 10 });
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.maxAge).toBe(10);
  });
});

describe("logs sem dados sensíveis", () => {
  it("remove os valores das queries que falharam e mascara chaves sensíveis", () => {
    const err = Object.assign(new Error('Failed query: insert into "customers" ("name","whatsapp") values ($1, $2)\nparams: Maria Silva,21999998888'), {
      parameters: ["Maria Silva", "21999998888"],
      code: "23505",
    });
    const out = JSON.stringify(__test.sanitize({ err, password: "x", authorization: "Bearer abc", userEmail: "ok" }));
    expect(out).not.toContain("Maria Silva");
    expect(out).not.toContain("21999998888");
    expect(out).not.toContain("Bearer abc");
    expect(out).toContain("params: [redacted]");
    expect(out).toContain("23505");
    expect(out).toContain('insert into \\"customers\\"');
  });
});
