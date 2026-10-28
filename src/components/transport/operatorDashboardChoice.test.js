import assert from "node:assert/strict";
import test from "node:test";

import { readOperatorWorkCompany, readOperatorWorkMode, saveOperatorWorkChoice } from "./operatorDashboardChoice.js";
import { resolveOperatorCompanyChoice, resolveOperatorWorkMode } from "./operatorAvailabilityState.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("the chosen dashboard survives reopening the app until the operator switches", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const companies = [{ companyId: "c1" }, { companyId: "c2" }];
    const both = { hasSoloFleet: true, hasCompanyFleet: true };
    // Nothing chosen yet: the solo fleet, most recent company.
    assert.equal(resolveOperatorWorkMode({ ...both, storedMode: readOperatorWorkMode("u1") }), "solo");

    saveOperatorWorkChoice("u1", "company", "c2");
    // "Reopening" reads only what was stored.
    assert.equal(resolveOperatorWorkMode({ ...both, storedMode: readOperatorWorkMode("u1") }), "company");
    assert.equal(resolveOperatorCompanyChoice(companies, readOperatorWorkCompany("u1")), "c2");

    // Another account on the same phone keeps its own choice.
    assert.equal(readOperatorWorkMode("u2"), "");

    // Switching to solo sticks too, and "Company" later returns to c2.
    saveOperatorWorkChoice("u1", "solo");
    assert.equal(readOperatorWorkMode("u1"), "solo");
    assert.equal(readOperatorWorkCompany("u1"), "c2");
  } finally {
    globalThis.localStorage = previous;
  }
});

test("no storage (private mode, blocked site data): falls back to solo without throwing", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  try {
    assert.doesNotThrow(() => saveOperatorWorkChoice("u1", "company", "c1"));
    assert.equal(readOperatorWorkMode("u1"), "");
    assert.equal(readOperatorWorkCompany("u1"), "");
  } finally {
    globalThis.localStorage = previous;
  }
});
