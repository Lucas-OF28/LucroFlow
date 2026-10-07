"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createConfirmedUser } from "../auth/admin";
import { ACTIVE_BUSINESS_COOKIE, requireUser } from "../auth/session";
import { createBusiness, ensureUserProfile, listMemberships, setUserPreferences } from "../services/businesses";
import { logger } from "../logger";
import { TOO_MANY, clientIp, hit } from "../rate-limit";
import { runAction } from "./_run";

const credentials = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(72),
});

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Só permite redirecionar para caminhos internos (evita open redirect). */
function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

export async function signInAction(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  // força bruta: limite por IP e por e-mail
  const ip = await clientIp();
  if (!(await hit("signInIp", ip)) || !(await hit("signInEmail", parsed.data.email))) return { ok: false, error: TOO_MANY };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    logger.warn("auth.sign_in_failed", { reason: error?.code });
    return { ok: false, error: error?.code === "email_not_confirmed" ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha incorretos." };
  }
  await ensureUserProfile({ id: data.user.id, email: data.user.email ?? parsed.data.email, fullName: data.user.user_metadata?.full_name });
  redirect(safeNext(form.get("next")));
}

/** Cadastro sem verificação de e-mail: a conta nasce confirmada e o usuário já entra logado. */
export async function signUpAction(_: unknown, form: FormData): Promise<ActionResult> {
  const schema = credentials.extend({ fullName: z.string().trim().min(2, "Informe seu nome.").max(120) });
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password"), fullName: form.get("fullName") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const email = parsed.data.email.trim().toLowerCase();
  // o cadastro usa a chave admin (sem o limite nativo do Supabase): limite próprio por IP
  if (!(await hit("signUpIp", await clientIp()))) return { ok: false, error: TOO_MANY };

  const created = await createConfirmedUser({ email, password: parsed.data.password, fullName: parsed.data.fullName });
  if (!created.ok) {
    logger.warn("auth.sign_up_failed", { reason: created.reason });
    if (created.reason === "exists") return { ok: false, error: "Este e-mail já está cadastrado. Entre ou recupere a senha." };
    if (created.reason === "weak_password") return { ok: false, error: "Senha muito fraca. Use letras, números e símbolos." };
    return { ok: false, error: "Não foi possível criar a conta. Tente novamente." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    logger.error("auth.sign_in_after_sign_up_failed", { reason: error.code });
    return { ok: false, error: "Conta criada. Entre com seu e-mail e senha." };
  }
  await ensureUserProfile({ id: created.userId, email, fullName: parsed.data.fullName });
  redirect("/onboarding");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/login");
}

export async function requestPasswordResetAction(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ email: z.email("Informe um e-mail válido.") }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!(await hit("resetIp", await clientIp())) || !(await hit("resetEmail", parsed.data.email))) return { ok: false, error: TOO_MANY };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/callback?next=/auth/redefinir-senha`,
  });
  // Mesma resposta exista ou não a conta (não revela e-mails cadastrados).
  return { ok: true, data: undefined, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
}

export async function updatePasswordAction(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(72), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Não foi possível alterar a senha. Solicite um novo link." };
  redirect("/");
}

export async function createBusinessAction(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction("business.create", async () => {
    await ensureUserProfile({ id: user.id, email: user.email, fullName: user.fullName });
    return createBusiness({ userId: user.id }, { name: form.get("name"), timezone: form.get("timezone") || undefined });
  }, "Não foi possível criar a empresa. Tente novamente.");
  if (!result.ok) return result;
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, result.data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function switchBusinessAction(businessId: string) {
  const user = await requireUser();
  const memberships = await listMemberships({ userId: user.id });
  if (!memberships.some((m) => m.businessId === businessId)) return;
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  await setUserPreferences({ userId: user.id }, { lastBusinessId: businessId });
  redirect("/");
}
