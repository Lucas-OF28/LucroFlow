import type { Metadata } from "next";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { PageHeader } from "@/components/shared/page-header";
import { todayIn } from "@/lib/dates";
import { str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listSupplierOptions } from "@/server/services/partners";
import { getProductOption } from "@/server/services/products";

export const metadata: Metadata = { title: "Nova compra" };

export default async function NewPurchasePage({ searchParams }: PageProps<"/compras/nova">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const [suppliers, product] = await Promise.all([listSupplierOptions(ctx), getProductOption(ctx, str(sp, "produto"))]);
  return (
    <>
      <PageHeader title="Nova compra" back={{ href: "/compras", label: "Compras" }} />
      <PurchaseForm suppliers={suppliers} today={todayIn(ctx.timezone)} initialProduct={product} />
    </>
  );
}
