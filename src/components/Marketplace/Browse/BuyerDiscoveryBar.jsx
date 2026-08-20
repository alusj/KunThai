import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Filter, MapPin, Package, Search, SlidersHorizontal, Store, Truck, X } from "lucide-react";
import {
  LOCATION_SCOPE_COUNTRY,
  LOCATION_SCOPE_NEARBY,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { buildSearchSuggestions, MIN_QUERY_LENGTH } from "../../../Backend/services/marketplace/productSearch";
import { addRecentMarketplaceSearch, getRecentMarketplaceSearches } from "../../../Backend/services/marketplace/recentSearchesService";
import { useI18n } from "../../../i18n";

const SORT_OPTIONS = [
  { value: "nearby", labelKey: "urmall.browse.sortNearby" },
  { value: "newest", labelKey: "urmall.browse.sortNewest" },
  { value: "popular", labelKey: "urmall.browse.sortPopular" },
  { value: "price-low", labelKey: "urmall.browse.sortPriceLow" },
  { value: "price-high", labelKey: "urmall.browse.sortPriceHigh" },
  { value: "discount", labelKey: "urmall.browse.sortDiscount" },
];

// Business verticals selectable from the category filter alongside the retail
// product categories.
const VERTICAL_CATEGORIES = [
  { value: "vertical:restaurant", labelKey: "urmall.browse.filterRestaurant" },
  { value: "vertical:property_agent", labelKey: "urmall.browse.filterRealEstate" },
  { value: "vertical:retail", labelKey: "urmall.browse.filterRetail" },
  { value: "vertical:hotel", labelKey: "urmall.browse.filterHotel" },
];

const LOCATION_SCOPES = [
  { value: "", labelKey: "urmall.browse.scopeAll" },
  { value: LOCATION_SCOPE_NEARBY, labelKey: "urmall.browse.scopeNearby" },
  { value: LOCATION_SCOPE_COUNTRY, labelKey: "urmall.browse.scopeCountry" },
];

export default function BuyerDiscoveryBar({
  filters,
  setFilters,
  categories = [],
  locations = [],
  products = [],
  onProductSelect,
  onStoreSelect,
  onClear,
  autoFocus = false,
}) {
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Once the shopper commits to a term (taps "see results"), collapse the
  // suggestion dropdown so the live results below are unobstructed — without
  // clearing the search the way closing the whole panel would.
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => getRecentMarketplaceSearches());

  function getCategoryLabel(category) {
    const match = VERTICAL_CATEGORIES.find((option) => option.value === category);
    return match ? t(match.labelKey) : category;
  }

  function getLocationLabel(location) {
    const match = LOCATION_SCOPES.find((option) => option.value === location);
    return match ? t(match.labelKey) : location;
  }

  const activeFilters = useMemo(
    () => [
      filters.category !== "all" ? getCategoryLabel(filters.category) : "",
      filters.location ? getLocationLabel(filters.location) : "",
      filters.delivery !== "all" ? filters.delivery === "delivery" ? t("urmall.browse.deliveryChip") : t("urmall.browse.pickupChip") : "",
      filters.minPrice ? t("urmall.browse.minLabel", { value: filters.minPrice }) : "",
      filters.maxPrice ? t("urmall.browse.maxLabel", { value: filters.maxPrice }) : "",
      filters.sort !== "nearby" ? t(SORT_OPTIONS.find((option) => option.value === filters.sort)?.labelKey || "") : "",
    ].filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters],
  );

  // Unique seller/store list drawn from the products already loaded for the
  // current query — no extra request needed to power store suggestions.
  const stores = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const seller = product.seller;
      if (seller?.id && seller?.name && !map.has(seller.id)) map.set(seller.id, seller);
    });
    return Array.from(map.values());
  }, [products]);

  // Product-first, typed suggestions. Matching products come first (relevance
  // ranked, typo tolerant), then the verticals/categories and stores that match
  // — each carries a `type` so the UI shows the right icon and select action.
  const searchQuery = filters.search.trim();
  const suggestions = useMemo(() => {
    const verticalCategoryLabels = VERTICAL_CATEGORIES.map((option) => ({ value: option.value, label: t(option.labelKey) }));
    const built = buildSearchSuggestions({
      products,
      categories,
      stores,
      locations,
      rawQuery: searchQuery,
    });
    // Fold in the business-type verticals as category suggestions.
    verticalCategoryLabels.forEach(({ value, label }) => {
      if (label.toLowerCase().includes(searchQuery.toLowerCase()) && !built.some((s) => s.value === value)) {
        built.push({ type: "category", value, label });
      }
    });
    return built.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, categories, locations, products, stores]);

  const hasQuery = searchQuery.length >= MIN_QUERY_LENGTH;
  const showSuggestions = hasQuery && !suggestionsDismissed;
  // Empty-state: recent searches surface the moment the box is focused with no
  // text, and are replaced by live suggestions as soon as the shopper types.
  const showEmptyState = inputFocused && !searchQuery && recentSearches.length > 0;

  function applySuggestion(suggestion) {
    setSuggestionsDismissed(true);
    if (suggestion.type === "product") {
      // A product suggestion opens the product directly — not a category filter.
      if (searchQuery) setRecentSearches(addRecentMarketplaceSearch(searchQuery));
      onProductSelect?.(suggestion.product);
      return;
    }
    if (suggestion.type === "store") {
      onStoreSelect?.(suggestion.store);
      return;
    }
    // Category / location suggestions open that facet.
    setFilters((current) => ({ ...current, search: "", [suggestion.type]: suggestion.value }));
  }

  function commitSearch() {
    setSuggestionsDismissed(true);
    if (searchQuery) setRecentSearches(addRecentMarketplaceSearch(searchQuery));
  }

  function applyRecentSearch(term) {
    setSuggestionsDismissed(false);
    setInputFocused(false);
    setFilters((current) => ({ ...current, search: term }));
  }

  function suggestionIcon(type) {
    if (type === "product") return <Package size={15} className="text-emerald-700" />;
    if (type === "store") return <Store size={15} className="text-gray-500" />;
    if (type === "location") return <MapPin size={15} className="text-gray-400" />;
    return <Filter size={15} className="text-gray-400" />;
  }

  function suggestionTypeLabel(type) {
    if (type === "product") return t("urmall.browse.suggestProduct");
    if (type === "store") return t("urmall.browse.suggestStore");
    if (type === "location") return t("urmall.browse.suggestLocation");
    return t("urmall.browse.suggestCategory");
  }

  function updateField(field, value) {
    if (field === "search") setSuggestionsDismissed(false);
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function renderFilterControls() {
    return (
      <>
      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <Filter size={16} className="text-emerald-700" />
        <select
          value={filters.category}
          onChange={(event) => updateField("category", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          <option value="all">{t("urmall.browse.allCategories")}</option>
          <optgroup label={t("urmall.browse.businessTypesGroup")}>
            {VERTICAL_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </optgroup>
          {categories.length ? (
            <optgroup label={t("urmall.browse.retailCategoriesGroup")}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <MapPin size={16} className="text-emerald-700" />
        <select
          value={filters.location}
          onChange={(event) => updateField("location", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          {LOCATION_SCOPES.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
          {locations.length ? (
            <optgroup label={t("urmall.browse.sellerLocationsGroup")}>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <Truck size={16} className="text-emerald-700" />
        <select
          value={filters.delivery}
          onChange={(event) => updateField("delivery", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          <option value="all">{t("urmall.browse.deliveryOrPickup")}</option>
          <option value="delivery">{t("urmall.browse.deliveryAvailable")}</option>
          <option value="pickup">{t("urmall.browse.pickupAvailable")}</option>
        </select>
      </label>

      <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600">
        <SlidersHorizontal size={16} className="text-emerald-700" />
        <select
          value={filters.sort}
          onChange={(event) => updateField("sort", event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      </>
    );
  }

  return (
    <section className="kt-urmall-search rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <div className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-100 px-3 text-gray-500">
            <Search size={18} />
            <input
              autoFocus={autoFocus}
              value={filters.search}
              onChange={(event) => updateField("search", event.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitSearch();
              }}
              placeholder={t("urmall.browse.searchPlaceholder")}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-500"
            />
          </div>
          {showSuggestions ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={commitSearch}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-left text-sm font-black text-gray-900 hover:bg-gray-50"
              >
                <Search size={15} className="text-emerald-700" />
                <span className="truncate">{t("urmall.browse.seeResultsFor", { query: searchQuery })}</span>
              </button>
              {suggestions.length ? (
                suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySuggestion(suggestion)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    {suggestionIcon(suggestion.type)}
                    <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-gray-500">
                      {suggestionTypeLabel(suggestion.type)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2.5 text-sm font-bold text-gray-500">
                  {t("urmall.browse.noSuggestions", { query: searchQuery })}
                </p>
              )}
            </div>
          ) : showEmptyState ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
              <p className="px-3 pb-1 pt-2.5 text-[10px] font-black uppercase tracking-wide text-gray-400">
                {t("urmall.browse.recentSearches")}
              </p>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyRecentSearch(term)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  <Clock size={15} className="text-gray-400" />
                  <span className="truncate">{term}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white lg:hidden"
        >
          <SlidersHorizontal size={17} />
          {t("urmall.browse.filtersBtn")}
        </button>

        <div className="hidden grid-cols-2 gap-2 sm:grid-cols-4 lg:grid lg:flex-none">
          {renderFilterControls()}
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-2 gap-2 sm:flex sm:items-center lg:flex">
        <input
          value={filters.minPrice}
          onChange={(event) => updateField("minPrice", event.target.value)}
          inputMode="decimal"
          placeholder={t("urmall.browse.minPrice")}
          className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />
        <input
          value={filters.maxPrice}
          onChange={(event) => updateField("maxPrice", event.target.value)}
          inputMode="decimal"
          placeholder={t("urmall.browse.maxPrice")}
          className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={onClear}
          className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-emerald-700 sm:col-span-1"
        >
          <X size={15} />
          {t("urmall.browse.clear")}
        </button>
      </div>

      {activeFilters.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {activeFilters.map((filter) => (
            <span key={filter} className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {filter}
            </span>
          ))}
        </div>
      ) : null}

      {filtersOpen ? createPortal(
        <div className="fixed inset-0 z-[70] overflow-hidden overscroll-none [contain:strict] lg:hidden">
          <button type="button" aria-label={t("urmall.browse.closeFilters")} onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-gray-950/45" />
          <div className="kt-urmall-search absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
                <h3 className="text-lg font-black text-gray-950">{t("urmall.browse.filterProducts")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700"
                aria-label={t("urmall.browse.closeFilters")}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">{renderFilterControls()}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={filters.minPrice}
                onChange={(event) => updateField("minPrice", event.target.value)}
                inputMode="decimal"
                placeholder={t("urmall.browse.minPrice")}
                className="h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />
              <input
                value={filters.maxPrice}
                onChange={(event) => updateField("maxPrice", event.target.value)}
                inputMode="decimal"
                placeholder={t("urmall.browse.maxPrice")}
                className="h-11 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={onClear} className="h-11 rounded-lg border border-gray-200 text-sm font-black text-gray-700">
                {t("urmall.browse.clear")}
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 rounded-lg bg-emerald-600 text-sm font-black text-white">
                {t("urmall.browse.showProducts")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
