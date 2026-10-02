import type { Metadata } from "next";
import { SaleForm } from "@/components/sales/sale-form";
import { PageHeader } from "@/components/shared/page-header";
import { todayIn } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { getProductOption } from "@/server/services/products";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage({ searchParams }: PageProps<"/vendas/nova">) {
  const ctx = await requireTenant();
  const product = await getProductOption(ctx, str(await searchParams, "produto"));
  return (
    <>
      <PageHeader title="Nova venda" back={{ href: "/vendas", label: "Vendas" }} />
      <SaleForm today={todayIn(ctx.timezone)} initialProduct={product} canApproveLoss={can(ctx.role, "approveLoss")} />
    </>
  );
}
