import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import cronRouter from "../api/cron/[job].js";
import paymentsRouter from "../api/payments/[action].js";
import { resolveRouteAction } from "./routeAction.js";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(router, { method = "POST", url, query = {}, headers = {}, body } = {}) {
  const res = mockRes();
  await router({ method, url, query, headers, body }, res);
  return res;
}

test("route action comes from the dynamic segment, else the last path segment", () => {
  assert.equal(resolveRouteAction({ query: { action: "monime-webhook" } }, "action"), "monime-webhook");
  assert.equal(resolveRouteAction({ query: { action: ["monime-webhook"] } }, "action"), "monime-webhook");
  assert.equal(resolveRouteAction({ url: "/api/monime-webhook?x=1" }, "action"), "monime-webhook");
  assert.equal(resolveRouteAction({ url: "/api/payments/monime-webhook" }, "action"), "monime-webhook");
  assert.equal(resolveRouteAction({ url: "/api/payments/%E0%A4%A" }, "action"), "");
});

test("every legacy Monime URL reaches its original handler", async () => {
  const actions = ["monime-create-payment", "monime-verify-payment", "monime-resume-pending", "monime-webhook"];
  for (const action of actions) {
    for (const url of [`/api/${action}`, `/api/payments/${action}`]) {
      // GET is rejected by each original handler before any env/DB access, so a
      // 405 with Allow: POST proves the router dispatched to the right file.
      const res = await call(paymentsRouter, { method: "GET", url });
      assert.equal(res.statusCode, 405, url);
      assert.equal(res.body?.ok, false, url);
    }
  }
});

test("unknown or prototype payment actions are 404, never dispatched", async () => {
  for (const url of ["/api/payments/flutterwave-webhook", "/api/payments/constructor", "/api/payments/__proto__", "/api/payments"]) {
    const res = await call(paymentsRouter, { url });
    assert.equal(res.statusCode, 404, url);
  }
});

test("Monime webhook still accepts POST through the router (no raw-body config needed)", async () => {
  const previous = { ...process.env };
  delete process.env.MONIME_ACCESS_TOKEN;
  delete process.env.MONIME_TOKEN;
  try {
    const res = await call(paymentsRouter, {
      url: "/api/monime-webhook",
      headers: { "content-type": "application/json" },
      body: { event: { name: "payment.completed" }, data: { id: "pay_test" } },
    });
    // Reaches the handler's own config check (not the router's 404/405).
    assert.notEqual(res.statusCode, 404);
    assert.notEqual(res.statusCode, 405);
  } finally {
    process.env = previous;
  }
});

test("both cron jobs are routed and keep their CRON_SECRET check", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    for (const job of ["admin-publish-scheduled", "process-business-subscriptions"]) {
      for (const url of [`/api/${job}`, `/api/cron/${job}`]) {
        const denied = await call(cronRouter, { method: "GET", url });
        assert.equal(denied.statusCode, 401, url);
        const wrongMethod = await call(cronRouter, { method: "PUT", url });
        assert.equal(wrongMethod.statusCode, 405, url);
      }
    }
    const unknown = await call(cronRouter, { method: "GET", url: "/api/cron/nope", headers: { authorization: "Bearer test-cron-secret" } });
    assert.equal(unknown.statusCode, 404);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("vercel.json rewrites the legacy URLs before the SPA fallback and schedules the cron router", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrites = config.rewrites.map((rule) => `${rule.source} -> ${rule.destination}`);
  for (const action of ["monime-create-payment", "monime-verify-payment", "monime-resume-pending", "monime-webhook"]) {
    assert.ok(rewrites.includes(`/api/${action} -> /api/payments/${action}`), action);
  }
  for (const job of ["admin-publish-scheduled", "process-business-subscriptions"]) {
    assert.ok(rewrites.includes(`/api/${job} -> /api/cron/${job}`), job);
  }
  assert.equal(config.rewrites.at(-1).destination, "/index.html");
  assert.deepEqual(config.crons.map((cron) => [cron.path, cron.schedule]), [
    ["/api/cron/admin-publish-scheduled", "0 0 * * *"],
    ["/api/cron/process-business-subscriptions", "15 0 * * *"],
  ]);
});
