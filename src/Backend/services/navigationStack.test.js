import assert from "node:assert/strict";
import test from "node:test";

import {
  createNavigationStack,
  currentNavigationEntry,
  popNavigationEntry,
  pushNavigationEntry,
  replaceNavigationEntry,
} from "./navigationStack.js";

test("navigation stack pops exactly one screen and preserves entry state", () => {
  let stack = createNavigationStack({ screen: "dashboard", state: { tab: "store" } });
  stack = pushNavigationEntry(stack, { screen: "menu", state: { scrollTop: 180 } });
  stack = pushNavigationEntry(stack, { screen: "orders", state: { filter: "pending" } });
  stack = pushNavigationEntry(stack, { screen: "order-detail", params: { orderId: "order-7" } });

  stack = popNavigationEntry(stack);
  assert.equal(currentNavigationEntry(stack).screen, "orders");
  assert.equal(currentNavigationEntry(stack).state.filter, "pending");

  stack = popNavigationEntry(stack);
  assert.equal(currentNavigationEntry(stack).screen, "menu");
  assert.equal(currentNavigationEntry(stack).state.scrollTop, 180);
});

test("navigation stack cannot pop past its domain root", () => {
  const root = createNavigationStack("dashboard");
  assert.strictEqual(popNavigationEntry(root), root);
  assert.equal(currentNavigationEntry(popNavigationEntry(root)).screen, "dashboard");
});

test("replace updates only the active entry", () => {
  const stack = pushNavigationEntry(createNavigationStack("dashboard"), "orders");
  const replaced = replaceNavigationEntry(stack, { screen: "order-detail", params: { orderId: "42" } });
  assert.deepEqual(replaced.map((entry) => entry.screen), ["dashboard", "order-detail"]);
  assert.equal(currentNavigationEntry(replaced).params.orderId, "42");
});
