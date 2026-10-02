/**
 * Dados demonstrativos realistas (§64), gerados PELOS SERVIÇOS (mesmas regras, travas e auditoria do app).
 *
 *   npm run db:seed
 *
 * - Com SUPABASE_SERVICE_ROLE_KEY: cria (ou reaproveita) o usuário demo no Supabase Auth
 *   (SEED_DEMO_EMAIL / SEED_DEMO_PASSWORD) para você entrar e ver os dados.
 * - Sem a chave: cria só o perfil local (útil para testar relatórios via SQL).
 * Cria SEMPRE uma empresa nova ("Loja Demo …"); nunca altera empresas existentes.
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { addDays, todayIn } = await import("../src/lib/dates");
  const { closeDb } = await import("../src/server/db/client");
  const { createBusiness, ensureUserProfile } = await import("../src/server/services/businesses");
  const { createCategory, createProduct } = await import("../src/server/services/products");
  const { createCustomer, createSupplier } = await import("../src/server/services/partners");
  const { createPurchase } = await import("../src/server/services/purchases");
  const { cancelSale, createSale, getSale } = await import("../src/server/services/sales");
  const { createReturn } = await import("../src/server/services/returns");
  const { createExpense, listExpenseCategories } = await import("../src/server/services/expenses");
  const { receivePayment } = await import("../src/server/services/receivables");

  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL em .env.local");

  // ─── usuário ──────────────────────────────────────────────────────────────
  const email = process.env.SEED_DEMO_EMAIL ?? "demo@lucroflow.app";
  let userId: string = randomUUID();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const password = process.env.SEED_DEMO_PASSWORD;
    if (!password || password.length < 8) throw new Error("Defina SEED_DEMO_PASSWORD (mín. 8 caracteres) para criar o usuário demo.");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Usuário Demo" } });
    if (created.data.user) userId = created.data.user.id;
    else {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = data.users.find((u) => u.email === email);
      if (!existing) throw new Error(`Não foi possível criar ${email}: ${created.error?.message}`);
      userId = existing.id;
    }
  } else {
    console.warn("⚠ Sem SUPABASE_SERVICE_ROLE_KEY: criando apenas o perfil local (sem login).");
  }
  await ensureUserProfile({ id: userId, email, fullName: "Usuário Demo" });

  const tz = "America/Sao_Paulo";
  const today = todayIn(tz);
  const businessId = await createBusiness({ userId }, { name: `Loja Demo ${today}`, timezone: tz });
  const ctx = { userId, businessId, role: "OWNER" as const, timezone: tz };

  // RNG determinístico
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const round = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

  // ─── cadastros ────────────────────────────────────────────────────────────
  const cats: Record<string, string> = {};
  for (const name of ["Celulares", "Consoles", "Notebooks", "Acessórios", "Tablets"]) cats[name] = (await createCategory(ctx, { name })).id;

  const suppliers = [];
  for (const [name, company] of [["Ana Importações", "Ana Imports Ltda"], ["TechDistribuidora", "Tech Dist. S.A."], ["Game Center Atacado", null], ["Mega Eletrônicos", "Mega Eletro ME"], ["João Revendas", null]] as const) {
    suppliers.push((await createSupplier(ctx, { name, companyName: company, whatsapp: `1199${Math.floor(1000000 + rnd() * 8999999)}` })).id);
  }
  const customers = [];
  for (const name of ["Carlos Souza", "Mariana Lima", "Pedro Alves", "Juliana Costa", "Rafael Martins", "Fernanda Rocha", "Lucas Ribeiro", "Camila Ferreira", "Bruno Gomes", "Patrícia Dias"]) {
    customers.push((await createCustomer(ctx, { name, whatsapp: `2198${Math.floor(1000000 + rnd() * 8999999)}` })).id);
  }

  type P = { id: string; name: string; cost: number; price: number; cat: string };
  const catalog: [string, string, number, number, number][] = [
    ["iPhone 15 128GB", "Celulares", 3500, 4300, 2], ["iPhone 14 128GB", "Celulares", 2700, 3350, 2], ["Galaxy S23", "Celulares", 2300, 2890, 2],
    ["Redmi Note 13", "Celulares", 900, 1250, 3], ["Moto G84", "Celulares", 950, 1290, 3],
    ["PlayStation 5", "Consoles", 2850, 3600, 1], ["Xbox Series S", "Consoles", 1700, 2150, 1], ["Nintendo Switch OLED", "Consoles", 1650, 2200, 1],
    ["MacBook Air M2", "Notebooks", 6200, 7400, 1], ["Notebook Dell Inspiron", "Notebooks", 2800, 3500, 1], ["Lenovo IdeaPad 3", "Notebooks", 2200, 2750, 1],
    ["AirPods Pro", "Acessórios", 1100, 1550, 2], ["Carregador 20W", "Acessórios", 45, 110, 10], ["Capinha MagSafe", "Acessórios", 25, 79, 10],
    ["Controle DualSense", "Acessórios", 300, 420, 3], ["Fone JBL Tune", "Acessórios", 180, 299, 4], ["Smartwatch Amazfit", "Acessórios", 450, 690, 2],
    ["iPad 10ª geração", "Tablets", 2400, 2990, 1], ["Galaxy Tab S9 FE", "Tablets", 1900, 2450, 1], ["Kindle Paperwhite", "Tablets", 650, 899, 2],
  ];
  const products: P[] = [];
  for (const [name, cat, cost, price, min] of catalog) {
    const { id } = await createProduct(ctx, {
      name, categoryId: cats[cat], referencePrice: String(price), minimumPrice: round(cost * 1.05), minStock: String(min),
      sku: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20), targetMargin: "25",
    });
    products.push({ id, name, cost, price, cat });
  }

  // ─── 6 meses de operação ──────────────────────────────────────────────────
  const start = addDays(today, -175);
  const stock = new Map<string, number>(products.map((p) => [p.id, 0]));
  let purchases = 0;
  let sales = 0;
  const saleIds: string[] = [];

  for (let d = 0; d <= 175; d++) {
    const date = addDays(start, d);
    // compras: ~a cada 9 dias (20 no total)
    if (purchases < 20 && d % 9 === 0) {
      const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(products));
      const unique = [...new Map(items.map((p) => [p.id, p])).values()];
      await createPurchase(ctx, {
        supplierId: pick(suppliers),
        purchaseDate: date,
        reference: `NF ${1000 + purchases}`,
        paymentMethod: pick(["PIX", "BOLETO", "BANK_TRANSFER"]),
        freight: round(30 + rnd() * 120),
        items: unique.map((p) => {
          const q = p.cost > 1000 ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 5);
          stock.set(p.id, stock.get(p.id)! + q);
          return { productId: p.id, quantity: String(q), unitCost: round(p.cost * (0.95 + rnd() * 0.12)) };
        }),
      });
      purchases++;
    }
    // vendas: ~a cada 5–6 dias (30 no total)
    if (sales < 30 && d > 6 && d % 5 === 2) {
      const available = products.filter((p) => stock.get(p.id)! > 0);
      if (available.length === 0) continue;
      const p = pick(available);
      const qty = Math.min(stock.get(p.id)!, p.cost > 1000 ? 1 : 1 + Math.floor(rnd() * 3));
      const price = Number(round(p.price * (0.9 + rnd() * 0.12)));
      const total = Number(round(price * qty));
      const fees = rnd() < 0.4 ? round(total * 0.035) : "0";
      const installment = rnd() < 0.25 && total > 1000;
      const down = installment ? Number(round(total * 0.4)) : total;
      const r = await createSale(ctx, {
        customerId: rnd() < 0.7 ? pick(customers) : null,
        saleDate: date,
        fees,
        acknowledgeLoss: true,
        items: [{ productId: p.id, quantity: String(qty), unitPrice: price.toFixed(2) }],
        payments: installment
          ? [
              { method: "PIX", amount: down.toFixed(2), received: true },
              { method: "PIX", amount: round(total - down), received: false, dueDate: addDays(date, 30) },
            ]
          : [{ method: pick(["PIX", "CREDIT_CARD", "DEBIT_CARD", "CASH"]), amount: total.toFixed(2), received: true }],
      });
      stock.set(p.id, stock.get(p.id)! - qty);
      saleIds.push(r.id);
      sales++;
    }
  }

  // recebimento de algumas parcelas antigas, uma devolução e um cancelamento (histórico realista)
  for (const id of saleIds.slice(0, 15)) {
    const s = await getSale(ctx, id);
    const open = s?.receivables.find((r) => r.status === "PENDING" && r.dueDate < today);
    if (open) await receivePayment(ctx, { receivableId: open.id, amount: open.amount, method: "PIX", paidOn: open.dueDate });
  }
  if (saleIds.length > 10) {
    const s = await getSale(ctx, saleIds[saleIds.length - 4]);
    if (s) await createReturn(ctx, { saleId: s.id, reason: "Cliente desistiu (demo)", refundMethod: "PIX", items: [{ saleItemId: s.items[0].item.id, quantity: "1", restock: true }] });
    await cancelSale(ctx, saleIds[saleIds.length - 2], { reason: "Venda lançada em duplicidade (demo)", refundMethod: "PIX" });
  }

  // despesas (15)
  const expCats = await listExpenseCategories(ctx);
  const byName = (n: string) => expCats.find((c) => c.name === n)!.id;
  const exps: [string, string, number][] = [
    ["Aluguel da loja", "Aluguel", 1200], ["Anúncios Instagram", "Marketing", 250], ["Internet fibra", "Internet", 120],
    ["Combustível entregas", "Combustível", 180], ["Embalagens", "Embalagem", 90],
  ];
  for (let i = 0; i < 15; i++) {
    const [description, cat, base] = exps[i % exps.length];
    await createExpense(ctx, { description, categoryId: byName(cat), amount: round(base * (0.9 + rnd() * 0.2)), expenseDate: addDays(today, -15 - i * 11), paymentMethod: "PIX" });
  }

  console.log(`✔ Seed concluído: empresa "${`Loja Demo ${today}`}" (${businessId})`);
  console.log(`  ${products.length} produtos · ${suppliers.length} fornecedores · ${customers.length} clientes · ${purchases} compras · ${sales} vendas · 15 despesas`);
  console.log(`  Login: ${email}${process.env.SUPABASE_SERVICE_ROLE_KEY ? "" : " (sem Auth configurado)"}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("✖ Seed falhou:", err);
  process.exit(1);
});
