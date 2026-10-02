import { describe, expect, it } from "vitest";
import {
  InsufficientStockError,
  allocateProportionally,
  applyCostAdjustment,
  applyInbound,
  applyOutbound,
  averageCost,
  calculatePurchase,
  calculateReturnLine,
  calculateSale,
  dec,
  margin,
  markup,
  money,
  percentChange,
  priceForTargetMargin,
  receivableDisplayStatus,
  receivableStatus,
  roi,
  salePaymentStatus,
  stockState,
  sum,
  type StockState,
} from "@/lib/finance";

const s = (d: { toFixed: (n: number) => string }, n = 2) => d.toFixed(n);

describe("dinheiro e arredondamento", () => {
  it("evita erro de ponto flutuante (0,1 + 0,2)", () => {
    expect(s(sum(["0.1", "0.2"]))).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3); // por isso não usamos number
  });

  it("arredonda half-up para centavos", () => {
    expect(s(money("2.345"))).toBe("2.35");
    expect(s(money("2.344"))).toBe("2.34");
    expect(s(money("-2.345"))).toBe("-2.35");
  });

  it("aceita vírgula decimal vinda de formulários", () => {
    expect(s(dec("10,5"))).toBe("10.50");
  });
});

describe("rateio proporcional (maior resto)", () => {
  it("rateia frete proporcional ao valor dos itens", () => {
    // Produto A 1.000, Produto B 2.000, frete 300 → 100 / 200
    const parts = allocateProportionally("300", ["1000", "2000"]);
    expect(parts.map((p) => s(p))).toEqual(["100.00", "200.00"]);
  });

  it("nunca perde centavos: 100 / 3", () => {
    const parts = allocateProportionally("100", ["1", "1", "1"]);
    expect(parts.map((p) => s(p))).toEqual(["33.34", "33.33", "33.33"]);
    expect(s(sum(parts))).toBe("100.00");
  });

  it("soma sempre igual ao total em casos aleatórios", () => {
    for (let n = 0; n < 200; n++) {
      const weights = Array.from({ length: 1 + (n % 7) }, (_, i) => ((n * 37 + i * 13) % 997) + 0.01);
      const total = ((n * 7919) % 100000) / 100;
      const parts = allocateProportionally(total, weights);
      expect(s(sum(parts))).toBe(money(total).toFixed(2));
    }
  });

  it("usa pesos de fallback quando todos os valores são zero", () => {
    const parts = allocateProportionally("10", ["0", "0"], ["1", "3"]);
    expect(parts.map((p) => s(p))).toEqual(["2.50", "7.50"]);
  });

  it("rateia valores negativos simetricamente", () => {
    const parts = allocateProportionally("-0.05", ["1", "1"]);
    expect(s(sum(parts))).toBe("-0.05");
  });
});

describe("custo médio ponderado", () => {
  it("exemplo da especificação: 10 × 100 + 5 × 120 = 106,67", () => {
    let st = stockState(0, 0);
    st = applyInbound(st, 10, "1000");
    st = applyInbound(st, 5, "600");
    expect(s(st.quantity, 3)).toBe("15.000");
    expect(s(st.value)).toBe("1600.00");
    expect(s(averageCost(st))).toBe("106.67");
  });

  it("saída usa custo médio e zera sem resíduo de centavos", () => {
    let st: StockState = stockState(3, "100.00"); // 33,333…
    const a = applyOutbound(st, 1);
    expect(s(a.cost)).toBe("33.33");
    st = a.state;
    const b = applyOutbound(st, 1);
    expect(s(b.cost)).toBe("33.34"); // 66,67 × 1/2 = 33,335 → 33,34
    const c = applyOutbound(b.state, 1);
    expect(s(c.cost)).toBe("33.33");
    expect(s(c.state.value)).toBe("0.00");
    expect(s(sum([a.cost, b.cost, c.cost]))).toBe("100.00");
  });

  it("não permite saída maior que o estoque", () => {
    expect(() => applyOutbound(stockState(2, 200), 3)).toThrow(InsufficientStockError);
  });

  it("ajuste de custo (manutenção) soma ao valor sem mudar a quantidade", () => {
    const st = applyCostAdjustment(stockState(1, "3550"), "150");
    expect(s(st.value)).toBe("3700.00");
    expect(s(averageCost(st))).toBe("3700.00");
  });

  it("não agrega custo a produto sem estoque", () => {
    expect(() => applyCostAdjustment(stockState(0, 0), "10")).toThrow();
  });
});

