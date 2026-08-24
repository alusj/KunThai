// Post outbox service (Phase 0, foreground drain).
//
// Ties the pure state machine (postOutboxCore) to IndexedDB persistence
// (postOutboxStore) and the browser's connectivity events. When enabled, a
// post that can't be published right now is persisted and retried
// automatically on reconnect / focus / next app open — so it is never lost to a
// bad network, a screen change, or the app closing.
//
// The publish routine is injected (setOutboxPublisher) so this module stays free
// of heavy imports and so Phase 1's Service Worker drain can reuse the same core
// with its own publisher.

import { isPostOutboxEnabled } from "./postOutboxConfig";
import {
  OUTBOX_STATUS,
  createOutboxRecord,
  isReady,
  isTerminal,
  markAttemptFailed,
  markDone,
  markSending,
  publishInputFor,
} from "./postOutboxCore";
import {
  deleteOutboxRecord,
  getAllOutboxRecords,
  isOutboxStorageAvailable,
  putOutboxRecord,
} from "./postOutboxStore";

export const POST_OUTBOX_EVENT = "kunthai-post-outbox";
export const OUTBOX_SYNC_TAG = "kunthai-post-outbox";

let publisher = null;
let draining = false;
let scheduled = null;
let wired = false;

// publisher: (postInput, scope) => Promise<serverPost>
export function setOutboxPublisher(fn) {
  if (typeof fn === "function") publisher = fn;
}

export function isPostOutboxReady() {
  return isPostOutboxEnabled() && isOutboxStorageAvailable();
}

function emit(type, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POST_OUTBOX_EVENT, { detail: { type, ...detail } }));
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Best-effort Service Worker Background Sync registration (Phase 1). When the
// browser supports it (Chromium), the SW is woken on reconnect and asks any
// client to drain. Unsupported browsers (iOS Safari, Firefox) simply skip this
// and rely on the foreground drains — the post is never lost either way.
function registerBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.sync?.register(OUTBOX_SYNC_TAG))
    .catch(() => {
      // Background Sync unavailable or blocked — foreground drains still cover it.
    });
}

// Persist a post for durable, retried delivery. Returns the created record (its
// id doubles as the post's client_post_id).
export async function enqueuePost(postInput, scope, { id } = {}) {
  const record = createOutboxRecord(postInput, scope, { id });
  await putOutboxRecord(record);
  emit("queued", { record });
  registerBackgroundSync();
  scheduleDrain(0);
  return record;
}

// Read the current queue for the pending-posts UI.
export function listOutboxRecords() {
  if (!isPostOutboxReady()) return Promise.resolve([]);
  return getAllOutboxRecords();
}

// User-initiated retry of a failed post: reset it to pending and drain now.
export async function retryOutboxRecord(id) {
  const records = await getAllOutboxRecords();
  const record = records.find((item) => item.id === id);
  if (!record) return;
  await putOutboxRecord({
    ...record,
    status: OUTBOX_STATUS.PENDING,
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: "",
    updatedAt: Date.now(),
  });
  emit("queued", { record });
  registerBackgroundSync();
  scheduleDrain(0);
}

// User-initiated discard: drop the queued post entirely.
export async function discardOutboxRecord(id) {
  await deleteOutboxRecord(id);
  emit("discarded", { id });
}

async function scheduleForPending() {
  const records = await getAllOutboxRecords();
  const now = Date.now();
  let soonest = Infinity;
  for (const record of records) {
    if (isTerminal(record)) continue;
    soonest = Math.min(soonest, Math.max(now, record.nextAttemptAt || now));
  }
  if (soonest !== Infinity) {
    scheduleDrain(Math.max(1000, soonest - now + 250));
  }
}

export async function drainOutbox() {
  if (!isPostOutboxReady() || draining || typeof publisher !== "function" || isOffline()) return;
  draining = true;
  try {
    const records = await getAllOutboxRecords();
    const now = Date.now();
    for (const record of records) {
      if (isTerminal(record)) {
        // A completed record is cleared once seen; failed records are kept so
        // the user can retry them by hand.
        if (record.status === OUTBOX_STATUS.DONE) await deleteOutboxRecord(record.id);
        continue;
      }
      if (!isReady(record, now)) continue;

      const sending = markSending(record, Date.now());
      await putOutboxRecord(sending);
      try {
        const serverPost = await publisher(publishInputFor(sending), sending.scope);
        const done = markDone(sending, serverPost, Date.now());
        await putOutboxRecord(done);
        emit("published", { record: done, serverPost });
        await deleteOutboxRecord(done.id);
      } catch (error) {
        const next = markAttemptFailed(sending, error, Date.now());
        await putOutboxRecord(next);
        emit(next.status === OUTBOX_STATUS.FAILED ? "failed" : "retry", { record: next });
      }
    }
  } finally {
    draining = false;
  }
  await scheduleForPending();
}

export function scheduleDrain(delay = 0) {
  if (!isPostOutboxReady() || scheduled) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    drainOutbox();
  }, Math.max(0, delay));
}

// Wire the automatic drains once. Safe to call from multiple mounts.
export function startOutboxAutoDrain() {
  if (wired || typeof window === "undefined" || !isPostOutboxReady()) return;
  wired = true;
  window.addEventListener("online", () => scheduleDrain(300));
  window.addEventListener("focus", () => scheduleDrain(300));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleDrain(300);
  });
  // The Service Worker's Background Sync handler asks the app to drain when the
  // browser wakes it on reconnect (Phase 1). Publishing always runs through the
  // real, correct app code path — the SW only nudges.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "kunthai-drain-outbox") scheduleDrain(0);
    });
  }
  // Drain anything left over from a previous session on startup.
  scheduleDrain(1200);
}
