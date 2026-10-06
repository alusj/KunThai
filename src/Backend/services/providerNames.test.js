import assert from "node:assert/strict";
import test from "node:test";

import { appleNameMetadataPatch, providerNameParts } from "./providerNames.js";

test("given and family names are used as they are", () => {
  assert.deepEqual(providerNameParts({ given_name: "Alusine", family_name: "Kamara", full_name: "x y" }), {
    firstName: "Alusine",
    lastName: "Kamara",
  });
});

test("a full name splits into first name and the rest", () => {
  assert.deepEqual(providerNameParts({ full_name: "  Alusine  Sulaiman Kamara " }), {
    firstName: "Alusine",
    lastName: "Sulaiman Kamara",
  });
  assert.deepEqual(providerNameParts({ name: "Cher" }), { firstName: "Cher", lastName: "" });
});

test("no name, or an email in the name field, gives nothing", () => {
  assert.deepEqual(providerNameParts({}), { firstName: "", lastName: "" });
  assert.deepEqual(providerNameParts({ full_name: "abc123@privaterelay.appleid.com" }), { firstName: "", lastName: "" });
  assert.deepEqual(providerNameParts(null), { firstName: "", lastName: "" });
});

test("Apple's first-time name is stored when the account has none", () => {
  assert.deepEqual(appleNameMetadataPatch({ email: "a@b.c" }, { givenName: "Ada", familyName: "Lovelace" }), {
    given_name: "Ada",
    family_name: "Lovelace",
    full_name: "Ada Lovelace",
  });
});

test("an existing name is never overwritten", () => {
  assert.equal(appleNameMetadataPatch({ first_name: "Saved" }, { givenName: "Ada", familyName: "L" }), null);
  assert.equal(appleNameMetadataPatch({ full_name: "Earlier Name" }, { givenName: "Ada" }), null);
});

test("a later Apple sign-in without a name writes nothing", () => {
  assert.equal(appleNameMetadataPatch({}, { givenName: "", familyName: null }), null);
  assert.equal(appleNameMetadataPatch({}, {}), null);
});
