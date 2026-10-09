import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_CAUTION } from "../../../i18n/orderCaution.js";
import {
  ORDER_CAUTION_KINDS,
  isOrderCautionHidden,
  normalizeOrderCautionKind,
  orderCautionContent,
  orderCautionKindForProduct,
  orderCautionKindsForCart,
  orderCautionStorageKey,
  pendingOrderCautions,
  readHiddenOrderCautions,
  resetOrderCautions,
  setOrderCautionHidden,
} from "./orderCaution.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const lookup = (key) => key.split(".").slice(1).reduce((node, part) => node?.[part], ORDER_CAUTION.en);

test("each UrMall business kind gets its own card", () => {
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "retail" } }), "retail");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "vendor" } }), "vendor");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "restaurant" } }), "restaurant");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "property_agent" } }), "realEstate");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "hotel" } }), "realEstate");
  assert.equal(orderCautionKindForProduct({ seller: { business_kind: "vendor" } }), "vendor");
});

test("a vertical listing's type wins over the seller's kind; unknown products are retail", () => {
  assert.equal(orderCautionKindForProduct({ verticalType: "restaurant", seller: { businessKind: "retail" } }), "restaurant");
  assert.equal(orderCautionKindForProduct({ verticalType: "room" }), "realEstate");
  assert.equal(orderCautionKindForProduct({ verticalType: "hotel" }), "realEstate");
  assert.equal(orderCautionKindForProduct({ verticalType: "property" }), "realEstate");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "retail" } }, "restaurant"), "restaurant");
  assert.equal(orderCautionKindForProduct({}), "retail");
  assert.equal(orderCautionKindForProduct(undefined), "retail");
  assert.equal(orderCautionKindForProduct({ seller: { businessKind: "something-new" } }), "retail");
  assert.equal(normalizeOrderCautionKind("Real Estate"), "realEstate");
  assert.equal(normalizeOrderCautionKind("nonsense"), "");
});

test("a cart lists each kind once, in order", () => {
  const items = [
    { product: { seller: { businessKind: "vendor" } } },
    { product: { seller: { businessKind: "retail" } } },
    { product: { seller: { businessKind: "vendor" } } },
    { product: {} },
  ];
  assert.deepEqual(orderCautionKindsForCart(items), ["vendor", "retail"]);
  assert.deepEqual(orderCautionKindsForCart(null), []);
});

test("every kind's content keys exist in English, with 4 tips and the common lines", () => {
  for (const kind of ORDER_CAUTION_KINDS) {
    const content = orderCautionContent(kind);
    assert.equal(content.kind, kind);
    assert.equal(content.tipKeys.length, 4);
    const total = content.tipKeys.length + content.commonKeys.length;
    assert.ok(total >= 4 && total <= 6, `${kind} shows 4–6 points`);
    for (const key of [content.labelKey, content.titleKey, content.introKey, ...content.tipKeys, ...content.commonKeys]) {
      assert.equal(typeof lookup(key), "string", `${key} exists`);
    }
    assert.equal(content.policyHref, "/policy-center/urmall");
  }
  assert.equal(orderCautionContent("bogus").kind, "retail");
});

test("every card says KunThai only connects buyers and is not a party to the deal", () => {
  for (const kind of ORDER_CAUTION_KINDS) {
    const intro = lookup(orderCautionContent(kind).introKey);
    assert.match(intro, /technology platform/);
    assert.match(intro, /not a party/);
  }
});

test("don't-show-again is per user and per kind", () => {
  const storage = memoryStorage();
  assert.deepEqual(readHiddenOrderCautions("user-a", storage), []);
  assert.equal(setOrderCautionHidden("user-a", "restaurant", true, storage), true);
  assert.equal(isOrderCautionHidden("user-a", "restaurant", storage), true);
  assert.equal(isOrderCautionHidden("user-a", "realEstate", storage), false, "other kinds still show");
  assert.equal(isOrderCautionHidden("user-b", "restaurant", storage), false, "other people still see it");
  assert.equal(isOrderCautionHidden("", "restaurant", storage), false, "the signed-out device key is separate");

  setOrderCautionHidden("user-a", "vendor", true, storage);
  assert.deepEqual(readHiddenOrderCautions("user-a", storage), ["vendor", "restaurant"]);
  setOrderCautionHidden("user-a", "restaurant", false, storage);
  assert.deepEqual(readHiddenOrderCautions("user-a", storage), ["vendor"]);
});

test("signed out falls back to a device key", () => {
  const storage = memoryStorage();
  assert.equal(orderCautionStorageKey(""), "kunthai.urmall.orderCaution.v1:device");
  assert.equal(orderCautionStorageKey(null), "kunthai.urmall.orderCaution.v1:device");
  assert.equal(orderCautionStorageKey(" abc "), "kunthai.urmall.orderCaution.v1:abc");
  setOrderCautionHidden(null, "retail", true, storage);
  assert.equal(isOrderCautionHidden(undefined, "retail", storage), true);
});

test("reset turns every card back on and clears the stored value", () => {
  const storage = memoryStorage();
  setOrderCautionHidden("u", "retail", true, storage);
  setOrderCautionHidden("u", "realEstate", true, storage);
  assert.equal(resetOrderCautions("u", storage), true);
  assert.deepEqual(readHiddenOrderCautions("u", storage), []);
  assert.equal(storage.data.has(orderCautionStorageKey("u")), false);
});

test("pending cards skip hidden kinds, unknown kinds and repeats", () => {
  const storage = memoryStorage();
  setOrderCautionHidden("u", "vendor", true, storage);
  assert.deepEqual(pendingOrderCautions("u", ["vendor", "retail", "retail", "bogus"], storage), ["retail"]);
  assert.deepEqual(pendingOrderCautions("u", "realEstate", storage), ["realEstate"]);
  assert.deepEqual(pendingOrderCautions("u", [], storage), []);
});

test("broken or blocked storage never hides a card and never throws", () => {
  const corrupt = memoryStorage({ [orderCautionStorageKey("u")]: "{not json" });
  assert.deepEqual(readHiddenOrderCautions("u", corrupt), []);
  const wrongShape = memoryStorage({ [orderCautionStorageKey("u")]: JSON.stringify({ hidden: ["retail", "evil", 3] }) });
  assert.deepEqual(readHiddenOrderCautions("u", wrongShape), ["retail"]);
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(readHiddenOrderCautions("u", blocked), []);
  assert.equal(setOrderCautionHidden("u", "retail", true, blocked), false);
  assert.equal(resetOrderCautions("u", blocked), false);
  assert.equal(isOrderCautionHidden("u", "retail", null), false);
  assert.equal(setOrderCautionHidden("u", "bogus", true, memoryStorage()), false);
});
