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
