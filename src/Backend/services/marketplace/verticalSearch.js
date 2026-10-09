// UrMall search across EVERYTHING a buyer can find: shop and vendor products
// plus restaurant meals, hotels and property listings.
//
// Products (shops and vendors) already had a typo-tolerant ranker
// (productSearch.js). Meals, hotels and property used exact substring
// matching, so "sharwama" never found "Shawarma" and photo search never even
// looked at them. This module gives those listings a product-shaped view so
// every search surface (the search bar, KAI's chat tools and photo search)
// ranks them with the SAME scorer. Pure: no network, no DOM.

import { normalizeSearchQuery, rankSearchResults, scoreProduct, MIN_QUERY_LENGTH } from "./productSearch.js";

// Words a shopper uses for the kind of listing, so "food", "hotel" or "house"
// finds listings whose own text never says it.
const TYPE_WORDS = {
  restaurant: "food meal restaurant dish",
  hotel: "hotel room stay accommodation lodging",
  property: "property real estate house home",
};

export function verticalListingName(type, item) {
  if (!item) return "";
  if (type === "restaurant") return item.name || item.businessName || "";
  if (type === "property") return item.title || item.businessName || "";
  return item.businessName || item.name || "";
}

export function verticalListingImage(type, item) {
  if (!item) return "";
  if (type === "restaurant") return item.image_url || (item.image_urls || [])[0] || "";
  if (type === "property") return (item.image_urls || [])[0] || "";
  return (item.images || [])[0] || item.image_url || "";
}

export function verticalListingPrice(type, item) {
  if (!item) return 0;
  return Number((type === "hotel" ? item.fromPrice : item.price) || 0);
}

/** A product-shaped view of a meal / hotel / property for productSearch's scorer. */
export function toSearchableVertical(type, item) {
  const roomText = Array.isArray(item?.rooms)
    ? item.rooms.map((room) => [room.name, room.room_type, room.listingDescription ?? room.description].filter(Boolean).join(" ")).join(" ")
    : "";
  return {
    id: item?.id,
    name: verticalListingName(type, item),
    description: [item?.listingDescription, item?.description, roomText].filter(Boolean).join(" "),
    category: [TYPE_WORDS[type], item?.meal_period, item?.property_type, item?.purpose].filter(Boolean).join(" "),
    details: { keywords: [item?.city, item?.address, item?.amenities].flat().filter(Boolean).join(" ") },
    seller: { name: item?.businessName || "" },
    views: item?.views,
    createdAt: item?.created_at || item?.updated_at || "",
  };
}

/** Score one vertical listing against a query (0 = not a match). */
export function scoreVerticalListing(type, item, rawQuery) {
  return scoreProduct(toSearchableVertical(type, item), rawQuery);
}

/**
 * Rank vertical entries ({ type, item }) against a query, best first, dropping
 * non-matches. An empty/too-short query returns the entries unchanged.
 */
export function rankVerticalEntries(entries = [], rawQuery = "") {
  if (normalizeSearchQuery(rawQuery).length < MIN_QUERY_LENGTH) return [...entries];
  return entries
    .map((entry) => ({ entry, score: scoreVerticalListing(entry.type, entry.item, rawQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

/**
 * One ranked list across products (shops + vendors) and verticals. Rows are
 * { kind: "retail", product } or { kind: "vertical", type, item }, ordered by
 * relevance so an exact meal name beats a loose product description hit.
 */
export function rankMarketplaceSearch(products = [], verticalEntries = [], rawQuery = "") {
  if (normalizeSearchQuery(rawQuery).length < MIN_QUERY_LENGTH) return [];
  const retail = rankSearchResults(products, rawQuery).map((product, index) => ({
    kind: "retail",
    product,
    score: scoreProduct(product, rawQuery),
    order: index,
  }));
  const verticals = verticalEntries
    .map((entry, index) => ({ kind: "vertical", type: entry.type, item: entry.item, score: scoreVerticalListing(entry.type, entry.item, rawQuery), order: index }))
    .filter((row) => row.score > 0);
  return [...retail, ...verticals]
    .sort((a, b) => (b.score - a.score) || (a.kind === b.kind ? a.order - b.order : a.kind === "retail" ? -1 : 1))
    .map(({ kind, product, type, item }) => (kind === "retail" ? { kind, product } : { kind, type, item }));
}

/** Flatten a vertical discovery payload into { type, item } entries. */
export function verticalEntriesFrom(discovery = {}) {
  return [
    ...(discovery?.restaurants || []).map((item) => ({ type: "restaurant", item })),
    ...(discovery?.hotels || []).map((item) => ({ type: "hotel", item })),
    ...(discovery?.properties || []).map((item) => ({ type: "property", item })),
  ];
}

/**
 * Photo search treats meals/hotels/property like products: prefixed ids (so
 * they never collide with product ids), image, price and currency, and the
 * original listing under `vertical` so the result opens the right screen.
 */
export function verticalAsPhotoCandidate({ type, item }) {
  return {
    ...toSearchableVertical(type, item),
    id: `${type}:${item.id}`,
    imageUrl: verticalListingImage(type, item),
    price: verticalListingPrice(type, item),
    currency: item.currency || "",
    vertical: { type, item },
  };
}
