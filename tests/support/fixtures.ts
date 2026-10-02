import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { MemberRole, TenantContext } from "@/server/db/tenant";
import { createBusiness, ensureUserProfile } from "@/server/services/businesses";
import { createProduct } from "@/server/services/products";
import { createPurchase } from "@/server/services/purchases";

export async function createUser(name = "Teste") {
  const id = randomUUID();
  await ensureUserProfile({ id, email: `${id}@test.local`, fullName: name });
  return { userId: id };
}

/** Empresa nova com um OWNER. Retorna o contexto validado (como o servidor montaria). */
export async function createTenant(name = "Empresa Teste", timezone = "America/Sao_Paulo"): Promise<TenantContext> {
  const user = await createUser(`Dono ${name}`);
  const businessId = await createBusiness(user, { name, timezone });
  return { ...user, businessId, role: "OWNER", timezone };
}

/** Adiciona um membro com papel específico (como superusuário — a UI de convites é futura). */
export async function addMember(owner: TenantContext, role: MemberRole): Promise<TenantContext> {
  const user = await createUser(`Membro ${role}`);
  await getDb().execute(sql`insert into business_members (business_id, user_id, role) values (${owner.businessId}, ${user.userId}, ${role})`);
  return { ...user, businessId: owner.businessId, role, timezone: owner.timezone };
}

export async function product(ctx: TenantContext, name = "Produto", extra: Record<string, unknown> = {}) {
  const { id } = await createProduct(ctx, { name, unit: "un", ...extra });
  return id;
}

export async function buy(ctx: TenantContext, productId: string, quantity: string | number, unitCost: string | number, extra: Record<string, unknown> = {}) {
  return createPurchase(ctx, { items: [{ productId, quantity: String(quantity), unitCost: String(unitCost) }], ...extra });
}

export function paidNow(amount: string, method = "PIX") {
  return [{ method, amount, received: true }];
}

/** Lê saldo do produto e soma das movimentações (como superusuário) para checar a invariante. */
export async function stockSnapshot(productId: string) {
  const [r] = await getDb().execute<{ qty: string; value: string; mq: string; mv: string }>(sql`
    select p.stock_quantity as qty, p.stock_value as value,
      (select coalesce(sum(quantity_delta), 0) from inventory_movements m where m.product_id = p.id) as mq,
      (select coalesce(sum(value_delta), 0) from inventory_movements m where m.product_id = p.id) as mv
    from products p where p.id = ${productId}`);
  return r;
}
