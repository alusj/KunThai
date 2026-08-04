// Product-first search engine for UrMall.
//
// This module is intentionally pure (no Supabase, no DOM) so the ranking,
// normalization and typo-tolerance rules can be unit tested and reused by both
// the buyer marketplace service (result ranking + DB recall filter) and the
// discovery bar (typed suggestions). The database performs broad recall; this
// module performs the precise, professional ranking on the returned candidate
// set — an exact product-name match always outranks a mere category match.

// Queries shorter than this are treated as "still typing" and are not scored as
// standalone matches, which stops a stray 1-letter sequence inside an unrelated
// word from surfacing irrelevant products.
export const MIN_QUERY_LENGTH = 2;

// Relevance tiers (higher wins). Kept as named constants so the ranking ladder
// reads the same as the product spec.
export const SCORE = {
  EXACT_NAME: 1000,
  NAME_PREFIX: 820,
  NAME_CONTAINS: 640,
  BRAND_MODEL_EXACT: 560,
  KEYWORDS: 440, // tags / variants / keywords
  CATEGORY: 320, // category + subcategory
  DESCRIPTION: 220, // description + specifications
  STORE: 160, // seller / store name
  TOKEN_HIT: 60, // per-token partial coverage bonus
  FUZZY_TOKEN: 40, // typo-tolerant token match (always below an exact token)
};

const WORD_SPLIT = /\s+/;
const WHITESPACE_RUN = /\s+/g;

// Small, hand-maintained synonym map for the market. Bidirectional expansion so
// "fridge" recalls "refrigerator" and vice versa.
const SYNONYMS = {
  fridge: ["refrigerator"],
  refrigerator: ["fridge"],
  tv: ["television"],
  television: ["tv"],
  laptop: ["notebook"],
  mobile: ["phone"],
  cellphone: ["phone"],
  sneaker: ["trainer"],
  sneakers: ["trainer"],
};

/**
 * Normalize a raw query or field value into a comparable canonical string:
 * lower-cased, hyphen/underscore/slash flattened to spaces, punctuation
 * stripped, and whitespace collapsed. "  I-Phone!! " -> "i phone".
 */
export function normalizeSearchQuery(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    // Keep letters (incl. accented/unicode) and digits; drop everything else.
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Split a normalized string into non-empty tokens. */
export function tokenize(value) {
  const normalized = normalizeSearchQuery(value);
  return normalized ? normalized.split(WORD_SPLIT) : [];
}

// Naive but effective singular/plural folding for English retail terms.
function singularize(token) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Variants of a token used for matching: itself, its singular, and synonyms. */
function expandToken(token) {
  const forms = new Set([token]);
  const singular = singularize(token);
  forms.add(singular);
  (SYNONYMS[token] || []).forEach((syn) => forms.add(syn));
  (SYNONYMS[singular] || []).forEach((syn) => forms.add(syn));
  return Array.from(forms);
}

// Bounded Levenshtein distance — returns a number <= maxDistance or maxDistance+1.
function boundedLevenshtein(a, b, maxDistance) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length];
}

// Typo budget scales with token length: short tokens must match tightly.
function typoBudget(token) {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  return 2;
}

/**
 * Does `token` fuzzily match any whole word inside `haystackTokens`?
 * Exact, prefix (partial word) and bounded-typo matches all count; the caller
 * decides how strongly to reward each. Returns "exact" | "fuzzy" | null.
 */
function matchTokenAgainst(token, haystack, haystackTokens) {
  for (const form of expandToken(token)) {
    if (!form) continue;
    // Partial-word / substring against the whole field (handles "iph" -> iphone).
    if (form.length >= MIN_QUERY_LENGTH && haystack.includes(form)) return "exact";
  }

  const budget = typoBudget(token);
  if (!budget) return null;
  for (const word of haystackTokens) {
    if (Math.abs(word.length - token.length) > budget) continue;
    if (boundedLevenshtein(token, word, budget) <= budget) return "fuzzy";
  }
  return null;
}

function fieldTokens(value) {
  return tokenize(value);
}

