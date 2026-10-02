"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, Home, Plus, ShoppingBag } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, QUICK_ACTIONS } from "./nav-items";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Navegação inferior no celular: INÍCIO · ESTOQUE · + · VENDAS · RELATÓRIOS (§44). */
export function MobileBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Início", icon: Home },
    { href: "/estoque", label: "Estoque", icon: Boxes },
    null,
    { href: "/vendas", label: "Vendas", icon: ShoppingBag },
    { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  ];
  return (
    <nav aria-label="Navegação rápida" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <ul className="grid grid-cols-5 items-end">
        {items.map((item) =>
          item === null ? (
            <li key="plus" className="flex justify-center">
              <QuickActionsDrawer />
            </li>
          ) : (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground", isActive(pathname, item.href) && "text-primary")}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function QuickActionsDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Ações rápidas: nova venda, compra, produto ou despesa"
          className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background focus-visible:ring-ring focus-visible:outline-none"
        >
          <Plus className="size-7" />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>O que você quer registrar?</DrawerTitle>
          <DrawerDescription>Escolha uma ação rápida.</DrawerDescription>
        </DrawerHeader>
        <div className="grid grid-cols-2 gap-3 p-4 pb-8">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium hover:bg-muted">
              <Icon className="size-6 text-primary" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
