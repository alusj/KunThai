import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readMp4Layout } from "../../src/Backend/services/media/mp4Layout.js";
import {
  ensurePostVideoFaststart,
  faststartPath,
  ffmpegRewrap,
  resolveFfmpeg,
  storagePathFromPublicUrl,
} from "./videoFaststart.js";

const SUPABASE = "https://example.supabase.co";
const PUBLIC = `${SUPABASE}/storage/v1/object/public/explore-media/`;

function box(type, payload) {
  const bytes = new Uint8Array(8 + payload);
  new DataView(bytes.buffer).setUint32(0, 8 + payload);
  for (let i = 0; i < 4; i += 1) bytes[4 + i] = type.charCodeAt(i);
  return bytes;
}
const concat = (...parts) => Buffer.concat(parts.map((part) => Buffer.from(part)));
const FRAGMENTED = concat(box("ftyp", 20), box("moov", 200), box("moof", 60), box("mdat", 4000));
const FASTSTART = concat(box("ftyp", 20), box("moov", 260), box("mdat", 4000));

// A public bucket served from memory, with HTTP range support.
function fakeFetch(files, log = []) {
  return async (url, { headers = {} } = {}) => {
    log.push(url);
    const data = files.get(url);
    if (!data) return new Response("", { status: 400 });
    const match = /bytes=(\d+)-(\d+)/.exec(headers.Range || "");
    if (!match) return new Response(data, { status: 200 });
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), data.length - 1);
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: { "content-range": `bytes ${start}-${end}/${data.length}` },
    });
  };
}

function fakeAdmin(files) {
  const calls = { uploads: [], updates: [] };
  const admin = {
    storage: {
      from: (bucket) => ({
        async upload(path, body, options) {
          calls.uploads.push({ bucket, path, options });
          files.set(`${PUBLIC}${path}`, Buffer.from(body));
          return { error: null };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `${PUBLIC}${path}` } }),
      }),
    },
    from(table) {
      const update = { table, filters: [] };
      return {
        update(values) {
          update.values = values;
          const chain = {
            eq(column, value) {
              update.filters.push([column, value]);
              if (update.filters.length === 2) {
                calls.updates.push(update);
                return Promise.resolve({ error: null });
              }
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };
  return { admin, calls };
}

test("public explore-media URLs map to their storage path; others are ignored", () => {
  assert.equal(storagePathFromPublicUrl(`${PUBLIC}u1/video-1.mp4`, SUPABASE), "u1/video-1.mp4");
  assert.equal(storagePathFromPublicUrl(`${PUBLIC}u1/my%20clip.mov?t=1`, `${SUPABASE}/`), "u1/my clip.mov");
  assert.equal(storagePathFromPublicUrl("https://elsewhere.example/video.mp4", SUPABASE), "");
  assert.equal(storagePathFromPublicUrl(`${SUPABASE}/storage/v1/object/public/other-bucket/a.mp4`, SUPABASE), "");
  assert.equal(storagePathFromPublicUrl("", SUPABASE), "");
});

test("the faststart copy sits next to the original as an .mp4", () => {
  assert.equal(faststartPath("u1/video-1.mov"), "u1/video-1-faststart.mp4");
  assert.equal(faststartPath("u1/video-1.mp4"), "u1/video-1-faststart.mp4");
  assert.equal(faststartPath("u1/video-1-faststart.mp4"), "u1/video-1-faststart.mp4");
});

test("a faststart video is left alone after a few header reads", async () => {
  const url = `${PUBLIC}u1/good.mp4`;
  const files = new Map([[url, FASTSTART]]);
  const { admin, calls } = fakeAdmin(files);
  let rewrapped = false;
  const result = await ensurePostVideoFaststart({
    post: { id: "p1", video_url: url },
    supabaseUrl: SUPABASE,
    admin,
    fetchImpl: fakeFetch(files),
    rewrap: async () => { rewrapped = true; },
  });
  assert.deepEqual(result, { status: "faststart", layout: "faststart" });
  assert.equal(rewrapped, false);
  assert.equal(calls.uploads.length + calls.updates.length, 0);
});

test("a fragmented video is rewrapped, uploaded next to the original, and the post repointed", async () => {
  const url = `${PUBLIC}u1/video-9.mov`;
  const files = new Map([[url, FRAGMENTED]]);
  const { admin, calls } = fakeAdmin(files);
  const result = await ensurePostVideoFaststart({
    post: { id: "p9", video_url: url },
    supabaseUrl: SUPABASE,
    admin,
    fetchImpl: fakeFetch(files),
    rewrap: async (source, target) => {
      assert.deepEqual(readFileSync(source), FRAGMENTED);
      writeFileSync(target, FASTSTART);
    },
  });
  assert.equal(result.status, "fixed");
  assert.equal(result.layout, "fragmented");
  assert.equal(result.videoUrl, `${PUBLIC}u1/video-9-faststart.mp4`);
  assert.equal(calls.uploads[0].path, "u1/video-9-faststart.mp4");
  assert.equal(calls.uploads[0].options.contentType, "video/mp4");
  // Only repointed while the post still shows the file that was checked.
  assert.deepEqual(calls.updates[0].values, { video_url: `${PUBLIC}u1/video-9-faststart.mp4` });
  assert.deepEqual(calls.updates[0].filters, [["id", "p9"], ["video_url", url]]);
  // The original stays (reposts may link to it).
  assert.ok(files.has(url));
});

test("a rewrap that is still not faststart never touches storage or the post", async () => {
  const url = `${PUBLIC}u1/odd.mp4`;
  const files = new Map([[url, FRAGMENTED]]);
  const { admin, calls } = fakeAdmin(files);
  await assert.rejects(
    ensurePostVideoFaststart({
      post: { id: "p2", video_url: url },
      supabaseUrl: SUPABASE,
      admin,
      fetchImpl: fakeFetch(files),
      rewrap: async (_source, target) => writeFileSync(target, FRAGMENTED),
    }),
    /rewrap still fragmented/,
  );
  assert.equal(calls.uploads.length + calls.updates.length, 0);
});

test("missing files and videos hosted elsewhere are reported, not fixed", async () => {
  const files = new Map();
  const { admin } = fakeAdmin(files);
  const fetchImpl = fakeFetch(files);
  const missing = await ensurePostVideoFaststart({ post: { id: "p3", video_url: `${PUBLIC}u1/gone.mp4` }, supabaseUrl: SUPABASE, admin, fetchImpl });
  assert.equal(missing.status, "missing");
  const elsewhere = await ensurePostVideoFaststart({ post: { id: "p4", video_url: "https://cdn.example/v.mp4" }, supabaseUrl: SUPABASE, admin, fetchImpl });
  assert.equal(elsewhere.status, "skipped");
});

test("ffmpeg turns a real fragmented MP4 into a faststart one without re-encoding", async (t) => {
  let ffmpeg = "";
  try {
    ffmpeg = resolveFfmpeg();
    execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
  } catch {
    t.skip("no runnable ffmpeg on this machine");
    return;
  }
  const work = mkdtempSync(join(tmpdir(), "kt-faststart-test-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const source = join(work, "fragmented.mp4");
  const target = join(work, "faststart.mp4");
  // One second of test picture and tone, written the way MediaRecorder does.
  execFileSync(ffmpeg, [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=160x120:rate=15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-c:v", "mpeg4", "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", source,
  ]);
  assert.equal((await readMp4Layout(new Blob([readFileSync(source)]))).layout, "fragmented");
  await ffmpegRewrap(source, target);
  assert.equal((await readMp4Layout(new Blob([readFileSync(target)]))).layout, "faststart");
});
