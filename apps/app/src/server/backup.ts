import "server-only";
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { mkdir, writeFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Database backup: `pg_dump` piped through gzip, stored in the media bucket under `db/`
 * (or BACKUP_DIR when R2 is not configured), oldest copies pruned. Run nightly by the
 * `backup/nightly` Inngest function; send that event by hand for an on-demand copy.
 *
 * The container installs the client that matches the server's major version — a newer server
 * than client makes pg_dump refuse, which is exactly the failure you want to hear about.
 */
export type BackupResult = { name: string; bytes: number; destination: string; pruned: number; ms: number };

export async function backupDatabase(): Promise<BackupResult> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const started = Date.now();
  const name = `adcraft-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}Z.sql.gz`;
  const body = await dump(url);
  if (body.byteLength < 1024) throw new Error(`backup looks empty (${body.byteLength} bytes)`);

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  const bucket = process.env.R2_BACKUP_BUCKET || process.env.R2_BUCKET;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;

  if (bucket && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `db/${name}`, Body: body, ContentType: "application/gzip" }));
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "db/" }));
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const stale = (listed.Contents ?? []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff && o.Key).map((o) => ({ Key: o.Key! }));
    if (stale.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale } }));
    return { name, bytes: body.byteLength, destination: `r2://${bucket}/db/${name}`, pruned: stale.length, ms: Date.now() - started };
  }

  const dir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "../../.data/backups");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), body);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  let pruned = 0;
  for (const f of await readdir(dir)) {
    if (!/^adcraft-.*\.sql\.gz$/.test(f)) continue;
    if ((await stat(path.join(dir, f))).mtimeMs < cutoff) {
      await unlink(path.join(dir, f));
      pruned++;
    }
  }
  return { name, bytes: body.byteLength, destination: path.join(dir, name), pruned, ms: Date.now() - started };
}

function dump(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_dump", ["--no-owner", "--no-privileges", url], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const gzip = createGzip({ level: 9 });
    proc.stdout.pipe(gzip);
    proc.stderr.on("data", (c) => (stderr += String(c).slice(0, 2000)));
    gzip.on("data", (c: Buffer) => chunks.push(c));
    gzip.on("error", reject);
    proc.on("error", (err) => reject(new Error(`pg_dump could not start: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`pg_dump exited ${code}: ${stderr.trim().slice(0, 300)}`));
      gzip.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}
