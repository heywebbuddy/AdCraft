import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Object storage for uploads and renders.
 *
 * - R2 (S3-compatible) when R2_* env vars are set.
 * - Local disk under `.data/files` otherwise; served by the app at `/api/files/<key>`.
 *
 * Keys are org-scoped: `org/<orgId>/<kind>/<uuid>.<ext>`.
 */
export type PutOptions = { contentType: string; cacheControl?: string };
export type StoredObject = { key: string; url: string; bytes: number; contentType: string };

export interface Storage {
  put(key: string, body: Uint8Array | Buffer, opts: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL for a stored key (R2 public bucket or the app's file route). */
  url(key: string): string;
}

export function objectKey(orgId: string, kind: "products" | "cutouts" | "renders" | "logos" | "uploads" | "sites", ext: string) {
  return `org/${orgId}/${kind}/${randomUUID()}.${ext.replace(/^\./, "")}`;
}

export function extFromMime(mime: string) {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a" } as Record<string, string>)[mime] ?? "bin";
}

export function mimeFromExt(key: string) {
  const ext = key.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

class LocalStorage implements Storage {
  constructor(private root: string, private publicBase: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("Invalid key");
    return full;
  }
  async put(key: string, body: Uint8Array | Buffer, opts: PutOptions) {
    const full = this.p(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return { key, url: this.url(key), bytes: body.byteLength, contentType: opts.contentType };
  }
  async get(key: string) {
    try {
      const body = await fs.readFile(this.p(key));
      return { body, contentType: mimeFromExt(key) };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(this.p(key), { force: true });
  }
  url(key: string) {
    return `${this.publicBase}/${key}`;
  }
}

class R2Storage implements Storage {
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  constructor(
    private cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase?: string },
    private fallbackBase: string,
  ) {}
  private async s3() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${this.cfg.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey },
      });
    }
    return this.client;
  }
  async put(key: string, body: Uint8Array | Buffer, opts: PutOptions) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: opts.contentType, CacheControl: opts.cacheControl ?? "public, max-age=31536000, immutable" }),
    );
    return { key, url: this.url(key), bytes: body.byteLength, contentType: opts.contentType };
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const res = await (await this.s3()).send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: res.ContentType ?? mimeFromExt(key) };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
  url(key: string) {
    return this.cfg.publicBase ? `${this.cfg.publicBase}/${key}` : `${this.fallbackBase}/${key}`;
  }
}

const g = globalThis as unknown as { __adcraftStorage?: Storage };

export function getStorage(): Storage {
  if (g.__adcraftStorage) return g.__adcraftStorage;
  const fileRoute = "/api/files";
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE } = process.env;
  const s: Storage =
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
      ? new R2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET, publicBase: R2_PUBLIC_BASE }, fileRoute)
      : new LocalStorage(process.env.LOCAL_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "../../.data/files"), fileRoute);
  g.__adcraftStorage = s;
  return s;
}
