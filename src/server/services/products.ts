import "server-only";
import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { averageCost, dec, margin, money, moneyToDb, quantityToDb, stockState } from "@/lib/finance";
import { addDays, todayIn } from "@/lib/dates";
import { categorySchema, pagination, productSchema } from "@/lib/validations";
import { pgConstraint, pgErrorCode } from "../errors";
import {
  categories,
  inventoryMovements,
  productImages,
  products,
  purchaseItems,
  purchases,
  saleItems,
  sales,
  suppliers,
  users,
} from "../db/schema";
import type { Transaction } from "../db/client";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { assertCan, audit, businessSettings, likePattern, pageOf, parse, ref } from "./_base";

// ─── Categorias ─────────────────────────────────────────────────────────────

export async function listCategories(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx.select({
      id: categories.id,
      name: categories.name,
      productCount: sql<number>`(select count(*)::int from products p where p.category_id = ${ref(categories.id)} and p.archived_at is null)`,
    })
      .from(categories)
      .where(and(eq(categories.businessId, ctx.businessId), isNull(categories.archivedAt)))
      .orderBy(asc(categories.name)),
  );
}

export async function createCategory(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(categorySchema, input);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx.insert(categories).values({ businessId: ctx.businessId, name: data.name, createdBy: ctx.userId })
      .onConflictDoNothing().returning({ id: categories.id, name: categories.name });
    if (!row) throw new AppError("CONFLICT", "Já existe uma categoria com esse nome.");
    return row;
  });
}

export async function renameCategory(ctx: TenantContext, id: string, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(categorySchema, input);
  return withTenant(ctx, async (tx) => {
    const r = await tx.update(categories).set({ name: data.name })
      .where(and(eq(categories.businessId, ctx.businessId), eq(categories.id, id))).returning({ id: categories.id })
      .catch((e) => {
        if (pgErrorCode(e) === "23505") throw new AppError("CONFLICT", "Já existe uma categoria com esse nome.");
        throw e;
      });
    if (r.length === 0) throw notFound("Categoria");
  });
}

export async function archiveCategory(ctx: TenantContext, id: string) {
  assertCan(ctx, "cancel");
  return withTenant(ctx, async (tx) => {
    await tx.update(products).set({ categoryId: null }).where(and(eq(products.businessId, ctx.businessId), eq(products.categoryId, id)));
    await tx.update(categories).set({ archivedAt: sql`now()` }).where(and(eq(categories.businessId, ctx.businessId), eq(categories.id, id)));
  });
}

// ─── Produtos ───────────────────────────────────────────────────────────────

async function assertRefs(tx: Transaction, ctx: TenantContext, data: { categoryId: string | null; mainSupplierId: string | null }) {
  if (data.categoryId) {
    const [c] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.businessId, ctx.businessId), eq(categories.id, data.categoryId)));
    if (!c) throw notFound("Categoria");
  }
  if (data.mainSupplierId) {
    const [s] = await tx.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.businessId, ctx.businessId), eq(suppliers.id, data.mainSupplierId)));
    if (!s) throw notFound("Fornecedor");
  }
}

function productValues(data: ReturnType<typeof productSchema.parse>) {
  return {
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    sku: data.sku,
    barcode: data.barcode,
    unit: data.unit,
    minStock: quantityToDb(data.minStock),
    referencePrice: data.referencePrice === null ? null : moneyToDb(data.referencePrice),
    minimumPrice: data.minimumPrice === null ? null : moneyToDb(data.minimumPrice),
    targetMargin: data.targetMargin === null ? null : data.targetMargin,
    location: data.location,
    mainSupplierId: data.mainSupplierId,
    notes: data.notes,
    status: data.status,
  };
}

function mapUniqueError(e: unknown): never {
  if (pgErrorCode(e) === "23505" && pgConstraint(e)?.includes("sku")) throw new AppError("CONFLICT", "Já existe um produto com este SKU.");
  throw e;
}

/** Produto nasce com estoque zero: estoque só entra por compra ou ajuste (nunca silenciosamente). */
export async function createProduct(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(productSchema, input);
  return withTenant(ctx, async (tx) => {
    await assertRefs(tx, ctx, data);
    const [row] = await tx.insert(products).values({ businessId: ctx.businessId, ...productValues(data), createdBy: ctx.userId })
      .returning({ id: products.id }).catch(mapUniqueError);
    await audit(tx, ctx, { action: "product.created", entityType: "product", entityId: row.id, summary: `Produto ${data.name} cadastrado` });
    return row;
  });
}

