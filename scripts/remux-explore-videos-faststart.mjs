#!/usr/bin/env node
// One-time (2026-11-04): rewraps Swip videos that start slowly into faststart
// MP4 (index first, no fragments). Fragmented MP4 (old in-browser trims,
// MediaRecorder) and files with the index at the end took 2+ seconds, or
// forever, to start on Android. Nothing is re-encoded: ffmpeg only moves the
// boxes (`-c copy -movflags +faststart`), so picture, sound and timing (the
// trim window in media_meta) stay exactly the same.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/remux-explore-videos-faststart.mjs [--dry-run] [--limit N] [--only <post id>]
//
// --dry-run  lists the slow clips and, when ffmpeg is installed, rewraps them
//            locally to check the result; uploads and changes nothing. Reading
//            needs no service key: SUPABASE_ANON_KEY is enough for a dry run.
// Otherwise each rewrapped file is uploaded NEXT TO the original as
// `<name>-faststart.mp4` and explore_posts.video_url is pointed at it. The
// original files are kept, and every change is written to
// remux-explore-videos-rollback.tsv (post id, old url, new url) so it can be
// undone. Re-runnable: a clip that is already faststart is skipped.
//
// Built for a slow, flaky link: every request is retried, and files move in
// 6 MB pieces (ranged downloads, resumable TUS uploads) so a dropped
// connection only repeats one piece.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readMp4Layout } from "../src/Backend/services/media/mp4Layout.js";

const base = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || (dryRun ? process.env.SUPABASE_ANON_KEY : "") || "").trim();
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");
const limit = Number(argValue("--limit")) || Infinity;
const only = argValue("--only");
const BUCKET = "explore-media";
const ROLLBACK_FILE = "remux-explore-videos-rollback.tsv";

if (!base || !key) {
  console.error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with --dry-run).");
  process.exit(1);
}
const ffmpeg = process.env.FFMPEG || "ffmpeg";
let hasFfmpeg = true;
try {
  execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
} catch {
  hasFfmpeg = false;
}
if (!hasFfmpeg && !dryRun) {
  console.error("Needs ffmpeg (brew install ffmpeg, or FFMPEG=/path/to/ffmpeg).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, apikey: key };
const PIECE_BYTES = 6 * 1024 * 1024; // Supabase TUS uploads require 6 MB pieces.
const TRIES = 6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(label, task) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= TRIES || error?.final) throw error;
      const wait = Math.min(60, 3 * 2 ** (attempt - 1));
      console.log(`         ${label}: ${error.message}; retrying in ${wait}s (${attempt}/${TRIES - 1})`);
      await sleep(wait * 1000);
    }
  }
}

function finalError(message) {
  return Object.assign(new Error(message), { final: true });
}

