import "server-only";
import { headers } from "next/headers";

/** Absolute origin of the current request (respects proxies), for links in emails and share URLs. */
export async function baseUrl() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