// Pull the normalized searchable surfaces out of a mapped buyer product. Works
// with the shape produced by mapBuyerProduct (name, brand, model, category,
// description, details, seller.*), degrading gracefully when fields are absent.
function extractSearchFields(product = {}) {
  const details = product.details || {};
  const keywordParts = [
    details.variants,
    details.tags,
    details.keywords,
    details.color,
    details.material,
    details.size,
    product.condition,
  ]
    .filter(Boolean)
    .join(" ");
  const specParts = [details.specifications, details.dimensions, details.weight, details.warranty]
    .filter(Boolean)
    .join(" ");

  const name = normalizeSearchQuery(product.name);
  const category = normalizeSearchQuery(
    [product.category, product.subcategory].filter(Boolean).join(" "),
  );
  const brandModel = normalizeSearchQuery([product.brand, product.model].filter(Boolean).join(" "));
  const keywords = normalizeSearchQuery(keywordParts);
  const description = normalizeSearchQuery([product.description, specParts].filter(Boolean).join(" "));
  const store = normalizeSearchQuery(product.seller?.name);

  return { name, category, brandModel, keywords, description, store };
}

/**
 * Relevance score for a product against a raw query. Higher is better; 0 means
 * "no relevant match" and the product should be dropped from search results.
 * The ladder mirrors the product spec: exact name > prefix > contains >
 * brand/model > keywords > category > description > store > fuzzy.
 */
export function scoreProduct(product, rawQuery) {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return 0;

  const fields = extractSearchFields(product);
  const tokens = tokenize(query);
  let score = 0;

  // Whole-query tiers against the product name.
  if (fields.name === query) score += SCORE.EXACT_NAME;
  else if (fields.name.startsWith(query)) score += SCORE.NAME_PREFIX;
  else if (fields.name.includes(query)) score += SCORE.NAME_CONTAINS;

  // Brand + model exact / contains.
  if (fields.brandModel && (fields.brandModel === query || fields.brandModel.includes(query))) {
    score += SCORE.BRAND_MODEL_EXACT;
  }

  // Per-token coverage across the remaining fields (partial + typo tolerant).
  const nameTokens = fieldTokens(fields.name);
  const brandTokens = fieldTokens(fields.brandModel);
  const keywordTokens = fieldTokens(fields.keywords);
  const categoryTokens = fieldTokens(fields.category);
  const descriptionTokens = fieldTokens(fields.description);
  const storeTokens = fieldTokens(fields.store);

  let matchedTokens = 0;
  let fuzzyTokens = 0;

  for (const token of tokens) {
    if (token.length < MIN_QUERY_LENGTH) continue;
    let best = 0;
    let fuzzy = false;

    const nameHit = matchTokenAgainst(token, fields.name, nameTokens);
    if (nameHit === "exact") best = Math.max(best, SCORE.NAME_CONTAINS / 2);
    else if (nameHit === "fuzzy") fuzzy = true;

    const brandHit = matchTokenAgainst(token, fields.brandModel, brandTokens);
    if (brandHit === "exact") best = Math.max(best, SCORE.BRAND_MODEL_EXACT / 3);
    else if (brandHit === "fuzzy") fuzzy = true;

    const keywordHit = matchTokenAgainst(token, fields.keywords, keywordTokens);
    if (keywordHit === "exact") best = Math.max(best, SCORE.KEYWORDS / 3);
    else if (keywordHit === "fuzzy") fuzzy = true;

    const categoryHit = matchTokenAgainst(token, fields.category, categoryTokens);
    if (categoryHit === "exact") best = Math.max(best, SCORE.CATEGORY / 3);
    else if (categoryHit === "fuzzy") fuzzy = true;

    const descriptionHit = matchTokenAgainst(token, fields.description, descriptionTokens);
    if (descriptionHit === "exact") best = Math.max(best, SCORE.DESCRIPTION / 3);
    else if (descriptionHit === "fuzzy") fuzzy = true;

    const storeHit = matchTokenAgainst(token, fields.store, storeTokens);
    if (storeHit === "exact") best = Math.max(best, SCORE.STORE / 3);
    else if (storeHit === "fuzzy") fuzzy = true;

    if (best > 0) {
      matchedTokens += 1;
      score += best + SCORE.TOKEN_HIT;
    } else if (fuzzy) {
      fuzzyTokens += 1;
      score += SCORE.FUZZY_TOKEN;
    }
  }

  // A multi-word query that matches every token cleanly is a strong signal.
  if (tokens.length > 1 && matchedTokens === tokens.length) {
    score += SCORE.TOKEN_HIT * tokens.length;
  }

  // If nothing at all matched (not even fuzzily), the product is not a result.
  if (matchedTokens === 0 && fuzzyTokens === 0 && score === 0) return 0;

  // Tiny popularity tie-breaker — never enough to jump a relevance tier.
  const popularity = Number(product.sales || 0) + Number(product.views || 0);
  const rating = Number(product.rating || 0);
  score += Math.min(popularity, 40) * 0.1 + rating * 0.5;

  return score;
}

