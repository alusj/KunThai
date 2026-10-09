import assert from "node:assert/strict";
import test from "node:test";

import { prepareFormValues, registerAiScreen, snapshotAiScreen } from "./aiScreenContext.js";
import {
  CATEGORY_FIELD_KEYS,
  FULFILLMENT_FIELD_KEYS,
  VENDOR_FIELD_KEYS,
  filterFieldsForKind,
  inferBusinessKind,
  isFieldAllowedForKind,
  normalizeBusinessKind,
  sanitizeRegistrationValues,
} from "./businessKindPolicy.js";
import { cancelFormGuide, chooseFormGuideOption, getFormGuideFlow, startFormGuide, submitFormGuideText } from "./formGuideFlow.js";

test("plain phrasing maps to the right business kind", () => {
  const cases = [
    ["I sell food", "restaurant"],
    ["We cook meals and do catering", "restaurant"],
    ["I rent houses", "property_agent"],
    ["real estate agency with apartments and land", "property_agent"],
    ["wholesale supplier", "vendor"],
    ["I'm a distributor of rice in bulk", "vendor"],
    ["I have a shop", "retail"],
    ["small boutique", "retail"],
    ["Je vends des repas", "restaurant"],
    ["tienda de ropa", "retail"],
    ["批发商", "vendor"],
    ["مطعم", "restaurant"],
  ];
  for (const [text, kind] of cases) {
    assert.deepEqual(inferBusinessKind(text), { kind, confident: true }, text);
  }
});

test("ids and form labels resolve exactly; nonsense and mixed answers are not guessed", () => {
  assert.equal(normalizeBusinessKind("Real Estate Agent"), "property_agent");
  assert.equal(normalizeBusinessKind("Vendor / Supplier"), "vendor");
  assert.equal(normalizeBusinessKind("restaurant"), "restaurant");
  assert.equal(normalizeBusinessKind("spaceship"), "");
  assert.deepEqual(inferBusinessKind("hello there"), { kind: "", confident: false });
  assert.deepEqual(inferBusinessKind("Netherlands"), { kind: "", confident: false }, "word boundaries, not substrings");
  const mixed = inferBusinessKind("I sell food wholesale");
  assert.equal(mixed.confident, false, "two kinds matched: confirm with the person");
  assert.equal(mixed.kind, "vendor");
});

test("categories only for retail and vendors; supply fields only for vendors; fulfilment never for real estate", () => {
  for (const key of CATEGORY_FIELD_KEYS) {
    assert.equal(isFieldAllowedForKind(key, "retail"), true);
    assert.equal(isFieldAllowedForKind(key, "vendor"), true);
    assert.equal(isFieldAllowedForKind(key, "restaurant"), false);
    assert.equal(isFieldAllowedForKind(key, "property_agent"), false);
    assert.equal(isFieldAllowedForKind(key, "hotel"), false);
  }
  for (const key of VENDOR_FIELD_KEYS) {
    assert.equal(isFieldAllowedForKind(key, "vendor"), true);
    for (const kind of ["retail", "restaurant", "property_agent"]) assert.equal(isFieldAllowedForKind(key, kind), false, `${kind} ${key}`);
  }
  for (const key of FULFILLMENT_FIELD_KEYS) {
    assert.equal(isFieldAllowedForKind(key, "restaurant"), true);
    assert.equal(isFieldAllowedForKind(key, "property_agent"), false);
  }
  // Until the kind is chosen nothing kind-specific applies.
  for (const key of [...CATEGORY_FIELD_KEYS, ...VENDOR_FIELD_KEYS, ...FULFILLMENT_FIELD_KEYS]) {
    assert.equal(isFieldAllowedForKind(key, "retail", { confirmed: false }), false, key);
  }
  assert.equal(isFieldAllowedForKind("identity.businessName", "restaurant", { confirmed: false }), true);
  const kept = filterFieldsForKind([{ key: "identity.categories" }, { key: "identity.businessName" }], "restaurant").map((field) => field.key);
  assert.deepEqual(kept, ["identity.businessName"]);
});

test("proposed values are checked against the kind they set", () => {
  const restaurant = sanitizeRegistrationValues(
    [{ key: "identity.categories", value: "Electronics" }, { key: "identity.businessName", value: "Mama's Kitchen" }],
    { kind: "restaurant", confirmed: true },
  );
  assert.deepEqual(restaurant.kept.map((item) => item.key), ["identity.businessName"]);
  assert.deepEqual(restaurant.dropped.map((item) => item.key), ["identity.categories"]);

  // Choosing the kind in the same breath confirms it for the other values.
  const shop = sanitizeRegistrationValues(
    [{ key: "identity.businessKind", value: "retail" }, { key: "identity.categories", value: "Fashion" }],
    { kind: "retail", confirmed: false },
  );
  assert.equal(shop.confirmed, true);
  assert.deepEqual(shop.kept.map((item) => item.key), ["identity.businessKind", "identity.categories"]);

  const switchToRealEstate = sanitizeRegistrationValues(
    [{ key: "identity.businessKind", value: "I rent houses" }, { key: "identity.categories", value: "Furniture" }, { key: "operations.vendorType", value: "importer" }],
    { kind: "retail", confirmed: true },
  );
  assert.equal(switchToRealEstate.kind, "property_agent");
  assert.deepEqual(switchToRealEstate.kept.map((item) => item.key), ["identity.businessKind"]);

  const unconfirmed = sanitizeRegistrationValues([{ key: "identity.categories", value: "Fashion" }], { kind: "retail", confirmed: false });
  assert.deepEqual(unconfirmed.kept, [], "no categories before the kind is chosen");
});

