import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

// pnpm runs this command from packages/db; use the same root env files as Next.
for (const file of [".env", ".env.local"]) {
  const envPath = path.resolve(__dirname, "../../", file);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/adcraft" },
  strict: true,
  verbose: true,
});
