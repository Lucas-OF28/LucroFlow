import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { products, sales } from "@/server/db/schema";
import { withTenant, withUser } from "@/server/db/tenant";
import { listProducts, createProduct } from "@/server/services/products";
import { resolveTenant } from "@/server/services/businesses";
import { createSale, listSales } from "@/server/services/sales";
import { addMember, buy, createTenant, paidNow, product } from "../support/fixtures";

/** Drizzle embrulha o erro do Postgres em `cause`. */
const dbError = (re: RegExp) => (e: unknown) => re.test(String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message));

describe("§57 isolamento multiempresa (RLS + backend)", () => {
  it("usuário da empresa A não vê dados da empresa B, nem forjando o business_id", async () => {
    const a = await createTenant("A");
    const b = await createTenant("B");
    await product(b, "Segredo de B");

    // contexto forjado: usuário de A alegando ser da empresa B
    const forged = { ...a, businessId: b.businessId };
    await expect(listProducts(forged)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const sales = await listSales(forged);
    expect(sales.rows).toHaveLength(0);

    const raw = await withUser(a, (tx) => tx.select().from(products));
    expect(raw.every((r) => r.businessId === a.businessId)).toBe(true);
  });

  it("não consegue inserir em outra empresa", async () => {
    const a = await createTenant("A2");
    const b = await createTenant("B2");
    await expect(createProduct({ ...a, businessId: b.businessId }, { name: "Invasor" })).rejects.toThrow();
  });

  it("resolveTenant ignora empresa da qual o usuário não é membro", async () => {
    const a = await createTenant("A3");
    const b = await createTenant("B3");
    const resolved = await resolveTenant(a, b.businessId);
    expect(resolved?.businessId).toBe(a.businessId);
  });

  it("venda não pode referenciar produto de outra empresa", async () => {
    const a = await createTenant("A4");
    const b = await createTenant("B4");
    const pb = await product(b);
    await buy(b, pb, 5, "10");
    await expect(
      createSale(a, { items: [{ productId: pb, quantity: "1", unitPrice: "20" }], payments: paidNow("20.00") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("papel da aplicação não pode apagar vendas nem alterar o livro-razão", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    await buy(ctx, p, 2, "10");
    await createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "20" }], payments: paidNow("20.00") });
    await expect(withTenant(ctx, (tx) => tx.delete(sales))).rejects.toSatisfy(dbError(/permission denied/));
    await expect(withTenant(ctx, (tx) => tx.execute(sql`update inventory_movements set quantity_delta = 99`))).rejects.toSatisfy(dbError(/permission denied/));
    await expect(withTenant(ctx, (tx) => tx.execute(sql`delete from audit_logs`))).rejects.toSatisfy(dbError(/permission denied/));
  });

  it("VIEWER só lê", async () => {
    const owner = await createTenant();
    const viewer = await addMember(owner, "VIEWER");
    await expect(createProduct(viewer, { name: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listProducts(viewer)).total).toBe(0);
  });

  it("banco rejeita estoque negativo mesmo se a aplicação errar (CHECK)", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    await expect(
      withTenant(ctx, (tx) => tx.execute(sql`update products set stock_quantity = -1 where id = ${p}`)),
    ).rejects.toSatisfy(dbError(/products_stock_quantity_non_negative/));
  });
});
