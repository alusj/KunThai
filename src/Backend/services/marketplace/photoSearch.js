// UrMall photo search — pure helpers.
//
// Flow: KAI identifies the photographed product (urmall.image_identify) and
// returns search words; those words — expanded with synonyms and category
// aliases here, so a laptop photo also finds a listing titled "Computer" in
// "Electricals" — run through the SAME scorer as typed search over the loaded
// catalogue (shop and vendor products, meals, hotels and property) plus a
// server recall; KAI then ranks only those real listings (urmall.image_match).
// Nothing here talks to the network.

import { moneyLabel } from "../ai/urmallAiModels.js";
import { normalizeSearchQuery, scoreProduct, SCORE } from "./productSearch.js";

export const PHOTO_CANDIDATE_LIMIT = 20;
// Listings sent to KAI's matching step (the server takes at most 24).
export const PHOTO_MATCH_LIMIT = 16;
export const PHOTO_TERM_LIMIT = 18;

// Words sellers use for the same thing. A term expands when it IS one of the
// words or ends with one ("silver laptop" -> laptop), so "laptop bag" does not
// turn into computers. Model names that start a term ("MacBook Pro") expand
// too. Avoid short words that sit inside unrelated words ("tab" in "table").
const SYNONYM_GROUPS = [
  ["laptop", "notebook", "notebook computer", "computer", "macbook", "chromebook"],
  ["computer", "desktop computer", "desktop", "laptop"],
  ["phone", "smartphone", "mobile phone", "mobile", "cellphone", "iphone", "android phone"],
  ["tablet", "ipad"],
  ["tv", "television", "smart tv", "led tv"],
  ["monitor", "computer monitor", "screen", "display"],
  ["headphones", "earphones", "earbuds", "headset", "airpods"],
  ["speaker", "bluetooth speaker", "sound system"],
  ["smartwatch", "watch", "wristwatch"],
  ["camera", "digital camera"],
  ["fridge", "refrigerator", "freezer"],
  ["sneakers", "trainers", "sports shoes"],
  ["sofa", "couch", "settee"],
  ["handbag", "purse", "bag"],
  ["motorbike", "motorcycle", "okada"],
  ["car", "vehicle", "automobile"],
  ["burger", "hamburger"],
  ["shawarma", "shwarma", "wrap"],
  ["apartment", "flat"],
  ["house", "home"],
  ["hotel room", "guest room", "suite"],
];
const MODEL_WORDS = new Set(["macbook", "chromebook", "iphone", "ipad", "airpods"]);

// Category names differ between KAI and sellers ("Electronics" vs
// "Electricals"); these are treated as the same shelf.
const CATEGORY_GROUPS = [
  ["electronics", "electronic", "electricals", "electrical", "electrical appliances", "gadgets"],
  ["computers", "computing", "laptops", "computer accessories"],
  ["phones", "mobile phones", "phones and tablets", "mobiles"],
  ["fashion", "clothing", "clothes", "apparel"],
  ["home and furniture", "furniture", "home and living"],
  ["appliances", "home appliances", "kitchen appliances"],
  ["food", "meals", "restaurant"],
  ["property", "real estate", "houses"],
];

function groupsFor(term, groups, { allowPrefix = false } = {}) {
  const key = normalizeSearchQuery(term);
  if (!key) return [];
  return groups.filter((group) => group.some((member) => {
    const word = normalizeSearchQuery(member);
    return key === word || key.endsWith(` ${word}`) || (allowPrefix && MODEL_WORDS.has(word) && (key.startsWith(`${word} `) || key.startsWith(word)));
  }));
}

function categoryGroupsFor(category) {
  const key = normalizeSearchQuery(category);
  if (!key) return [];
  return CATEGORY_GROUPS.filter((group) => group.some((member) => {
    const word = normalizeSearchQuery(member);
    return key === word || ` ${key} `.includes(` ${word} `);
  }));
}

/**
 * Weighted search words for a photo: KAI's words (most specific first), the
 * object type and name, synonyms of each, the brand, and the category with
 * its aliases. Returns [{ term, weight, kind }], strongest first, where kind
 * is "term" | "synonym" | "brand" | "category".
 */
export function expandPhotoSearchTerms(identified = {}) {
  const byKey = new Map();
  function add(term, weight, kind) {
    const text = String(term || "").replace(/\s+/g, " ").trim();
    const key = normalizeSearchQuery(text);
    if (!key || key.length < 2) return;
    const current = byKey.get(key);
    if (!current || current.weight < weight) byKey.set(key, { term: text, weight, kind: current && current.kind === "term" ? "term" : kind });
  }

  const category = String(identified?.category || "").trim();
  const categoryKey = normalizeSearchQuery(category);
  const modelTerms = (Array.isArray(identified?.searchTerms) ? identified.searchTerms : [])
    .filter((term) => normalizeSearchQuery(term) !== categoryKey);
  const primary = [];
  modelTerms.forEach((term, index) => primary.push([term, Math.max(4, 10 - index * 0.75)]));
  if (identified?.objectType) primary.push([identified.objectType, 8]);
  if (identified?.name) primary.push([identified.name, 7]);

  primary.forEach(([term, weight]) => add(term, weight, "term"));
  primary.forEach(([term, weight]) => {
    groupsFor(term, SYNONYM_GROUPS, { allowPrefix: true }).flat().forEach((synonym) => add(synonym, weight * 0.75, "synonym"));
  });
  if (identified?.brand) add(identified.brand, 3, "brand");
  if (category) {
    add(category, 2, "category");
    categoryGroupsFor(category).flat().forEach((alias) => add(alias, 2, "category"));
  }

  return [...byKey.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, PHOTO_TERM_LIMIT);
}