async function fetchRange(url, start, end) {
  return retry("download", async () => {
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(120_000) });
    if (response.status === 400 || response.status === 404) throw finalError(`range ${response.status}`);
    if (response.status !== 206 && !response.ok) throw new Error(`range ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  });
}

async function download(url, size) {
  const pieces = [];
  for (let start = 0; start < size; start += PIECE_BYTES) {
    pieces.push(await fetchRange(url, start, Math.min(size, start + PIECE_BYTES) - 1));
  }
  const data = Buffer.concat(pieces);
  if (data.length !== size) throw new Error(`downloaded ${data.length} of ${size} bytes`);
  return data;
}

const b64 = (value) => Buffer.from(value).toString("base64");

// Resumable (TUS) upload, 6 MB at a time; after a dropped piece the server is
// asked where it got to and the upload continues from there.
async function uploadResumable(objectPath, data) {
  const endpoint = `${base}/storage/v1/upload/resumable`;
  const location = await retry("upload start", async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(data.length),
        "x-upsert": "true",
        "Upload-Metadata": [
          `bucketName ${b64(BUCKET)}`,
          `objectName ${b64(objectPath)}`,
          `contentType ${b64("video/mp4")}`,
          `cacheControl ${b64("31536000")}`,
        ].join(","),
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status !== 201) throw new Error(`upload start ${response.status} ${await response.text()}`);
    const where = response.headers.get("location") || "";
    return where.startsWith("http") ? where : new URL(where, endpoint).toString();
  });

  let offset = 0;
  while (offset < data.length) {
    offset = await retry("upload", async () => {
      // Where the server actually is (a piece may have landed before the drop).
      const head = await fetch(location, { method: "HEAD", headers: { ...headers, "Tus-Resumable": "1.0.0" }, signal: AbortSignal.timeout(60_000) });
      if (!head.ok) throw new Error(`upload check ${head.status}`);
      const at = Number(head.headers.get("upload-offset") || 0);
      if (at >= data.length) return at;
      const response = await fetch(location, {
        method: "PATCH",
        headers: { ...headers, "Tus-Resumable": "1.0.0", "Upload-Offset": String(at), "Content-Type": "application/offset+octet-stream" },
        body: data.subarray(at, Math.min(data.length, at + PIECE_BYTES)),
        signal: AbortSignal.timeout(300_000),
      });
      if (response.status !== 204) throw new Error(`upload piece ${response.status} ${await response.text()}`);
      return Number(response.headers.get("upload-offset") || at + PIECE_BYTES);
    });
  }
}
const publicPrefix = `${base}/storage/v1/object/public/${BUCKET}/`;

// Reads only the top-level box headers, with small range requests.
function remoteBlob(url, size) {
  return {
    size,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const bytes = await fetchRange(url, start, end - 1);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      };
    },
  };
}

async function remoteSize(url) {
  return retry("size", async () => {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(60_000) });
    if (response.status === 400 || response.status === 404) return 0;
    if (response.status !== 206) throw new Error(`size ${response.status}`);
    return Number((response.headers.get("content-range") || "").split("/")[1]) || 0;
  });
}

async function loadPosts() {
  const query = new URLSearchParams({ select: "id,video_url", video_url: "like.*", order: "created_at.asc" });
  if (only) query.set("id", `eq.${only}`);
  const posts = await retry("posts", async () => {
    const response = await fetch(`${base}/rest/v1/explore_posts?${query}`, { headers, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`posts ${response.status} ${await response.text()}`);
    return response.json();
  });
  return posts.filter((post) => String(post.video_url || "").startsWith(publicPrefix));
}

const work = mkdtempSync(join(tmpdir(), "kt-remux-"));
const tally = { faststart: 0, rewrapped: 0, missing: 0, failed: 0 };
let done = 0;

for (const post of await loadPosts()) {
  if (done >= limit) break;
  const url = post.video_url;
  const path = decodeURIComponent(url.slice(publicPrefix.length).split("?")[0]);
  try {
    const size = await remoteSize(url);
    if (!size) {
      tally.missing += 1;
      console.log(`missing  ${post.id} ${path}`);
      continue;
    }
    const { layout } = await readMp4Layout(remoteBlob(url, size));
    if (layout === "faststart") {
      tally.faststart += 1;
      continue;
    }
    done += 1;
    if (!hasFfmpeg) {
      console.log(`would fix ${post.id} ${layout} ${(size / 1048576).toFixed(1)} MB ${path} (no ffmpeg: not rewrapped)`);
      tally.rewrapped += 1;
      continue;
    }

    const source = join(work, "source");
    const target = join(work, "faststart.mp4");
    writeFileSync(source, await download(url, size));
    rmSync(target, { force: true });
    // First picture and sound track only: iPhone .mov files also carry a
    // metadata track that an MP4 cannot hold.
    execFileSync(ffmpeg, ["-v", "error", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", target], { stdio: "inherit" });

    const output = readFileSync(target);
    const check = await readMp4Layout(new Blob([output]));
    if (check.layout !== "faststart") throw new Error(`rewrap still ${check.layout}`);
    const newPath = path.replace(/\.[a-z0-9]+$/i, "") + "-faststart.mp4";
    const newUrl = `${publicPrefix}${newPath}`;
    console.log(`${dryRun ? "would fix" : "fixing"} ${post.id} ${layout} ${(size / 1048576).toFixed(1)} MB -> ${(statSync(target).size / 1048576).toFixed(1)} MB ${newPath}`);

    if (!dryRun) {
      await uploadResumable(newPath, output);
      // The uploaded file must be complete and faststart before any post points at it.
      const uploadedSize = await remoteSize(newUrl);
      if (uploadedSize !== output.length) throw new Error(`uploaded ${uploadedSize} of ${output.length} bytes`);
      const uploaded = await readMp4Layout(remoteBlob(newUrl, uploadedSize));
      if (uploaded.layout !== "faststart") throw new Error(`uploaded file reads as ${uploaded.layout}`);
      await retry("update post", async () => {
        const patch = await fetch(`${base}/rest/v1/explore_posts?id=eq.${post.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ video_url: newUrl }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!patch.ok) throw new Error(`update ${patch.status} ${await patch.text()}`);
      });
      appendFileSync(ROLLBACK_FILE, `${post.id}\t${url}\t${newUrl}\n`);
    }
    tally.rewrapped += 1;
  } catch (error) {
    tally.failed += 1;
    console.error(`failed   ${post.id} ${path}: ${error.message}`);
  }
}

rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify({ dryRun, ...tally }));
