import assert from "node:assert/strict";
import test from "node:test";

import aiHandler from "../api/ai.js";
import paymentsRouter from "../api/payments/[action].js";
import { handleCors } from "./cors.js";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

test("native app origins get CORS headers; preflight is answered with 204", () => {
  for (const origin of ["https://localhost", "capacitor://localhost"]) {
    const res = mockRes();
    assert.equal(handleCors({ method: "OPTIONS", headers: { origin } }, res), true);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.headers["access-control-allow-origin"], origin);
    assert.match(res.headers["access-control-allow-headers"], /Authorization/);
    assert.equal(res.headers["access-control-allow-credentials"], undefined);
  }
});

test("other origins get no CORS headers, and normal requests continue", () => {
  const res = mockRes();
  assert.equal(handleCors({ method: "POST", headers: { origin: "https://evil.example" } }, res), false);
  assert.equal(res.headers["access-control-allow-origin"], undefined);

  const sameOrigin = mockRes();
  assert.equal(handleCors({ method: "GET", headers: {} }, sameOrigin), false);
  assert.deepEqual(sameOrigin.headers, {});
});

test("API functions answer the native preflight instead of 405", async () => {
  for (const [handler, url] of [[aiHandler, "/api/ai"], [paymentsRouter, "/api/monime-create-payment"]]) {
    const res = mockRes();
    await handler({ method: "OPTIONS", url, query: {}, headers: { origin: "capacitor://localhost" } }, res);
    assert.equal(res.statusCode, 204, url);
    assert.equal(res.headers["access-control-allow-origin"], "capacitor://localhost", url);
  }
});
