import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound fetch for URLs a user typed (website and product imports).
 *
 * Anything we fetch on a user's behalf can be pointed at our own infrastructure — Railway's
 * private network, the container itself, a cloud metadata endpoint — so every hop is resolved
 * first and rejected when it lands on a private address. Redirects are followed by hand for the
 * same reason: `redirect: "follow"` would only check the address the user typed.
 */

const BLOCKED_HOSTS = /(^|\.)(localhost|internal|local|localdomain|home\.arpa)$/i;

/** Private, loopback, link-local, CGNAT and other ranges that must never be reachable from here. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, includes 169.254.169.254 (cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::1" || s === "::") return true;
    if (/^(fc|fd)/.test(s)) return true; // unique local
    if (/^fe[89ab]/.test(s)) return true; // link-local
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return true;
}

export class BlockedUrlError extends Error {
  constructor(message = "That address is not public.") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Resolve a hostname and refuse anything that is not a public address. Returns the address to pin to. */
export async function assertPublicHost(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host) || !host.includes(".")) throw new BlockedUrlError();
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError();
    return host;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`Could not find ${host}.`);
  }
  if (!addresses.length) throw new BlockedUrlError(`Could not find ${host}.`);
  // Every answer must be public: one private record is enough for a rebind attack.
  for (const a of addresses) if (isPrivateAddress(a.address)) throw new BlockedUrlError();
  return addresses[0]!.address;
}

/** Parse and validate a user-supplied URL. Throws BlockedUrlError for anything we will not fetch. */
export async function publicUrl(input: string | URL): Promise<URL> {
  let u: URL;
  try {
    u = input instanceof URL ? input : new URL(input);
  } catch {
    throw new BlockedUrlError("That doesn't look like a web address.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new BlockedUrlError("Only http(s) links work.");
  await assertPublicHost(u.hostname);
  return u;
}

export type SafeFetchOptions = { headers?: Record<string, string>; timeoutMs?: number; maxRedirects?: number; maxBytes?: number };

/**
 * Fetch a public URL, checking every redirect hop. Returns the response and the final URL.
 * The body is read here (bounded by `maxBytes`) so callers cannot stream from a host that was
 * only validated at connect time.
 */
export async function safeFetch(input: string | URL, opts: SafeFetchOptions = {}): Promise<{ res: Response; url: URL; buffer: Buffer }> {
  const { headers = {}, timeoutMs = 15_000, maxRedirects = 4, maxBytes = 25 * 1024 * 1024 } = opts;
  let url = await publicUrl(input);
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; ; hop++) {
    const left = deadline - Date.now();
    if (left <= 0) throw new BlockedUrlError("That page took too long to answer.");
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(left) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) return { res, url, buffer: Buffer.alloc(0) };
      if (hop >= maxRedirects) throw new BlockedUrlError("That address redirects too many times.");
      url = await publicUrl(new URL(location, url));
      continue;
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new BlockedUrlError("That file is too large.");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new BlockedUrlError("That file is too large.");
    return { res, url, buffer };
  }
}

/** Convenience: text body of a public URL (empty string when the response is not ok). */
export async function safeText(input: string | URL, opts: SafeFetchOptions = {}): Promise<{ text: string; url: URL; ok: boolean; status: number }> {
  const { res, url, buffer } = await safeFetch(input, opts);
  return { text: res.ok ? buffer.toString("utf8") : "", url, ok: res.ok, status: res.status };
}
