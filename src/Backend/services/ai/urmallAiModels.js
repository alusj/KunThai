// KAI — pure UrMall helpers.
//
// Everything the model is told about a listing is built here, from the real
// mapped KunThai record, with deterministic formatting. The model never sees a
// raw price number it could reformat: it sees the exact label KunThai itself
// would display, and is instructed to quote it verbatim.

import { haversineKm } from "../../utils/distance.js";
import { formatCountryMoney } from "../../../data/globalCountryProfiles.js";

export const ASSISTANT_RESULT_LIMIT = 6;

export function moneyLabel(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  return formatCountryMoney(value, currency || "");
}

function effectivePrice(product) {
  const discount = Number(product?.discountPrice);
  const price = Number(product?.price || 0);
  return Number.isFinite(discount) && discount > 0 && discount < price ? discount : price;
}

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactAttributes(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const entries = Object.entries(details)
    .filter(([key, value]) => key !== "tierPricing" && value !== null && value !== "" && typeof value !== "object")
    .slice(0, 12)
    .map(([key, value]) => [clip(key, 40), clip(value, 80)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Buyer coordinates KunThai already holds. Never prompts for location. */
export function readBuyerCoordinates(storage = globalThis.localStorage) {
  const read = (key) => {
    try {
      return JSON.parse(storage?.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  for (const value of [read("marketplace-buyer-address"), read("kunthai.buyerLocation.v1")]) {
    const latitude = Number(value?.coordinates?.latitude ?? value?.latitude);
    const longitude = Number(value?.coordinates?.longitude ?? value?.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) {
      return { latitude, longitude };
    }
  }
  return null;
}

function distanceTo(buyer, latitude, longitude) {
  if (!buyer || latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  const km = haversineKm(buyer, { latitude, longitude });
  return Number.isFinite(km) ? Math.round(km * 10) / 10 : null;
}

/**
 * Decide whether a budget can be applied to listings. KunThai holds no
 * exchange rates, so a budget in another currency is never converted: the
 * price filter is skipped and results are shown cheapest first instead.
 */
export function resolveBudget({ minPrice = null, maxPrice = null, budgetCurrency = "" }, marketCurrency) {
  const hasBudget = minPrice !== null || maxPrice !== null;
  const mismatch = Boolean(hasBudget && budgetCurrency && marketCurrency && budgetCurrency !== marketCurrency);
  return {
    apply: hasBudget && !mismatch,
    minPrice: hasBudget && !mismatch ? minPrice : null,
    maxPrice: hasBudget && !mismatch ? maxPrice : null,
    mismatch: mismatch ? { budgetCurrency, listingCurrency: marketCurrency, priceFilterApplied: false } : null,
    sortCheapestFirst: mismatch,
  };
}

/** Case-insensitive match against categories that really exist. */
export function matchCategory(requested, categories = []) {
  const wanted = String(requested || "").trim().toLowerCase();
  if (!wanted) return "";
  const exact = categories.find((category) => String(category).toLowerCase() === wanted);
  if (exact) return exact;
  return categories.find((category) => String(category).toLowerCase().includes(wanted) || wanted.includes(String(category).toLowerCase())) || "";
}

/** What the model may know about one listing. No seller phone, email or address. */
export function productFactsForAi(product, { buyer = null, detail = false } = {}) {
  if (!product?.id) return null;
  const currency = product.currency || product.seller?.currency || "";
  const price = effectivePrice(product);
  const hasDiscount = price < Number(product.price || 0);
  const stock = Number(product.stock || 0);
  return {
    id: product.id,
    name: clip(product.name, 120),
    priceLabel: moneyLabel(price, currency),
    ...(hasDiscount ? { originalPriceLabel: moneyLabel(product.price, currency) } : {}),
    category: product.category || undefined,
    condition: product.condition || undefined,
    brand: product.brand || undefined,
    model: product.model || undefined,
    inStock: stock > 0,
    ...(stock > 0 && stock <= 10 ? { stockLeft: stock } : {}),
    delivery: Boolean(product.deliveryAvailable),
    pickup: Boolean(product.pickupAvailable),
    ...(product.deliveryTime ? { deliveryTimeStatedBySeller: clip(product.deliveryTime, 60) } : {}),
    negotiable: Boolean(product.allowNegotiation),
    city: product.seller?.city || clip(product.location, 60) || undefined,
    seller: clip(product.seller?.name, 80) || undefined,
    sellerVerified: ["verified", "approved"].includes(String(product.seller?.verificationStatus || "").toLowerCase()),
    ...(Number(product.reviewCount) > 0 ? { rating: Number(product.rating), reviewCount: Number(product.reviewCount) } : {}),
    ...(distanceTo(buyer, product.seller?.latitude, product.seller?.longitude) !== null
      ? { distanceKm: distanceTo(buyer, product.seller?.latitude, product.seller?.longitude) }
      : {}),
    description: clip(product.description, detail ? 1_200 : 300) || undefined,
    ...(detail ? { attributes: compactAttributes(product.details) } : {}),
  };
}

const VERTICAL_PRICE = {
  restaurant: (item) => item.price,
  hotel: (item) => item.fromPrice,
  property: (item) => item.price,
};

export function verticalPrice(type, item) {
  return Number(VERTICAL_PRICE[type]?.(item) || 0);
}

export function verticalName(type, item) {
  if (type === "restaurant") return item.name || item.businessName || "";
  if (type === "property") return item.title || item.businessName || "";
  return item.businessName || "";
}

export function verticalSearchText(type, item) {
  return [verticalName(type, item), item.description, item.businessName, item.meal_period, item.purpose, item.property_type, item.city, item.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function verticalFactsForAi(type, item, { buyer = null } = {}) {
  if (!item?.id) return null;
  const price = verticalPrice(type, item);
  const label = moneyLabel(price, item.currency);
  return {
    id: item.id,
    type,
    name: clip(verticalName(type, item), 120),
    business: clip(item.businessName, 80) || undefined,
    priceLabel: type === "hotel" ? (label ? `from ${label} per night` : undefined) : type === "property" && item.rent_period ? `${label} per ${item.rent_period}` : label,
    ...(type === "restaurant" && item.meal_period ? { mealPeriod: item.meal_period } : {}),
    ...(type === "restaurant" && item.preparation_minutes ? { preparationMinutesStatedBySeller: Number(item.preparation_minutes) } : {}),
    ...(type === "hotel" ? { roomTypes: Array.isArray(item.rooms) ? item.rooms.length : undefined } : {}),
    ...(type === "property"
      ? { purpose: item.purpose || undefined, propertyType: item.property_type || undefined, bedrooms: Number(item.bedrooms) || undefined }
      : {}),
    city: item.city || undefined,
    delivery: type === "restaurant" ? Boolean(item.deliveryEnabled) : undefined,
    ...(distanceTo(buyer, item.latitude, item.longitude) !== null ? { distanceKm: distanceTo(buyer, item.latitude, item.longitude) } : {}),
    description: clip(item.description, 240) || undefined,
  };
}

/** Sort by real distance when the buyer's location is known; unknowns last. */
export function sortByDistance(entries, getCoordinates, buyer) {
  if (!buyer) return entries;
  return entries
    .map((entry, index) => {
      const coords = getCoordinates(entry) || {};
      return { entry, index, km: distanceTo(buyer, coords.latitude, coords.longitude) };
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.index - b.index)
    .map((item) => item.entry);
}

/** Review data for summaries: ratings and comments only, never names. */
export function reviewFactsForAi(reviews, max = 20) {
  const list = Array.isArray(reviews?.reviews) ? reviews.reviews : [];
  return {
    reviewCount: Number(reviews?.reviewCount || list.length || 0),
    averageRating: list.length ? Math.round((list.reduce((sum, review) => sum + Number(review.rating || 0), 0) / list.length) * 10) / 10 : null,
    reviews: list.slice(0, max).map((review) => ({ rating: Number(review.rating || 0), comment: clip(review.comment, 300) || undefined })),
  };
}