describe("compra com rateio", () => {
  it("rateia frete e desconto global e fecha o total exato", () => {
    const calc = calculatePurchase({
      items: [
        { productId: "A", quantity: 1, unitCost: "1000" },
        { productId: "B", quantity: 2, unitCost: "1000" },
      ],
      freight: "300",
      taxes: "0.01",
      discount: "100",
    });
    expect(calc.items.map((i) => s(i.allocatedCosts))).toEqual(["100.00", "200.01"]);
    expect(calc.items.map((i) => s(i.allocatedDiscount))).toEqual(["33.33", "66.67"]);
    expect(s(calc.total)).toBe("3200.01");
    expect(s(sum(calc.items.map((i) => i.landedTotal)))).toBe(s(calc.total));
  });

  it("custo final inclui frete e entra no custo médio", () => {
    const calc = calculatePurchase({ items: [{ productId: "P", quantity: 1, unitCost: "3500" }], freight: "50" });
    expect(s(calc.items[0].landedTotal)).toBe("3550.00");
  });

  it("rejeita desconto maior que o valor", () => {
    expect(() => calculatePurchase({ items: [{ productId: "P", quantity: 1, unitCost: "10" }], discount: "11" })).toThrow();
    expect(() => calculatePurchase({ items: [{ productId: "P", quantity: 1, unitCost: "10", discount: "11" }] })).toThrow();
  });

  it("rejeita quantidade zero ou negativa", () => {
    expect(() => calculatePurchase({ items: [{ productId: "P", quantity: 0, unitCost: "10" }] })).toThrow();
    expect(() => calculatePurchase({ items: [{ productId: "P", quantity: -1, unitCost: "10" }] })).toThrow();
  });
});

describe("venda, lucro, margem e ROI", () => {
  it("exemplo da especificação §23–25: lucro 550, margem 12,79%, ROI 14,86%", () => {
    // compra 3.500 + frete 50 = 3.550 no estoque; manutenção 150 agregada → 3.700
    let st = applyInbound(stockState(0, 0), 1, "3550");
    st = applyCostAdjustment(st, "150");
    const sale = calculateSale(
      { items: [{ productId: "P", quantity: 1, unitPrice: "4300" }], fees: "50" },
      new Map([["P", st]]),
    );
    expect(s(sale.totalRevenue)).toBe("4300.00");
    expect(s(sale.totalCost)).toBe("3700.00");
    expect(s(sale.grossProfit)).toBe("600.00");
    expect(s(sale.netProfit)).toBe("550.00");
    expect(s(sale.marginPercent!)).toBe("12.79");
    expect(s(sale.roiPercent!)).toBe("14.86");
  });

  it("frete cobrado entra no faturamento (D1); frete pago é custo da venda", () => {
    const sale = calculateSale(
      {
        items: [{ productId: "P", quantity: 1, unitPrice: "200" }],
        freightCharged: "30",
        freightPaid: "25",
      },
      new Map([["P", stockState(5, "500")]]),
    );
    expect(s(sale.totalRevenue)).toBe("230.00");
    expect(s(sale.grossProfit)).toBe("130.00");
    expect(s(sale.netProfit)).toBe("105.00");
  });

  it("prejuízo é calculado e marcado como negativo", () => {
    const sale = calculateSale(
      { items: [{ productId: "P", quantity: 1, unitPrice: "80" }], fees: "100" },
      new Map([["P", stockState(1, "100")]]),
    );
    expect(s(sale.netProfit)).toBe("-120.00");
    expect(sale.marginPercent!.isNegative()).toBe(true);
  });

  it("desconto global é rateado entre itens sem perder centavos", () => {
    const sale = calculateSale(
      {
        items: [
          { productId: "A", quantity: 1, unitPrice: "10" },
          { productId: "B", quantity: 1, unitPrice: "10" },
          { productId: "C", quantity: 1, unitPrice: "10" },
        ],
        discount: "1",
      },
      new Map([
        ["A", stockState(1, 5)],
        ["B", stockState(1, 5)],
        ["C", stockState(1, 5)],
      ]),
    );
    expect(sale.items.map((i) => s(i.netRevenue))).toEqual(["9.66", "9.67", "9.67"]);
    expect(s(sale.productsRevenue)).toBe("29.00");
  });

  it("linhas repetidas do mesmo produto consomem o mesmo saldo", () => {
    expect(() =>
      calculateSale(
        {
          items: [
            { productId: "P", quantity: 2, unitPrice: "10" },
            { productId: "P", quantity: 1, unitPrice: "10" },
          ],
        },
        new Map([["P", stockState(2, 20)]]),
      ),
    ).toThrow(InsufficientStockError);
  });

  it("estoque insuficiente: estoque 2, venda 3", () => {
    expect(() =>
      calculateSale({ items: [{ productId: "P", quantity: 3, unitPrice: "10" }] }, new Map([["P", stockState(2, 20)]])),
    ).toThrow("Estoque insuficiente.");
  });

  it("custo histórico: venda registra custo do momento, compra posterior não altera", () => {
    // 10 × 100
    let st = applyInbound(stockState(0, 0), 10, "1000");
    const sale = calculateSale({ items: [{ productId: "P", quantity: 1, unitPrice: "150" }] }, new Map([["P", st]]));
    expect(s(sale.items[0].unitCostAtSale)).toBe("100.00");
    const recordedProfit = s(sale.netProfit);
    st = sale.stockAfter.get("P")!;
    // nova compra 10 × 140 → custo médio muda
    st = applyInbound(st, 10, "1400");
    expect(s(averageCost(st))).toBe("121.05");
    // o lucro gravado da venda anterior continua 50
    expect(recordedProfit).toBe("50.00");
    expect(s(sale.items[0].totalCost)).toBe("100.00");
  });
});

