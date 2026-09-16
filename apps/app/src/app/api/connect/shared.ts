export const CONNECT_COOKIE = "adcraft_connect";

export type ConnectState = { state: string; orgId: string; brandId: string | null; platform: string; redirectUri: string };

export function appOrigin(req: Request) {
  const configured = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return (configured ?? new URL(req.url).origin).replace(/\/$/, "");
}
