import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant";
import { hit } from "@/server/rate-limit";
import { createTenant } from "../support/fixtures";

describe("limite de tentativas", () => {
  it("bloqueia depois do limite (cadastro: 5 por IP por hora) e conta cada chave separadamente", async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}-${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await hit("signUpIp", ip));
    expect(results).toEqual([true, true, true, true, true, false, false]);
    expect(await hit("signUpIp", `${ip}-outro`)).toBe(true);
  });

  it("não guarda IP/e-mail em claro", async () => {
    const email = `alguem-${randomUUID()}@exemplo.com`;
    await hit("signInEmail", email);
    const rows = await getDb().execute<{ key: string }>(sql`select key from app.rate_limits`);
    expect(rows.some((r) => r.key.includes(email) || r.key.includes("alguem-"))).toBe(false);
  });

  it("a tabela de limites não é acessível pelo papel da aplicação", async () => {
    const ctx = await createTenant();
    await expect(withTenant(ctx, (tx) => tx.execute(sql`select * from app.rate_limits`))).rejects.toThrow();
  });
});
