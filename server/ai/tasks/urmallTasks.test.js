import assert from "node:assert/strict";
import test from "node:test";

import { AI_ERROR_CODES } from "../aiErrors.js";
import { getTask, taskAllowsSurface } from "../aiTasks.js";

const LISTING = { id: "p1", name: "Tecno Spark 20", priceLabel: "Le 1,850.00", condition: "new", delivery: true };

test("UrMall buyer tasks are grounded and refuse to run without the listing", () => {
  for (const id of ["urmall.product_explain", "urmall.product_question"]) {
    const task = getTask(id);
    assert.equal(taskAllowsSurface(task, "urmall"), true);
    assert.equal(taskAllowsSurface(task, "explore"), false);
    assert.match(task.instruction, /Use ONLY the KunThai data provided/);
    assert.throws(
      () => task.build({ question: "Is it waterproof?" }),
      (error) => error.code === AI_ERROR_CODES.invalidRequest,
    );
  }
});

test("the listing travels as a labelled data block with its exact price label", () => {
  const built = getTask("urmall.product_explain").build({ listing: LISTING });
  assert.match(built.prompt, /Listing \(KunThai data\):\n---\n/);
  assert.ok(built.prompt.includes("Le 1,850.00"));
});

test("product questions are personal and never cached", () => {
  const built = getTask("urmall.product_question").build({ listing: LISTING, question: "Does it come with a charger?" });
  assert.equal(built.cacheKey, null);
  assert.throws(() => getTask("urmall.product_question").build({ listing: LISTING }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("review summaries need written reviews and never pass reviewer names", () => {
  const task = getTask("urmall.review_summary");
  assert.throws(
    () => task.build({ reviews: { reviewCount: 2, reviews: [{ rating: 5 }, { rating: 4, comment: "" }] } }),
    (error) => error.code === AI_ERROR_CODES.invalidRequest,
  );
  const built = task.build({
    productName: "Tecno Spark 20",
    reviews: { reviewCount: 1, reviews: [{ rating: 5, comment: "Fast delivery", buyerName: "Amara Kamara" }] },
  });
  assert.ok(built.prompt.includes("Fast delivery"));
  // The browser strips names already; the task only forwards rating + comment
  // fields it was given, and must not invent a rating in its instruction.
  assert.match(task.instruction, /Do not invent a rating/);
});

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("photo search sends the shopper's photo and refuses anything that is not an image", () => {
  const task = getTask("urmall.image_identify");
  assert.equal(taskAllowsSurface(task, "urmall"), true);
  const built = task.build({ image: `data:image/png;base64,${PNG_1PX}`, language: "fr" });
  assert.equal(built.media.length, 1);
  assert.equal(built.media[0].mimeType, "image/png");
  assert.match(built.prompt, /Keep searchTerms in English/);
  assert.throws(() => task.build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  const fake = Buffer.from("not an image").toString("base64");
  assert.throws(() => task.build({ image: `data:image/png;base64,${fake}` }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("photo identification keeps only clean search words", () => {
  const result = getTask("urmall.image_identify").parse({
    found: true,
    name: "Tecno Spark 20",
    explanation: "A budget Android smartphone.",
    searchTerms: ["Tecno Spark 20", "", "smartphone", "phone", "a", "b", "c", "d"],
  });
  assert.equal(result.kind, "json");
  assert.equal(result.text, "A budget Android smartphone.");
  assert.deepEqual(result.searchTerms.slice(0, 3), ["Tecno Spark 20", "smartphone", "phone"]);
  assert.ok(result.searchTerms.length <= 6);
  assert.equal(getTask("urmall.image_identify").parse({ found: false, name: "", explanation: "A selfie.", searchTerms: [] }).found, false);
});

test("photo matching is grounded in real listings and needs candidates", () => {
  const task = getTask("urmall.image_match");
  assert.match(task.instruction, /Use ONLY the KunThai data provided/);
  assert.throws(() => task.build({ product: { name: "Phone" }, listings: [] }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  const built = task.build({ product: { name: "Tecno Spark 20", explanation: "Phone" }, listings: [LISTING] });
  assert.match(built.prompt, /Listings \(KunThai data\):\n---\n/);
  assert.ok(built.prompt.includes("Le 1,850.00"));
  const parsed = task.parse({ matches: [{ id: "p1", level: "exact", reason: "Same model." }, { id: "", level: "exact", reason: "x" }, { id: "p2", level: "weird", reason: "Close." }] });
  assert.deepEqual(parsed.matches.map((m) => [m.id, m.level]), [["p1", "exact"], ["p2", "similar"]]);
});
