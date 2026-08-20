import { getActiveCountryProfile } from "../../data/globalCountryProfiles";

const preloadedScopes = new Set();
const preloadPromises = new Map();

const MARKETPLACE_DEFAULT_FILTERS = {
  search: "",
  category: "all",
  location: "",
  delivery: "all",
  sort: "nearby",
  minPrice: "",
  maxPrice: "",
};

function marketplaceCatalogKey(filters) {
  return JSON.stringify(
    Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {}),
  );
}

function mergeFreshPosts(freshPosts, storedPosts) {
  const merged = new Map();
  [...freshPosts, ...storedPosts].forEach((post) => {
    if (post?.id && !merged.has(post.id)) merged.set(post.id, post);
  });
  return Array.from(merged.values());
}

async function preloadExploreDashboard() {
  const [{ fetchRecommendedExplorePosts }, { readStoredPosts, writeStoredPosts }] = await Promise.all([
    import("./explore/recommendationService"),
    import("./explore/cacheService"),
  ]);
  const freshPosts = await fetchRecommendedExplorePosts("feed", { limit: 24, offset: 0 });
  if (freshPosts.length) {
    writeStoredPosts("feed", mergeFreshPosts(freshPosts, readStoredPosts("feed")));
  }
}

async function preloadMarketplaceDashboard() {
  const [{ fetchBuyerMarketplaceProducts }, { writeBrowseCatalogSnapshot }] = await Promise.all([
    import("./marketplace/buyerMarketplaceService"),
    import("./marketplace/browseCatalogCache"),
  ]);
  const catalog = await fetchBuyerMarketplaceProducts(MARKETPLACE_DEFAULT_FILTERS);
  writeBrowseCatalogSnapshot(marketplaceCatalogKey(MARKETPLACE_DEFAULT_FILTERS), catalog);
}

async function preloadTransportDashboard(userId) {
  const [
    { fetchTransportFleets },
    { fetchActiveTripCount, fetchSavedOperatorCount },
    { writeTransportDashboardSnapshot },
  ] = await Promise.all([
    import("../../components/services/transportFleetService"),
    import("../../components/services/passengerTransportService"),
    import("../../components/services/transportDashboardCacheService"),
  ]);
  const [fleets, activeTripsCount, savedOperatorsCount] = await Promise.all([
    fetchTransportFleets({ mode: "topRated", fleetType: null, includeOffline: false }),
    fetchActiveTripCount(),
    fetchSavedOperatorCount(),
  ]);
  const countryIso = getActiveCountryProfile().iso2 || "";
  writeTransportDashboardSnapshot(
    { userId, countryIso },
    {
      summary: {
        topRatedCount: fleets.length,
        activeTripsCount,
        savedOperatorsCount,
      },
      operators: fleets.slice(0, 6),
    },
  );
}

/**
 * Warm the safe, read-only first-screen data for one inactive main dashboard.
 * This never mounts the screen, opens subscriptions, or requests GPS.
 */
export function preloadMainDashboardData(page, { userId = "" } = {}) {
  const scopeKey = `${page}:${userId || "guest"}`;
  if (preloadedScopes.has(scopeKey)) return Promise.resolve();
  if (preloadPromises.has(scopeKey)) return preloadPromises.get(scopeKey);

  const task = (async () => {
    if (page === "explore") await preloadExploreDashboard();
    if (page === "marketplace") await preloadMarketplaceDashboard();
    if (page === "transport") await preloadTransportDashboard(userId);
    preloadedScopes.add(scopeKey);
  })().finally(() => preloadPromises.delete(scopeKey));

  preloadPromises.set(scopeKey, task);
  return task;
}
