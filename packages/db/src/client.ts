import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

/**
 * One database type for the whole app, whichever driver is underneath.
 *
 * - `DATABASE_URL` set → postgres-js against a real Postgres (staging/prod, or local if you have one).
 * - unset → PGlite, an embedded Postgres persisted under `.data/pglite`, migrated on first use.
 *   Zero setup for local development.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __adcraftDb?: Db; __adcraftReady?: Promise<void> };

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

function create(): { db: Db; ready: Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, { prepare: false, max: 10 });
    return { db: drizzlePostgres(sql, { schema }) as unknown as Db, ready: Promise.resolve() };
  }
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.resolve(process.cwd(), "../../.data/pglite");
  if (process.env.NODE_ENV === "production") {
    console.warn("[@adcraft/db] DATABASE_URL is not set in production; falling back to PGlite at", dataDir);
  }
  // PGlite is ESM-only and loads its wasm relative to its own file, so it must not be
  // bundled by webpack. `process.getBuiltinModule` is opaque to webpack, so this stays a real Node require.
  const nodeModule = process.getBuiltinModule("node:module") as typeof import("node:module");
  const nodeRequire = nodeModule.createRequire(path.resolve(migrationsFolder, "../package.json"));
  const { PGlite } = nodeRequire("@electric-sql/pglite") as { PGlite: typeof PGliteType };

  const open = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    return new PGlite(dataDir);
  };
  let client: PGliteType = open();
  const db = drizzlePglite(client, { schema }) as unknown as Db;

  const ready = (async () => {
    try {
      await client.waitReady;
    } catch (err) {
      // An unclean shutdown can leave the directory in a state PGlite refuses to open.
      // Development data only: move it aside and start fresh rather than crash every request.
      const aside = `${dataDir}-corrupt-${Date.now()}`;
      console.error(`[@adcraft/db] PGlite could not open ${dataDir} (${(err as Error).message}). Moving it to ${aside} and starting fresh.`);
      fs.renameSync(dataDir, aside);
      client = open();
      // Rebind the drizzle instance's session to the new client.
      (db as unknown as { session: { client: PGliteType } }).session.client = client;
      await client.waitReady;
    }
    await migratePglite(db as never, { migrationsFolder });
  })().catch((err) => {
    console.error("[@adcraft/db] PGlite migration failed", err);
    throw err;
  });

  // Close cleanly so the next boot finds a consistent directory.
  const shutdown = () => {
    void client.close().finally(() => process.exit(0));
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, shutdown);
  }
  return { db, ready };
}

const instance = g.__adcraftDb ? { db: g.__adcraftDb, ready: g.__adcraftReady! } : create();
g.__adcraftDb = instance.db;
g.__adcraftReady = instance.ready;

export const db: Db = instance.db;
/** Resolves once the embedded database has its migrations applied (immediately for Postgres). */
export const dbReady: Promise<void> = instance.ready;
