import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ATTEMPTS,
  OUTBOX_STATUS,
  backoffDelay,
  createOutboxRecord,
  isReady,
  isTerminal,
  markAttemptFailed,
  markDone,
  markSending,
  newClientPostId,
  publishInputFor,
} from "./postOutboxCore.js";

test("newClientPostId returns a v4 uuid", () => {
  const id = newClientPostId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(newClientPostId(), newClientPostId());
});

test("a new record starts pending and immediately ready", () => {
  const now = 1000;
  const record = createOutboxRecord({ body: "hi" }, "feed", { now });
  assert.equal(record.status, OUTBOX_STATUS.PENDING);
  assert.equal(record.attempts, 0);
  assert.equal(record.scope, "feed");
  assert.ok(isReady(record, now));
  assert.equal(isTerminal(record), false);
});

test("the record id is reused as the client_post_id for every attempt", () => {
  const record = createOutboxRecord({ body: "hi" }, "feed", { id: "fixed-id" });
  assert.equal(record.id, "fixed-id");
  assert.equal(publishInputFor(record).client_post_id, "fixed-id");
  const sending = markSending(record);
  assert.equal(publishInputFor(sending).client_post_id, "fixed-id");
});

test("sending increments attempts and stops the item being ready", () => {
  const now = 1000;
  const record = markSending(createOutboxRecord({}, "feed", { now }), now);
  assert.equal(record.status, OUTBOX_STATUS.SENDING);
  assert.equal(record.attempts, 1);
  assert.equal(isReady(record, now), false);
});

test("a stale sending item is reclaimed after the grace period", () => {
  const record = markSending(createOutboxRecord({}, "feed", { now: 0 }), 0);
  assert.equal(isReady(record, 30_000, 60_000), false);
  assert.equal(isReady(record, 61_000, 60_000), true);
});

test("done is terminal and carries the server post", () => {
  const record = markDone(markSending(createOutboxRecord({})), { id: "server-1" });
  assert.equal(record.status, OUTBOX_STATUS.DONE);
  assert.equal(record.serverPost.id, "server-1");
  assert.ok(isTerminal(record));
});

test("a failed attempt under the cap returns to pending with backoff", () => {
  const now = 10_000;
  const sending = markSending(createOutboxRecord({}, "feed", { now: 0 }), now);
  const retried = markAttemptFailed(sending, new Error("Failed to fetch"), now);
  assert.equal(retried.status, OUTBOX_STATUS.PENDING);
  assert.ok(retried.nextAttemptAt > now, "backoff pushes the next attempt into the future");
  assert.equal(isReady(retried, now), false, "not ready during the backoff window");
  assert.ok(isReady(retried, retried.nextAttemptAt), "ready once the window elapses");
  assert.match(retried.lastError, /failed to fetch/i);
});

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffDelay(1), 4000);
  assert.equal(backoffDelay(2), 8000);
  assert.equal(backoffDelay(3), 16000);
  assert.ok(backoffDelay(50) <= 5 * 60 * 1000);
});

test("hitting the attempt cap moves the record to failed (terminal)", () => {
  let record = createOutboxRecord({}, "feed", { now: 0 });
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    record = markSending(record);
    record = markAttemptFailed(record, new Error("network error"), 0);
  }
  assert.equal(record.attempts, MAX_ATTEMPTS);
  assert.equal(record.status, OUTBOX_STATUS.FAILED);
  assert.ok(isTerminal(record));
  assert.equal(isReady(record, Number.MAX_SAFE_INTEGER), false, "failed items are never re-attempted automatically");
});
