import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { productImages, products } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { getStorage } from "../storage";
import { assertCan, audit } from "./_base";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGES = 10;

/**
 * Upload de foto de produto: valida tipo REAL (decodificando a imagem, não confiando no MIME do cliente),
 * tamanho e permissão; redimensiona (máx. 1600px) e converte para WebP.
 * Caminho: businesses/{businessId}/products/{productId}/{uuid}.webp
 */
export async function addProductImage(ctx: TenantContext, productId: string, file: { bytes: Buffer; type: string; size: number }) {
  assertCan(ctx, "write");
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) throw new AppError("VALIDATION", "Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > IMAGE_MAX_BYTES) throw new AppError("VALIDATION", "A imagem deve ter no máximo 5 MB.");

  let webp: Buffer;
  let meta: OutputInfo;
  try {
    const out = await sharp(file.bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    webp = out.data;
    meta = out.info;
  } catch {
    throw new AppError("VALIDATION", "Arquivo de imagem inválido ou corrompido.");
  }

  // valida produto/limite antes de gravar no Storage
  const existing = await withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ id: products.id }).from(products).where(and(eq(products.businessId, ctx.businessId), eq(products.id, productId)));
    if (!p) throw notFound("Produto");
    const [{ n }] = await tx.select({ n: count() }).from(productImages).where(eq(productImages.productId, productId));
    if (n >= MAX_IMAGES) throw new AppError("VALIDATION", `Máximo de ${MAX_IMAGES} fotos por produto.`);
    return n;
  });

  const path = `businesses/${ctx.businessId}/products/${productId}/${randomUUID()}.webp`;
  await getStorage().put(path, webp, "image/webp");
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx.insert(productImages).values({
        businessId: ctx.businessId,
        productId,
        storagePath: path,
        contentType: "image/webp",
        sizeBytes: webp.length,
        width: meta.width,
        height: meta.height,
        position: existing,
        isPrimary: existing === 0,
        createdBy: ctx.userId,
      }).returning({ id: productImages.id });
      await audit(tx, ctx, { action: "product.image_added", entityType: "product", entityId: productId, summary: "Foto adicionada ao produto" });
      return row;
    });
  } catch (e) {
    await getStorage().remove([path]).catch(() => {});
    throw e;
  }
}

export async function removeProductImage(ctx: TenantContext, imageId: string) {
  assertCan(ctx, "write");
  const path = await withTenant(ctx, async (tx) => {
    const [img] = await tx.delete(productImages)
      .where(and(eq(productImages.businessId, ctx.businessId), eq(productImages.id, imageId)))
      .returning({ path: productImages.storagePath, productId: productImages.productId, isPrimary: productImages.isPrimary });
    if (!img) throw notFound("Foto");
    if (img.isPrimary) {
      await tx.execute(sql`update product_images set is_primary = true where id = (
        select id from product_images where product_id = ${img.productId} order by position limit 1)`);
    }
    await audit(tx, ctx, { action: "product.image_removed", entityType: "product", entityId: img.productId, summary: "Foto removida do produto" });
    return img.path;
  });
  await getStorage().remove([path]).catch(() => {});
}

export async function setPrimaryImage(ctx: TenantContext, imageId: string) {
  assertCan(ctx, "write");
  await withTenant(ctx, async (tx) => {
    const [img] = await tx.select({ productId: productImages.productId }).from(productImages)
      .where(and(eq(productImages.businessId, ctx.businessId), eq(productImages.id, imageId)));
    if (!img) throw notFound("Foto");
    await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, img.productId));
    await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
  });
}
