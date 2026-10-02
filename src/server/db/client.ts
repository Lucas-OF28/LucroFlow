import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Qualquer executor de queries: o banco ou uma transação aberta. */
export type Executor = Database | Transaction;

const globalForDb = globalThis as unknown as { __lucroflowDb?: { url: string; db: Database; client: postgres.Sql } };

function create(url: string) {
  const client = postgres(url, {
    // Pooler do Supabase em modo transação não suporta prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { url, client, db: drizzle(client, { schema }) };
}

/** Conexão única por processo (reaproveitada no hot reload do Next em desenvolvimento). */
export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (!globalForDb.__lucroflowDb || globalForDb.__lucroflowDb.url !== url) {
    globalForDb.__lucroflowDb = create(url);
  }
  return globalForDb.__lucroflowDb.db;
}

export async function closeDb() {
  if (globalForDb.__lucroflowDb) {
    await globalForDb.__lucroflowDb.client.end({ timeout: 5 });
    globalForDb.__lucroflowDb = undefined;
  }
}

export { schema };
