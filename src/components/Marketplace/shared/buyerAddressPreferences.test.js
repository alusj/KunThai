import assert from "node:assert/strict";
import test from "node:test";

import {
  filterDeletedBuyerAddresses,
  findPreferredBuyerAddress,
  markBuyerAddressDeleted,
  mergeRemoteBuyerAddresses,
  readBuyerAddressList,
  restoreBuyerAddress,
  writeBuyerAddressList,
  writeBuyerAddressPreference,
} from "./buyerAddressPreferences.js";

test("selected buyer addresses remain preferred and deleted addresses stay filtered", () => {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
  const events = [];
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  globalThis.window = {
    localStorage,
    dispatchEvent: (event) => events.push(event),
  };

  const home = { id: "home-id", category: "Resident", street: "1 Home Road" };
  const office = { id: "office-id", category: "Office", street: "2 Work Road" };

  writeBuyerAddressList([home, office]);
  writeBuyerAddressPreference(office, { notify: false });
  assert.equal(findPreferredBuyerAddress(readBuyerAddressList()).id, office.id);

  const remaining = markBuyerAddressDeleted(office);
  assert.deepEqual(remaining.map((address) => address.id), [home.id]);
  assert.deepEqual(filterDeletedBuyerAddresses([home, office]).map((address) => address.id), [home.id]);
  assert.equal(findPreferredBuyerAddress(readBuyerAddressList()).id, home.id);
  assert.equal(events.at(-1)?.detail?.address?.id, home.id);

  restoreBuyerAddress(office);
  writeBuyerAddressList([home, office]);
  assert.deepEqual(readBuyerAddressList().map((address) => address.id), [home.id, office.id]);

  const unsynced = { id: "local-address-1", category: "Other", street: "Offline Road" };
  assert.deepEqual(mergeRemoteBuyerAddresses([home], [office, unsynced]).map((address) => address.id), [home.id, unsynced.id]);

  delete globalThis.window;
  delete globalThis.CustomEvent;
});
