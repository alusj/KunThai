import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAiFormValues,
  coerceFieldValue,
  getActiveAiScreen,
  prepareFormValues,
  registerAiScreen,
  sendAiScreenMessage,
  snapshotAiScreen,
} from "./aiScreenContext.js";

const FIELDS = [
  { key: "identity.businessName", label: "Business name", type: "text", required: true, value: "" },
  { key: "identity.categories", label: "Categories", type: "multiselect", maxItems: 2, options: ["Electronics", "Fashion & Clothing", "Furniture"], value: [] },
  { key: "operations.businessType", label: "Where it sells", type: "select", options: [{ value: "both", label: "Both" }, { value: "online", label: "Online" }], value: "both" },
  { key: "operations.deliveryEnabled", label: "Offers delivery", type: "boolean", value: "no" },
  { key: "operations.openTime", label: "Opens", type: "time", value: "09:00" },
  { key: "location.email", label: "Email", type: "email", value: "" },
  { key: "location.phone", label: "Phone", type: "phone", value: "" },
  { key: "identity.logo", label: "Logo", type: "image", value: "" },
  { key: "trustPayout.bankDetails", label: "Bank details", type: "text", fillable: false, value: "" },
];

function registerForm(applied) {
  return registerAiScreen(() => ({
    id: "test-form",
    title: "Test registration",
    describe: () => "A test form.",
    form: { fields: () => FIELDS, apply: (values) => Object.assign(applied, values) },
  }));
}

test("values are converted to what each field accepts", () => {
  const byKey = Object.fromEntries(FIELDS.map((field) => [field.key, field]));
  assert.deepEqual(coerceFieldValue(byKey["operations.deliveryEnabled"], "yes"), { ok: true, value: true, display: "Yes" });
  assert.deepEqual(coerceFieldValue(byKey["operations.businessType"], "Online"), { ok: true, value: "online", display: "Online" });
  assert.deepEqual(coerceFieldValue(byKey["operations.openTime"], "8am"), { ok: true, value: "08:00", display: "08:00" });
  assert.equal(coerceFieldValue(byKey["identity.categories"], "Electronics, Furniture, Fashion & Clothing").value.length, 2, "respects the limit");
  assert.equal(coerceFieldValue(byKey["location.email"], "not-an-email").ok, false);
  assert.equal(coerceFieldValue(byKey["operations.businessType"], "carrier pigeon").ok, false, "only offered choices");
});

test("image and excluded fields are never filled", () => {
  const byKey = Object.fromEntries(FIELDS.map((field) => [field.key, field]));
  assert.equal(coerceFieldValue(byKey["identity.logo"], "a nice logo").ok, false);
  assert.equal(coerceFieldValue(byKey["trustPayout.bankDetails"], "0123456789").ok, false);
});

test("the screen tells KAI its fields, and unknown keys are refused", () => {
  const applied = {};
  const unregister = registerForm(applied);
  try {
    const snapshot = snapshotAiScreen();
    assert.equal(snapshot.screen, "Test registration");
    assert.deepEqual(snapshot.capabilities, ["form"]);
    assert.match(snapshot.facts, /identity\.businessName \[text, required\]/);
    assert.ok(snapshot.facts.includes('identity.logo [image, only the person can add this] "Logo"'), snapshot.facts);

    const prepared = prepareFormValues([
      { key: "identity.businessName", value: "Mama Grace Store" },
      { key: "identity.logo", value: "draw one" },
      { key: "secret.field", value: "x" },
    ]);
    assert.deepEqual(prepared.ready.map((item) => item.key), ["identity.businessName"]);
    assert.deepEqual(prepared.skipped.map((item) => item.key), ["identity.logo", "secret.field"]);

    // Nothing reaches the form until it is applied.
    assert.deepEqual(applied, {});
    const outcome = applyAiFormValues("test-form", prepared.ready);
    assert.deepEqual(outcome, { ok: true, filled: 1 });
    assert.deepEqual(applied, { "identity.businessName": "Mama Grace Store" });
  } finally {
    unregister();
  }
});

test("filling a screen that has closed does nothing", () => {
  const applied = {};
  registerForm(applied)();
  assert.deepEqual(applyAiFormValues("test-form", [{ key: "identity.businessName", value: "Late" }]), { ok: false, reason: "screen-closed" });
  assert.deepEqual(applied, {});
});

test("the screen on top is the one KAI sees", () => {
  const unregisterForm = registerForm({});
  const sent = [];
  const unregisterChat = registerAiScreen(() => ({
    id: "test-chat",
    title: "Chat with Ama",
    messaging: {
      thread: () => ({ with: "Ama", messages: [{ from: "them", text: "Is it available?" }, { from: "me", text: "Yes" }] }),
      send: (text) => sent.push(text),
    },
  }));
  try {
    assert.equal(getActiveAiScreen().id, "test-chat");
    const snapshot = snapshotAiScreen();
    assert.deepEqual(snapshot.capabilities, ["message"]);
    assert.match(snapshot.facts, /Them: Is it available\?/);
    assert.match(snapshot.facts, /Me: Yes/);
  } finally {
    unregisterChat();
    unregisterForm();
  }
  assert.deepEqual(sent, [], "nothing is sent while reading the screen");
});

test("a reply is sent only when asked, and only to the screen it belongs to", async () => {
  const sent = [];
  const unregister = registerAiScreen(() => ({
    id: "test-chat",
    title: "Chat with Ama",
    messaging: { thread: () => ({ with: "Ama", messages: [] }), send: (text) => sent.push(text) },
  }));
  try {
    assert.deepEqual(await sendAiScreenMessage("test-chat", "Yes, it is in stock."), { ok: true });
    assert.deepEqual(sent, ["Yes, it is in stock."]);
    assert.deepEqual(await sendAiScreenMessage("another-screen", "Hello"), { ok: false, reason: "screen-closed" });
    assert.deepEqual(await sendAiScreenMessage("test-chat", "   "), { ok: false, reason: "empty" });
    assert.equal(sent.length, 1);
  } finally {
    unregister();
  }
});
