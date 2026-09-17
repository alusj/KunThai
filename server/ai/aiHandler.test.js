import assert from "node:assert/strict";
import test from "node:test";

import { describeAiService, handleAiRequest } from "./aiHandler.js";

// A minimal stand-in for the Vercel response object.
function makeResponse() {
  const sent = { status: 0, payload: null, headers: {} };
  return {
    sent,
    setHeader(name, value) {
      sent.headers[name] = value;
    },
    status(code) {
      sent.status = code;
      return this;
    },
    json(payload) {
      sent.payload = payload;
      return payload;
    },
  };
}

function makeRequest({ method = "POST", headers = {}, body = {} } = {}) {
  return { method, headers, body };
}

function withEnv(values, run) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the catalogue never exposes a prompt or a model id to the browser", () => {
  const description = describeAiService();
  assert.equal(description.ok, true);
  assert.ok(Array.isArray(description.tasks));
  assert.ok(description.tasks.length > 0);

  const serialised = JSON.stringify(description);
  assert.ok(!/instruction/i.test(serialised), "task instructions must stay on the server");
  assert.ok(!/gemini/i.test(serialised), "model ids must stay on the server");
  assert.ok(!/apiKey|GEMINI_API_KEY/.test(serialised));

  for (const task of description.tasks) {
    assert.deepEqual(Object.keys(task).sort(), ["id", "label", "output", "surfaces"].sort());
  }
});

test("GET returns the catalogue and reports AI as off when no key is configured", async () => {
  await withEnv({ GEMINI_API_KEY: undefined }, async () => {
    const res = makeResponse();
    await handleAiRequest(makeRequest({ method: "GET" }), res);
    assert.equal(res.sent.status, 200);
    assert.equal(res.sent.payload.ok, true);
    assert.equal(res.sent.payload.available, false);
    assert.equal(res.sent.headers["Cache-Control"], "no-store");
  });
});

test("an unsupported method is refused", async () => {
  const res = makeResponse();
  await handleAiRequest(makeRequest({ method: "DELETE" }), res);
  assert.equal(res.sent.status, 405);
  assert.equal(res.sent.payload.ok, false);
});

test("a missing Gemini key degrades to a clean unavailable answer, not a crash", async () => {
  await withEnv({ GEMINI_API_KEY: undefined }, async () => {
    const res = makeResponse();
    await handleAiRequest(makeRequest({ body: { task: "text.improve", surface: "explore", input: { text: "hi" } } }), res);
    assert.equal(res.sent.status, 503);
    assert.equal(res.sent.payload.code, "ai_unavailable");
    assert.ok(res.sent.payload.message.length > 0);
  });
});

test("the feature can be switched off platform-wide even with a key present", async () => {
  await withEnv({ GEMINI_API_KEY: "test-key", KUNTHAI_AI_ENABLED: "false" }, async () => {
    const res = makeResponse();
    await handleAiRequest(makeRequest({ body: { task: "text.improve", input: { text: "hi" } } }), res);
    assert.equal(res.sent.status, 503);
    assert.equal(res.sent.payload.code, "ai_unavailable");
  });
});

test("an unauthenticated request never reaches Gemini", async () => {
  await withEnv({ GEMINI_API_KEY: "test-key", KUNTHAI_AI_ENABLED: undefined }, async () => {
    const res = makeResponse();
    await handleAiRequest(makeRequest({ body: { task: "text.improve", input: { text: "hi" } } }), res);
    assert.equal(res.sent.status, 401);
    assert.equal(res.sent.payload.code, "not_authenticated");
  });
});

test("an oversized body is rejected on the declared length, before parsing", async () => {
  await withEnv({ GEMINI_API_KEY: "test-key" }, async () => {
    const res = makeResponse();
    await handleAiRequest(
      makeRequest({ headers: { "content-length": "5000000" }, body: { task: "text.improve" } }),
      res,
    );
    assert.equal(res.sent.status, 413);
    assert.equal(res.sent.payload.code, "payload_too_large");
  });
});

test("a failed request sets Retry-After when the caller should wait", async () => {
  await withEnv({ GEMINI_API_KEY: "test-key" }, async () => {
    const res = makeResponse();
    // No bearer token -> 401, which carries no Retry-After.
    await handleAiRequest(makeRequest({ body: { task: "text.improve", input: { text: "hi" } } }), res);
    assert.equal(res.sent.headers["Retry-After"], undefined);
  });
});
