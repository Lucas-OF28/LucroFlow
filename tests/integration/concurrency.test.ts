import { describe, expect, it } from "vitest";
import { createSale } from "@/server/services/sales";
import { addMember, buy, createTenant, paidNow, product, stockSnapshot } from "../support/fixtures";

describe("§67 concorrência", () => {
  it("estoque 1, dois usuários vendem ao mesmo tempo: só uma venda é confirmada", async () => {
    const owner = await createTenant();
    const employee = await addMember(owner, "EMPLOYEE");
    const p = await product(owner);
    await buy(owner, p, 1, "100");

    const attempt = (ctx: typeof owner) =>
      createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "150" }], payments: paidNow("150.00") });

    const results = await Promise.allSettled([attempt(owner), attempt(employee)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const snap = await stockSnapshot(p);
    expect(snap.qty).toBe("0.000");
    expect(snap.value).toBe("0.00");
  });

  it("20 vendas simultâneas sobre estoque 7: exatamente 7 confirmadas, numeração sem duplicidade", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    await buy(ctx, p, 7, "10");
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "15" }], payments: paidNow("15.00") }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ code: string }>[];
    expect(ok).toHaveLength(7);
    expect(new Set(ok.map((r) => r.value.code)).size).toBe(7);
    const snap = await stockSnapshot(p);
    expect(snap.qty).toBe("0.000");
    expect(snap.mq).toBe("0.000");
  });
});
