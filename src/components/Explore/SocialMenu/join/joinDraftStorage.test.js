import assert from "node:assert/strict";
import test from "node:test";

import { clearLocalDraft, draftStorageKey, mergeRestoredAnswers, readLocalDraft, writeLocalDraft } from "./joinDraftStorage.js";

function memoryStore() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    size: () => values.size,
  };
}

test("drafts are kept per account and application", () => {
  const store = memoryStore();
  assert.equal(draftStorageKey("", "app"), "");
  writeLocalDraft("u1", "app1", { name: "Ama" }, store, 5);
  assert.deepEqual(readLocalDraft("u1", "app1", store), { answers: { name: "Ama" }, savedAt: 5 });
  assert.equal(readLocalDraft("u2", "app1", store), null);
  writeLocalDraft("u1", "app1", {}, store);
  assert.equal(readLocalDraft("u1", "app1", store), null);
  writeLocalDraft("u1", "app1", { name: "Ama" }, store);
  clearLocalDraft("u1", "app1", store);
  assert.equal(store.size(), 0);
});

test("unsaved local answers are restored over the server's", () => {
  const { answers, restoredKeys } = mergeRestoredAnswers(
    { name: "Ama", city: "Freetown", skills: ["a"] },
    { answers: { city: "Bo", skills: ["a"], phone: "123" } },
  );
  assert.deepEqual(answers, { name: "Ama", city: "Bo", skills: ["a"], phone: "123" });
  assert.deepEqual(restoredKeys.sort(), ["city", "phone"]);
  assert.deepEqual(mergeRestoredAnswers({ a: 1 }, null), { answers: { a: 1 }, restoredKeys: [] });
});

test("a broken stored value is ignored", () => {
  const store = memoryStore();
  store.setItem(draftStorageKey("u", "a"), "{not json");
  assert.equal(readLocalDraft("u", "a", store), null);
});
