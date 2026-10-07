"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { finalizeImageUploadAction, prepareImageUploadAction, removeProductImageAction, setPrimaryImageAction } from "@/server/actions/domain";

const MAX = 50 * 1024 * 1024;

/** PUT direto no link de envio de uso único, com progresso (fetch não informa progresso de upload). */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

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
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const primary = images.find((i) => i.isPrimary) ?? images[0];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    for (const [i, file] of list.entries()) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error(`${file.name}: use JPG, PNG ou WebP.`); continue; }
      if (file.size > MAX) { toast.error(`${file.name}: máximo de 50 MB.`); continue; }
      const label = list.length > 1 ? ` (${i + 1}/${list.length})` : "";
      setUploading(`Preparando${label}…`);
      const prep = await prepareImageUploadAction(productId, { type: file.type, size: file.size });
      if (!prep.ok) { toast.error(prep.error); continue; }
      try {
        await putWithProgress(prep.data.uploadUrl, file, (pct) => setUploading(`Enviando${label} ${pct}%`));
      } catch {
        toast.error(`${file.name}: falha no envio. Verifique a conexão e tente novamente.`);
        continue;
      }
      setUploading(`Otimizando${label}…`);
      const fin = await finalizeImageUploadAction(productId, prep.data.uploadPath);
      if (!fin.ok) toast.error(fin.error);
    }
    setUploading(null);
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
            <Button type="button" variant="outline" className="w-full" disabled={uploading !== null} onClick={() => input.current?.click()}>
              <ImagePlus className="size-4" /> <span aria-live="polite">{uploading ?? "Adicionar fotos"}</span>
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
