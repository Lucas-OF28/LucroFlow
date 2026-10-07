import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Operações administrativas de Auth (somente servidor; usa a chave secreta).
 * Isolado aqui para que trocar de provedor de autenticação não espalhe mudanças pelo app.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type CreateUserResult = { ok: true; userId: string } | { ok: false; reason: "exists" | "weak_password" | "error" };

/**
 * Cria a conta JÁ CONFIRMADA (sem verificação de e-mail, por decisão do produto).
 * Consequência aceita: o e-mail não prova posse; a recuperação de senha continua indo para o dono real do e-mail.
 */
export async function createConfirmedUser(input: { email: string; password: string; fullName: string }): Promise<CreateUserResult> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (data.user) return { ok: true, userId: data.user.id };
  if (error?.code === "email_exists" || error?.code === "user_already_exists" || /already/i.test(error?.message ?? "")) return { ok: false, reason: "exists" };
  if (error?.code === "weak_password") return { ok: false, reason: "weak_password" };
  return { ok: false, reason: "error" };
}
