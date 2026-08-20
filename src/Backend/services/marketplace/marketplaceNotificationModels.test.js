import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBuyerOrderNotification,
  buildBuyerOrderNotifications,
  buildSellerProductNotificationSignals,
} from "./marketplaceNotificationModels.js";

const NOW = new Date("2026-08-20T12:00:00Z").getTime();

function product(overrides = {}) {
  return {
    id: "product-1",
    name: "Handwoven Bag",
    status: "active",
    stock: 20,
    low_stock_alert: 3,
    views: 0,
    sales: 0,
    created_at: "2026-07-01T12:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

test("buyer order notification id changes with order status", () => {
  const base = {
    id: "order-1",
    preview: "Canvas Shoes x1",
    sellerName: "Mariam Store",
    createdAt: "2026-08-20T09:00:00Z",
  };
  const pending = buildBuyerOrderNotification({ ...base, status: "pending" });
  const shipped = buildBuyerOrderNotification({ ...base, status: "shipped" });

  assert.equal(pending.id, "buyer-order:order-1:pending");
  assert.equal(shipped.id, "buyer-order:order-1:shipped");
  assert.match(shipped.title, /on the way/i);
});

test("financial order events are excluded until payments are active", () => {
  assert.equal(buildBuyerOrderNotification({ id: "order-2", status: "refunded" }), null);
  assert.equal(buildBuyerOrderNotification({ id: "order-3", status: "payment_failed" }), null);
});

test("buyer order notifications keep the latest order first", () => {
  const rows = buildBuyerOrderNotifications([
    { id: "old", status: "pending", createdAt: "2026-08-19T09:00:00Z" },
    { id: "new", status: "accepted", createdAt: "2026-08-20T09:00:00Z" },
  ]);
  assert.deepEqual(rows.map((row) => row.orderId), ["new", "old"]);
});

test("seller gets a strong performance signal only after meaningful activity", () => {
  const signals = buildSellerProductNotificationSignals([
    product({ views: 80, sales: 8 }),
    product({ id: "too-early", views: 12, sales: 1, created_at: "2026-08-18T12:00:00Z" }),
  ], NOW);

  const strong = signals.find((signal) => signal.id.startsWith("product-signal:performing:product-1"));
  assert.ok(strong);
  assert.match(strong.title, /performing very well/i);
  assert.equal(strong.actionTarget, "seller-product-insights");
  assert.equal(signals.some((signal) => signal.productId === "too-early"), false);
});

test("seller gets useful low visibility and inventory calls to action", () => {
  const signals = buildSellerProductNotificationSignals([
    product({ id: "quiet", name: "Quiet Listing", views: 4, sales: 0 }),
    product({ id: "empty", name: "Sold Out Item", stock: 0, views: 40 }),
  ], NOW);

  const quiet = signals.find((signal) => signal.id === "product-signal:low-visibility:quiet");
  const empty = signals.find((signal) => signal.id === "product-signal:out-of-stock:empty");
  assert.equal(quiet.actionLabel, "Improve listing");
  assert.equal(empty.actionLabel, "Update product");
  assert.equal(empty.status, "warning");
});