export async function updateProduct(ctx: TenantContext, id: string, input: unknown) {
  assertCan(ctx, "write");
  const data = parse(productSchema, input);
  return withTenant(ctx, async (tx) => {
    await assertRefs(tx, ctx, data);
    const r = await tx.update(products).set(productValues(data))
      .where(and(eq(products.businessId, ctx.businessId), eq(products.id, id)))
      .returning({ id: products.id }).catch(mapUniqueError);
    if (r.length === 0) throw notFound("Produto");
    await audit(tx, ctx, { action: "product.updated", entityType: "product", entityId: id, summary: `Produto ${data.name} atualizado` });
  });
}

export async function archiveProduct(ctx: TenantContext, id: string) {
  assertCan(ctx, "cancel");
  return withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ name: products.name, qty: products.stockQuantity }).from(products)
      .where(and(eq(products.businessId, ctx.businessId), eq(products.id, id)));
    if (!p) throw notFound("Produto");
    if (dec(p.qty).greaterThan(0)) throw new AppError("CONFLICT", "Produto ainda tem estoque. Zere o estoque (venda ou ajuste) antes de arquivar.");
    await tx.update(products).set({ archivedAt: sql`now()`, status: "INACTIVE" }).where(eq(products.id, id));
    await audit(tx, ctx, { action: "product.archived", entityType: "product", entityId: id, summary: `Produto ${p.name} arquivado` });
  });
}

export type StockFilter = "all" | "in_stock" | "low" | "out" | "stale";

export interface InventoryListOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  filter?: StockFilter;
  categoryId?: string;
  supplierId?: string;
  includeInactive?: boolean;
  sort?: "name" | "value" | "quantity" | "recent";
}

/** Listagem de produtos/estoque com filtros, busca (nome, SKU, código de barras) e paginação. */
export async function listProducts(ctx: TenantContext, opts: InventoryListOptions = {}) {
  const { page, pageSize } = pagination.parse(opts);
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const biz = await businessSettings(tx, ctx);
    const staleSince = addDays(today, -biz.staleDays);
    const lastSale = sql`(select max(m.movement_date) from inventory_movements m where m.product_id = ${ref(products.id)} and m.type = 'SALE')`;
    const lastIn = sql`(select max(m.movement_date) from inventory_movements m where m.product_id = ${ref(products.id)} and m.type in ('PURCHASE','ADJUSTMENT_IN'))`;

    const filters: (SQL | undefined)[] = [
      eq(products.businessId, ctx.businessId),
      isNull(products.archivedAt),
      opts.includeInactive ? undefined : eq(products.status, "ACTIVE"),
      opts.categoryId ? eq(products.categoryId, opts.categoryId) : undefined,
      opts.supplierId ? eq(products.mainSupplierId, opts.supplierId) : undefined,
    ];
    if (opts.q) {
      const p = likePattern(opts.q);
      filters.push(sql`(${products.name} ilike ${p} or ${products.sku} ilike ${p} or ${products.barcode} = ${opts.q})`);
    }
    switch (opts.filter) {
      case "in_stock": filters.push(sql`${products.stockQuantity} > 0`); break;
      case "out": filters.push(sql`${products.stockQuantity} = 0`); break;
      case "low": filters.push(sql`${products.minStock} > 0 and ${products.stockQuantity} <= ${products.minStock}`); break;
      case "stale": filters.push(sql`${products.stockQuantity} > 0 and coalesce(${lastSale}, '0001-01-01') < ${staleSince} and coalesce(${lastIn}, '0001-01-01') < ${staleSince}`); break;
    }
    const where = and(...filters);

    const order = {
      name: [asc(products.name)],
      value: [desc(products.stockValue), asc(products.name)],
      quantity: [desc(products.stockQuantity), asc(products.name)],
      recent: [desc(products.createdAt)],
    }[opts.sort ?? "name"];

    const [{ total }] = await tx.select({ total: count() }).from(products).where(where);
    const [totals] = await tx.select({
      value: sql<string>`coalesce(sum(${products.stockValue}), 0)`,
      quantity: sql<string>`coalesce(sum(${products.stockQuantity}), 0)`,
    }).from(products).where(where);

    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        unit: products.unit,
        status: products.status,
        categoryId: products.categoryId,
        categoryName: categories.name,
        supplierName: suppliers.name,
        stockQuantity: products.stockQuantity,
        stockValue: products.stockValue,
        minStock: products.minStock,
        referencePrice: products.referencePrice,
        minimumPrice: products.minimumPrice,
        lastSaleDate: sql<string | null>`${lastSale}`,
        imagePath: sql<string | null>`(select pi.storage_path from product_images pi where pi.product_id = ${ref(products.id)} order by pi.is_primary desc, pi.position limit 1)`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.mainSupplierId))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      ...pageOf(rows.map((r) => {
        const st = stockState(r.stockQuantity, r.stockValue);
        const avg = averageCost(st);
        const refPrice = r.referencePrice ? dec(r.referencePrice) : null;
        return {
          ...r,
          averageCost: avg.toFixed(6),
          isLow: dec(r.minStock).greaterThan(0) && st.quantity.lessThanOrEqualTo(dec(r.minStock)),
          isOut: st.quantity.isZero(),
          /** Margem potencial = (preço ref. − custo médio) / preço ref. */
          potentialMargin: refPrice && st.quantity.greaterThan(0) ? margin(refPrice.minus(avg), refPrice)?.toFixed(2) ?? null : null,
        };
      }), total, page, pageSize),
      totals,
    };
  });
}

