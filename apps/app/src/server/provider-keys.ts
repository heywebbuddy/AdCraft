import "server-only";
import { getPlatformSetting, setPlatformSetting } from "./platform-settings";
import { decryptSecret, encryptSecret } from "./crypto";

/**
 * Provider keys entered in Admin → Providers.
 *
 * Stored encrypted (AES-256-GCM, the same key as ad-platform tokens) in `platform_settings`
 * under `providerKeys` as { ENV_NAME: ciphertext }. A saved value overrides the server's
 * environment variable of the same name; clearing it falls back to the environment again.
 * Only names in the allowlist (the integrations listed on that page) can be set — never
 * DATABASE_URL, AUTH_SECRET or anything else.
 *
 * Applied by writing `process.env`, because every provider client reads its key from there
 * when it is used. `applyProviderKeys()` runs at server start (instrumentation.ts) and after
 * each save, so a change takes effect without a restart — except the sign-in methods, which
 * Auth.js reads once at start.
 */
const SETTING = "providerKeys";

/** Values that are safe to show in full (identifiers, hosts, ports), not secrets. */
const PLAIN = new Set(["SMTP_HOST", "SMTP_PORT", "R2_ACCOUNT_ID", "R2_BUCKET", "AUTH_GOOGLE_ID", "META_APP_ID", "TIKTOK_APP_ID", "GOOGLE_ADS_CLIENT_ID"]);

export const isPlainKey = (k: string) => PLAIN.has(k);

/** The original environment value of each key, captured before any database override. */
const original = new Map<string, string | undefined>();

async function loadStored(): Promise<Record<string, string>> {
  const raw = await getPlatformSetting<Record<string, string>>(SETTING);
  return raw && typeof raw === "object" ? raw : {};
}

/** Decrypted stored values. Unreadable entries (e.g. the encryption key changed) are skipped. */
export async function storedProviderKeys(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, enc] of Object.entries(await loadStored())) {
    try {
      out[k] = decryptSecret(enc);
    } catch {
      /* unreadable: treated as not set */
    }
  }
  return out;
}

/** Make `process.env` reflect the database: stored values win, cleared ones revert. */
export async function applyProviderKeys(allowed: string[]): Promise<void> {
  const stored = await storedProviderKeys();
  for (const k of allowed) {
    if (!original.has(k)) original.set(k, process.env[k]);
    const v = stored[k];
    if (v) process.env[k] = v;
    else if (original.get(k) === undefined) delete process.env[k];
    else process.env[k] = original.get(k);
  }
}

/** Save changes: a string sets the key, null removes the saved value. Only allowed names. */
export async function saveProviderKeys(changes: Record<string, string | null>, allowed: string[], adminId: string): Promise<string[]> {
  const current = await loadStored();
  const touched: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (!allowed.includes(k)) continue;
    if (v === null) {
      if (k in current) {
        delete current[k];
        touched.push(k);
      }
    } else if (v.trim()) {
      current[k] = encryptSecret(v.trim());
      touched.push(k);
    }
  }
  if (touched.length) {
    await setPlatformSetting(SETTING, current, adminId);
    await applyProviderKeys(allowed);
  }
  return touched;
}

/** Where each key currently comes from, with a masked hint. Never returns a full secret. */
export function describeKey(k: string, stored: Record<string, string>): { source: "database" | "environment" | "missing"; hint: string } {
  const fromDb = stored[k];
  const value = fromDb ?? original.get(k) ?? process.env[k];
  if (!value) return { source: "missing", hint: "" };
  const hint = isPlainKey(k) ? value : `••••${value.slice(-4)}`;
  return { source: fromDb ? "database" : "environment", hint };
}
