import assert from "node:assert/strict";
import test from "node:test";

import { notificationDisplayText } from "./notificationText.js";

const PAYMENT = "Your App Store payment of USD 23.99 was successful and 300 Visibility Credits have been credited to your balance.";

test("a body that repeats the title is dropped", () => {
  assert.deepEqual(notificationDisplayText(PAYMENT, PAYMENT), { title: PAYMENT, body: "" });
  assert.deepEqual(notificationDisplayText(PAYMENT, `"${PAYMENT}"`), { title: PAYMENT, body: "" });
});

test("a cut-off copy of the title is dropped", () => {
  assert.deepEqual(notificationDisplayText(PAYMENT, "Your App Store payment of USD 23.99 was successful and 300 Visibility Credits have..."), { title: PAYMENT, body: "" });
});

test("a body that is the title plus more is shown once", () => {
  assert.deepEqual(notificationDisplayText("Order shipped", "Order shipped. It arrives Friday."), { title: "Order shipped. It arrives Friday.", body: "" });
});

test("different title and body are both kept", () => {
  assert.deepEqual(
    notificationDisplayText("Alus Jay 1 added something new", "You recently viewed Computer."),
    { title: "Alus Jay 1 added something new", body: "You recently viewed Computer." },
  );
});

test("missing pieces fall back to whatever text there is", () => {
  assert.deepEqual(notificationDisplayText("", "Only body"), { title: "Only body", body: "" });
  assert.deepEqual(notificationDisplayText("Only title", ""), { title: "Only title", body: "" });
});
