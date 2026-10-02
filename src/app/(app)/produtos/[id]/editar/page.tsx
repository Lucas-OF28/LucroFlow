import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/products/product-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireTenant } from "@/server/auth/session";
import { listSupplierOptions } from "@/server/services/partners";
import { getProductDetail, listCategories } from "@/server/services/products";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params }: PageProps<"/produtos/[id]/editar">) {
  const ctx = await requireTenant();
  const { id } = await params;
  const [p, categories, suppliers] = await Promise.all([getProductDetail(ctx, id), listCategories(ctx), listSupplierOptions(ctx)]);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={`Editar ${p.name}`} back={{ href: `/produtos/${id}`, label: p.name }} />
      <ProductForm
        productId={id}
        categories={categories}
        suppliers={suppliers}
        initial={{
          name: p.name,
          description: p.description ?? "",
          categoryId: p.categoryId ?? "",
          sku: p.sku ?? "",
          barcode: p.barcode ?? "",
          unit: p.unit,
          minStock: String(Number(p.minStock)),
          referencePrice: p.referencePrice ?? "",
          minimumPrice: p.minimumPrice ?? "",
          targetMargin: p.targetMargin ?? "",
          location: p.location ?? "",
          mainSupplierId: p.mainSupplierId ?? "",
          notes: p.notes ?? "",
          status: p.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        }}
      />
    </>
  );
}
