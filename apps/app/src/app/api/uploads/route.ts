import { NextResponse } from "next/server";
import { getStorage, objectKey, extFromMime } from "@adcraft/storage";
import { requireOrg } from "@/server/org";
import { checkRate } from "@/server/guardrails";

/**
 * Large uploads (twin footage, headshots) go through this route rather than a server action:
 * actions are capped at 16 MB, footage for a digital twin can be a few hundred. The file is
 * stored under the org's `uploads/` prefix and its key handed back for the next action.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 600 * 1024 * 1024;
const ALLOWED = /^(video\/(mp4|quicktime|webm|x-m4v)|image\/(png|jpeg|webp)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a|m4a|aac|ogg|webm|flac))$/;

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireOrg();
  } catch {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }
  if (ctx.role === "viewer") return NextResponse.json({ error: "Viewers can't upload." }, { status: 403 });
  try {
    checkRate(ctx.org.id, "upload", 30);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Too many uploads." }, { status: 429 });
  }
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "Keep the file under 600 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep the file under 600 MB." }, { status: 413 });
  const type = ALLOWED.test(file.type) ? file.type : file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "";
  if (!type) return NextResponse.json({ error: "Use an mp4 / mov / webm video, or a png / jpg image." }, { status: 415 });
  const key = objectKey(ctx.org.id, "uploads", extFromMime(type));
  await getStorage().put(key, Buffer.from(await file.arrayBuffer()), { contentType: type });
  return NextResponse.json({ key, size: file.size, type });
}
