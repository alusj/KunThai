// UrMall photo search — pure helpers.
//
// Flow: KAI identifies the photographed product (urmall.image_identify) and
// returns search words; those words run through the SAME ranking as typed
// search over the loaded catalogue; KAI then ranks only those real listings
// (urmall.image_match). Nothing here talks to the network.

import { moneyLabel } from "../ai/urmallAiModels.js";
import { rankSearchResults } from "./productSearch.js";

export const PHOTO_CANDIDATE_LIMIT = 16;

function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Real listings worth showing KAI. Each search word ranks the catalogue with
 * the typed-search scorer; earlier (more specific) words and higher positions
 * count more, so an exact model beats a generic category hit.
 */
export function photoSearchCandidates(products = [], terms = [], limit = PHOTO_CANDIDATE_LIMIT) {
  const words = (Array.isArray(terms) ? terms : []).map((term) => String(term || "").trim()).filter(Boolean);
  const scores = new Map();
  const byId = new Map();
  words.forEach((term, termIndex) => {
    const termWeight = words.length - termIndex;
    rankSearchResults(products, term).slice(0, 40).forEach((product, position) => {
      if (!product?.id) return;
      byId.set(product.id, product);
      scores.set(product.id, (scores.get(product.id) || 0) + termWeight * (40 - position));
    });
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id));
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
    description: clip(product.description, 140) || undefined,
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
