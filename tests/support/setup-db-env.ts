import { afterAll, inject } from "vitest";
import { closeDb } from "@/server/db/client";

process.env.DATABASE_URL = inject("databaseUrl");

afterAll(async () => {
  await closeDb();
});
