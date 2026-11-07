// Server safety net: every Swip video ends up a faststart MP4.
//
// The app rewrites slow layouts on the phone before upload
// (src/Backend/services/media/nativeVideoCompression.js), but older app
// versions and browser uploads cannot. A fragmented MP4 (MediaRecorder output)
// or one with its index at the end takes seconds, or forever, to start on
// Android. Here the server checks the posted file (a few 16-byte range reads)
// and, when it is slow, rewraps it with ffmpeg: no re-encode, same picture,
// sound and timing, index first. The new file goes next to the original as
// `<name>-faststart.mp4` and the post is pointed at it. The original is kept
// (reposts may still link to it).
//
// Called right after a video post is created (api/explore-video-fix.js, POST)
// and by a daily cron for anything that call missed.

import { execFile } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { readMp4Layout } from "../../src/Backend/services/media/mp4Layout.js";

export const EXPLORE_MEDIA_BUCKET = "explore-media";
export const FASTSTART_SUFFIX = "-faststart.mp4";

const run = promisify(execFile);

/** Storage path of a public explore-media URL, or "" when it is not one. */
export function storagePathFromPublicUrl(url, supabaseUrl, bucket = EXPLORE_MEDIA_BUCKET) {
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const prefix = `${base}/storage/v1/object/public/${bucket}/`;
  const value = String(url || "");
  if (!base || !value.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(value.slice(prefix.length).split(/[?#]/)[0]);
  } catch {
    return "";
  }
}

/** Where the faststart copy of `path` is stored. */
export function faststartPath(path) {
  const value = String(path || "");
  if (value.endsWith(FASTSTART_SUFFIX)) return value;
  return value.replace(/\.[a-z0-9]+$/i, "") + FASTSTART_SUFFIX;
}

async function fetchRange(fetchImpl, url, start, end) {
  const response = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206 && !response.ok) {
    throw Object.assign(new Error(`range ${response.status}`), { status: response.status });
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Size in bytes of a public file; 0 when it does not exist. */
export async function remoteSize(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { Range: "bytes=0-0" } });
  if (response.status === 400 || response.status === 404) return 0;
  if (response.status !== 206) throw new Error(`size ${response.status}`);
  return Number(String(response.headers.get("content-range") || "").split("/")[1]) || 0;
}

/** Layout of a public file, read from its top-level box headers only. */
export async function remoteLayout(fetchImpl, url, size) {
  const blob = {
    size,
    slice: (start, end) => ({
      arrayBuffer: async () => {
        const bytes = await fetchRange(fetchImpl, url, start, end - 1);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    }),
  };
  return (await readMp4Layout(blob)).layout;
}

let ffmpegBinary = "";

/**
 * The bundled ffmpeg (@ffmpeg-installer), made runnable. npm 11 can skip the
 * package's own `chmod` step, and a deployed function's files are read-only,
 * so an unrunnable binary is copied to /tmp first.
 */
export function resolveFfmpeg() {
  if (ffmpegBinary) return ffmpegBinary;
  if (process.env.FFMPEG_PATH) return (ffmpegBinary = process.env.FFMPEG_PATH);
  const require = createRequire(import.meta.url);
  const bundled = require("@ffmpeg-installer/ffmpeg").path;
  let path = bundled;
  try {
    if ((statSync(bundled).mode & 0o111) === 0) {
      path = join(tmpdir(), "kt-ffmpeg");
      if (!existsSync(path)) copyFileSync(bundled, path);
      chmodSync(path, 0o755);
    }
  } catch {
    path = bundled;
  }
  return (ffmpegBinary = path);
}

/** Rewraps `source` into a faststart MP4 at `target`, without re-encoding. */
export async function ffmpegRewrap(source, target) {
  // First picture and sound track only: iPhone .mov files also carry metadata
  // tracks that an MP4 cannot hold.
  await run(resolveFfmpeg(), [
    "-v", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c", "copy", "-movflags", "+faststart", "-f", "mp4", target,
  ], { maxBuffer: 1024 * 1024 });
}

/**
 * Makes sure `post.video_url` is a faststart MP4, rewrapping it when needed.
 *
 * @param {object} options
 * @param {{ id: string, video_url: string }} options.post
 * @param {string} options.supabaseUrl
 * @param {object} options.admin  Supabase client with the service role.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(source: string, target: string) => Promise<void>} [options.rewrap]
 * @returns {Promise<{ status: "faststart" | "fixed" | "missing" | "skipped", layout?: string, videoUrl?: string }>}
 */
export async function ensurePostVideoFaststart({ post, supabaseUrl, admin, fetchImpl = fetch, rewrap = ffmpegRewrap }) {
  const videoUrl = String(post?.video_url || "");
  const path = storagePathFromPublicUrl(videoUrl, supabaseUrl);
  if (!post?.id || !path) return { status: "skipped" };

  const size = await remoteSize(fetchImpl, videoUrl);
  if (!size) return { status: "missing" };
  const layout = await remoteLayout(fetchImpl, videoUrl, size);
  if (layout === "faststart") return { status: "faststart", layout };

  const work = mkdtempSync(join(tmpdir(), "kt-faststart-"));
  try {
    const source = join(work, "source");
    const target = join(work, "faststart.mp4");
    const download = await fetchImpl(videoUrl);
    if (!download.ok) throw new Error(`download ${download.status}`);
    writeFileSync(source, new Uint8Array(await download.arrayBuffer()));
    await rewrap(source, target);

    const output = readFileSync(target);
    const checked = (await readMp4Layout(new Blob([output]))).layout;
    if (checked !== "faststart") throw new Error(`rewrap still ${checked}`);

    const newPath = faststartPath(path);
    const { error: uploadError } = await admin.storage.from(EXPLORE_MEDIA_BUCKET).upload(newPath, output, {
      contentType: "video/mp4",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw new Error(`upload: ${uploadError.message || uploadError}`);
    const { data: publicData } = admin.storage.from(EXPLORE_MEDIA_BUCKET).getPublicUrl(newPath);
    const newUrl = publicData?.publicUrl || "";
    if (!newUrl) throw new Error("no public URL for the rewrapped file");

    // Only if the post still shows the file that was checked (it may have
    // been edited or removed meanwhile).
    const { error: updateError } = await admin
      .from("explore_posts")
      .update({ video_url: newUrl })
      .eq("id", post.id)
      .eq("video_url", videoUrl);
    if (updateError) throw new Error(`update: ${updateError.message || updateError}`);
    return { status: "fixed", layout, videoUrl: newUrl };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
