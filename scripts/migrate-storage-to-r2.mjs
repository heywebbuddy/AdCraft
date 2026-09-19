// One-off: copy every file under a local-storage directory into the R2 bucket, keeping keys.
// Used when a deployment switches from disk storage to R2 (the R2_* variables) after files exist.
//
//   node scripts/migrate-storage-to-r2.mjs [dir]        dir defaults to $LOCAL_STORAGE_DIR or .data/files
//   DRY_RUN=1 node scripts/migrate-storage-to-r2.mjs    list only
//
// Skips objects that already exist in the bucket with the same size. Safe to re-run.
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("packages/storage/package.json"));
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set.");
  process.exit(1);
}
const root = path.resolve(process.argv[2] ?? process.env.LOCAL_STORAGE_DIR ?? ".data/files");
const dry = process.env.DRY_RUN === "1";
const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", txt: "text/plain" };

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && !e.name.startsWith(".")) yield p;
  }
}

let copied = 0, skipped = 0, bytes = 0, failed = 0;
for await (const file of walk(root)) {
  const key = path.relative(root, file).split(path.sep).join("/");
  if (!key.startsWith("org/")) { skipped++; continue; }
  const size = (await stat(file)).size;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch((e) => (e?.$metadata?.httpStatusCode === 404 ? null : Promise.reject(e)));
    if (head && head.ContentLength === size) { skipped++; continue; }
    if (dry) { console.log("would copy", key, size); copied++; continue; }
    const ext = key.split(".").pop().toLowerCase();
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: await readFile(file), ContentType: MIME[ext] ?? "application/octet-stream", CacheControl: "public, max-age=31536000, immutable" }));
    copied++; bytes += size;
    if (copied % 25 === 0) console.log(`… ${copied} copied`);
  } catch (err) {
    failed++; console.error("failed", key, err?.message ?? err);
  }
}
console.log(`${dry ? "would copy" : "copied"} ${copied} file(s) (${(bytes / 1048576).toFixed(1)} MB), skipped ${skipped} already present, ${failed} failed — from ${root} to r2://${R2_BUCKET}`);
process.exit(failed ? 1 : 0);
