import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Opening KAI (or any sheet) must leave the dashboard exactly where it is.
// Setting overflow:hidden on <html>/<body> collapsed the mobile scroll offset
// to 0, so the page jumped to the top while the overlay was open.

class FakeElement {
  constructor({ overflowY = "visible", scrollTop = 0, scrollHeight = 0, clientHeight = 0, parent = null, tag = "div" } = {}) {
    Object.assign(this, { overflowY, scrollTop, scrollHeight, clientHeight, parentElement: parent, tag });
    this.overflowX = "visible";
    this.scrollLeft = 0;
    this.scrollWidth = 0;
    this.clientWidth = 0;
  }
  closest() { return null; }
}

function setup() {
  const listeners = new Map();
  const html = new FakeElement({ tag: "html" });
  const body = new FakeElement({ tag: "body", parent: html });
  const styleWrites = [];
  const trap = (tag) => new Proxy({}, { set(_target, key) { styleWrites.push(`${tag}.${String(key)}`); return true; } });
  html.style = trap("html");
  body.style = trap("body");
  globalThis.Element = FakeElement;
  globalThis.window = {
    scrollY: 900,
    getComputedStyle: (element) => ({ overflowY: element.overflowY, overflowX: element.overflowX }),
  };
  globalThis.document = {
    body,
    documentElement: html,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
  };
  const event = (type, props) => {
    let prevented = false;
    listeners.get(type)?.({ cancelable: true, preventDefault: () => { prevented = true; }, ...props });
    return prevented;
  };
  return { listeners, body, styleWrites, event };
}

const { acquireBodyScrollLock } = await import("./useBodyScrollLock.js");

test("the lock never touches page styles, so the scroll offset cannot move", () => {
  const { styleWrites } = setup();
  const release = acquireBodyScrollLock();
  assert.deepEqual(styleWrites, []);
  assert.equal(window.scrollY, 900);
  release();
  assert.deepEqual(styleWrites, []);
  const source = readFileSync(new URL("./useBodyScrollLock.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.style\.(overflow|position|top)\s*=/);
});

test("page scrolling is blocked while locked and free again after release", () => {
  const { listeners, body, event } = setup();
  const release = acquireBodyScrollLock();
  assert.equal(event("wheel", { target: body, deltaX: 0, deltaY: 120 }), true);
  assert.equal(event("keydown", { target: body, key: "PageDown" }), true);
  event("touchstart", { touches: [{ clientX: 100, clientY: 400 }] });
  assert.equal(event("touchmove", { target: body, touches: [{ clientX: 100, clientY: 300 }] }), true);
  release();
  assert.equal(listeners.size, 0, "every listener is removed on release");
});

test("lists inside the overlay still scroll, without chaining to the page at their ends", () => {
  const { body, event } = setup();
  const release = acquireBodyScrollLock();
  const list = new FakeElement({ overflowY: "auto", scrollTop: 100, scrollHeight: 600, clientHeight: 200, parent: body });
  const row = new FakeElement({ parent: list });
  assert.equal(event("wheel", { target: row, deltaX: 0, deltaY: 50 }), false, "mid-list: the list scrolls");
  list.scrollTop = 400; // at the bottom
  assert.equal(event("wheel", { target: row, deltaX: 0, deltaY: 50 }), true, "bottom: nothing chains to the page");
  assert.equal(event("wheel", { target: row, deltaX: 0, deltaY: -50 }), false, "and it can scroll back up");
  release();
});

test("nested overlays keep the lock until the last one closes", () => {
  const { listeners, body, event } = setup();
  const releaseOuter = acquireBodyScrollLock();
  const releaseInner = acquireBodyScrollLock();
  releaseInner();
  assert.equal(event("wheel", { target: body, deltaX: 0, deltaY: 120 }), true);
  releaseInner(); // releasing twice must not unlock the outer overlay
  assert.equal(event("wheel", { target: body, deltaX: 0, deltaY: 120 }), true);
  releaseOuter();
  assert.equal(listeners.size, 0);
});

test("KAI's chat panel and assistant sheet both use this lock", () => {
  for (const file of ["../ai/chat/AiChatPanel.jsx", "../ai/AiAssistantSheet.jsx"]) {
    assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /useBodyScrollLock\(open\)/, file);
  }
});
