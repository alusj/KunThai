import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const serviceSource = readFileSync(new URL("./sellerRegistrationService.js", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../../../components/Marketplace/MarketplaceHeader/Business/BusinessHeader/MyBizMenu/MyBizMenu.jsx", import.meta.url), "utf8");

function deletionService(rpcError = null) {
  const values = new Map([
    ["kunthai.marketplace.active-business.v1.owner", "deleted-business"],
    ["kunthai.marketplace.active-business-hint.v1", "deleted-business"],
  ]);
  const events = [];
  const context = {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
      rpc: async (name, args) => {
        assert.equal(name, "delete_my_marketplace_business");
        assert.equal(args.target_business_id, "deleted-business");
        // A background read can refill the cache while deletion is pending.
        runInNewContext("registeredBusinessesCache = { stale: true }", context);
        return { error: rpcError };
      },
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    },
    window: { addEventListener() {}, dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  // Execute the real service with its network imports replaced by the fixture.
  const api = runInNewContext(`${serviceSource.replace(/^import[\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "")}
    ({ deleteRegisteredBusiness, cached: () => registeredBusinessesCache })`, context);
  return { api, values, events };
}

test("successful deletion clears pending-read cache and active business before announcing the change", async () => {
  const { api, values, events } = deletionService();
  await api.deleteRegisteredBusiness("deleted-business");
  assert.equal(api.cached(), null);
  assert.equal(values.size, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.businessId, null);
});

test("failed deletion preserves the active workspace and does not announce removal", async () => {
  const { api, values, events } = deletionService({ message: "Deletion refused" });
  await assert.rejects(api.deleteRegisteredBusiness("deleted-business"), /could not delete/);
  assert.equal(values.size, 2);
  assert.equal(events.length, 0);
});

function menuDeletionHandler(error = null) {
  const effects = { timers: [], toasts: [], reloaded: false, closed: false };
  const handlerBody = menuSource.match(/onClick=\{async \(\) => \{([\s\S]*?)\n {16}\}\}/)?.[1];
  assert.ok(handlerBody, "The confirmation button has its deletion handler");
  const handler = runInNewContext(`(async () => {${handlerBody}\n})`, {
    businessToDelete: { id: "deleted-business" },
    deleteRegisteredBusiness: async (id) => {
      assert.equal(id, "deleted-business");
      if (error) throw error;
    },
    setRequestingDeletion() {},
    setBusinessToDelete() {},
    closeDrawer: () => { effects.closed = true; },
    showToast: (_message, type) => effects.toasts.push(type),
    t: (key) => key,
    window: {
      setTimeout: (callback, delay) => effects.timers.push({ callback, delay }),
      location: { reload: () => { effects.reloaded = true; } },
    },
  });
  return { handler, effects };
}

test("UrMall deletion refreshes the workspace automatically after the same success delay as UrRide", async () => {
  const { handler, effects } = menuDeletionHandler();
  await handler();
  assert.deepEqual(effects.toasts, ["success"]);
  assert.equal(effects.timers.length, 1);
  assert.equal(effects.timers[0].delay, 1600);
  effects.timers[0].callback();
  assert.equal(effects.reloaded, true);
});

test("UrMall deletion errors keep the dialog open without scheduling a reload", async () => {
  const { handler, effects } = menuDeletionHandler(new Error("Deletion refused"));
  await handler();
  assert.deepEqual(effects.toasts, ["danger"]);
  assert.equal(effects.timers.length, 0);
  assert.equal(effects.closed, false);
});
