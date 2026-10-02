"use client";

import { Building2, Check, LogOut, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { signOutAction, switchBusinessAction } from "@/server/actions/auth";

export function UserMenu({
  user,
  businesses,
  activeBusinessId,
}: {
  user: { email: string; fullName: string | null };
  businesses: { businessId: string; businessName: string; role: Role }[];
  activeBusinessId: string;
}) {
  const initials = (user.fullName ?? user.email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu da conta">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium">{user.fullName ?? "Minha conta"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Empresas</DropdownMenuLabel>
        {businesses.map((b) => (
          <DropdownMenuItem key={b.businessId} onSelect={() => b.businessId !== activeBusinessId && switchBusinessAction(b.businessId)}>
            <Building2 className="size-4" aria-hidden />
            <span className="flex-1 truncate">
              {b.businessName}
              <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[b.role]}</span>
            </span>
            {b.businessId === activeBusinessId && <Check className="size-4 text-primary" aria-label="Empresa ativa" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/onboarding?nova=1"><Plus className="size-4" /> Nova empresa</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes"><Settings className="size-4" /> Configurações</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOutAction()}>
          <LogOut className="size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
