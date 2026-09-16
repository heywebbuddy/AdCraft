import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Minimal ffmpeg helpers shared by the offline fallbacks of the video, voice and
 * presenter adapters. Every helper returns bytes so callers can store them wherever
 * they like; temp files live in a per-call directory that is always removed.
 *
 * Binary resolution: `FFMPEG_PATH` env → `ffmpeg-static` → `ffmpeg` on PATH.
 */

const nodeRequire = createRequire(import.meta.url);

let resolved: string | null = null;
export function ffmpegPath(): string {
  if (resolved) return resolved;
  if (process.env.FFMPEG_PATH) return (resolved = process.env.FFMPEG_PATH);
  try {
    const p = nodeRequire("ffmpeg-static") as string | null;
    if (p) return (resolved = p);
  } catch {
    /* ffmpeg-static not installed for this platform */
  }
  return (resolved = "ffmpeg");
}

export async function runFfmpeg(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args], { cwd: opts.cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 10 * 60_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg failed to start (${ffmpegPath()}): ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.split("\n").filter(Boolean).slice(-6).join(" | ")}`));
    });
  });
}

/** Run `fn` inside a fresh temp directory that is removed afterwards. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = path.join(os.tmpdir(), `adcraft-ffmpeg-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Duration of a media file in seconds, parsed from `ffmpeg -i` (ffprobe is not shipped with ffmpeg-static). */
export async function probeDurationSec(file: string): Promise<number | null> {
  let stderr = "";
  try {
    stderr = await runFfmpeg(["-i", file, "-f", "null", "-"], { timeoutMs: 60_000 });
  } catch (err) {
    stderr = err instanceof Error ? err.message : String(err);
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function probeBufferDurationSec(bytes: Buffer, ext = "mp4"): Promise<number | null> {
  return withTempDir(async (dir) => {
    const f = path.join(dir, `in.${ext}`);
    await fs.writeFile(f, bytes);
    return probeDurationSec(f);
  });
}

export type Size = { width: number; height: number };

/** Even dimensions are required by yuv420p. */
export function evenSize(s: Size): Size {
  return { width: Math.max(2, Math.round(s.width / 2) * 2), height: Math.max(2, Math.round(s.height / 2) * 2) };
}

/**
 * Ken Burns clip from a single still: slow zoom towards the centre.
 * H.264 + yuv420p + faststart so it plays everywhere, silent audio track so
 * concatenation with clips that carry audio is straightforward.
 */
export async function kenBurnsMp4(
  image: Buffer,
  opts: { width: number; height: number; durationSec: number; fps?: number; zoomTo?: number },
): Promise<Buffer> {
  const fps = opts.fps ?? 30;
  const { width, height } = evenSize(opts);
  const frames = Math.max(1, Math.round(opts.durationSec * fps));
  const zoomTo = opts.zoomTo ?? 1.18;
  const step = (zoomTo - 1) / frames;
  // Upscale first so zoompan has pixels to work with (avoids the visible jitter of zooming a small frame).
  const vf = [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='min(1+${step.toFixed(6)}*on,${zoomTo})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
    "format=yuv420p",
  ].join(",");
  return withTempDir(async (dir) => {
    const inFile = path.join(dir, "in.png");
    const outFile = path.join(dir, "out.mp4");
    await fs.writeFile(inFile, image);
    await runFfmpeg([
      "-loop", "1", "-framerate", String(fps), "-i", inFile,
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-vf", vf,
      "-t", opts.durationSec.toFixed(3),
      "-r", String(fps),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", "-shortest",
      "-movflags", "+faststart",
      outFile,
    ]);
    return fs.readFile(outFile);
  });
}

/** Silent MP3 of the given length (offline voice fallback). */
export async function silenceMp3(durationSec: number): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const outFile = path.join(dir, "silence.mp3");
    await runFfmpeg([
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
      "-t", Math.max(0.1, durationSec).toFixed(3),
      "-c:a", "libmp3lame", "-q:a", "9",
      outFile,
    ]);
    return fs.readFile(outFile);
  });
}

export type SlideFrame = { png: Buffer; durationSec: number };

/**
 * Slideshow from PNG frames (one per caption segment), optionally muxed with an audio
 * track. Used by the offline presenter card so UGC assembly can be exercised without HeyGen.
 */
export async function slideshowMp4(
  frames: SlideFrame[],
  opts: { width: number; height: number; fps?: number; audio?: { bytes: Buffer; ext: string } },
): Promise<Buffer> {
  if (frames.length === 0) throw new Error("slideshowMp4 needs at least one frame");
  const fps = opts.fps ?? 30;
  const { width, height } = evenSize(opts);
  return withTempDir(async (dir) => {
    const list: string[] = [];
    for (const [i, f] of frames.entries()) {
      const name = `f${String(i).padStart(3, "0")}.png`;
      await fs.writeFile(path.join(dir, name), f.png);
      list.push(`file '${name}'`, `duration ${Math.max(0.05, f.durationSec).toFixed(3)}`);
    }
    // concat demuxer ignores the last duration unless the final file is repeated.
    list.push(`file 'f${String(frames.length - 1).padStart(3, "0")}.png'`);
    await fs.writeFile(path.join(dir, "list.txt"), list.join("\n") + "\n");
    const total = frames.reduce((s, f) => s + Math.max(0.05, f.durationSec), 0);
    const outFile = path.join(dir, "out.mp4");
    const args = ["-f", "concat", "-safe", "0", "-i", "list.txt"];
    if (opts.audio) {
      await fs.writeFile(path.join(dir, `audio.${opts.audio.ext}`), opts.audio.bytes);
      args.push("-i", `audio.${opts.audio.ext}`);
    } else {
      args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    }
    args.push(
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      "-r", String(fps),
      "-t", total.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      outFile,
    );
    await runFfmpeg(args, { cwd: dir });
    return fs.readFile(outFile);
  });
}
