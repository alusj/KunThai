import { haversineKm } from "../../utils/distance.js";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function productCoordinates(product = {}) {
  const rawLatitude = product.seller?.latitude;
  const rawLongitude = product.seller?.longitude;
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === "" || rawLongitude === null || rawLongitude === undefined || rawLongitude === "") return null;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function productCountry(product = {}) {
  return normalizeText(product.countryCode || product.seller?.countryCode || product.country || product.seller?.country);
}

function productCity(product = {}) {
  return normalizeText(product.seller?.city || product.location);
}

function freshnessTime(product = {}) {
  const value = new Date(product.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function qualityScore(product = {}) {
  return (
    Number(product.stock > 0) * 1000 +
    Number(product.rating || 0) * 20 +
    Math.log1p(Number(product.sales || 0)) * 8 +
    Math.log1p(Number(product.views || 0))
  );
}

function proximityBand({ buyerHasCoordinates, distance, sameCity, sameCountry }) {
  if (buyerHasCoordinates) {
    if (distance !== null && distance <= 50) return 0;
    if (sameCity) return 1;
    if (distance !== null) return 2;
    if (sameCountry) return 3;
    return 4;
  }

  if (sameCity) return 0;
  if (sameCountry) return 1;
  return 2;
}

// Location is the leading signal, but unknown coordinates never make the
// catalogue disappear. City/country, availability, quality and freshness form
// progressively weaker fallbacks.
export function rankMarketplaceProductsNearby(products = [], buyerContext = {}) {
  const buyerCoordinates = buyerContext.latitude != null && buyerContext.longitude != null
    ? { latitude: Number(buyerContext.latitude), longitude: Number(buyerContext.longitude) }
    : null;
  const buyerHasCoordinates = Boolean(
    buyerCoordinates && Number.isFinite(buyerCoordinates.latitude) && Number.isFinite(buyerCoordinates.longitude),
  );
  const buyerCity = normalizeText(buyerContext.city);
  const buyerCountry = normalizeText(buyerContext.countryCode || buyerContext.country);

  return products
    .map((product, originalIndex) => {
      const sellerCoordinates = productCoordinates(product);
      const distance = buyerHasCoordinates && sellerCoordinates
        ? haversineKm(buyerCoordinates, sellerCoordinates)
        : null;
      const sellerCity = productCity(product);
      const sellerCountry = productCountry(product);
      const sameCity = Boolean(buyerCity && sellerCity && (sellerCity === buyerCity || sellerCity.includes(buyerCity) || buyerCity.includes(sellerCity)));
      const sameCountry = Boolean(buyerCountry && sellerCountry && sellerCountry === buyerCountry);

      return {
        product: distance === null ? product : { ...product, distanceKm: distance },
        originalIndex,
        distance,
        band: proximityBand({ buyerHasCoordinates, distance, sameCity, sameCountry }),
      };
    })
    .sort((a, b) => (
      a.band - b.band ||
      (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY) ||
      qualityScore(b.product) - qualityScore(a.product) ||
      freshnessTime(b.product) - freshnessTime(a.product) ||
      a.originalIndex - b.originalIndex
    ))
    .map((entry) => entry.product);
}

function searchableTokens(product = {}) {
  const details = product.details && typeof product.details === "object"
    ? Object.values(product.details).join(" ")
    : "";
  return new Set(
    normalizeText([
      product.name,
      product.category,
      product.brand,
      product.model,
      product.description,
      details,
    ].join(" "))
      .split(" ")
      .filter((token) => token.length >= 3),
  );
}

function priceSimilarityScore(product, candidate) {
  const price = Number(product.discountPrice || product.price || 0);
  const candidatePrice = Number(candidate.discountPrice || candidate.price || 0);
  if (!(price > 0) || !(candidatePrice > 0)) return 0;
  const ratio = Math.abs(price - candidatePrice) / Math.max(price, candidatePrice);
  if (ratio <= 0.2) return 18;
  if (ratio <= 0.5) return 10;
  if (ratio <= 0.75) return 4;
  return 0;
}

function relatedProductScore(product, candidate, sourceTokens) {
  const category = normalizeText(product.category);
  const candidateCategory = normalizeText(candidate.category);
  const brand = normalizeText(product.brand);
  const candidateBrand = normalizeText(candidate.brand);
  const model = normalizeText(product.model);
  const candidateModel = normalizeText(candidate.model);
  const subcategory = normalizeText(product.details?.subcategory || product.details?.subCategory);
  const candidateSubcategory = normalizeText(candidate.details?.subcategory || candidate.details?.subCategory);
  const candidateTokens = searchableTokens(candidate);
  let sharedTokens = 0;
  sourceTokens.forEach((token) => {
    if (candidateTokens.has(token)) sharedTokens += 1;
  });

  let score = 0;
  if (category && candidateCategory === category) score += 60;
  else if (category && candidateCategory && (candidateCategory.includes(category) || category.includes(candidateCategory))) score += 35;
  if (subcategory && candidateSubcategory === subcategory) score += 28;
  if (brand && candidateBrand === brand) score += 24;
  if (model && candidateModel === model) score += 14;
  score += Math.min(sharedTokens, 8) * 4;
  score += priceSimilarityScore(product, candidate);
  if (candidate.stock > 0) score += 8;
  if (candidate.seller?.id && candidate.seller.id !== product.seller?.id) score += 6;
  if (candidate.distanceKm != null) {
    if (candidate.distanceKm <= 10) score += 16;
    else if (candidate.distanceKm <= 50) score += 9;
    else if (candidate.distanceKm <= 100) score += 3;
  }
  if (productCountry(product) && productCountry(product) === productCountry(candidate)) score += 5;
  return score;
}

// Produces a useful fallback even when the catalogue is sparse, while limiting
// repeated products from one seller so recommendations remain varied.
export function rankSimilarMarketplaceProducts(product, candidates = [], limit = 8) {
  if (!product?.id || limit <= 0) return [];
  const sourceTokens = searchableTokens(product);
  const ranked = candidates
    .filter((candidate) => candidate?.id && candidate.id !== product.id && candidate.stock > 0)
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      score: relatedProductScore(product, candidate, sourceTokens),
    }))
    .sort((a, b) => (
      b.score - a.score ||
      (a.candidate.distanceKm ?? Number.POSITIVE_INFINITY) - (b.candidate.distanceKm ?? Number.POSITIVE_INFINITY) ||
      qualityScore(b.candidate) - qualityScore(a.candidate) ||
      freshnessTime(b.candidate) - freshnessTime(a.candidate) ||
      a.originalIndex - b.originalIndex
    ));

  const selected = [];
  const overflow = [];
  const sellerCounts = new Map();
  ranked.forEach((entry) => {
    const sellerId = entry.candidate.seller?.id || `product:${entry.candidate.id}`;
    const count = sellerCounts.get(sellerId) || 0;
    if (count < 2) {
      selected.push(entry.candidate);
      sellerCounts.set(sellerId, count + 1);
    } else {
      overflow.push(entry.candidate);
    }
  });

  return [...selected, ...overflow].slice(0, limit);
}
