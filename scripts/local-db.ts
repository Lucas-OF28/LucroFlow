/**
 * PostgreSQL local SEM Docker (binário oficial via embedded-postgres), para desenvolvimento e testes manuais.
 *
 *   npm run db:local            → sobe em localhost:54322 (dados em ./.local-db, persistente)
 *
 * Depois, em outro terminal: DATABASE_URL=postgres://postgres:postgres@localhost:54322/lucroflow
 * npm run db:migrate && npm run db:seed. Auth/Storage continuam exigindo um projeto Supabase.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(".local-db");
const port = Number(process.env.LOCAL_DB_PORT ?? 54322);

async function main() {
  const fresh = !existsSync(path.join(dir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("lucroflow");
  console.log(`✔ PostgreSQL local em postgres://postgres:postgres@localhost:${port}/lucroflow (Ctrl+C para parar)`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
