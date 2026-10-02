import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../scripts/migrate";

/**
 * Sobe um PostgreSQL REAL (binário oficial, sem Docker) para os testes de integração,
 * aplica as migrations versionadas e expõe a URL aos testes.
 * Se TEST_DATABASE_URL estiver definida (ex.: CI com serviço Postgres), usa ela.
 */
export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) {
    await runMigrations(process.env.TEST_DATABASE_URL);
    project.provide("databaseUrl", process.env.TEST_DATABASE_URL);
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "lucroflow-pg-"));
  const port = 54_000 + Math.floor(Math.random() * 900);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    // mesmo encoding do Supabase (no Windows o padrão seria WIN1252)
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("lucroflow_test");
  const url = `postgres://postgres:postgres@localhost:${port}/lucroflow_test`;
  await runMigrations(url);
  project.provide("databaseUrl", url);

  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
