import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return <LoginForm next={typeof sp.next === "string" ? sp.next : undefined} linkError={sp.erro === "link"} />;
}
