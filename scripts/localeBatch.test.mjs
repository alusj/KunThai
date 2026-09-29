import assert from "node:assert/strict";
import test from "node:test";

import * as batch from "./localeBatch.mjs";

test("batch markers survive Russian transliteration and split every item", () => {
  assert.equal(typeof batch.joinTranslationBatch, "function");
  assert.equal(typeof batch.splitTranslationBatch, "function");
  const joined = batch.joinTranslationBatch(["Hello __KTSAFE0__", "Goodbye"]);
  assert.equal(joined, "Hello __KTSAFE0__\n__KTSAFE999901__\nGoodbye");
  assert.deepEqual(batch.splitTranslationBatch("Привет __KTSAFE0__\n__KTSAFE999901__\nДо свидания"), [
    "Привет __KTSAFE0__",
    "До свидания",
  ]);
});
