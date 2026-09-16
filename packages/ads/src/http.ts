import { createHash } from "node:crypto";
import { AdsApiError } from "./provider";
import type { Platform } from "./types";

export type Json = Record<string, unknown>;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  /** JSON body (sent as application/json). */
  json?: unknown;
  /** Multipart body. */
  form?: FormData;
  /** URL-encoded body. */
  urlencoded?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
};

export function withQuery(url: string, query?: RequestOptions["query"]): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

/**
 * fetch wrapper: throws AdsApiError on non-2xx or on a platform "error" envelope that
 * hides inside a 200 (TikTok's `code !== 0`, Meta's `{error}`) — callers pass `isError`.
 */
export async function request<T = Json>(
  platform: Platform,
  url: string,
  opts: RequestOptions & { isError?: (body: unknown) => boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  } else if (opts.urlencoded) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.urlencoded).toString();
  }
  const full = withQuery(url, opts.query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(full, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* keep text */
  }
  const endpoint = endpointOf(full);
  if (!res.ok) throw new AdsApiError(platform, endpoint, res.status, parsed);
  if (opts.isError?.(parsed)) throw new AdsApiError(platform, endpoint, res.status, parsed);
  return parsed as T;
}

function endpointOf(url: string) {
  try {
    const u = new URL(url);
    return `${u.pathname}`;
  } catch {
    return url;
  }
}

/** Small deterministic 32-bit hash (FNV-1a) for seeds and synthetic ids. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shortHash(input: string, len = 10): string {
  const a = fnv1a(input).toString(36);
  const b = fnv1a(`${input}:2`).toString(36);
  return `${a}${b}`.slice(0, len);
}

/** YYYY-MM-DD for a Date in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/** Every YYYY-MM-DD from since to until inclusive. */
export function dateRange(since: string, until: string): string[] {
  const out: string[] = [];
  let cur = since;
  let guard = 0;
  while (cur <= until && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function truncate(s: string | undefined, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function fileToBlob(bytes: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType });
}

export function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

export function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
