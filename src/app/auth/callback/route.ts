import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/server/services/businesses";
import { logger } from "@/server/logger";

/** Retorno dos links de e-mail (confirmação de conta e recuperação de senha). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureUserProfile({ id: data.user.id, email: data.user.email ?? "", fullName: data.user.user_metadata?.full_name });
      return NextResponse.redirect(`${origin}${next}`);
    }
    logger.warn("auth.callback_failed", { reason: error?.code });
  }
  return NextResponse.redirect(`${origin}/login?erro=link`);
}
