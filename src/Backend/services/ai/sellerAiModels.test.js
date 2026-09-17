import assert from "node:assert/strict";
import test from "node:test";

import {
  appendKeywordsToDescription,
  buildSalesTrendFacts,
  businessSummaryFacts,
  customerMessagesFacts,
  listingDraftFacts,
  productPerformanceFacts,
} from "./sellerAiModels.js";

const NOW = Date.UTC(2026, 8, 17, 12);
const day = (offset) => new Date(NOW - offset * 24 * 60 * 60 * 1000).toISOString();

test("sales trends are computed from real orders, completed revenue only", () => {
  const orders = [
    { status: "completed", total_amount: 100, created_at: day(0) },
    { status: "pending", total_amount: 500, created_at: day(1) },
    { status: "completed", total_amount: 50, created_at: day(3) },
    // Previous period.
    { status: "completed", total_amount: 300, created_at: day(9) },
    { status: "cancelled", total_amount: 80, created_at: day(10) },
  ];
  const facts = buildSalesTrendFacts(orders, { days: 7, now: NOW, currency: "SLE" });
  assert.equal(facts.totals.orders, 3);
  assert.equal(facts.totals.completedOrders, 2);
  assert.match(facts.totals.completedRevenue, /150/);
  assert.equal(facts.previousPeriod.orders, 2);
  assert.equal(facts.previousPeriod.revenueChangePercent, -50);
  assert.equal(facts.bucket, "day");
  assert.equal(facts.series.length, 7);
  assert.deepEqual(facts.totals.byStatus, { completed: 2, pending: 1 });
});

test("a period with no earlier sales reports no percentage rather than an invented one", () => {
  const facts = buildSalesTrendFacts([{ status: "completed", total_amount: 10, created_at: day(0) }], { days: 30, now: NOW });
  assert.equal(facts.previousPeriod.revenueChangePercent, null);
  assert.equal(facts.bucket, "week");
  assert.equal(buildSalesTrendFacts([], { days: 7, now: NOW }).note, "No orders in this period.");
});

test("product performance uses KunThai's own low-stock rule and real conversion", () => {
  const products = [
    { id: "a", name: "Phone", status: "active", price: 100, stock: 2, low_stock_alert: 3, views: 50, sales: 5 },
    { id: "b", name: "Case", status: "active", price: 10, stock: 40, low_stock_alert: 3, views: 200, sales: 2 },
    { id: "c", name: "Old", status: "active", price: 10, stock: 0, low_stock_alert: 3, views: 0, sales: 0 },
    { id: "d", name: "Draft", status: "draft", price: 10, stock: 1, low_stock_alert: 3, views: 0, sales: 0 },
  ];
  const byConversion = productPerformanceFacts(products, { sortBy: "conversion", limit: 2, currency: "SLE" });
  assert.deepEqual(byConversion.products.map((product) => product.id), ["a", "b"]);
  assert.equal(byConversion.products[0].conversionPercent, 10);
  assert.equal(byConversion.lowStock, 1);
  assert.equal(byConversion.outOfStock, 1);
  assert.equal(byConversion.products[0].lowStock, true);
  // Drafts are excluded from a low-stock list: only active listings can sell.
  assert.ok(!productPerformanceFacts(products, { sortBy: "low_stock" }).products.some((product) => product.id === "d"));
});

test("the business summary drops the dashboard's placeholder metrics", () => {
  const facts = businessSummaryFacts(
    {
      business: { name: "Freetown Phones", kind: "retail", currency: "SLE", verificationLabel: "Verified Seller", rating: 0, reviewCount: 0 },
      health: { score: 80, missingItems: ["Add a banner"] },
      today: { orders: 2, revenue: 150, pendingMessages: 1, lowStockAlerts: 3 },
    },
    null,
  );
  assert.equal(facts.business.name, "Freetown Phones");
  assert.equal(facts.today.lowStockProducts, 3);
  assert.ok(!JSON.stringify(facts).includes("rating"), "the dashboard's hard-coded 0 rating must not be reported");
  assert.match(businessSummaryFacts(null).error, /No UrMall business/);
});

test("conversation overviews carry topics and words, never buyer identities", () => {
  const facts = customerMessagesFacts({
    metrics: { unreadMessages: 1, buyerQuestionsWaiting: 1 },
    conversations: [
      {
        topic: "Tecno Spark 20",
        buyerName: "Amara Kamara",
        buyerId: "u-123",
        unread: true,
        type: "question",
        messages: [{ from: "buyer", text: "Is it still available?" }, { from: "seller", text: "Yes" }],
      },
    ],
  });
  assert.equal(facts.recent[0].lastBuyerMessage, "Is it still available?");
  const json = JSON.stringify(facts);
  assert.ok(!json.includes("Amara") && !json.includes("u-123"));
});

test("listing drafts sent to AI exclude prices and include completeness checks", () => {
  const facts = listingDraftFacts({
    basics: { name: "Phone", description: "Good phone", brand: "Tecno" },
    details: { storage: "128GB", tierPricing: [{ min: 5, price: 90 }] },
    media: { coverImageUrl: "https://x/y.jpg", extraImageUrls: ["a", "b"] },
    pricing: { price: "2000", discountPrice: "1800" },
  });
  const json = JSON.stringify(facts);
  assert.ok(!json.includes("2000") && !json.includes("1800") && !json.includes("tierPricing"));
  assert.deepEqual(facts.completeness, { hasCoverPhoto: true, extraPhotos: 2, hasVideo: false, descriptionWords: 2, hasBrand: true, hasModel: false });
});

test("keywords are added as one editable line, merged on repeat", () => {
  const once = appendKeywordsToDescription("Good phone", ["tecno", "android"]);
  assert.equal(once, "Good phone\n\nKeywords: tecno, android");
  assert.equal(appendKeywordsToDescription(once, ["Android", "smartphone"]), "Good phone\n\nKeywords: tecno, android, smartphone");
  assert.equal(appendKeywordsToDescription("", ["tecno"]), "Keywords: tecno");
});
