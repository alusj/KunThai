import assert from "node:assert/strict";
import test from "node:test";

import { createRequestSharer, limitMessageKey, requestShareKey } from "./aiRequestSharing.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a double tap sends one request", async () => {
  const share = createRequestSharer();
  const gate = deferred();
  let calls = 0;
  const start = () => {
    calls += 1;
    return gate.promise;
  };
  const body = { task: "text.improve", input: { text: "hello" } };
  const first = share(body, start);
  const second = share({ task: "text.improve", input: { text: "hello" } }, start);
  gate.resolve({ ok: true, result: "Hello." });
  assert.deepEqual(await first, { ok: true, result: "Hello." });
  assert.deepEqual(await second, { ok: true, result: "Hello." });
  assert.equal(calls, 1);
});

test("Stop then the same request again reuses the call already being billed", async () => {
  const share = createRequestSharer();
  const gate = deferred();
  let calls = 0;
  const start = () => {
    calls += 1;
    return gate.promise;
  };
  const body = { task: "assistant.chat", input: { message: "hi" } };
  const controller = new AbortController();
  const stopped = share(body, start, controller.signal);
  controller.abort();
  await assert.rejects(stopped, (error) => error.name === "AbortError");
  const retried = share(body, start, new AbortController().signal);
  gate.resolve("answer");
  assert.equal(await retried, "answer");
  assert.equal(calls, 1);
});

test("different requests and finished requests are not shared", async () => {
  const share = createRequestSharer();
  let calls = 0;
  const start = async () => {
    calls += 1;
    return calls;
  };
  await share({ a: 1 }, start);
  await share({ a: 2 }, start);
  await share({ a: 1 }, start);
  assert.equal(calls, 3);
  assert.equal(requestShareKey({ a: 1 }), '{"a":1}');
});

test("a failure reaches every waiting caller and frees the slot", async () => {
  const share = createRequestSharer();
  let calls = 0;
  const start = async () => {
    calls += 1;
    throw new Error("busy");
  };
  const results = await Promise.allSettled([share({ x: 1 }, start), share({ x: 1 }, start)]);
  assert.deepEqual(results.map((item) => item.status), ["rejected", "rejected"]);
  await assert.rejects(share({ x: 1 }, start));
  assert.equal(calls, 2);
});

test("limit errors have translated messages", () => {
  assert.equal(limitMessageKey("rate_limited"), "kaiRegistrationFix.limit.rateLimited");
  assert.equal(limitMessageKey("budget_exceeded"), "kaiRegistrationFix.limit.budgetExceeded");
  assert.equal(limitMessageKey("ai_resting"), "kaiRegistrationFix.limit.resting");
  assert.equal(limitMessageKey("timeout"), "");
});
