import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { createBusinessSchema, updateBusinessSchema } from "@/lib/validations";
import { businessMembers, businesses, userPreferences, users } from "../db/schema";
import { type MemberRole, type TenantContext, type UserContext, withTenant, withUser } from "../db/tenant";
import { AppError } from "../errors";
import { assertCan, audit, parse } from "./_base";

export interface AuthUserInfo {
  id: string;
  email: string;
  fullName?: string | null;
}

/** Cria/atualiza o perfil público do usuário autenticado (idempotente). */
export async function ensureUserProfile(user: AuthUserInfo) {
  await withUser({ userId: user.id }, async (tx) => {
    await tx
      .insert(users)
      .values({ id: user.id, email: user.email, fullName: user.fullName ?? null })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: user.email, ...(user.fullName ? { fullName: user.fullName } : {}) },
      });
  });
}

export interface Membership {
  businessId: string;
  businessName: string;
  role: MemberRole;
  timezone: string;
}

export async function listMemberships(ctx: UserContext): Promise<Membership[]> {
  return withUser(ctx, (tx) =>
    tx
      .select({
        businessId: businesses.id,
        businessName: businesses.name,
        role: businessMembers.role,
        timezone: businesses.timezone,
      })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(and(eq(businessMembers.userId, ctx.userId), eq(businessMembers.status, "ACTIVE")))
      .orderBy(asc(businessMembers.createdAt)),
  );
}

/**
 * Resolve a empresa ativa: valida no banco que o usuário é membro ativo.
 * Um businessId de cookie/URL adulterado simplesmente não resolve.
 */
export async function resolveTenant(ctx: UserContext, preferredBusinessId?: string | null): Promise<TenantContext | null> {
  const memberships = await listMemberships(ctx);
  if (memberships.length === 0) return null;
  const m = memberships.find((x) => x.businessId === preferredBusinessId) ?? memberships[0];
  return { userId: ctx.userId, businessId: m.businessId, role: m.role, timezone: m.timezone };
}

export async function createBusiness(ctx: UserContext, input: unknown): Promise<string> {
  const data = parse(createBusinessSchema, input);
  return withUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`select app.create_business(${data.name}, ${data.timezone}) as id`);
    const businessId = rows[0].id;
    await tx
      .insert(userPreferences)
      .values({ userId: ctx.userId, lastBusinessId: businessId })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { lastBusinessId: businessId } });
    await audit(tx, { ...ctx, businessId, role: "OWNER", timezone: data.timezone }, {
      action: "business.created",
      entityType: "business",
      entityId: businessId,
      summary: `Empresa ${data.name} criada`,
    });
    return businessId;
  }).catch((err) => {
    if (String((err as Error)?.message ?? "").includes("invalid timezone")) throw new AppError("VALIDATION", "Fuso horário inválido.");
    throw err;
  });
}

export async function getBusiness(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const [b] = await tx.select().from(businesses).where(eq(businesses.id, ctx.businessId));
    return b;
  });
}

export async function updateBusiness(ctx: TenantContext, input: unknown) {
  assertCan(ctx, "manageBusiness");
  const data = parse(updateBusinessSchema, input);
  return withTenant(ctx, async (tx) => {
    const valid = await tx.execute(sql`select 1 from pg_timezone_names where name = ${data.timezone}`);
    if (valid.length === 0) throw new AppError("VALIDATION", "Fuso horário inválido.");
    await tx
      .update(businesses)
      .set({ name: data.name, timezone: data.timezone, staleDays: data.staleDays })
      .where(eq(businesses.id, ctx.businessId));
    await audit(tx, ctx, { action: "business.updated", entityType: "business", entityId: ctx.businessId, summary: "Configurações da empresa atualizadas", metadata: data });
  });
}

export async function getUserPreferences(ctx: UserContext) {
  return withUser(ctx, async (tx) => {
    const [p] = await tx.select().from(userPreferences).where(eq(userPreferences.userId, ctx.userId));
    return p ?? null;
  });
}

export async function setUserPreferences(ctx: UserContext, prefs: { theme?: "light" | "dark" | "system"; lastBusinessId?: string }) {
  await withUser(ctx, async (tx) => {
    await tx
      .insert(userPreferences)
      .values({ userId: ctx.userId, ...prefs })
      .onConflictDoUpdate({ target: userPreferences.userId, set: prefs });
  });
}
