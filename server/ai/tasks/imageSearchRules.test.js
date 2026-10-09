import assert from "node:assert/strict";
import test from "node:test";

import { getTask } from "../aiTasks.js";
import {
  IMAGE_IDENTIFY_INSTRUCTION,
  IMAGE_IDENTIFY_SCHEMA,
  MAX_PHOTO_SEARCH_TERMS,
  deviceTermsFor,
  normalizeIdentifiedPhoto,
} from "./imageSearchRules.js";

test("the photo task uses the photo-search rules for its prompt, schema and result", () => {
  const task = getTask("urmall.image_identify");
  assert.equal(task.instruction, IMAGE_IDENTIFY_INSTRUCTION);
  assert.equal(task.schema, IMAGE_IDENTIFY_SCHEMA);
  assert.equal(task.cacheScope, "user");
  const result = task.parse({ found: true, photoType: "physical_object", objectType: "laptop", name: "Laptop", explanation: "x", searchTerms: ["laptop"] });
  assert.equal(result.kind, "json");
  assert.equal(result.found, true);
});

test("the instruction says a device showing text or forms on its screen is still the product", () => {
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /Screens are products/);
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /laptop[^.]*phone[^.]*tablet[^.]*TV/);
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /text, forms, an app/);
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /the product is the DEVICE/);
  // "No product" is kept for photos with nothing sellable, and still searched.
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /found to false only when there is truly no sellable object/);
  assert.match(IMAGE_IDENTIFY_INSTRUCTION, /still fill searchTerms with your best guess/);
  for (const field of ["found", "photoType", "objectType", "deviceWithScreen", "searchTerms"]) {
    assert.ok(IMAGE_IDENTIFY_SCHEMA.required.includes(field), field);
  }
  assert.deepEqual(IMAGE_IDENTIFY_SCHEMA.properties.photoType.enum, ["physical_object", "screenshot", "document", "person", "blank", "other"]);
});

test("a laptop whose screen shows forms is corrected to a product and searched as a laptop", () => {
  // The answer seen in production for a photo of an open MacBook.
  const result = normalizeIdentifiedPhoto({
    found: false,
    photoType: "document",
    objectType: "document",
    deviceWithScreen: false,
    name: "document",
    explanation: "The photo shows a document or computer screen displaying text and forms rather than a product.",
    searchTerms: ["document", "form"],
  });
  assert.equal(result.found, true);
  assert.equal(result.corrected, true);
  assert.equal(result.bestGuess, false);
  assert.equal(result.deviceWithScreen, true);
  assert.ok(result.searchTerms.includes("computer"));
  assert.ok(result.searchTerms.includes("laptop"));
  assert.ok(!result.searchTerms.includes("document"), "what the screen shows is not searched");
  assert.ok(!result.searchTerms.includes("form"));
  assert.equal(result.text, "", "the contradicting 'not a product' text is dropped");
  assert.notEqual(result.name.toLowerCase(), "document");
});

test("deviceWithScreen from the model always wins over found:false", () => {
  const result = normalizeIdentifiedPhoto({
    found: false,
    photoType: "physical_object",
    objectType: "laptop",
    deviceWithScreen: true,
    name: "Ordinateur portable",
    explanation: "Un ordinateur portable ouvert.",
    searchTerms: ["MacBook", "laptop", "website"],
  });
  assert.equal(result.found, true);
  assert.equal(result.name, "Ordinateur portable", "a real product name in the shopper's language is kept");
  assert.deepEqual(result.searchTerms.slice(0, 3), ["laptop", "computer", "notebook"]);
  assert.ok(result.searchTerms.includes("MacBook"));
  assert.ok(!result.searchTerms.includes("website"));
});

test("a found device keeps the model's specific words first and gains synonyms and category", () => {
  const result = normalizeIdentifiedPhoto({
    found: true,
    photoType: "physical_object",
    objectType: "laptop",
    deviceWithScreen: true,
    name: "Apple MacBook Pro",
    category: "Electronics",
    brand: "Apple",
    explanation: "An open silver laptop.",
    searchTerms: ["MacBook Pro", "MacBook", "laptop"],
  });
  assert.equal(result.corrected, false);
  assert.equal(result.name, "Apple MacBook Pro");
  assert.equal(result.text, "An open silver laptop.");
  assert.equal(result.searchTerms[0], "MacBook Pro");
  for (const word of ["computer", "notebook", "Electronics"]) assert.ok(result.searchTerms.includes(word), word);
  assert.ok(result.searchTerms.length <= MAX_PHOTO_SEARCH_TERMS);
});

test("a flat screenshot or a selfie stays 'no product' but keeps a best-guess search", () => {
  const screenshot = normalizeIdentifiedPhoto({
    found: false,
    photoType: "screenshot",
    objectType: "screenshot",
    deviceWithScreen: false,
    name: "Screenshot of a shopping page",
    explanation: "A screenshot of an online shop showing sneakers.",
    searchTerms: ["sneakers", "trainers"],
  });
  assert.equal(screenshot.found, false);
  assert.equal(screenshot.bestGuess, true);
  assert.deepEqual(screenshot.searchTerms, ["sneakers", "trainers"]);

  const selfie = normalizeIdentifiedPhoto({ found: false, photoType: "person", objectType: "person", deviceWithScreen: false, name: "", explanation: "A selfie of a person using a phone.", searchTerms: [] });
  assert.equal(selfie.found, false);
  assert.equal(selfie.bestGuess, false);
  assert.deepEqual(selfie.searchTerms, []);

  // No words at all but a name: the name is searched.
  const named = normalizeIdentifiedPhoto({ found: false, photoType: "other", objectType: "", name: "Ankara fabric", explanation: "", searchTerms: [] });
  assert.deepEqual(named.searchTerms, ["Ankara fabric"]);
  assert.equal(named.bestGuess, true);
});

test("accessories are not turned into the device they belong to", () => {
  const bag = normalizeIdentifiedPhoto({ found: true, photoType: "physical_object", objectType: "laptop bag", deviceWithScreen: false, name: "Laptop bag", explanation: "", searchTerms: ["laptop bag", "backpack"] });
  assert.equal(bag.deviceWithScreen, false);
  assert.ok(!bag.searchTerms.includes("computer"));
  assert.deepEqual(deviceTermsFor("tablet"), ["tablet", "ipad"]);
  assert.deepEqual(deviceTermsFor("headphones"), []);
  assert.ok(deviceTermsFor("smartphone").includes("phone"));
});

test("a physical object the model doubted is still searched as a product", () => {
  const result = normalizeIdentifiedPhoto({ found: false, photoType: "physical_object", objectType: "office chair", deviceWithScreen: false, name: "Chaise", explanation: "", searchTerms: ["office chair", "chair"] });
  assert.equal(result.found, true);
  assert.equal(result.corrected, true);
  assert.equal(result.searchTerms[0], "office chair");
  assert.equal(result.subject, "product");
});
