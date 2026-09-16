import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __adcraftSql?: ReturnType<typeof postgres> };

const PLACEHOLDER_URL = "postgres://localhost:5432/adcraft";

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // postgres-js opens no socket until the first query, so a placeholder keeps
    // `next build` (which imports this module) working without a database.
    console.warn("[@adcraft/db] DATABASE_URL is not set; queries will fail until it is.");
  }
  return postgres(url ?? PLACEHOLDER_URL, { prepare: false, max: 10 });
}

// Reuse the connection pool across HMR reloads in dev.
const sql = globalForDb.__adcraftSql ?? createSql();
if (process.env.NODE_ENV !== "production") globalForDb.__adcraftSql = sql;

export const db: Db = drizzle(sql, { schema });
