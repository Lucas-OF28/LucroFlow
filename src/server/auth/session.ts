import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "../db/tenant";
import { listMemberships, resolveTenant } from "../services/businesses";

export const ACTIVE_BUSINESS_COOKIE = "lf_business";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

/** Usuário autenticado (validado no servidor de Auth), memorizado por requisição. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return { id: data.user.id, email: data.user.email ?? "", fullName: meta.full_name ?? meta.name ?? null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Contexto de empresa da requisição. O cookie só INDICA a preferência;
 * a associação é revalidada no banco (resolveTenant). Sem empresa → onboarding.
 */
export const requireTenant = cache(async (): Promise<TenantContext & { user: SessionUser }> => {
  const user = await requireUser();
  const preferred = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
  const tenant = await resolveTenant({ userId: user.id }, preferred);
  if (!tenant) redirect("/onboarding");
  return { ...tenant, user };
});

export const getMemberships = cache(async () => {
  const user = await requireUser();
  return listMemberships({ userId: user.id });
});
