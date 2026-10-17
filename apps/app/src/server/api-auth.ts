import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, dbReady, apiKeys, organizations } from "@adcraft/db";

export const API_KEY_PREFIX = "ak_live_";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** A fresh key. Only `hashed` is stored; `plain` is shown once. */
export function generateApiKey() {
  const plain = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { plain, hashed: hashApiKey(plain), prefix: plain.slice(0, API_KEY_PREFIX.length + 6) };
}

export type ApiPrincipal = { orgId: string; keyId: string; name: string };

/**
 * Resolve `Authorization: Bearer ak_live_…` to an organisation, or null. Touches lastUsedAt.
 * Keys of a suspended organisation are refused, like its members' sessions (server/org.ts).
 */
export async function authenticateApiKey(req: Request): Promise<ApiPrincipal | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const plain = m[1];
  if (!plain.startsWith(API_KEY_PREFIX)) return null;
  await dbReady;
  const [row] = await db
    .select({ id: apiKeys.id, orgId: apiKeys.orgId, name: apiKeys.name })
    .from(apiKeys)
    .innerJoin(organizations, eq(organizations.id, apiKeys.orgId))
    .where(and(eq(apiKeys.hashedKey, hashApiKey(plain)), isNull(apiKeys.revokedAt), isNull(organizations.suspendedAt)))
    .limit(1);
  if (!row) return null;
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});
  return { orgId: row.orgId, keyId: row.id, name: row.name };
}

export function unauthorized(message = "Missing or invalid API key. Send `Authorization: Bearer ak_live_…`.") {
  return Response.json({ error: { code: "unauthorized", message } }, { status: 401 });
}
