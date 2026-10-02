import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { Logo } from "@/components/shared/logo";
import { getMemberships, requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Configurar negócio" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireUser();
  const sp = await searchParams;
  const memberships = await getMemberships();
  if (memberships.length > 0 && sp.nova !== "1") redirect("/");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4">
      <Logo />
      <div className="w-full max-w-sm"><OnboardingForm firstBusiness={memberships.length === 0} /></div>
    </div>
  );
}
