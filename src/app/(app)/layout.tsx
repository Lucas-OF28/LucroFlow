import Link from "next/link";
import { MobileBottomNav, SidebarNav } from "@/components/layout/app-nav";
import { GlobalSearch } from "@/components/layout/global-search";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo, LogoMark } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getMemberships, requireTenant } from "@/server/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireTenant();
  const memberships = await getMemberships();
  const active = memberships.find((m) => m.businessId === ctx.businessId);

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
        <Link href="/" className="mb-4 px-2 py-1"><Logo /></Link>
        <SidebarNav />
        <p className="mt-auto truncate px-3 pt-4 text-xs text-muted-foreground">{active?.businessName}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Link href="/" className="md:hidden" aria-label="LucroFlow — início"><LogoMark className="size-7" /></Link>
          <div className="min-w-0 flex-1"><GlobalSearch /></div>
          <ThemeToggle />
          <UserMenu user={ctx.user} businesses={memberships} activeBusinessId={ctx.businessId} />
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
