// Pure state machine for the Explore post outbox (Phase 0).
//
// This file is deliberately free of IndexedDB, network, and browser globals so
// it can be unit-tested in isolation. The store (IndexedDB) and the service
// (drain + event wiring) build on top of these pure transitions.
//
// Lifecycle: pending -> sending -> (done | back to pending with backoff | failed)
//   - a successful publish  -> done
//   - a failed attempt under the cap -> pending again, with an exponential
//     backoff so we don't hammer a bad network
//   - a failed attempt at the cap    -> failed (terminal; the draft is kept so
//     the user can still retry by hand)

export const OUTBOX_STATUS = Object.freeze({
  PENDING: "pending",
  SENDING: "sending",
  DONE: "done",
  FAILED: "failed",
});

export const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 4000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

// A v4 uuid, used as BOTH the outbox record id and the post's client_post_id —
// so the first attempt and every retry share one idempotency key and can never
// create a duplicate post.
export function newClientPostId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// Exponential backoff for the Nth attempt (attempts is the count already made).
export function backoffDelay(attempts) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

export function createOutboxRecord(postInput, scope = "feed", { id, now = Date.now() } = {}) {
  const recordId = id || newClientPostId();
  return {
    id: recordId,
    status: OUTBOX_STATUS.PENDING,
    scope: scope || "feed",
    postInput: postInput || {},
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
    lastError: "",
  };
}

export function isTerminal(record) {
  return record?.status === OUTBOX_STATUS.DONE || record?.status === OUTBOX_STATUS.FAILED;
}

// A record is ready to attempt when it is pending and its backoff window (if
// any) has elapsed. Items stuck in "sending" from a previous, interrupted run
// are also reclaimed here once older than a grace period.
export function isReady(record, now = Date.now(), staleSendingMs = 60_000) {
  if (!record) return false;
  if (record.status === OUTBOX_STATUS.PENDING) {
    return (record.nextAttemptAt || 0) <= now;
  }
  if (record.status === OUTBOX_STATUS.SENDING) {
    return now - (record.updatedAt || 0) >= staleSendingMs;
  }
  return false;
}

export function markSending(record, now = Date.now()) {
  return {
    ...record,
    status: OUTBOX_STATUS.SENDING,
    attempts: (record.attempts || 0) + 1,
    updatedAt: now,
  };
}

export function markDone(record, serverPost = null, now = Date.now()) {
  return {
    ...record,
    status: OUTBOX_STATUS.DONE,
    serverPost: serverPost || null,
    updatedAt: now,
    completedAt: now,
    lastError: "",
  };
}

// A failed attempt: retry with backoff while under the cap, otherwise fail.
export function markAttemptFailed(record, error, now = Date.now()) {
  const message = String(error?.message || error || "").slice(0, 300);
  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    return {
      ...record,
      status: OUTBOX_STATUS.FAILED,
      updatedAt: now,
      failedAt: now,
      lastError: message,
    };
  }
  return {
    ...record,
    status: OUTBOX_STATUS.PENDING,
    updatedAt: now,
    nextAttemptAt: now + backoffDelay(record.attempts || 0),
    lastError: message,
  };
}

// The input handed to the publish routine — the stored post plus the shared
// idempotency key, so the DB insert stays idempotent across retries.
export function publishInputFor(record) {
  return { ...record.postInput, client_post_id: record.id };
}
