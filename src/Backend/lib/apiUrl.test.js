import assert from "node:assert/strict";
import test from "node:test";

import { apiUrl, isNativeApp } from "./apiUrl.js";

test("web (and Node) keep the relative /api path", () => {
  assert.equal(isNativeApp(), false);
  assert.equal(apiUrl("/api/ai"), "/api/ai");
});

test("inside the Capacitor app /api goes to the deployed origin", () => {
  const previous = globalThis.window;
  globalThis.window = { Capacitor: { isNativePlatform: () => true } };
  try {
    assert.equal(isNativeApp(), true);
    assert.equal(apiUrl("/api/ai"), "https://kunthai.app/api/ai");
    assert.equal(apiUrl("/api/monime-create-payment"), "https://kunthai.app/api/monime-create-payment");
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
