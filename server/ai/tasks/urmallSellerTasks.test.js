import assert from "node:assert/strict";
import test from "node:test";

import { AI_ERROR_CODES } from "../aiErrors.js";
import { getTask, taskAllowsSurface } from "../aiTasks.js";
import { toolNamesFor, validateToolCall, functionDeclarationsFor } from "../assistant/assistantTools.js";

const DRAFT = { name: "tecno spark 20", brand: "Tecno", condition: "new", completeness: { hasCoverPhoto: false } };

const SELLER_TASKS = [
  "urmall.listing_title",
  "urmall.listing_description",
  "urmall.listing_category",
  "urmall.listing_keywords",
  "urmall.listing_quality",
  "urmall.customer_reply",
  "urmall.conversation_summary",
  "urmall.seller_review_insights",
  "urmall.marketing_copy",
];

test("seller tasks run only in UrMall and on the cheap tier", () => {
  for (const id of SELLER_TASKS) {
    const task = getTask(id);
    assert.equal(taskAllowsSurface(task, "urmall"), true, id);
    assert.equal(taskAllowsSurface(task, "explore"), false, id);
    assert.equal(task.tier, "fast", id);
  }
});

test("listing helpers forbid invented claims and never discuss price changes", () => {
  for (const id of ["urmall.listing_title", "urmall.listing_description"]) {
    assert.match(getTask(id).instruction, /Never invent specifications/);
  }
  assert.match(getTask("urmall.listing_quality").instruction, /Do not suggest changing the price/);
  assert.throws(() => getTask("urmall.listing_description").build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("a suggested category must be one of the business's own categories", () => {
  const task = getTask("urmall.listing_category");
  const categories = ["Phones & Tablets", "Accessories"];
  assert.deepEqual(task.parse({ category: "phones & tablets" }, { categories }), {
    kind: "category",
    category: "Phones & Tablets",
    text: "Phones & Tablets",
  });
  const invented = task.parse({ category: "Smartphones" }, { categories });
  assert.equal(invented.kind, "text");
  assert.throws(() => task.build({ listing: DRAFT, categories: [] }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("keywords are normalised, de-duplicated and capped", () => {
  const result = getTask("urmall.listing_keywords").parse({ keywords: ["Tecno", "tecno", "#smart phone", "a", ...Array.from({ length: 20 }, (unused, index) => `kw${index}`)] });
  assert.equal(result.kind, "keywords");
  assert.equal(result.items[0], "tecno");
  assert.equal(result.items[1], "smart phone");
  assert.equal(result.items.length, 10);
});

test("customer replies need a buyer message and are never cached", () => {
  const task = getTask("urmall.customer_reply");
  assert.throws(
    () => task.build({ messages: [{ from: "seller", text: "Hello" }] }),
    (error) => error.code === AI_ERROR_CODES.invalidRequest,
  );
  const built = task.build({ messages: [{ from: "buyer", text: "Can you give me a discount?" }] });
  assert.equal(built.cacheKey, null);
  assert.match(task.instruction, /Never promise a price, discount, delivery time, stock level or refund/);
});

test("marketing copy may mention a discount only when the listing has one", () => {
  assert.match(getTask("urmall.marketing_copy").instruction, /Mention a discount only if the listing has an originalPriceLabel/);
});

test("seller assistant tools are read-only and invisible to buyers", () => {
  const sellerTools = toolNamesFor("urmall", "seller");
  for (const name of ["get_business_summary", "get_product_performance", "get_sales_trend", "get_review_insights", "get_customer_messages_overview"]) {
    assert.ok(sellerTools.includes(name), name);
    assert.equal(validateToolCall({ name, args: {} }, "urmall", "seller").kind, "data");
    assert.equal(validateToolCall({ name, args: {} }, "urmall", "buyer").rejected, true, `${name} must not run for buyers`);
  }
});

test("seller tool arguments are clamped to safe values", () => {
  assert.deepEqual(validateToolCall({ name: "get_sales_trend", args: { days: 365 } }, "urmall", "seller").args, { days: 30 });
  assert.deepEqual(validateToolCall({ name: "get_product_performance", args: { sortBy: "profit", limit: 500 } }, "urmall", "seller").args, { sortBy: "views", limit: 10 });
});

test("tool declarations stay within what Gemini's schema accepts", () => {
  for (const declaration of functionDeclarationsFor("urmall", "seller")) {
    if (!declaration.parameters) continue;
    assert.ok(Object.keys(declaration.parameters.properties || {}).length > 0, `${declaration.name} has an empty object schema`);
    for (const [key, property] of Object.entries(declaration.parameters.properties)) {
      if (property.enum) assert.equal(property.type, "string", `${declaration.name}.${key}: enums must be strings`);
    }
  }
});
