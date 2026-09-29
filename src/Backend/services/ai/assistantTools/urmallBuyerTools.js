import {
  fetchBuyerDiscoveryOptions,
  fetchBuyerMarketplaceProducts,
  fetchBuyerProductForAssistant,
  fetchBuyerReviews,
  searchMarketplaceStores,
} from "../../marketplace/buyerMarketplaceService";
import { fetchMarketplaceVerticalDiscovery } from "../../marketplace/marketplaceVerticalService";
import { getActiveCountryProfile } from "../../../../data/globalCountryProfiles";
import {
  ASSISTANT_RESULT_LIMIT,
  matchCategory,
  productFactsForAi,
  readBuyerCoordinates,
  resolveBudget,
  reviewFactsForAi,
  sortByDistance,
  verticalFactsForAi,
  verticalPrice,
} from "../urmallAiModels";
import { rankVerticalEntries, verticalEntriesFrom } from "../../marketplace/verticalSearch";

// KAI — UrMall buyer tools.
//
// Each tool calls the SAME service the UrMall screens use, so results obey the
// same country scoping, stock rules and row-level security a shopper sees.
// `result` is what the model reads; `entities` are the real records the chat
// renders as cards (prices on cards come from these, never from model text).

function marketCurrency() {
  return getActiveCountryProfile().currency?.code || "";
}

async function searchProducts(args) {
  const currency = marketCurrency();
  const budget = resolveBudget(args, currency);
  const categories = args.category
    ? (await fetchBuyerDiscoveryOptions().catch(() => ({ categories: [] }))).categories || []
    : [];
  const category = matchCategory(args.category, categories);
  const buyer = readBuyerCoordinates();

  const sort = budget.sortCheapestFirst && args.sort === "relevance"
    ? "price-low"
    : args.sort === "relevance" || args.sort === "nearby"
      ? ""
      : args.sort;

  const data = await fetchBuyerMarketplaceProducts({
    search: args.query,
    category: category || "all",
    delivery: args.delivery === "any" ? "" : args.delivery,
    sort,
    ...(budget.minPrice !== null ? { minPrice: budget.minPrice } : {}),
    ...(budget.maxPrice !== null ? { maxPrice: budget.maxPrice } : {}),
  });

  let products = Array.isArray(data?.newProducts) ? data.newProducts : [];
  if (args.condition !== "any") {
    products = products.filter((product) => String(product.condition || "").toLowerCase() === args.condition);
  }
  // A numeric budget only means something for listings priced in that currency.
  if (budget.apply) {
    products = products.filter((product) => !product.currency || product.currency === currency);
  }
  if (args.sort === "nearby") {
    products = sortByDistance(products, (product) => product.seller, buyer);
  }

  const top = products.slice(0, ASSISTANT_RESULT_LIMIT);

  // A buyer asking for "shawarma" or "a room" may not know it is a meal or a
  // stay rather than a product, so the same words also search meals, hotels
  // and property. They only fill the space products left over.
  const room = Math.max(0, ASSISTANT_RESULT_LIMIT - top.length);
  const verticals = room && !category
    ? await matchingVerticals(args.query, budget, currency).then((entries) => entries.slice(0, Math.max(2, room))).catch(() => [])
    : [];

  return {
    result: {
      marketCurrency: currency,
      totalMatches: products.length,
      ...(category ? { category } : args.category ? { categoryNotFound: args.category } : {}),
      priceFilterApplied: budget.apply,
      ...(budget.mismatch ? { budgetCurrencyMismatch: budget.mismatch } : {}),
      ...(args.sort === "nearby" && !buyer ? { locationUnknown: true } : {}),
      products: top.map((product) => productFactsForAi(product, { buyer })),
      ...(verticals.length
        ? { mealsStaysAndProperty: verticals.map(({ type, item }) => verticalFactsForAi(type, item, { buyer })) }
        : {}),
    },
    entities: { products: top, ...(verticals.length ? { verticals } : {}) },
  };
}

async function matchingVerticals(query, budget, currency) {
  const discovery = await fetchMarketplaceVerticalDiscovery();
  let entries = rankVerticalEntries(verticalEntriesFrom(discovery), query);
  if (budget.apply && budget.maxPrice !== null) {
    entries = entries.filter(({ type, item }) => {
      const price = verticalPrice(type, item);
      return price > 0 && price <= budget.maxPrice && (!item.currency || item.currency === currency);
    });
  }
  return entries;
}

async function searchFoodAndStays(args) {
  const currency = marketCurrency();
  const budget = resolveBudget({ maxPrice: args.maxPrice, budgetCurrency: args.budgetCurrency }, currency);
  const buyer = readBuyerCoordinates();
  const discovery = await fetchMarketplaceVerticalDiscovery();
  const pools = { restaurant: discovery?.restaurants, hotel: discovery?.hotels, property: discovery?.properties };

  // Same typo-tolerant ranking as UrMall's search bar ("sharwama" -> Shawarma).
  let items = rankVerticalEntries((pools[args.type] || []).map((item) => ({ type: args.type, item })), args.query || "")
    .map((entry) => entry.item);

  if (budget.apply && budget.maxPrice !== null) {
    items = items.filter((item) => {
      const price = verticalPrice(args.type, item);
      return price > 0 && price <= budget.maxPrice && (!item.currency || item.currency === currency);
    });
  }
  if (budget.apply || budget.sortCheapestFirst) {
    items = [...items].sort((a, b) => verticalPrice(args.type, a) - verticalPrice(args.type, b));
  }
  if (args.nearby) {
    items = sortByDistance(items, (item) => item, buyer);
  }

  const top = items.slice(0, ASSISTANT_RESULT_LIMIT);
  return {
    result: {
      type: args.type,
      marketCurrency: currency,
      totalMatches: items.length,
      priceFilterApplied: budget.apply,
      ...(budget.mismatch ? { budgetCurrencyMismatch: budget.mismatch } : {}),
      ...(args.nearby && !buyer ? { locationUnknown: true } : {}),
      listings: top.map((item) => verticalFactsForAi(args.type, item, { buyer })),
    },
    entities: { verticals: top.map((item) => ({ type: args.type, item })) },
  };
}

async function getProductDetails(args) {
  const buyer = readBuyerCoordinates();
  const products = (
    await Promise.all(args.productIds.map((id) => fetchBuyerProductForAssistant(id).catch(() => null)))
  ).filter(Boolean);
  return {
    result: {
      found: products.length,
      ...(products.length < args.productIds.length ? { unavailable: args.productIds.length - products.length } : {}),
      products: products.map((product) => productFactsForAi(product, { buyer, detail: true })),
    },
    entities: { products },
  };
}

async function getProductReviews(args) {
  const [product, reviews] = await Promise.all([
    fetchBuyerProductForAssistant(args.productId).catch(() => null),
    fetchBuyerReviews({ productId: args.productId, reviewType: "product" }).catch(() => null),
  ]);
  if (!product) return { result: { error: "This product is no longer available." } };
  return {
    result: { product: product.name, ...reviewFactsForAi(reviews) },
    entities: { products: [product] },
  };
}

async function findStores(args) {
  const stores = await searchMarketplaceStores(args.query, ASSISTANT_RESULT_LIMIT);
  return {
    result: {
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        city: store.city || undefined,
        kind: store.businessKind,
        verified: store.verificationStatus === "verified",
      })),
    },
    entities: { stores },
  };
}

export const URMALL_BUYER_TOOLS = {
  search_products: searchProducts,
  search_food_and_stays: searchFoodAndStays,
  get_product_details: getProductDetails,
  get_product_reviews: getProductReviews,
  find_stores: findStores,
};