// A term "hits" a listing strongly when it matches its name, brand/model,
// keywords or category — not only somewhere in a long description.
const STRONG_HIT = SCORE.CATEGORY / 3 + SCORE.TOKEN_HIT;

function weighted(terms) {
  return (Array.isArray(terms) ? terms : [])
    .map((entry, index, list) => (typeof entry === "object" && entry
      ? { term: String(entry.term || "").trim(), weight: Number(entry.weight) || 1, kind: entry.kind || "term" }
      : { term: String(entry || "").trim(), weight: list.length - index, kind: "term" }))
    .filter((entry) => normalizeSearchQuery(entry.term).length >= 2);
}

/**
 * Score every listing against the weighted words. Returns
 * [{ product, score, strong }] best first; `strong` means a product word (not
 * just the brand or category) matched its title, brand, keywords or category.
 */
export function rankPhotoCandidates(products = [], terms = [], limit = PHOTO_CANDIDATE_LIMIT) {
  const words = weighted(terms);
  if (!words.length) return [];
  const ranked = [];
  const seen = new Set();
  for (const product of Array.isArray(products) ? products : []) {
    if (!product?.id || seen.has(product.id)) continue;
    seen.add(product.id);
    let score = 0;
    let strong = false;
    for (const { term, weight, kind } of words) {
      const raw = scoreProduct(product, term);
      if (raw <= 0) continue;
      score += weight * (raw / (raw + 300));
      if (raw >= STRONG_HIT && (kind === "term" || kind === "synonym")) strong = true;
    }
    if (score > 0) ranked.push({ product, score, strong });
  }
  return ranked
    .sort((a, b) => (b.strong - a.strong) || (b.score - a.score))
    .slice(0, limit);
}

/**
 * Listings to show when KAI's matching step picked nothing or failed: only
 * the ones a product word matched by title, brand, keywords or category.
 */
export function photoFallbackResults(ranked = [], max = 6) {
  return ranked
    .filter((entry) => entry?.strong)
    .slice(0, max)
    .map(({ product }) => ({ product, level: "similar", reason: "" }));
}

/**
 * At most two server searches that recall listings the preloaded catalogue
 * may not hold: KAI's most specific word, and the object type with its
 * synonyms (the server recalls a listing matching ANY of those words).
 */
export function photoRecallQueries(identified = {}, expanded = expandPhotoSearchTerms(identified)) {
  const specific = String((Array.isArray(identified?.searchTerms) ? identified.searchTerms : [])[0] || "").trim();
  const objectType = String(identified?.objectType || "").trim();
  const synonyms = expanded.filter((entry) => entry.kind === "synonym").map((entry) => entry.term);
  const broad = [objectType, ...synonyms]
    .map((term) => normalizeSearchQuery(term))
    .filter((term, index, list) => term && list.indexOf(term) === index)
    .slice(0, 4)
    .join(" ");
  return [specific, broad]
    .map((query) => query.trim())
    .filter((query, index, list) => normalizeSearchQuery(query).length >= 2 && list.findIndex((other) => normalizeSearchQuery(other) === normalizeSearchQuery(query)) === index);
}

/** Merge listing lists, keeping the first copy of each id. */
export function mergeListings(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((product) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    merged.push(product);
  });
  return merged;
}

function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Real listings worth showing KAI, best first. `terms` are plain words (the
 * earlier, the stronger) or expandPhotoSearchTerms() entries.
 */
export function photoSearchCandidates(products = [], terms = [], limit = PHOTO_CANDIDATE_LIMIT) {
  return rankPhotoCandidates(products, terms, limit).map((entry) => entry.product);
}

/**
 * Words to search with: KAI's search terms first (most specific), then the
 * identified name and category as a safety net, de-duplicated.
 */
export function photoSearchTerms(identified = {}) {
  const seen = new Set();
  return [...(Array.isArray(identified?.searchTerms) ? identified.searchTerms : []), identified?.name, identified?.category]
    .map((term) => String(term || "").trim())
    .filter((term) => {
      const key = term.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

/** The compact, exact-label record KAI compares against the photo. */
export function photoMatchListing(product) {
  const discount = Number(product?.discountPrice);
  const price = Number.isFinite(discount) && discount > 0 && discount < Number(product?.price || 0) ? discount : Number(product?.price || 0);
  const currency = product?.currency || product?.seller?.currency || "";
  return {
    id: String(product.id),
    name: clip(product.name, 100),
    category: clip(product.category, 60) || undefined,
    brand: clip(product.brand, 60) || undefined,
    model: clip(product.model, 60) || undefined,
    condition: product.condition || undefined,
    priceLabel: moneyLabel(price, currency) || undefined,
    listingKind: product.vertical?.type || (product.seller?.businessKind === "vendor" ? "vendor product" : "shop product"),
    keywords: clip([product.details?.tags, product.details?.keywords].flat().filter((value) => typeof value === "string").join(", "), 60) || undefined,
    description: clip(product.description, 130) || undefined,
  };
}

/**
 * Turn KAI's picks back into real products, in KAI's order. Ids KAI invented
 * (not in the candidate list) are dropped, and each product appears once.
 */
export function applyPhotoMatches(candidates = [], matches = []) {
  const byId = new Map(candidates.filter((product) => product?.id).map((product) => [String(product.id), product]));
  const seen = new Set();
  const results = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    const id = String(match?.id || "");
    const product = byId.get(id);
    if (!product || seen.has(id)) continue;
    seen.add(id);
    results.push({ product, level: match.level === "exact" ? "exact" : "similar", reason: String(match.reason || "") });
  }
  return results;
}
