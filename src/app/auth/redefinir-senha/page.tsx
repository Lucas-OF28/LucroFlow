import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Logo } from "@/components/shared/logo";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage() {
  await requireUser();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4">
      <Logo />
      <div className="w-full max-w-sm"><ResetPasswordForm /></div>
    </div>
  );
}
