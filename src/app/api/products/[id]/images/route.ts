import { NextResponse, type NextRequest } from "next/server";
import { runAction } from "@/server/actions/_run";
import { requireTenant } from "@/server/auth/session";
import { addProductImage, IMAGE_MAX_BYTES } from "@/server/services/images";
import { isStorageConfigured } from "@/server/storage";

/** Upload de foto (multipart). Route Handler para não depender do limite de corpo das Server Actions. */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/products/[id]/images">) {
  const { id } = await params;
  if (!isStorageConfigured()) {
    return NextResponse.json({ ok: false, error: "Armazenamento de fotos não configurado." }, { status: 503 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > IMAGE_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, error: "A imagem deve ter no máximo 5 MB." }, { status: 413 });
  }
  const result = await runAction("product.image_upload", async () => {
    const ctx = await requireTenant();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("missing file");
    return addProductImage(ctx, id, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type, size: file.size });
  }, "Não foi possível enviar a foto.");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