// A registration screen wired like useBusinessRegistrationAi: the field list
// goes through the policy and the kind field applies at once.
function fakeRegistration({ kind = "retail", confirmed = false } = {}) {
  const state = { kind, confirmed, name: "", categories: [], description: "", delivery: "no" };
  const applied = [];
  const kindField = () => ({
    key: "identity.businessKind",
    label: "Business type",
    type: "select",
    required: true,
    immediate: true,
    options: [{ value: "retail", label: "Retail Store" }, { value: "vendor", label: "Vendor / Supplier" }, { value: "restaurant", label: "Restaurant" }, { value: "property_agent", label: "Real Estate Agent" }],
    normalize: (text) => {
      const result = inferBusinessKind(text);
      return result.kind && result.confident ? { ok: true, value: result.kind, display: result.kind } : { ok: false, reason: "Which kind of business?" };
    },
    value: state.confirmed ? state.kind : "",
    sectionLabel: "Identity",
  });
  const unregister = registerAiScreen(() => ({
    id: "urmall-business-registration",
    title: "UrMall business registration",
    form: {
      fields: () => filterFieldsForKind([
        kindField(),
        { key: "identity.businessName", label: "Business name", type: "text", value: state.name, sectionLabel: "Identity" },
        { key: "identity.categories", label: "Categories", type: "multiselect", options: ["Electronics", "Fashion"], value: state.categories, sectionLabel: "Identity" },
        { key: "identity.description", label: "Description", type: "textarea", value: state.description, sectionLabel: "Identity" },
        { key: "operations.deliveryEnabled", label: "Delivery", type: "boolean", value: state.delivery, sectionLabel: "Operations" },
      ], state.kind, { confirmed: state.confirmed }),
      meta: () => ({ businessKind: state.kind, kindConfirmed: state.confirmed }),
      sanitize: (proposed) => {
        const { kept, dropped } = sanitizeRegistrationValues(proposed, { kind: state.kind, confirmed: state.confirmed });
        return { kept, dropped: dropped.map((item) => ({ ...item, reason: "Not for this business type." })) };
      },
      apply: (values) => {
        applied.push(values);
        if (values["identity.businessKind"]) Object.assign(state, { kind: values["identity.businessKind"], confirmed: true });
        if (values["identity.businessName"]) state.name = values["identity.businessName"];
        if (values["identity.categories"]) state.categories = values["identity.categories"];
      },
    },
  }));
  return { state, applied, unregister };
}

test("the guided questions ask the kind first and never ask a restaurant for categories", () => {
  const { state, applied, unregister } = fakeRegistration();
  try {
    startFormGuide();
    assert.equal(getFormGuideFlow().question.key, "identity.businessKind", "kind first");
    submitFormGuideText("I sell food");
    assert.equal(state.kind, "restaurant", "plain phrasing understood and applied at once");
    assert.deepEqual(applied[0], { "identity.businessKind": "restaurant" });
    const asked = [];
    for (let guard = 0; guard < 10 && getFormGuideFlow().question; guard += 1) {
      const question = getFormGuideFlow().question;
      asked.push(question.key);
      if (question.key === "__section") chooseFormGuideOption("skip");
      else chooseFormGuideOption("__skip");
    }
    assert.ok(!asked.includes("identity.categories"), asked.join(","));
    assert.ok(asked.includes("operations.deliveryEnabled"), "restaurants are asked about delivery");
  } finally {
    cancelFormGuide({ silent: true });
    unregister();
  }
});

test("a shop is asked for categories once it is a shop; an unclear kind is asked again", () => {
  const { state, unregister } = fakeRegistration();
  try {
    startFormGuide();
    submitFormGuideText("hmm not sure");
    assert.equal(getFormGuideFlow().question.key, "identity.businessKind", "asked again, never guessed");
    assert.equal(state.confirmed, false);
    submitFormGuideText("I have a shop");
    assert.equal(state.kind, "retail");
    assert.equal(getFormGuideFlow().question.key, "identity.businessName");
    chooseFormGuideOption("__skip");
    assert.equal(getFormGuideFlow().question.key, "identity.categories");
  } finally {
    cancelFormGuide({ silent: true });
    unregister();
  }
});

test("values KAI proposes for a restaurant never include categories, and the server sees the kind", () => {
  const { unregister } = fakeRegistration({ kind: "restaurant", confirmed: true });
  try {
    const snapshot = snapshotAiScreen();
    assert.deepEqual(snapshot.formMeta, { screen: "urmall-business-registration", businessKind: "restaurant", kindConfirmed: true });
    assert.ok(!snapshot.facts.includes("identity.categories"));
    const prepared = prepareFormValues([
      { key: "identity.categories", value: "Electronics" },
      { key: "identity.businessName", value: "Mama's Kitchen" },
    ]);
    assert.deepEqual(prepared.ready.map((item) => item.key), ["identity.businessName"]);
    assert.deepEqual(prepared.skipped.map((item) => item.key), ["identity.categories"]);
  } finally {
    unregister();
  }
});