/** Busca rápida para seletores (venda/compra). Somente produtos ativos e não arquivados. */
export async function searchProductsForSelector(ctx: TenantContext, q: string, opts: { inStockOnly?: boolean } = {}) {
  return withTenant(ctx, async (tx) => {
    const p = likePattern(q.trim());
    return tx.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      stockQuantity: products.stockQuantity,
      stockValue: products.stockValue,
      referencePrice: products.referencePrice,
      minimumPrice: products.minimumPrice,
      imagePath: sql<string | null>`(select pi.storage_path from product_images pi where pi.product_id = ${ref(products.id)} order by pi.is_primary desc, pi.position limit 1)`,
      lastUnitCost: sql<string | null>`(select pi.landed_unit_cost from purchase_items pi join purchases pu on pu.id = pi.purchase_id where pi.product_id = ${ref(products.id)} and pu.status = 'CONFIRMED' order by pu.purchase_date desc, pu.number desc limit 1)`,
    })
      .from(products)
      .where(and(
        eq(products.businessId, ctx.businessId),
        isNull(products.archivedAt),
        eq(products.status, "ACTIVE"),
        q.trim() ? sql`(${products.name} ilike ${p} or ${products.sku} ilike ${p} or ${products.barcode} = ${q.trim()})` : undefined,
        opts.inStockOnly ? sql`${products.stockQuantity} > 0` : undefined,
      ))
      .orderBy(asc(products.name))
      .limit(20);
  });
}

