// KAI — which registration fields apply to which UrMall business kind.
//
// One pure module (no imports) shared by the browser (the registration screen's
// KAI field list and value filtering) and the server (the assistant strips
// values the model proposes for fields that do not apply). Keeping both sides
// on the same table means "a restaurant never gets categories" is enforced in
// code twice, not just asked for in a prompt.
//
// Kinds (see URMALL_BUSINESS_KINDS in sellerRegistrationService.js):
//   retail          a shop or store            categories, delivery/pickup
//   vendor          a supplier / wholesaler    categories, delivery/pickup, vendor fields
//   restaurant      food and meals             delivery/pickup only
//   property_agent  real estate                none of the above
//   hotel           retired kind, kept for old businesses; treated like real estate

export const REGISTRATION_SCREEN_ID = "urmall-business-registration";

export const BUSINESS_KIND_IDS = Object.freeze(["retail", "vendor", "restaurant", "property_agent"]);
const KNOWN_KINDS = new Set([...BUSINESS_KIND_IDS, "hotel"]);

export const BUSINESS_KIND_LABELS = Object.freeze({
  retail: "Retail Store",
  vendor: "Vendor / Supplier",
  restaurant: "Restaurant",
  property_agent: "Real Estate Agent",
  hotel: "Hotel",
});

export const CATEGORY_FIELD_KEYS = Object.freeze(["identity.categories", "identity.otherCategory"]);
export const VENDOR_FIELD_KEYS = Object.freeze([
  "operations.vendorType",
  "operations.salesModel",
  "operations.defaultSellingUnit",
  "operations.defaultMinOrderQuantity",
  "operations.leadTimeDays",
  "operations.serviceAreas",
  "operations.quotationEnabled",
]);
export const FULFILLMENT_FIELD_KEYS = Object.freeze(["operations.deliveryEnabled", "operations.pickupEnabled"]);
export const BUSINESS_KIND_FIELD_KEY = "identity.businessKind";

export function kindUsesCategories(kind) {
  return kind === "retail" || kind === "vendor";
}

export function kindIsVendor(kind) {
  return kind === "vendor";
}

export function kindHasFulfillment(kind) {
  return kind === "retail" || kind === "vendor" || kind === "restaurant";
}

// --- recognising the kind ------------------------------------------------------

// Exact ids and the labels the form shows.
const EXACT = new Map([
  ["retail", "retail"],
  ["retail store", "retail"],
  ["vendor", "vendor"],
  ["vendor / supplier", "vendor"],
  ["vendor/supplier", "vendor"],
  ["supplier", "vendor"],
  ["restaurant", "restaurant"],
  ["property_agent", "property_agent"],
  ["property agent", "property_agent"],
  ["real estate", "property_agent"],
  ["real estate agent", "property_agent"],
  ["real_estate", "property_agent"],
  ["hotel", "hotel"],
]);

