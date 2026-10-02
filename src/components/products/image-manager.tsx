"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { removeProductImageAction, setPrimaryImageAction } from "@/server/actions/domain";

const MAX = 5 * 1024 * 1024;

export function ImageManager({
  productId,
  name,
  images,
  canEdit,
  storageReady,
}: {
  productId: string;
  name: string;
  images: { id: string; url?: string; isPrimary: boolean }[];
  canEdit: boolean;
  storageReady: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const primary = images.find((i) => i.isPrimary) ?? images[0];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error(`${file.name}: use JPG, PNG ou WebP.`); continue; }
      if (file.size > MAX) { toast.error(`${file.name}: máximo de 5 MB.`); continue; }
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/products/${productId}/images`, { method: "POST", body });
      const json = (await res.json().catch(() => ({ ok: false, error: "Falha no envio." }))) as ActionResult<unknown>;
      if (!json.ok) toast.error(json.error);
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {primary?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada
          <img src={primary.url} alt={name} className="size-full object-cover" />
        ) : (
          <span className="text-sm text-muted-foreground">Sem foto</span>
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((img) => (
            <li key={img.id} className={cn("group relative aspect-square overflow-hidden rounded-lg border", img.isPrimary && "ring-2 ring-primary")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
              {canEdit && (
                <div className="absolute inset-0 flex items-end justify-between bg-black/40 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" aria-label="Definir como principal" className="rounded bg-background/90 p-1" disabled={pending}
                    onClick={() => start(async () => { const r = await setPrimaryImageAction(img.id, productId); if (!r.ok) toast.error(r.error); })}>
                    <Star className="size-3" />
                  </button>
                  <button type="button" aria-label="Remover foto" className="rounded bg-background/90 p-1 text-danger" disabled={pending}
                    onClick={() => start(async () => { const r = await removeProductImageAction(img.id, productId); if (!r.ok) toast.error(r.error); })}>
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        storageReady ? (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" id="product-photo" onChange={(e) => upload(e.target.files)} />
            <Button type="button" variant="outline" className="w-full" disabled={uploading} onClick={() => input.current?.click()}>
              <ImagePlus className="size-4" /> {uploading ? "Enviando…" : "Adicionar fotos"}
            </Button>
            {images.length === 1 && canEdit && (
              <Button type="button" variant="ghost" size="sm" className="w-full text-danger" disabled={pending}
                onClick={() => start(async () => { const r = await removeProductImageAction(images[0].id, productId); if (!r.ok) toast.error(r.error); })}>
                <Trash2 className="size-4" /> Remover foto
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Fotos indisponíveis: configure o Supabase Storage (SUPABASE_SERVICE_ROLE_KEY).</p>
        )
      )}
    </div>
  );
}