describe("indicadores", () => {
  it("margem ≠ ROI ≠ markup", () => {
    expect(s(margin(50, 150)!)).toBe("33.33");
    expect(s(roi(50, 100)!)).toBe("50.00");
    expect(markup(150, 100)!.toFixed(2)).toBe("1.50");
  });

  it("preço para margem desejada usa margem sobre receita (não markup)", () => {
    expect(s(priceForTargetMargin(100, 30)!)).toBe("142.86");
    expect(priceForTargetMargin(100, 100)).toBeNull();
  });

  it("indicadores com denominador zero são indefinidos (null), não 0%", () => {
    expect(margin(10, 0)).toBeNull();
    expect(roi(10, 0)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
  });

  it("margem/ROI com base negativa são indefinidos (mês só com devoluções não vira margem positiva)", () => {
    expect(margin("-53.62", "-79.67")).toBeNull();
    expect(roi("-10", "-5")).toBeNull();
  });

  it("variação percentual", () => {
    expect(s(percentChange("118", "100")!)).toBe("18.00");
    expect(s(percentChange("-50", "-100")!)).toBe("50.00"); // prejuízo diminuiu
  });
});

describe("devolução", () => {
  const line = {
    soldQuantity: 3,
    previouslyReturnedQuantity: 0,
    netRevenue: "100",
    previouslyRefunded: 0,
    totalCost: "60",
    previouslyAttributedCost: 0,
  };

  it("devolução parcial: proporcional", () => {
    const r = calculateReturnLine({ ...line, quantity: 1, restock: true });
    expect(s(r.refundAmount)).toBe("33.33");
    expect(s(r.costReversal)).toBe("20.00");
  });

  it("devolução do restante usa o resíduo exato", () => {
    const r = calculateReturnLine({
      ...line,
      previouslyReturnedQuantity: 1,
      previouslyRefunded: "33.33",
      previouslyAttributedCost: "20",
      quantity: 2,
      restock: true,
    });
    expect(s(r.refundAmount)).toBe("66.67");
    expect(s(r.costReversal)).toBe("40.00");
  });

  it("item que não volta ao estoque não estorna custo", () => {
    const r = calculateReturnLine({ ...line, quantity: 1, restock: false });
    expect(s(r.costReversal)).toBe("0.00");
  });

  it("não permite devolver mais que o vendido nem reembolsar além do valor", () => {
    expect(() => calculateReturnLine({ ...line, quantity: 4, restock: true })).toThrow();
    expect(() => calculateReturnLine({ ...line, quantity: 1, restock: true, refundAmount: "101" })).toThrow();
  });
});

describe("contas a receber", () => {
  it("status derivado dos valores", () => {
    expect(receivableStatus({ amount: 100, amountPaid: 0, amountCancelled: 0 })).toBe("PENDING");
    expect(receivableStatus({ amount: 100, amountPaid: 40, amountCancelled: 0 })).toBe("PARTIAL");
    expect(receivableStatus({ amount: 100, amountPaid: 100, amountCancelled: 0 })).toBe("PAID");
    expect(receivableStatus({ amount: 100, amountPaid: 0, amountCancelled: 100 })).toBe("CANCELLED");
  });

  it("vencida quando passou do vencimento com saldo aberto", () => {
    const r = { amount: 100, amountPaid: 40, amountCancelled: 0, dueDate: "2026-09-30" };
    expect(receivableDisplayStatus(r, "2026-10-01")).toBe("OVERDUE");
    expect(receivableDisplayStatus(r, "2026-09-30")).toBe("PARTIAL");
  });

  it("venda de 5.000 com entrada de 2.000: recebido 2.000, a receber 3.000", () => {
    const st = salePaymentStatus(
      [
        { amount: "2000", amountPaid: "2000", amountCancelled: 0, dueDate: "2026-10-01" },
        { amount: "3000", amountPaid: 0, amountCancelled: 0, dueDate: "2026-11-01" },
      ],
      "2026-10-01",
    );
    expect(st.status).toBe("PARTIAL");
    expect(s(st.received)).toBe("2000.00");
    expect(s(st.open)).toBe("3000.00");
  });
});
