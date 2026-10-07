import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/security";
import { supabasePublicConfig } from "./config";

/** Cliente Supabase do servidor (sessão via cookies httpOnly). Usado SOMENTE por src/server/auth. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicConfig();
  return createServerClient(url, anonKey, {
    cookieOptions: sessionCookieOptions({}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, sessionCookieOptions(options));
        } catch {
          // Server Component: não pode gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