/** Página do produto: cadastro, estoque, custo médio, histórico e lucro histórico (líquido de devoluções). */
export async function getProductDetail(ctx: TenantContext, id: string) {
  const today = todayIn(ctx.timezone);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ product: products, categoryName: categories.name, supplierName: suppliers.name })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.mainSupplierId))
      .where(and(eq(products.businessId, ctx.businessId), eq(products.id, id)));
    if (!row) return null;
    const p = row.product;

    const images = await tx.select().from(productImages)
      .where(and(eq(productImages.businessId, ctx.businessId), eq(productImages.productId, id)))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position));

    const purchaseHistory = await tx
      .select({
        purchaseId: purchases.id, code: purchases.code, date: purchases.purchaseDate, status: purchases.status, supplierName: suppliers.name,
        quantity: purchaseItems.quantity, unitCost: purchaseItems.unitCost, landedTotal: purchaseItems.landedTotal, landedUnitCost: purchaseItems.landedUnitCost,
      })
      .from(purchaseItems)
      .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(and(eq(purchaseItems.businessId, ctx.businessId), eq(purchaseItems.productId, id)))
      .orderBy(desc(purchases.purchaseDate), desc(purchases.number))
      .limit(50);

    const saleHistory = await tx
      .select({
        saleId: sales.id, code: sales.code, date: sales.saleDate, status: sales.status,
        quantity: saleItems.quantity, unitPrice: saleItems.unitPrice, netRevenue: saleItems.netRevenue,
        unitCostAtSale: saleItems.unitCostAtSale, totalCost: saleItems.totalCost,
        returnedQuantity: sql<string>`(select coalesce(sum(ri.quantity), 0) from return_items ri where ri.sale_item_id = ${ref(saleItems.id)})`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(saleItems.businessId, ctx.businessId), eq(saleItems.productId, id)))
      .orderBy(desc(sales.saleDate), desc(sales.number))
      .limit(50);

    const movements = await tx
      .select({ m: inventoryMovements, userName: sql<string | null>`coalesce(${users.fullName}, ${users.email})` })
      .from(inventoryMovements)
      .leftJoin(users, eq(users.id, inventoryMovements.createdBy))
      .where(and(eq(inventoryMovements.businessId, ctx.businessId), eq(inventoryMovements.productId, id)))
      .orderBy(desc(inventoryMovements.occurredAt), desc(inventoryMovements.id))
      .limit(100);

    // Lucro histórico: vendas confirmadas, líquido de devoluções. Custos de venda (taxas/frete) são da venda, não do produto.
    const [hist] = await tx.execute<{ revenue: string; cost: string; qty: string }>(sql`
      select
        coalesce((select sum(si.net_revenue) from sale_items si join sales s on s.id = si.sale_id
                  where si.product_id = ${id} and s.status = 'CONFIRMED'), 0)
        - coalesce((select sum(ri.refund_amount) from return_items ri join returns r on r.id = ri.return_id join sales s on s.id = r.sale_id
                  where ri.product_id = ${id} and s.status = 'CONFIRMED'), 0) as revenue,
        coalesce((select sum(si.total_cost) from sale_items si join sales s on s.id = si.sale_id
                  where si.product_id = ${id} and s.status = 'CONFIRMED'), 0)
        - coalesce((select sum(ri.cost_reversal) from return_items ri join returns r on r.id = ri.return_id join sales s on s.id = r.sale_id
                  where ri.product_id = ${id} and s.status = 'CONFIRMED'), 0) as cost,
        coalesce((select sum(si.quantity) from sale_items si join sales s on s.id = si.sale_id
                  where si.product_id = ${id} and s.status = 'CONFIRMED'), 0)
        - coalesce((select sum(ri.quantity) from return_items ri join returns r on r.id = ri.return_id join sales s on s.id = r.sale_id
                  where ri.product_id = ${id} and s.status = 'CONFIRMED'), 0) as qty`);

    const aging = await stockAgingForProducts(tx, ctx.businessId, today, id);

    const st = stockState(p.stockQuantity, p.stockValue);
    const avg = averageCost(st);
    const refPrice = p.referencePrice ? dec(p.referencePrice) : null;
    const revenue = money(hist.revenue);
    const cost = money(hist.cost);
    const profit = revenue.minus(cost);

    return {
      ...p,
      categoryName: row.categoryName,
      supplierName: row.supplierName,
      images,
      averageCost: avg.toFixed(6),
      potentialUnitProfit: refPrice && st.quantity.greaterThan(0) ? money(refPrice.minus(avg)).toFixed(2) : null,
      potentialMargin: refPrice && st.quantity.greaterThan(0) ? margin(refPrice.minus(avg), refPrice)?.toFixed(2) ?? null : null,
      suggestedPrice: p.targetMargin && st.quantity.greaterThan(0)
        ? money(avg.dividedBy(dec(1).minus(dec(p.targetMargin).dividedBy(100)))).toFixed(2)
        : null,
      oldestDaysInStock: aging.oldestDays,
      averageDaysInStock: aging.averageDays,
      history: {
        quantitySold: hist.qty,
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        profit: profit.toFixed(2),
        margin: margin(profit, revenue)?.toFixed(2) ?? null,
      },
      purchaseHistory,
      saleHistory,
      movements,
    };
  });
}

/**
 * Idade do estoque com premissa FIFO **apenas analítica** (as unidades mais antigas saem primeiro).
 * Vendas canceladas e seus estornos se anulam e são ignorados. Custo contábil continua sendo o médio.
 */
