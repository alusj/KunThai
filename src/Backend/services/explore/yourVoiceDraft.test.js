import assert from "node:assert/strict";
import test from "node:test";

import { clearVoiceDraft, readVoiceDraft, writeVoiceDraft } from "./yourVoiceDraft.js";

function memoryStore() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test("a saved form comes back for the same account only", () => {
  const store = memoryStore();
  writeVoiceDraft("a", { title: "Hello" }, "Explore", store);
  assert.equal(readVoiceDraft("a", store).form.title, "Hello");
  assert.equal(readVoiceDraft("a", store).currentScreen, "Explore");
  assert.equal(readVoiceDraft("b", store), null);
});

test("clearing removes it, and broken data reads as nothing", () => {
  const store = memoryStore();
  writeVoiceDraft("a", { title: "Hello" }, "Explore", store);
  clearVoiceDraft("a", store);
  assert.equal(readVoiceDraft("a", store), null);
  store.setItem("kunthai.yourVoice.draft.a", "{not json");
  assert.equal(readVoiceDraft("a", store), null);
});
