import assert from "node:assert/strict";
import test from "node:test";

import { CRON_TIME_BUDGET_MS, createVideoFixHandler } from "./videoFixHandler.js";
import { deploymentOrigin, kickExploreVideoFix } from "./videoFixKick.js";

function response() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Minimal query builder over an in-memory explore_posts table.
function fakeAdmin(posts, queries = []) {
  return {
    from() {
      const query = { filters: [] };
      queries.push(query);
      const builder = {
        select() { return builder; },
        eq(column, value) { query.filters.push(["eq", column, value]); return builder; },
        gte(column, value) { query.filters.push(["gte", column, value]); return builder; },
        not(column, op, value) { query.filters.push(["not", column, op, value]); return builder; },
        neq(column, value) { query.filters.push(["neq", column, value]); return builder; },
        order() { return builder; },
        limit(count) { query.limit = count; return Promise.resolve({ data: posts.slice(0, count), error: null }); },
        maybeSingle() {
          const id = query.filters.find(([, column]) => column === "id")?.[2];
          return Promise.resolve({ data: posts.find((post) => post.id === id) || null, error: null });
        },
      };
      return builder;
    },
  };
}

const POSTS = [
  { id: "p1", user_id: "alice", video_url: "https://x/v1.mp4" },
  { id: "p2", user_id: "bob", video_url: "https://x/v2.mp4" },
  { id: "p3", user_id: "alice", video_url: "" },
];

function handlerWith({ posts = POSTS, ensure = async () => ({ status: "fixed" }), now, queries } = {}) {
  return createVideoFixHandler({
    createAdmin: () => fakeAdmin(posts, queries),
    authenticate: async (token) => (token === "alice-token" ? { id: "alice" } : null),
    ensure,
    cronSecret: () => "cron-secret",
    ...(now ? { now } : {}),
  });
}

test("the author can ask for their own video post to be checked", async () => {
  const checked = [];
  const res = response();
  await handlerWith({ ensure: async (post) => { checked.push(post.id); return { status: "fixed" }; } })(
    { method: "POST", headers: {}, body: { accessToken: "alice-token", postId: "p1" } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, status: "fixed" });
  assert.deepEqual(checked, ["p1"]);
});

test("nobody can trigger work on someone else's post, or without signing in", async () => {
  const handler = handlerWith({ ensure: async () => assert.fail("must not run") });
  const other = response();
  await handler({ method: "POST", headers: {}, body: { accessToken: "alice-token", postId: "p2" } }, other);
  assert.equal(other.statusCode, 403);
  const anonymous = response();
  await handler({ method: "POST", headers: {}, body: { postId: "p1" } }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  const unknown = response();
  await handler({ method: "POST", headers: {}, body: { accessToken: "alice-token", postId: "nope" } }, unknown);
  assert.equal(unknown.statusCode, 404);
});

test("a post without a video is a no-op; a failed fix is reported, not thrown", async () => {
  const noVideo = response();
  await handlerWith()({ method: "POST", headers: {}, body: { accessToken: "alice-token", postId: "p3" } }, noVideo);
  assert.deepEqual(noVideo.body, { ok: true, status: "skipped" });
  const failed = response();
  await handlerWith({ ensure: async () => { throw new Error("boom"); } })(
    { method: "POST", headers: {}, body: { accessToken: "alice-token", postId: "p1" } },
    failed,
  );
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.code, "fix_failed");
});

test("the daily check needs the cron secret and looks at recent, not-yet-fixed videos", async () => {
  const denied = response();
  await handlerWith()({ method: "GET", headers: { authorization: "Bearer wrong" } }, denied);
  assert.equal(denied.statusCode, 401);

  const queries = [];
  const statuses = ["faststart", "fixed", "missing"];
  let index = 0;
  const res = response();
  await handlerWith({ queries, ensure: async () => ({ status: statuses[index++] }) })(
    { method: "GET", headers: { authorization: "Bearer cron-secret" } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checked, 3);
  assert.equal(res.body.faststart, 1);
  assert.equal(res.body.fixed, 1);
  assert.equal(res.body.missing, 1);
  const filters = queries[0].filters;
  assert.ok(filters.some(([kind, column]) => kind === "gte" && column === "created_at"));
  assert.ok(filters.some(([kind, column, op, value]) => kind === "not" && column === "video_url" && op === "like" && value === "%-faststart.mp4"));
});

test("the daily check stops starting new work before the function time limit", async () => {
  let clock = 0;
  const res = response();
  await handlerWith({
    now: () => clock,
    ensure: async () => { clock += CRON_TIME_BUDGET_MS; return { status: "fixed" }; },
  })({ method: "GET", headers: { authorization: "Bearer cron-secret" } }, res);
  assert.equal(res.body.checked, 2);
  assert.equal(res.body.deferred, 1);
});

test("the cron kick calls the deployment with the secret and never waits long or throws", async () => {
  assert.equal(deploymentOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "kunthai.app" }), "https://kunthai.app");
  assert.equal(deploymentOrigin({}), "");
  assert.deepEqual(await kickExploreVideoFix({ cronSecret: "s", env: {} }), { started: false, reason: "not_configured" });

  const seen = [];
  const answered = await kickExploreVideoFix({
    cronSecret: "s",
    env: { VERCEL_URL: "preview.vercel.app" },
    fetchImpl: async (url, options) => { seen.push([url, options.headers.Authorization]); return new Response(JSON.stringify({ ok: true, fixed: 2 }), { status: 200 }); },
  });
  assert.deepEqual(seen, [["https://preview.vercel.app/api/explore-video-fix", "Bearer s"]]);
  assert.equal(answered.fixed, 2);

  const slow = await kickExploreVideoFix({ cronSecret: "s", env: { VERCEL_URL: "x" }, waitMs: 20, fetchImpl: () => new Promise(() => {}) });
  assert.deepEqual(slow, { started: true, status: "running" });
  const broken = await kickExploreVideoFix({ cronSecret: "s", env: { VERCEL_URL: "x" }, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(broken.started, false);
});
