import assert from "node:assert/strict";
import test from "node:test";
import { createRentalCatalogueCache } from "./rentalCatalogueCache.js";

test("rental remounts reuse a single request and a recent public snapshot", async () => {
  let calls = 0;
  let time = 1000;
  const cache = createRentalCatalogueCache(async () => { calls++; return [{ id: "car", status: "available" }]; }, () => time);
  const first = cache.load("SL");
  assert.equal(first, cache.load("SL"));
  await first;
  await cache.load("SL");
  assert.equal(calls, 1);
  assert.equal(cache.read("SL")[0].id, "car");
  time += 60001;
  await cache.load("SL");
  assert.equal(calls, 2);
  await cache.load("SL", true);
  assert.equal(calls, 3);
});

test("hidden, reserved and deleted vehicles never enter public catalogue snapshots", async () => {
  const cache = createRentalCatalogueCache(async () => [{ status: "available", id: "visible" }, { status: "hidden" }, { status: "reserved" }, { status: "available", deleted_at: "today" }]);
  assert.deepEqual(await cache.load("SL"), [{ status: "available", id: "visible" }]);
  assert.deepEqual(cache.read("GH"), []);
});

test("an old request cannot repopulate a catalogue invalidated by a fleet edit", async () => {
  let resolve;
  const cache = createRentalCatalogueCache(() => new Promise((done) => { resolve = done; }));
  const pending = cache.load("SL");
  await Promise.resolve();
  cache.clear();
  resolve([{ id: "old", status: "available" }]);
  await pending;
  assert.deepEqual(cache.read("SL"), []);
});

test("failed requests can be retried", async () => {
  let calls = 0;
  const cache = createRentalCatalogueCache(async () => { if (++calls === 1) throw new Error("offline"); return []; });
  await assert.rejects(cache.load("SL"), /offline/);
  assert.deepEqual(await cache.load("SL"), []);
  assert.equal(calls, 2);
});
