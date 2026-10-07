import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { productImages, products } from "../db/schema";
import { type TenantContext, withTenant } from "../db/tenant";
import { AppError, notFound } from "../errors";
import { getStorage } from "../storage";
import { assertCan, audit } from "./_base";

export const IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGES = 10;

async function assertCanAddImage(ctx: TenantContext, productId: string) {
  return withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ id: products.id }).from(products).where(and(eq(products.businessId, ctx.businessId), eq(products.id, productId)));
    if (!p) throw notFound("Produto");
    const [{ n }] = await tx.select({ n: count() }).from(productImages).where(eq(productImages.productId, productId));
    if (n >= MAX_IMAGES) throw new AppError("VALIDATION", `Máximo de ${MAX_IMAGES} fotos por produto.`);
    return n;
  });
}

/**
 * Etapa 1 do upload: valida permissão, produto, tipo e tamanho declarados e devolve um link de envio de
 * USO ÚNICO para um caminho temporário da empresa. A foto (até 50 MB) vai do navegador direto ao Storage,
 * sem passar pelo limite de corpo das funções da Vercel (4,5 MB).
 */
export async function prepareProductImageUpload(ctx: TenantContext, productId: string, file: { type: string; size: number }) {
  assertCan(ctx, "write");
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) throw new AppError("VALIDATION", "Envie uma imagem JPG, PNG ou WebP.");
  if (!(file.size > 0) || file.size > IMAGE_MAX_BYTES) throw new AppError("VALIDATION", "A imagem deve ter no máximo 50 MB.");
  await assertCanAddImage(ctx, productId);
  const uploadPath = `businesses/${ctx.businessId}/uploads/${randomUUID()}`;
  return { uploadPath, uploadUrl: await getStorage().createUploadUrl(uploadPath) };
}

/**
 * Etapa 2: o servidor lê o arquivo enviado, valida o conteúdo REAL (decodifica a imagem — não confia no MIME
 * nem no tamanho declarados), corrige a rotação, redimensiona (máx. 1600 px), converte para WebP e grava em
 * businesses/{businessId}/products/{productId}/{uuid}.webp. O original temporário é sempre apagado.
 */
export async function finalizeProductImageUpload(ctx: TenantContext, productId: string, uploadPath: string) {
  assertCan(ctx, "write");
  // o caminho só pode ser um upload temporário DESTA empresa (nunca um arquivo arbitrário do bucket)
  const prefix = `businesses/${ctx.businessId}/uploads/`;
  if (!uploadPath.startsWith(prefix) || !/^[0-9a-f-]{36}$/.test(uploadPath.slice(prefix.length))) {
    throw new AppError("VALIDATION", "Upload inválido.");
  }
  const storage = getStorage();
  try {
    const existing = await assertCanAddImage(ctx, productId);
    let bytes: Buffer;
    try {
      bytes = await storage.get(uploadPath);
    } catch {
      throw new AppError("VALIDATION", "O envio da imagem não foi concluído. Tente novamente.");
    }
    if (bytes.length > IMAGE_MAX_BYTES) throw new AppError("VALIDATION", "A imagem deve ter no máximo 50 MB.");

    let webp: Buffer;
    let meta: OutputInfo;
    try {
      const out = await sharp(bytes, { limitInputPixels: 150_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      webp = out.data;
      meta = out.info;
    } catch {
      throw new AppError("VALIDATION", "Arquivo de imagem inválido ou corrompido.");
    }

    const path = `businesses/${ctx.businessId}/products/${productId}/${randomUUID()}.webp`;
    await storage.put(path, webp, "image/webp");
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
      await storage.remove([path]).catch(() => {});
      throw e;
    }
  } finally {
    await storage.remove([uploadPath]).catch(() => {});
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
