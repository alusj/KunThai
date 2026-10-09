// Order and booking caution cards — the pure rules behind them.
//
// Before a buyer orders or books in UrMall, a caution card explains that
// KunThai only connects them with an independent business, plus practical
// safety steps that fit that kind of business. This module decides which card
// a listing gets, which translation keys the card shows, and whether the buyer
// asked not to see it again. No React and no Supabase here, so it runs in
// plain Node tests; storage is passed in (localStorage in the app).
//
// "Don't show this again" is remembered per signed-in user AND per kind, so
// hiding the restaurant card never hides the real-estate one. A signed-out
// visitor's choice is kept under a device key instead.

export const ORDER_CAUTION_KINDS = Object.freeze(["retail", "vendor", "restaurant", "realEstate"]);

export const ORDER_CAUTION_STORAGE_PREFIX = "kunthai.urmall.orderCaution.v1:";
export const ORDER_CAUTION_DEVICE_KEY = "device";
export const ORDER_CAUTION_POLICY_HREF = "/policy-center/urmall";

const KIND_SET = new Set(ORDER_CAUTION_KINDS);
const TIP_COUNT = 4;
const COMMON_KEYS = Object.freeze(["orderCaution.common.chat", "orderCaution.common.report"]);

// Vertical listings carry their own type ("restaurant", "hotel", "room",
// "property"); everything else follows the seller's registered business kind
// (see URMALL_BUSINESS_KINDS: retail, vendor, restaurant, property_agent, and
// the retired hotel kind, which now lives inside real estate).
const KIND_ALIASES = new Map([
  ["retail", "retail"],
  ["shop", "retail"],
  ["store", "retail"],
  ["vendor", "vendor"],
  ["supplier", "vendor"],
  ["wholesale", "vendor"],
  ["restaurant", "restaurant"],
  ["meal", "restaurant"],
  ["food", "restaurant"],
  ["realestate", "realEstate"],
  ["real_estate", "realEstate"],
  ["property", "realEstate"],
  ["property_agent", "realEstate"],
  ["hotel", "realEstate"],
  ["room", "realEstate"],
]);

/** Normalises a business kind or listing type to a caution kind, or "" when unknown. */
export function normalizeOrderCautionKind(value) {
  const raw = String(value ?? "").trim();
  if (KIND_SET.has(raw)) return raw;
  return KIND_ALIASES.get(raw.toLowerCase().replace(/[\s-]+/g, "_")) || "";
}

/**
 * The caution kind for a listing. An explicit listing type (the vertical
 * detail's `type`) wins, then the product's own vertical type, then the
 * seller's business kind. Ordinary products default to retail.
 */
export function orderCautionKindForProduct(product = {}, listingType = "") {
  const candidates = [
    listingType,
    product?.verticalType,
    product?.seller?.businessKind,
    product?.seller?.business_kind,
    product?.businessKind,
  ];
  for (const candidate of candidates) {
    const kind = normalizeOrderCautionKind(candidate);
    if (kind) return kind;
  }
  return "retail";
}

/** The distinct caution kinds in a cart, in the order they first appear. */
export function orderCautionKindsForCart(items = []) {
  const kinds = [];
  for (const item of Array.isArray(items) ? items : []) {
    const kind = orderCautionKindForProduct(item?.product || {});
    if (!kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

/** Translation keys a card shows. Real estate is a booking; the rest are orders. */
export function orderCautionContent(kind) {
  const safeKind = normalizeOrderCautionKind(kind) || "retail";
  const base = `orderCaution.${safeKind}`;
  return {
    kind: safeKind,
    labelKey: `${base}.label`,
    titleKey: `${base}.title`,
    introKey: `${base}.intro`,
    tipKeys: Array.from({ length: TIP_COUNT }, (_, index) => `${base}.tip${index + 1}`),
    commonKeys: [...COMMON_KEYS],
    policyHref: ORDER_CAUTION_POLICY_HREF,
  };
}

// --- preference -----------------------------------------------------------

function defaultStorage() {
  try {
    return typeof globalThis !== "undefined" && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/** Storage key for one person (or this device when signed out). */
export function orderCautionStorageKey(userId) {
  const id = String(userId ?? "").trim();
  return `${ORDER_CAUTION_STORAGE_PREFIX}${id || ORDER_CAUTION_DEVICE_KEY}`;
}

/** The kinds this person chose not to see again. Unreadable storage hides nothing. */
export function readHiddenOrderCautions(userId, storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(orderCautionStorageKey(userId)) || "null");
    const list = Array.isArray(parsed?.hidden) ? parsed.hidden : [];
    return ORDER_CAUTION_KINDS.filter((kind) => list.includes(kind));
  } catch {
    return [];
  }
}

export function isOrderCautionHidden(userId, kind, storage = defaultStorage()) {
  const safeKind = normalizeOrderCautionKind(kind);
  return Boolean(safeKind) && readHiddenOrderCautions(userId, storage).includes(safeKind);
}

function writeHidden(userId, hidden, storage) {
  if (!storage) return false;
  try {
    const key = orderCautionStorageKey(userId);
    if (hidden.length) storage.setItem(key, JSON.stringify({ hidden }));
    else storage.removeItem(key);
    return true;
  } catch {
    // A refused write (private mode, full quota) only means the card shows again.
    return false;
  }
}

/** Hide (or show again) one kind's card for this person. Returns whether it was saved. */
export function setOrderCautionHidden(userId, kind, hidden = true, storage = defaultStorage()) {
  const safeKind = normalizeOrderCautionKind(kind);
  if (!safeKind) return false;
  const current = new Set(readHiddenOrderCautions(userId, storage));
  if (hidden) current.add(safeKind);
  else current.delete(safeKind);
  return writeHidden(userId, ORDER_CAUTION_KINDS.filter((item) => current.has(item)), storage);
}

/** Turn every card back on for this person. */
export function resetOrderCautions(userId, storage = defaultStorage()) {
  return writeHidden(userId, [], storage);
}

/** Of the given kinds, the ones still to show (deduplicated, order kept). */
export function pendingOrderCautions(userId, kinds = [], storage = defaultStorage()) {
  const hidden = new Set(readHiddenOrderCautions(userId, storage));
  const pending = [];
  for (const value of Array.isArray(kinds) ? kinds : [kinds]) {
    const kind = normalizeOrderCautionKind(value);
    if (kind && !hidden.has(kind) && !pending.includes(kind)) pending.push(kind);
  }
  return pending;
}
