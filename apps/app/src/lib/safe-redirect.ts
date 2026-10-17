/**
 * A redirect target that came from the request (`?callbackUrl=`, a form field). Only same-origin
 * relative paths pass: it must start with "/" but not "//" or "/\" (browsers read both as another
 * host), and must still resolve to this origin once tabs and newlines are stripped the way
 * browsers do. Anything else — absolute URLs, `javascript:`, protocol-relative — gets `fallback`.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  const base = "http://same-origin.invalid";
  try {
    if (new URL(value, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