export async function stockAgingForProducts(tx: Transaction, businessId: string, today: string, productId?: string) {
  const rows = await tx.execute<{ product_id: string; movement_date: string; remaining: string }>(sql`
    with mv as (
      select m.id, m.product_id, m.movement_date, m.occurred_at, m.quantity_delta
      from inventory_movements m
      left join sales s on s.id = m.reference_id and m.reference_type = 'SALE'
      where m.business_id = ${businessId}
        ${productId ? sql`and m.product_id = ${productId}` : sql``}
        and m.type not in ('SALE_CANCEL', 'COST_ADJUSTMENT', 'TRANSFER')
        and not (m.type = 'SALE' and s.status = 'CANCELLED')
    ),
    ins as (
      select product_id, movement_date,
        sum(quantity_delta) over w - quantity_delta as start_q,
        sum(quantity_delta) over w as end_q
      from mv where quantity_delta > 0
      window w as (partition by product_id order by occurred_at, id)
    ),
    outs as (
      select product_id, sum(-quantity_delta) as total_out from mv where quantity_delta < 0 group by product_id
    )
    select i.product_id, i.movement_date,
      greatest(0, i.end_q - greatest(i.start_q, coalesce(o.total_out, 0))) as remaining
    from ins i left join outs o on o.product_id = i.product_id
    where i.end_q > coalesce(o.total_out, 0)`);

  let oldest: number | null = null;
  let weighted = dec(0);
  let qty = dec(0);
  for (const r of rows) {
    const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(r.movement_date).slice(0, 10)}T00:00:00Z`)) / 86_400_000));
    oldest = oldest === null ? days : Math.max(oldest, days);
    weighted = weighted.plus(dec(r.remaining).times(days));
    qty = qty.plus(dec(r.remaining));
  }
  return {
    layers: rows,
    oldestDays: oldest,
    averageDays: qty.greaterThan(0) ? Math.round(weighted.dividedBy(qty).toNumber()) : null,
  };
}

/** Livro-razão de movimentações (todas as entradas/saídas), paginado e filtrável. */
export async function listMovements(
  ctx: TenantContext,
  opts: { page?: number; pageSize?: number; type?: string; productId?: string; from?: string; to?: string } = {},
) {
  const { page, pageSize } = pagination.parse(opts);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(inventoryMovements.businessId, ctx.businessId),
      opts.type ? sql`${inventoryMovements.type} = ${opts.type}` : undefined,
      opts.productId ? eq(inventoryMovements.productId, opts.productId) : undefined,
      opts.from ? sql`${inventoryMovements.movementDate} >= ${opts.from}` : undefined,
      opts.to ? sql`${inventoryMovements.movementDate} <= ${opts.to}` : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(inventoryMovements).where(where);
    const rows = await tx
      .select({
        m: inventoryMovements,
        productName: products.name,
        unit: products.unit,
        userName: sql<string | null>`coalesce(${users.fullName}, ${users.email})`,
        referenceCode: sql<string | null>`case ${inventoryMovements.referenceType}
          when 'SALE' then (select s.code from sales s where s.id = ${inventoryMovements.referenceId})
          when 'PURCHASE' then (select pu.code from purchases pu where pu.id = ${inventoryMovements.referenceId})
          when 'RETURN' then (select r.code from returns r where r.id = ${inventoryMovements.referenceId})
          else null end`,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(products.id, inventoryMovements.productId))
      .leftJoin(users, eq(users.id, inventoryMovements.createdBy))
      .where(where)
      .orderBy(desc(inventoryMovements.occurredAt), desc(inventoryMovements.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return pageOf(rows, total, page, pageSize);
  });
}

/** Um produto no formato do seletor (pré-preenchimento de venda/compra via ?produto=). */
export async function getProductOption(ctx: TenantContext, id: string | undefined) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withTenant(ctx, async (tx) => {
    const [p] = await tx.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unit: products.unit,
      stockQuantity: products.stockQuantity,
      stockValue: products.stockValue,
      referencePrice: products.referencePrice,
      minimumPrice: products.minimumPrice,
      lastUnitCost: sql<string | null>`(select pi.landed_unit_cost from purchase_items pi join purchases pu on pu.id = pi.purchase_id where pi.product_id = ${ref(products.id)} and pu.status = 'CONFIRMED' order by pu.purchase_date desc, pu.number desc limit 1)`,
    }).from(products).where(and(eq(products.businessId, ctx.businessId), eq(products.id, id), isNull(products.archivedAt)));
    return p ?? null;
  });
}
