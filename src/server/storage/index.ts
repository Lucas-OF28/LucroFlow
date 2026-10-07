import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Abstração de armazenamento de arquivos. Hoje: Supabase Storage (bucket PRIVADO).
 * Trocar de provedor (S3, R2, disco) = nova implementação desta interface.
 *
 * Segurança: o navegador nunca tem credencial do Storage. O servidor valida empresa/papel e entrega
 * URLs assinadas de curta duração — para LER (exibição) e, no upload, um link de ENVIO de uso único para
 * um caminho temporário escolhido pelo servidor (arquivos grandes não passam pelo limite de 4,5 MB da Vercel).
 */
export interface StorageDriver {
  put(path: string, body: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer>;
  remove(paths: string[]): Promise<void>;
  signedUrls(paths: string[], expiresInSeconds?: number): Promise<Map<string, string>>;
  /** URL para o navegador enviar (PUT) UM arquivo para `path`. Válida por ~2 h, uso único. */
  createUploadUrl(path: string): Promise<string>;
}

let cached: StorageDriver | null = null;

class SupabaseStorageDriver implements StorageDriver {
  constructor(private client: SupabaseClient, private bucket: string) {}

  async put(path: string, body: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`storage.put failed: ${error.message}`);
  }

  async get(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw new Error(`storage.get failed: ${error?.message ?? "not found"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async createUploadUrl(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`storage.uploadUrl failed: ${error?.message}`);
    return data.signedUrl;
  }

  async remove(paths: string[]) {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) throw new Error(`storage.remove failed: ${error.message}`);
  }

  async signedUrls(paths: string[], expiresInSeconds = 60 * 60) {
    const out = new Map<string, string>();
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return out;
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrls(unique, expiresInSeconds);
    if (error) throw new Error(`storage.sign failed: ${error.message}`);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
    return out;
  }
}

export function isStorageConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getStorage(): StorageDriver {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("storage not configured");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  cached = new SupabaseStorageDriver(client, process.env.SUPABASE_STORAGE_BUCKET || "lucroflow");
  return cached;
}

/** URLs assinadas para exibição; falha silenciosa (mostra placeholder) se o Storage estiver indisponível. */
export async function signedUrlsSafe(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  if (!isStorageConfigured()) return new Map();
  try {
    return await getStorage().signedUrls(paths.filter((p): p is string => Boolean(p)));
  } catch {
    return new Map();
  }
}