/**
 * Rank and filter a candidate product list against a raw query. When the query
 * is empty the list is returned unchanged (caller applies its own sort). When a
 * query is present, non-matching products are removed and the rest are ordered
 * by relevance, then popularity, then recency.
 */
export function rankSearchResults(products = [], rawQuery = "") {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return [...products];

  return products
    .map((product) => ({ product, score: scoreProduct(product, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const popA = Number(a.product.sales || 0) + Number(a.product.views || 0);
      const popB = Number(b.product.sales || 0) + Number(b.product.views || 0);
      if (popB !== popA) return popB - popA;
      return new Date(b.product.createdAt || 0).getTime() - new Date(a.product.createdAt || 0).getTime();
    })
    .map((entry) => entry.product);
}

// ---------------------------------------------------------------------------
// Database recall filter (PostgREST `.or()` builder)
// ---------------------------------------------------------------------------

// Fields searched directly on the marketplace_products row. Normalization has
// already stripped commas/parentheses/quotes from tokens, so interpolating them
// into the PostgREST or-filter is safe (no raw SQL, no injection surface).
const RECALL_FIELDS = ["name", "description", "category", "brand", "model", "location"];

function ilikeClauses(value) {
  return RECALL_FIELDS.map((field) => `${field}.ilike.*${value}*`);
}

/**
 * Build a PostgREST or-filter string for broad candidate recall. Each query
 * token must appear (as a substring) in at least one searchable field — plus
 * the full phrase, so exact multi-word titles are always recalled. Returns ""
 * when the query is too short to search.
 */
export function buildProductRecallFilter(rawQuery) {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return "";

  const clauses = new Set(ilikeClauses(query));
  tokenize(query).forEach((token) => {
    if (token.length >= MIN_QUERY_LENGTH) ilikeClauses(token).forEach((clause) => clauses.add(clause));
  });
  return Array.from(clauses).join(",");
}

/**
 * A deliberately looser recall filter used only when the strict filter returns
 * nothing — recalls typo/partial candidates by matching a short prefix of the
 * longest query token (e.g. "samsng" -> "sam" recalls Samsung) which are then
 * fuzzily re-ranked. Avoids downloading the whole catalogue for typo tolerance.
 */
export function buildRelaxedRecallFilter(rawQuery) {
  const tokens = tokenize(rawQuery).filter((token) => token.length >= 4);
  if (!tokens.length) return "";

  const longest = tokens.sort((a, b) => b.length - a.length)[0];
  const prefix = longest.slice(0, 3);
  if (prefix.length < 3) return "";
  return ilikeClauses(prefix).join(",");
}

// ---------------------------------------------------------------------------
// Typed suggestions for the discovery bar
// ---------------------------------------------------------------------------

/**
 * Build a professional, product-first suggestion list that clearly separates
 * result types. Products come first (ranked), then matching categories, then
 * stores, then seller locations. Each suggestion carries a `type` so the UI can
 * render the correct icon and route the correct action on select.
 */
export function buildSearchSuggestions({
  products = [],
  categories = [],
  stores = [],
  locations = [],
  rawQuery = "",
  limit = 8,
} = {}) {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) return [];

  const suggestions = [];
  const seen = new Set();
  function push(suggestion) {
    const key = `${suggestion.type}:${String(suggestion.value).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(suggestion);
  }

  // 1. Products — the primary result type.
  rankSearchResults(products, rawQuery)
    .slice(0, 5)
    .forEach((product) =>
      push({ type: "product", value: product.id, label: product.name, product }),
    );

  // 2. Categories — supporting results.
  categories.forEach((category) => {
    if (normalizeSearchQuery(category).includes(query)) {
      push({ type: "category", value: category, label: String(category) });
    }
  });

  // 3. Stores / sellers.
  stores.forEach((store) => {
    const name = typeof store === "string" ? store : store?.name;
    const id = typeof store === "string" ? store : store?.id || name;
    if (name && normalizeSearchQuery(name).includes(query)) {
      push({ type: "store", value: id, label: name, store });
    }
  });

  // 4. Seller locations.
  locations.forEach((location) => {
    if (normalizeSearchQuery(location).includes(query)) {
      push({ type: "location", value: location, label: String(location) });
    }
  });

  return suggestions.slice(0, limit);
}
