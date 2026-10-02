import { describe, expect, it } from "vitest";
import { todayIn } from "@/lib/dates";
import { createExpense, listExpenseCategories } from "@/server/services/expenses";
import { getProductDetail } from "@/server/services/products";
import { createPurchase } from "@/server/services/purchases";
import { listReceivables, receivablesSummary, receivePayment } from "@/server/services/receivables";
import { monthlyReport, periodSummary } from "@/server/services/reports";
import { createSale, getSale } from "@/server/services/sales";
import { adjustStock } from "@/server/services/stock-adjustments";
import { buy, createTenant, paidNow, product, stockSnapshot } from "../support/fixtures";

describe("fluxo completo (critério de aceitação §87)", () => {
  it("compra → estoque → venda → despesa → pagamento parcial → recebível → relatório, tudo consistente", async () => {
    const ctx = await createTenant("Loja Aceitação");
    const today = todayIn(ctx.timezone);
    const p = await product(ctx, "iPhone 15", { referencePrice: "4300" });

    // Compra: 3 × 3.500 + frete 150 (rateado → 50 por unidade)
    const purchase = await createPurchase(ctx, {
      items: [{ productId: p, quantity: "3", unitCost: "3500" }],
      freight: "150",
    });
    expect(purchase.total).toBe("10650.00");
    let snap = await stockSnapshot(p);
    expect(snap.qty).toBe("3.000");
    expect(snap.value).toBe("10650.00");

    // Manutenção de R$ 450 agregada ao custo (§23) → 11.100 / 3 = 3.700 por unidade
    await adjustStock(ctx, { productId: p, type: "COST_ADJUSTMENT", amount: "450", notes: "Manutenção" });

    // Venda: 1 × 4.300, taxa 50, entrada de 2.000 e 2.300 a receber
    const sale = await createSale(ctx, {
      items: [{ productId: p, quantity: "1", unitPrice: "4300" }],
      fees: "50",
      payments: [
        { method: "PIX", amount: "2000", received: true },
        { method: "PIX", amount: "2300", received: false, dueDate: today },
      ],
    });
    expect(sale.totalCost).toBe("3700.00");
    expect(sale.netProfit).toBe("550.00");
    expect(sale.marginPercent).toBe("12.79");
    expect(sale.roiPercent).toBe("14.86");

    snap = await stockSnapshot(p);
    expect(snap.qty).toBe("2.000");
    expect(snap.value).toBe("7400.00");
    expect(snap.mq).toBe(snap.qty); // invariante do livro-razão
    expect(snap.mv).toBe(snap.value);

    // Despesa operacional
    const cats = await listExpenseCategories(ctx);
    await createExpense(ctx, { description: "Anúncio", categoryId: cats.find((c) => c.name === "Marketing")!.id, amount: "100" });

    // Recebível aparece; pagamento parcial
    const open = await listReceivables(ctx, { filter: "open" });
    expect(open.rows).toHaveLength(1);
    expect(open.rows[0].open).toBe("2300.00");
    const r = await receivePayment(ctx, { receivableId: open.rows[0].id, amount: "1000", method: "PIX" });
    expect(r.status).toBe("PARTIAL");
    expect((await receivablesSummary(ctx)).open).toBe("1300.00");

    const detail = await getSale(ctx, sale.id);
    expect(detail!.received).toBe("3000.00");
    expect(detail!.openAmount).toBe("1300.00");
    expect(detail!.paymentStatus).toBe("PARTIAL");

    // Relatório do período: faturamento ≠ lucro; compras não são despesa; caixa ≠ lucro
    const s = await periodSummary(ctx, today, today);
    expect(s.revenue).toBe("4300.00");
    expect(s.cogs).toBe("3700.00");
    expect(s.grossProfit).toBe("600.00");
    expect(s.saleCosts).toBe("50.00");
    expect(s.expenses).toBe("100.00");
    expect(s.netProfit).toBe("450.00");
    expect(s.purchases).toBe("10650.00");
    expect(s.cashIn).toBe("3000.00");
    expect(s.stockValueAtEnd).toBe("7400.00");
    expect(s.unitsSold).toBe("1.000");
    expect(s.marginPercent).toBe("10.47");

    const month = await monthlyReport(ctx, today);
    expect(month.summary.netProfit).toBe("450.00");
    expect(month.openReceivablesFromPeriod).toBe("1300.00");
    expect(month.highlights.topByProfit?.name).toBe("iPhone 15");

    const pd = await getProductDetail(ctx, p);
    expect(pd!.history.profit).toBe("600.00");
    expect(pd!.movements.map((m) => m.m.type).sort()).toEqual(["COST_ADJUSTMENT", "PURCHASE", "SALE"]);
  });

  it("§66 custo histórico: compra nova não altera o lucro de venda antiga", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    await buy(ctx, p, 10, "100");
    const sale = await createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "150" }], payments: paidNow("150.00") });
    expect(sale.totalCost).toBe("100.00");

    await buy(ctx, p, 10, "140");
    const after = await getSale(ctx, sale.id);
    expect(after!.items[0].item.unitCostAtSale).toBe("100.000000");
    expect(after!.netProfit).toBe("50.00");

    // nova venda usa o novo custo médio: (900 + 1400) / 19 = 121,05
    const s2 = await createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "150" }], payments: paidNow("150.00") });
    expect(s2.totalCost).toBe("121.05");
    expect((await getSale(ctx, sale.id))!.netProfit).toBe("50.00");
  });

  it("estoque insuficiente: não salva nada da venda", async () => {
    const ctx = await createTenant();
    const a = await product(ctx, "A");
    const b = await product(ctx, "B");
    await buy(ctx, a, 5, "10");
    await buy(ctx, b, 2, "10");
    await expect(
      createSale(ctx, {
        items: [
          { productId: a, quantity: "1", unitPrice: "20" },
          { productId: b, quantity: "3", unitPrice: "20" },
        ],
        payments: paidNow("80.00"),
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect((await stockSnapshot(a)).qty).toBe("5.000");
    expect((await stockSnapshot(b)).qty).toBe("2.000");
    const s = await periodSummary(ctx, "2000-01-01", "2100-01-01");
    expect(s.saleCount).toBe(0);
  });

  it("soma dos pagamentos precisa fechar com o total calculado no servidor", async () => {
    const ctx = await createTenant();
    const p = await product(ctx);
    await buy(ctx, p, 1, "10");
    await expect(
      createSale(ctx, { items: [{ productId: p, quantity: "1", unitPrice: "20" }], payments: paidNow("19.99") }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("perda de estoque (LOSS) reduz o lucro líquido; ajuste comum não", async () => {
    const ctx = await createTenant();
    const today = todayIn(ctx.timezone);
    const p = await product(ctx);
    await buy(ctx, p, 10, "30");
    await adjustStock(ctx, { productId: p, type: "LOSS", quantity: "2", notes: "Quebra" });
    await adjustStock(ctx, { productId: p, type: "ADJUSTMENT_OUT", quantity: "1", notes: "Contagem" });
    const s = await periodSummary(ctx, today, today);
    expect(s.losses).toBe("60.00");
    expect(s.netProfit).toBe("-60.00");
    expect((await stockSnapshot(p)).value).toBe("210.00");
  });
});
