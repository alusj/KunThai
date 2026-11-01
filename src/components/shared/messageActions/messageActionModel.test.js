import assert from "node:assert/strict";
import test from "node:test";

import {
  DELETE_FOR_EVERYONE_WINDOW_MS,
  EDIT_WINDOW_MS,
  messageActionKeys,
  placeMessageMenu,
  quoteText,
} from "./messageActionModel.js";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const ID = "4f1d2c3b-1111-4222-8333-944455556666";
const ago = (ms) => new Date(NOW - ms).toISOString();

test("my fresh text message can be replied to, copied, edited and deleted for everyone", () => {
  const keys = messageActionKeys({ id: ID, text: "Hi", type: "text", createdAt: ago(60_000) }, { mine: true, now: NOW });
  assert.deepEqual(keys, ["reply", "copy", "edit", "delete"]);
});

test("editing stops after 15 minutes and delete for everyone after 24 hours", () => {
  const afterEdit = messageActionKeys({ id: ID, text: "Hi", createdAt: ago(EDIT_WINDOW_MS + 1) }, { mine: true, now: NOW });
  assert.deepEqual(afterEdit, ["reply", "copy", "delete"]);
  const afterDelete = messageActionKeys({ id: ID, text: "Hi", createdAt: ago(DELETE_FOR_EVERYONE_WINDOW_MS + 1) }, { mine: true, now: NOW });
  assert.deepEqual(afterDelete, ["reply", "copy", "deleteForMe"]);
});

test("their message offers delete for me and, where allowed, block", () => {
  const message = { id: ID, text: "Hello", createdAt: ago(1000) };
  assert.deepEqual(messageActionKeys(message, { mine: false, canBlock: true, now: NOW }), ["reply", "copy", "deleteForMe", "block"]);
  assert.deepEqual(messageActionKeys(message, { mine: false, now: NOW }), ["reply", "copy", "deleteForMe"]);
});

test("photos and voice notes cannot be edited or copied without words", () => {
  const keys = messageActionKeys({ id: ID, text: "", type: "audio", createdAt: ago(1000) }, { mine: true, now: NOW });
  assert.deepEqual(keys, ["reply", "delete"]);
});

test("a deleted message only offers delete for me, and unsent ones offer nothing", () => {
  assert.deepEqual(messageActionKeys({ id: ID, deletedAt: ago(10), createdAt: ago(100) }, { mine: true, now: NOW }), ["deleteForMe"]);
  assert.deepEqual(messageActionKeys({ id: "pending-1", text: "Hi", pending: true }, { mine: true, now: NOW }), []);
});

test("quotes show the words, or a label for media and deleted messages", () => {
  const labels = { photo: "Photo", voice: "Voice note", deleted: "Deleted", message: "Message" };
  assert.equal(quoteText({ body: "Where are you?" }, labels), "Where are you?");
  assert.equal(quoteText({ body: "", type: "image" }, labels), "Photo");
  assert.equal(quoteText({ body: "", type: "audio" }, labels), "Voice note");
  assert.equal(quoteText({ body: "secret", deleted: true }, labels), "Deleted");
  assert.equal(quoteText({ body: "x".repeat(400) }, labels).length, 160);
});

// A phone thread between a header ending at 120px and a composer at 720px.
const BOUNDS = { top: 120, bottom: 720, left: 0, right: 390 };
const MENU = { width: 200, height: 220 };

test("a message low in the thread gets the menu above it", () => {
  const anchor = { top: 600, bottom: 660, left: 16, right: 200 };
  const place = placeMessageMenu(anchor, MENU, BOUNDS);
  assert.equal(place.side, "above");
  assert.equal(place.top, 600 - 8 - 220);
});

test("a message near the top gets the menu below it", () => {
  const anchor = { top: 140, bottom: 200, left: 16, right: 200 };
  const place = placeMessageMenu(anchor, MENU, BOUNDS);
  assert.equal(place.side, "below");
  assert.equal(place.top, 208);
});

test("the menu never crosses the header or the composer", () => {
  const tall = { top: 130, bottom: 710, left: 16, right: 300 };
  const place = placeMessageMenu(tall, MENU, BOUNDS);
  assert.ok(place.top >= BOUNDS.top + 8);
  assert.ok(place.top + MENU.height <= BOUNDS.bottom - 8);
  const lowNoRoom = { top: 330, bottom: 700, left: 16, right: 200 };
  const low = placeMessageMenu(lowNoRoom, MENU, BOUNDS);
  assert.ok(low.top + MENU.height <= BOUNDS.bottom - 8);
});

test("my message's menu lines up with its right edge and stays on screen", () => {
  const anchor = { top: 300, bottom: 340, left: 250, right: 374 };
  const place = placeMessageMenu(anchor, MENU, BOUNDS, { align: "end" });
  assert.equal(place.left, 174);
  const edge = placeMessageMenu({ ...anchor, left: 360, right: 389 }, MENU, BOUNDS, { align: "start" });
  assert.equal(edge.left, 390 - 8 - 200);
});
