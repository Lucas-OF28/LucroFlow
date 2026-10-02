import { describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/lib/dates";
import { cancelPurchase, createPurchase, getPurchase } from "@/server/services/purchases";
import { receivablesSummary } from "@/server/services/receivables";
import { periodSummary } from "@/server/services/reports";
import { createReturn } from "@/server/services/returns";
import { cancelSale, createSale, getSale } from "@/server/services/sales";
import { addMember, buy, createTenant, paidNow, product, stockSnapshot } from "../support/fixtures";

describe("cancelamento de venda (§33)", () => {
  it("estorna estoque pelo custo histórico, cancela parcelas, estorna recebido e sai dos indicadores", async () => {
    const ctx = await createTenant();
    const today = todayIn(ctx.timezone);
    const p = await product(ctx);
    await buy(ctx, p, 2, "100");
    const sale = await createSale(ctx, {
      items: [{ productId: p, quantity: "2", unitPrice: "150" }],
      payments: [
        { method: "PIX", amount: "100", received: true },
        { method: "BOLETO", amount: "200", received: false, dueDate: addDays(today, 30) },
      ],
    });
    expect((await stockSnapshot(p)).qty).toBe("0.000");
    // custo médio muda depois da venda; o estorno usa o custo histórico
    await buy(ctx, p, 1, "300");

    const res = await cancelSale(ctx, sale.id, { reason: "Cliente desistiu", refundMethod: "PIX" });
    expect(res.refunded).toBe("100.00");

    const snap = await stockSnapshot(p);
    expect(snap.qty).toBe("3.000");
    expect(snap.value).toBe("500.00");
    expect(snap.mv).toBe(snap.value);

    const detail = await getSale(ctx, sale.id);
    expect(detail!.status).toBe("CANCELLED");
    expect(detail!.receivables.every((r) => r.status !== "PENDING")).toBe(true);
    expect((await receivablesSummary(ctx)).open).toBe("0");

    const s = await periodSummary(ctx, today, today);
    expect(s.revenue).toBe("0.00");
    expect(s.saleCount).toBe(0);
    expect(s.cashIn).toBe("100.00");
    expect(s.cashOut).toBe("100.00");

    await expect(cancelSale(ctx, sale.id, { reason: "de novo" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("EMPLOYEE não pode cancelar", async () => {
    const owner = await createTenant();
    const emp = await addMember(owner, "EMPLOYEE");
    const p = await product(owner);
    await buy(owner, p, 1, "10");
    const sale = await createSale(emp, { items: [{ productId: p, quantity: "1", unitPrice: "20" }], payments: paidNow("20.00") });
    await expect(cancelSale(emp, sale.id, { reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("devolução (§34, D2)", () => {
  it("parcial: abate o saldo a receber primeiro, volta ao estoque pelo custo histórico, reduz receita na data da devolução", async () => {
    const ctx = await createTenant();
    const today = todayIn(ctx.timezone);
    const p = await product(ctx);
    await buy(ctx, p, 3, "100");
    const sale = await createSale(ctx, {
      items: [{ productId: p, quantity: "3", unitPrice: "200" }],
      payments: [
        { method: "PIX", amount: "200", received: true },
        { method: "PIX", amount: "400", received: false, dueDate: addDays(today, 10) },
      ],
    });
    const detail = await getSale(ctx, sale.id);
    const item = detail!.items[0].item;

    const ret = await createReturn(ctx, {
      saleId: sale.id,
      reason: "Defeito",
      items: [{ saleItemId: item.id, quantity: "1", restock: true }],
    });
    expect(ret.refundTotal).toBe("200.00");
    expect(ret.receivableReduction).toBe("200.00");
    expect(ret.cashRefund).toBe("0.00");
    expect((await receivablesSummary(ctx)).open).toBe("200.00");

    const snap = await stockSnapshot(p);
    expect(snap.qty).toBe("1.000");
    expect(snap.value).toBe("100.00");

    const s = await periodSummary(ctx, today, today);
    expect(s.revenue).toBe("400.00");
    expect(s.cogs).toBe("200.00");
    expect(s.grossProfit).toBe("200.00");
    expect(s.unitsSold).toBe("2.000");

    // devolução do restante sem restock (avariado): reembolso em dinheiro do excedente
    const ret2 = await createReturn(ctx, {
      saleId: sale.id,
      reason: "Avaria",
      refundMethod: "PIX",
      items: [{ saleItemId: item.id, quantity: "2", restock: false }],
    });
    expect(ret2.refundTotal).toBe("400.00");
    expect(ret2.receivableReduction).toBe("200.00");
    expect(ret2.cashRefund).toBe("200.00");
    const s2 = await periodSummary(ctx, today, today);
    expect(s2.revenue).toBe("0.00");
    // custo das unidades avariadas permanece como custo (prejuízo de 200)
    expect(s2.grossProfit).toBe("-200.00");
    expect((await stockSnapshot(p)).qty).toBe("1.000");

    await expect(
      createReturn(ctx, { saleId: sale.id, reason: "x", items: [{ saleItemId: item.id, quantity: "1", restock: true }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("compra: rateio e cancelamento", () => {
  it("rateia frete proporcional ao valor e entra no custo médio", async () => {
    const ctx = await createTenant();
    const a = await product(ctx, "A");
    const b = await product(ctx, "B");
    const pur = await createPurchase(ctx, {
      items: [
        { productId: a, quantity: "1", unitCost: "1000" },
        { productId: b, quantity: "1", unitCost: "2000" },
      ],
      freight: "300",
      discount: "30",
    });
    expect(pur.total).toBe("3270.00");
    expect((await stockSnapshot(a)).value).toBe("1090.00");
    expect((await stockSnapshot(b)).value).toBe("2180.00");
    const detail = await getPurchase(ctx, pur.id);
    expect(detail!.items.map((i) => i.item.landedTotal)).toEqual(["1090.00", "2180.00"]);
  });

  it("cancelamento estorna estoque; é bloqueado se houve saída depois", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    const first = await buy(ctx, p, 2, "50");
    const second = await buy(ctx, p, 3, "60");
    await cancelPurchase(ctx, second.id, { reason: "Lançada em duplicidade" });
    let snap = await stockSnapshot(p);
    expect(snap.qty).toBe("2.000");
    expect(snap.value).toBe("100.00");

    await createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "80" }], payments: paidNow("80.00") });
    await expect(cancelPurchase(ctx, first.id, { reason: "x" })).rejects.toMatchObject({ code: "CONFLICT" });
    snap = await stockSnapshot(p);
    expect(snap.mq).toBe(snap.qty);
    expect(snap.mv).toBe(snap.value);
  });
});

describe("venda com prejuízo (§105, D4)", () => {
  it("exige confirmação explícita e papel MANAGER+", async () => {
    const owner = await createTenant();
    const emp = await addMember(owner, "EMPLOYEE");
    const mgr = await addMember(owner, "MANAGER");
    const p = await product(owner);
    await buy(owner, p, 3, "100");
    const input = { items: [{ productId: p, quantity: "1", unitPrice: "80" }], payments: paidNow("80.00") };

    await expect(createSale(emp, input)).rejects.toMatchObject({ code: "BELOW_COST_CONFIRMATION_REQUIRED" });
    await expect(createSale(emp, { ...input, acknowledgeLoss: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ok = await createSale(mgr, { ...input, acknowledgeLoss: true });
    expect(ok.netProfit).toBe("-20.00");
    const detail = await getSale(owner, ok.id);
    expect(detail!.belowCost).toBe(true);
    expect(detail!.belowCostApprovedBy).toBe(mgr.userId);
  });
});
