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
// --dry-run  lists the slow clips and rewraps them locally (needs ffmpeg) but
//            uploads and changes nothing.
// Otherwise each rewrapped file is uploaded NEXT TO the original as
// `<name>-faststart.mp4` and explore_posts.video_url is pointed at it. The
// original files are kept, and every change is written to
// remux-explore-videos-rollback.tsv (post id, old url, new url) so it can be
// undone. Re-runnable: a clip that is already faststart is skipped.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readMp4Layout } from "../src/Backend/services/media/mp4Layout.js";

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");
const limit = Number(argValue("--limit")) || Infinity;
const only = argValue("--only");
const BUCKET = "explore-media";
const ROLLBACK_FILE = "remux-explore-videos-rollback.tsv";

if (!base || !key) {
  console.error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("Needs ffmpeg (brew install ffmpeg).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, apikey: key };
const publicPrefix = `${base}/storage/v1/object/public/${BUCKET}/`;

// Reads only the top-level box headers, with small range requests.
function remoteBlob(url, size) {
  return {
    size,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const response = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
          if (response.status !== 206 && !response.ok) throw new Error(`range ${response.status}`);
          return response.arrayBuffer();
        },
      };
    },
  };
}

async function remoteSize(url) {
  const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
  if (response.status !== 206) return 0;
  return Number((response.headers.get("content-range") || "").split("/")[1]) || 0;
}

async function loadPosts() {
  const query = new URLSearchParams({ select: "id,video_url", video_url: "like.*", order: "created_at.asc" });
  if (only) query.set("id", `eq.${only}`);
  const response = await fetch(`${base}/rest/v1/explore_posts?${query}`, { headers });
  if (!response.ok) throw new Error(`posts ${response.status} ${await response.text()}`);
  return (await response.json()).filter((post) => String(post.video_url || "").startsWith(publicPrefix));
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

    const source = join(work, "source");
    const target = join(work, "faststart.mp4");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download ${response.status}`);
    writeFileSync(source, Buffer.from(await response.arrayBuffer()));
    rmSync(target, { force: true });
    execFileSync("ffmpeg", ["-v", "error", "-i", source, "-map", "0", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", target], { stdio: "inherit" });

    const output = readFileSync(target);
    const check = await readMp4Layout(new Blob([output]));
    if (check.layout !== "faststart") throw new Error(`rewrap still ${check.layout}`);
    const newPath = path.replace(/\.[a-z0-9]+$/i, "") + "-faststart.mp4";
    const newUrl = `${publicPrefix}${newPath}`;
    console.log(`${dryRun ? "would fix" : "fixing"} ${post.id} ${layout} ${(size / 1048576).toFixed(1)} MB -> ${(statSync(target).size / 1048576).toFixed(1)} MB ${newPath}`);

    if (!dryRun) {
      const upload = await fetch(`${base}/storage/v1/object/${BUCKET}/${newPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "video/mp4", "Cache-Control": "max-age=31536000", "x-upsert": "true" },
        body: output,
      });
      if (!upload.ok) throw new Error(`upload ${upload.status} ${await upload.text()}`);
      const patch = await fetch(`${base}/rest/v1/explore_posts?id=eq.${post.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ video_url: newUrl }),
      });
      if (!patch.ok) throw new Error(`update ${patch.status} ${await patch.text()}`);
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