// Natural phrasing, a few major languages each. Latin-script words match on
// word boundaries; other scripts match as substrings.
const KIND_WORDS = {
  property_agent: [
    "real estate", "realtor", "realty", "estate agent", "estate agency", "property", "properties", "rent out", "renting out",
    "rent houses", "rent apartments", "rentals", "rental", "letting", "landlord", "apartment", "apartments", "flats", "land",
    "plots", "houses for", "homes for", "houses to rent", "hotel", "hotels", "lodge", "guest house", "guesthouse",
    "airbnb", "immobilier", "immobilière", "agence immobilière", "inmobiliaria", "bienes raíces", "imobiliária", "imóveis",
    "immobilien", "makler", "properti", "sewa rumah", "kontrakan",
    "房地产", "租房", "地产", "عقارات", "عقار", "प्रॉपर्टी", "रियल एस्टेट", "किराए", "недвижимост", "аренда", "不動産", "賃貸", "bất động sản",
  ],
  restaurant: [
    "restaurant", "restaurants", "food", "foods", "meal", "meals", "cook", "cooking", "kitchen", "cafe", "café", "eatery",
    "canteen", "chop bar", "catering", "caterer", "takeaway", "take-away", "fast food", "grill", "cuisine", "dishes", "menu",
    "diner", "bistro", "pizzeria", "buka", "mama put", "street food", "nourriture", "repas", "cuisine", "comida", "comidas",
    "restaurante", "refeições", "makanan", "warung", "rumah makan", "essen", "gaststätte", "imbiss",
    "餐厅", "饭店", "餐馆", "美食", "مطعم", "طعام", "रेस्टोरेंट", "खाना", "भोजन", "ресторан", "еда", "кафе", "レストラン", "飲食", "食堂", "nhà hàng", "quán ăn",
  ],
  vendor: [
    "wholesale", "wholesaler", "wholesalers", "supplier", "suppliers", "supply", "supplies", "distributor", "distribution",
    "distribute", "manufacturer", "manufacturing", "manufacture", "factory", "importer", "importing", "import", "bulk", "b2b",
    "fournisseur", "grossiste", "en gros", "mayorista", "proveedor", "al por mayor", "fornecedor", "atacado", "atacadista",
    "grosir", "pemasok", "distributor", "großhandel", "lieferant", "hersteller",
    "批发", "供应商", "厂家", "جملة", "مورد", "थोक", "आपूर्तिकर्ता", "опт", "поставщик", "卸", "仕入", "bán sỉ", "nhà cung cấp",
  ],
  retail: [
    "shop", "shops", "store", "stores", "boutique", "retail", "retailer", "kiosk", "supermarket", "minimart", "mini mart",
    "pharmacy", "outlet", "market stall", "stall", "magasin", "boutique", "tienda", "loja", "toko", "kedai", "laden", "geschäft",
    "商店", "店铺", "متجر", "محل", "दुकान", "магазин", "ショップ", "お店", "cửa hàng",
  ],
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LATIN = /^[\p{Script=Latin}\p{N}\s/'’&-]+$/u;
const MATCHERS = Object.fromEntries(Object.entries(KIND_WORDS).map(([kind, words]) => [
  kind,
  Array.from(new Set(words)).map((word) => (LATIN.test(word)
    ? { word, test: new RegExp(`(^|[^\\p{L}])${escapeRegExp(word)}($|[^\\p{L}])`, "iu") }
    : { word, test: { test: (text) => text.includes(word) } })),
]));

/** An id, a form label, or "" — for values that are already a kind. */
export function normalizeBusinessKind(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (KNOWN_KINDS.has(text)) return text;
  return EXACT.get(text) || "";
}

/**
 * Read what kind of business the person described.
 * Returns { kind, confident }: `kind` is "" when nothing matched or two kinds
 * tie; `confident` is false when another kind also matched, so the caller
 * confirms with the person instead of guessing.
 */
export function inferBusinessKind(value) {
  const exact = normalizeBusinessKind(value);
  if (exact) return { kind: exact, confident: true };

  const text = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return { kind: "", confident: false };

  const scores = Object.entries(MATCHERS)
    .map(([kind, matchers]) => [kind, matchers.reduce((sum, matcher) => sum + (matcher.test.test(text) ? 1 : 0), 0)])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!scores.length) return { kind: "", confident: false };
  // "I sell food wholesale": the more specific signal wins (supplier over food,
  // real estate over "for sale"), but the match is reported as unsure.
  if (scores.length > 1 && scores[0][1] === scores[1][1]) {
    const priority = ["vendor", "property_agent", "restaurant", "retail"];
    const tied = scores.filter(([, score]) => score === scores[0][1]).map(([kind]) => kind);
    return { kind: priority.find((kind) => tied.includes(kind)) || "", confident: false };
  }
  return { kind: scores[0][0], confident: scores.length === 1 };
}

// --- which fields apply --------------------------------------------------------

/**
 * Whether a registration field applies to this kind. Until the kind is
 * confirmed, no kind-specific field applies: KAI asks for the kind first.
 */
export function isFieldAllowedForKind(key, kind, { confirmed = true } = {}) {
  const field = String(key || "");
  const known = KNOWN_KINDS.has(kind);
  if (CATEGORY_FIELD_KEYS.includes(field)) return confirmed && known && kindUsesCategories(kind);
  if (VENDOR_FIELD_KEYS.includes(field)) return confirmed && known && kindIsVendor(kind);
  if (FULFILLMENT_FIELD_KEYS.includes(field)) return confirmed && known && kindHasFulfillment(kind);
  return true;
}

/** Keep only the fields (objects with a `key`) that apply to this kind. */
export function filterFieldsForKind(fields, kind, options) {
  return (Array.isArray(fields) ? fields : []).filter((field) => isFieldAllowedForKind(field?.key, kind, options));
}

/**
 * Filter proposed values ([{ key, value }]) for a registration form.
 *
 * A businessKind among the values is resolved first and becomes the kind the
 * rest are checked against (choosing the kind confirms it). Returns
 * { kind, confirmed, kept, dropped }.
 */
export function sanitizeRegistrationValues(values, { kind = "", confirmed = false } = {}) {
  const list = Array.isArray(values) ? values : [];
  let effectiveKind = normalizeBusinessKind(kind);
  let effectiveConfirmed = Boolean(confirmed) && Boolean(effectiveKind);

  const kindEntry = list.find((item) => item?.key === BUSINESS_KIND_FIELD_KEY);
  if (kindEntry) {
    const proposed = inferBusinessKind(kindEntry.value);
    if (proposed.kind && proposed.confident) {
      effectiveKind = proposed.kind;
      effectiveConfirmed = true;
    }
  }

  const kept = [];
  const dropped = [];
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    if (isFieldAllowedForKind(item.key, effectiveKind, { confirmed: effectiveConfirmed })) kept.push(item);
    else dropped.push(item);
  });
  return { kind: effectiveKind, confirmed: effectiveConfirmed, kept, dropped };
}
