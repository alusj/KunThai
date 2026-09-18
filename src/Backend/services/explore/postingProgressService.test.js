import assert from "node:assert/strict";
import test from "node:test";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { publishPostingNotice, readPostingNotice, wasInterruptedByReload } = await import("./postingProgressService.js");

const NOTICE_KEY = "explore-posting-notice";

test("posting/uploading from an earlier page load is interrupted; a server-side review is not", () => {
  assert.equal(wasInterruptedByReload({ status: "posting", pageSession: "page-earlier" }, "page-now"), true);
  assert.equal(wasInterruptedByReload({ status: "uploading", pageSession: "page-earlier" }, "page-now"), true);
  assert.equal(wasInterruptedByReload({ status: "reviewing", pageSession: "page-earlier" }, "page-now"), false);
  assert.equal(wasInterruptedByReload({ status: "error", pageSession: "page-earlier" }, "page-now"), false);
  assert.equal(wasInterruptedByReload({ status: "complete", pageSession: "page-earlier" }, "page-now"), false);
  assert.equal(wasInterruptedByReload({ status: "posting", pageSession: "page-now" }, "page-now"), false);
});

test("after a reload, an unfinished upload becomes a dismissible failure instead of a frozen percentage", () => {
  store.set(NOTICE_KEY, JSON.stringify({
    id: "notice-1",
    status: "posting",
    stage: "uploading-media",
    progress: 56,
    persistent: true,
    pageSession: "page-earlier",
  }));

  const notice = readPostingNotice();
  assert.equal(notice.status, "error");
  assert.equal(notice.interrupted, true);
  assert.equal(notice.progress, 0);
  assert.equal(notice.persistent, true);
  assert.equal(JSON.parse(store.get(NOTICE_KEY)).status, "error", "saved, so it stays until dismissed");
});

test("a post in progress in this page load is left alone", () => {
  globalThis.window = { dispatchEvent: () => true };
  try {
    publishPostingNotice({ status: "posting", stage: "uploading-media", progress: 40 });
    const notice = readPostingNotice();
    assert.equal(notice.status, "posting");
    assert.equal(notice.progress, 40);
    assert.equal(notice.interrupted, false);
  } finally {
    delete globalThis.window;
  }
});
