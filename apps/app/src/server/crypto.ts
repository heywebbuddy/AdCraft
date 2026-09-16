import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { OAuthTokens } from "@adcraft/ads";

/**
 * AES-256-GCM for ad-platform tokens at rest (PLAN.md section 4: "Tokens are encrypted at rest").
 *
 * Key: `TOKEN_ENCRYPTION_KEY` (base64, 32 bytes) when set; otherwise derived from
 * `AUTH_SECRET` with HKDF-SHA256 so local development needs no extra config.
 * Ciphertext format: `v1.<iv>.<tag>.<data>` (base64url), so the key can be rotated later
 * by bumping the version prefix.
 */
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    cachedKey = buf;
    return buf;
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set TOKEN_ENCRYPTION_KEY or AUTH_SECRET to encrypt ad-platform tokens");
  cachedKey = Buffer.from(hkdfSync("sha256", secret, "adcraft-token-encryption", "ad-platform-tokens", 32));
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  const [version, ivB, tagB, dataB] = enc.split(".");
  if (version !== VERSION || !ivB || !tagB || !dataB) throw new Error("Unrecognised token ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

/** Columns for `ad_accounts` from a token set. */
export function encryptTokens(tokens: OAuthTokens) {
  return {
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    tokenExpiresAt: tokens.expiresAt ?? null,
  };
}

export function decryptTokens(row: { accessTokenEnc: string | null; refreshTokenEnc: string | null; tokenExpiresAt: Date | null }): OAuthTokens {
  if (!row.accessTokenEnc) throw new Error("Ad account has no stored token; reconnect it");
  return {
    accessToken: decryptSecret(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : undefined,
    expiresAt: row.tokenExpiresAt ?? undefined,
  };
}
