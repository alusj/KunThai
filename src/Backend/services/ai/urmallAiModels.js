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
  return [verticalName(type, item), item.listingDescription, item.description, item.businessName, item.meal_period, item.purpose, item.property_type, item.city, item.address]
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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const VERTICAL_KIND_LABEL = {
  restaurant: "restaurant meal",
  room: "hotel room",
  hotel: "hotel",
  property: "real-estate property",
};

function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length)),
  );
}

function servedDaysLabel(days) {
  const list = Array.isArray(days) ? days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [];
  if (!list.length) return undefined;
  if (list.length === 7) return "every day";
  return list.map((day) => WEEKDAY_NAMES[day]).join(", ");
}

/**
 * What KAI may know about a meal, room, hotel or property open on a buyer
 * detail screen. Built from the mapped listing (mapVerticalProduct) with
 * exact price labels; no seller phone, email or WhatsApp.
 */
export function verticalDetailFactsForAi(product, { buyer = null } = {}) {
  if (!product?.id || !product.isVertical) return null;
  const type = product.verticalType;
  const facts = product.listingFacts || {};
  const currency = product.currency || product.seller?.currency || "";
  const price = Number(product.price || 0);
  const label = price > 0 ? moneyLabel(price, currency) : "";
  const perNight = type === "room" || type === "hotel";
  const rentPeriod = type === "property" ? facts.rentPeriod : "";
  const priceLabel = !label
    ? undefined
    : type === "hotel"
      ? `from ${label} per night`
      : perNight
        ? `${label} per night`
        : rentPeriod
          ? `${label} per ${rentPeriod}`
          : label;
  const distance = distanceTo(buyer, product.seller?.latitude, product.seller?.longitude);
  const base = {
    id: product.id,
    listingKind: VERTICAL_KIND_LABEL[type] || "listing",
    name: clip(product.name, 120),
    priceLabel,
    seller: clip(product.seller?.name, 80) || undefined,
    sellerVerified: ["verified", "approved"].includes(String(product.seller?.verificationStatus || "").toLowerCase()),
    city: product.seller?.city || undefined,
    country: product.seller?.country || product.country || undefined,
    ...(Number(product.reviewCount) > 0 ? { rating: Number(product.rating), reviewCount: Number(product.reviewCount) } : {}),
    ...(distance !== null ? { distanceKm: distance } : {}),
    description: clip(product.description, 1_200) || undefined,
  };

  if (type === "restaurant") {
    return compact({
      ...base,
      restaurant: base.seller,
      seller: undefined,
      mealPeriod: facts.mealPeriod ? String(facts.mealPeriod).replaceAll("_", " ") : undefined,
      cuisine: facts.cuisine,
      preparationMinutesStatedBySeller: facts.preparationMinutes,
      daysAvailable: servedDaysLabel(facts.servedDays),
      delivery: Boolean(product.deliveryAvailable),
      pickup: Boolean(product.pickupAvailable),
    });
  }
  if (type === "property") {
    return compact({
      ...base,
      agent: base.seller,
      seller: undefined,
      propertyType: facts.propertyType,
      forRentOrSale: facts.purpose,
      bedrooms: facts.bedrooms,
      bathrooms: facts.bathrooms,
      parkingSpaces: facts.parkingSpaces,
      furnished: facts.furnished,
      landSize: facts.landSize,
      floorArea: facts.floorArea,
      rooms: facts.rooms,
      starRating: facts.starRating,
      location: clip([facts.address, facts.city].filter(Boolean).join(", "), 140) || clip(product.location, 140) || undefined,
      priceNegotiable: Boolean(product.allowNegotiation),
    });
  }
  if (type === "room") {
    return compact({
      ...base,
      hotel: base.seller,
      seller: undefined,
      guestsPerRoom: facts.capacity,
      roomsAvailable: facts.roomsAvailable,
      amenities: Array.isArray(facts.amenities) ? facts.amenities.map((amenity) => clip(amenity, 40)).join(", ") : undefined,
    });
  }
  if (type === "hotel") {
    return compact({
      ...base,
      roomTypes: (facts.roomTypes || [])
        .map((room) => compact({
          name: clip(room.name, 60) || undefined,
          priceLabel: Number(room.nightlyRate) > 0 ? `${moneyLabel(room.nightlyRate, currency)} per night` : undefined,
          guests: room.capacity,
        }))
        .filter((room) => Object.keys(room).length),
    });
  }
  return compact(base);
}

// The screen context keeps about 1,200 characters (see aiScreenContext.js):
// the short facts go first and the description fills what is left.
const SCREEN_TEXT_LIMIT = 1_150;

/**
 * Plain "key: value" lines for a listing, for KAI's screen context (the
 * floating KAI chat reads them while the detail screen is open).
 */
export function describeListingForAi(facts, heading = "Listing open on screen") {
  if (!facts || typeof facts !== "object") return "";
  const lines = [`${heading} (KunThai data; quote prices exactly):`];
  const { description, ...rest } = facts;
  Object.entries(rest).forEach(([key, value]) => {
    if (key === "id" || value === undefined || value === null || value === "") return;
    let text;
    if (Array.isArray(value)) {
      text = value
        .map((entry) => (entry && typeof entry === "object"
          ? Object.entries(entry).map(([innerKey, innerValue]) => `${innerKey} ${innerValue}`).join(", ")
          : String(entry)))
        .join("; ");
    } else if (typeof value === "object") {
      text = Object.entries(value).map(([innerKey, innerValue]) => `${innerKey} ${innerValue}`).join(", ");
    } else if (typeof value === "boolean") {
      text = value ? "yes" : "no";
    } else {
      text = String(value);
    }
    if (text) lines.push(`- ${key}: ${clip(text, 200)}`);
  });
  const used = lines.join("\n").length;
  const room = SCREEN_TEXT_LIMIT - used - "\n- description: ".length;
  if (description && room > 40) lines.push(`- description: ${clip(description, room)}`);
  return lines.join("\n");
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
