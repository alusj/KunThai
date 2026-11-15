import assert from "node:assert/strict";
import test from "node:test";

// The intro line splitter (welcomeIntroPieces.js).
const { introLinePieces } = await import("./welcomeIntroPieces.js");

test("Get assisted with AI arrives letter by letter in a random order, all within the window", () => {
  const pieces = introLinePieces("Get assisted with AI", () => 0.3);
  const letters = pieces.filter((piece) => !piece.space);
  assert.equal(letters.map((piece) => piece.text).join(""), "GetassistedwithAI");
  assert.equal(pieces.map((piece) => piece.text).join(""), "Get assisted with AI");
  const delays = letters.map((piece) => piece.delay);
  assert.equal(new Set(delays).size, letters.length, "each letter has its own moment");
  assert.notDeepEqual(delays, [...delays].sort((a, b) => a - b), "not in reading order");
  assert.ok(Math.min(...delays) >= 4200 && Math.max(...delays) <= 5700);
});

test("joined scripts come in word by word so their letters keep their shapes", () => {
  const pieces = introLinePieces("احصل على مساعدة", () => 0.5).filter((piece) => !piece.space);
  assert.deepEqual(pieces.map((piece) => piece.text), ["احصل", "على", "مساعدة"]);
});
