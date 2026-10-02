/**
 * Aplica as migrations versionadas em ./drizzle.
 * Uso: npm run db:migrate   (lê DATABASE_MIGRATION_URL ou DATABASE_URL de .env.local)
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function runMigrations(url: string) {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end({ timeout: 5 });
  }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate.ts");
if (isMain) {
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL (ou DATABASE_MIGRATION_URL) em .env.local");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("✔ Migrations aplicadas."))
    .catch((err) => {
      console.error("✖ Falha ao aplicar migrations:", err);
      process.exit(1);
    });
}
