import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_SURFACES,
  aiSurfaceLabel,
  clearAiRole,
  getAiSurface,
  setAiRole,
  setAiSurface,
  surfaceForMainPage,
} from "./aiSurfaceService.js";

test("App.jsx page names map onto the AI surfaces the server accepts", () => {
  // App.jsx calls its surfaces explore/marketplace/transport; the AI layer
  // speaks the product names. A mismatch here would silently send every
  // UrMall request to the server as "global".
  assert.equal(surfaceForMainPage("explore"), "explore");
  assert.equal(surfaceForMainPage("marketplace"), "urmall");
  assert.equal(surfaceForMainPage("transport"), "urride");
  assert.equal(surfaceForMainPage("admin"), "admin");
  assert.equal(surfaceForMainPage("something-else"), "global");
  assert.equal(surfaceForMainPage(undefined), "global");

  for (const page of ["explore", "marketplace", "transport", "admin"]) {
    assert.ok(AI_SURFACES.includes(surfaceForMainPage(page)));
  }
});

test("an unknown surface never overwrites the recorded one", () => {
  setAiSurface({ surface: "urmall", screen: "seller products" });
  assert.deepEqual(getAiSurface(), { surface: "urmall", screen: "seller products", role: "" });

  setAiSurface({ surface: "not-a-surface" });
  assert.equal(getAiSurface().surface, "urmall");
});

test("subscribers are notified only when the surface actually changes", () => {
  setAiSurface({ surface: "explore", screen: "" });

  let notifications = 0;
  // useSyncExternalStore's subscribe is not exported; the store is exercised
  // through the public setter, so assert on the value instead of the callback
  // count by proving repeated identical writes are no-ops.
  const before = getAiSurface();
  setAiSurface({ surface: "explore", screen: "" });
  const after = getAiSurface();
  notifications += before === after ? 0 : 1;

  // Identical writes keep the very same object, so React skips a re-render.
  assert.equal(notifications, 0);
  assert.equal(before, after);

  setAiSurface({ surface: "explore", screen: "post composer" });
  assert.notEqual(getAiSurface(), after);
  assert.equal(getAiSurface().screen, "post composer");
});

test("screen hints are length capped before they can reach a prompt", () => {
  setAiSurface({ surface: "explore", screen: "x".repeat(400) });
  assert.equal(getAiSurface().screen.length, 80);
});

test("every surface has a human label for the assistant header", () => {
  for (const surface of AI_SURFACES) {
    assert.ok(aiSurfaceLabel(surface).length > 0);
  }
  assert.equal(aiSurfaceLabel("urmall"), "UrMall");
  assert.equal(aiSurfaceLabel("nonsense"), "KunThai");
});

test("roles are remembered per section and never leak into another section", () => {
  setAiSurface({ surface: "urmall", screen: "" });
  setAiRole("urmall", "seller", "seller workspace");
  assert.deepEqual(getAiSurface(), { surface: "urmall", screen: "seller workspace", role: "seller" });

  // Moving to Explore: no seller role there.
  setAiSurface({ surface: "explore", screen: "" });
  assert.equal(getAiSurface().role, "");

  // Back to UrMall with the workspace still open: the seller context returns.
  setAiSurface({ surface: "urmall", screen: "" });
  assert.deepEqual(getAiSurface(), { surface: "urmall", screen: "seller workspace", role: "seller" });

  // A stale clear from a different role does not remove the current one.
  clearAiRole("urmall", "buyer");
  assert.equal(getAiSurface().role, "seller");
  clearAiRole("urmall", "seller");
  assert.deepEqual(getAiSurface(), { surface: "urmall", screen: "", role: "" });
});
