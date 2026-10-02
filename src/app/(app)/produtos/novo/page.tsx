import type { Metadata } from "next";
import { ProductForm } from "@/components/products/product-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireTenant } from "@/server/auth/session";
import { listSupplierOptions } from "@/server/services/partners";
import { listCategories } from "@/server/services/products";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const ctx = await requireTenant();
  const [categories, suppliers] = await Promise.all([listCategories(ctx), listSupplierOptions(ctx)]);
  return (
    <>
      <PageHeader title="Novo produto" back={{ href: "/produtos", label: "Produtos" }} />
      <ProductForm categories={categories} suppliers={suppliers} />
    </>
  );
}
