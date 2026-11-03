#!/usr/bin/env node
// One-time (2026-11-03): makes the small copy (src/Backend/lib/smallImageCopyModel.js)
// of every photo already in the public media buckets, for photos uploaded
// before the app made one itself. macOS only (uses `sips`). Re-runnable: a
// photo that already has its copy is skipped.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/backfill-small-image-copies.mjs [--dry-run]
//
// The photos to copy come from a file (storage.objects is not reachable
// through the REST API), one "bucket<TAB>path" per line:
//   --list <file>   e.g. from `supabase db query` on storage.objects.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { smallCopyPath, smallCopySize } from "../src/Backend/lib/smallImageCopyModel.js";

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const listFile = process.argv[process.argv.indexOf("--list") + 1];
if (!base || !key || !listFile || process.argv.indexOf("--list") < 0) {
  console.error("Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --list <file>.");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "kt-small-"));
const headers = { Authorization: `Bearer ${key}`, apikey: key };
const items = readFileSync(listFile, "utf8").split("\n").map((line) => line.split("\t")).filter(([bucket, path]) => bucket && path);
const tally = { made: 0, existing: 0, rotated: 0, failed: 0 };

function sipsValue(file, property) {
  const out = execFileSync("sips", ["-g", property, file], { encoding: "utf8" });
  return out.split(`${property}:`)[1]?.trim() || "";
}

for (const [bucket, path] of items) {
  const copyPath = smallCopyPath(path);
  const publicUrl = `${base}/storage/v1/object/public/${bucket}/${path}`;
  try {
    const head = await fetch(`${base}/storage/v1/object/public/${bucket}/${copyPath}`, { method: "HEAD" });
    if (head.ok) {
      tally.existing += 1;
      continue;
    }
    const response = await fetch(publicUrl);
    if (!response.ok) throw new Error(`download ${response.status}`);
    const source = join(work, "source");
    const target = join(work, "small.jpg");
    writeFileSync(source, Buffer.from(await response.arrayBuffer()));

    // A rotation flag might not survive the resize: such photos keep showing
    // their original (the app falls back when the copy is missing).
    const orientation = sipsValue(source, "orientation");
    if (orientation && orientation !== "1" && orientation !== "<nil>") {
      tally.rotated += 1;
      continue;
    }
    const size = smallCopySize(Number(sipsValue(source, "pixelWidth")), Number(sipsValue(source, "pixelHeight")));
    if (!size) throw new Error("no size");
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "55", "--resampleHeightWidth", String(size.height), String(size.width), source, "--out", target], { stdio: "ignore" });

    if (!dryRun) {
      const upload = await fetch(`${base}/storage/v1/object/${bucket}/${copyPath}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000", "x-upsert": "true" },
        body: readFileSync(target),
      });
      if (!upload.ok) throw new Error(`upload ${upload.status} ${await upload.text()}`);
    }
    tally.made += 1;
  } catch (error) {
    tally.failed += 1;
    console.error(`${bucket}/${path}: ${error.message}`);
  }
}

rmSync(work, { recursive: true, force: true });
console.log(`${dryRun ? "[dry run] " : ""}made ${tally.made}, already there ${tally.existing}, kept original (rotation flag) ${tally.rotated}, failed ${tally.failed}`);
