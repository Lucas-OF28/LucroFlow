import type { Metadata } from "next";
import Link from "next/link";
import { BusinessForm, CategoryManager } from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/shared/page-header";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS, can } from "@/lib/permissions";
import { requireTenant } from "@/server/auth/session";
import { getBusiness } from "@/server/services/businesses";
import { listExpenseCategories } from "@/server/services/expenses";
import { listCategories } from "@/server/services/products";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireTenant();
  const [business, categories, expenseCategories] = await Promise.all([getBusiness(ctx), listCategories(ctx), listExpenseCategories(ctx)]);
  return (
    <>
      <PageHeader title="Configurações" description={`Seu papel nesta empresa: ${ROLE_LABELS[ctx.role]}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Empresa</CardTitle><CardDescription>Plano: {business.plan === "FREE" ? "Gratuito" : business.plan}</CardDescription></CardHeader>
          <CardContent><BusinessForm initial={{ name: business.name, timezone: business.timezone, staleDays: business.staleDays }} canEdit={can(ctx.role, "manageBusiness")} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Categorias de produto</CardTitle></CardHeader>
          <CardContent><CategoryManager kind="product" items={categories.map((c) => ({ id: c.id, name: c.name, count: c.productCount }))} canEdit={can(ctx.role, "write")} canArchive={can(ctx.role, "cancel")} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Categorias de despesa</CardTitle></CardHeader>
          <CardContent><CategoryManager kind="expense" items={expenseCategories} canEdit={can(ctx.role, "write")} canArchive={false} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Aparência</CardTitle><CardDescription>Claro, escuro ou igual ao sistema.</CardDescription></CardHeader>
          <CardContent><ThemeToggle /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Conta</CardTitle><CardDescription>{ctx.user.email}</CardDescription></CardHeader>
          <CardContent className="text-sm"><Link href="/recuperar-senha" className="underline">Alterar senha (enviar link por e-mail)</Link></CardContent>
        </Card>
      </div>
    </>
  );
}
