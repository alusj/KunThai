import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Clock, Package, Search, Store, Tag, UtensilsCrossed, X } from "lucide-react";

import {
  fetchBuyerDiscoveryOptions,
  fetchBuyerMarketplaceProducts,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { fetchMarketplaceVerticalDiscovery } from "../../../Backend/services/marketplace/marketplaceVerticalService";
import { MIN_QUERY_LENGTH, normalizeSearchQuery, rankSearchResults } from "../../../Backend/services/marketplace/productSearch";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import {
  addRecentMarketplaceSearch,
  clearRecentMarketplaceSearches,
  getRecentMarketplaceSearches,
} from "../../../Backend/services/marketplace/recentSearchesService";
import { detectPublicCodeKind, openPublicCodeResult } from "../../../Backend/services/publicCodeService";
import { usePublicCodeLookup } from "../../../Backend/hooks/usePublicCodeLookup";
import PublicCodeResultCard from "../../shared/PublicCodeResultCard";
import { useI18n } from "../../../i18n";

const EMPTY_VERTICAL = { restaurants: [], hotels: [], properties: [] };

// ---- Vertical (restaurant / hotel / property) helpers -------------------
function verticalName(type, item) {
  if (type === "restaurant") return item.name || item.businessName || "";
  if (type === "property") return item.title || item.businessName || "";
  return item.businessName || "";
}
function verticalImage(type, item) {
  if (type === "restaurant") return item.image_url || (item.image_urls || [])[0] || "";
  if (type === "property") return (item.image_urls || [])[0] || "";
  return (item.images || [])[0] || "";
}
function verticalAddress(type, item) {
  if (type === "hotel") return [item.city, item.country].filter(Boolean).join(", ");
  return [item.address, item.city, item.country].filter(Boolean).join(", ");
}
function verticalText(type, item) {
  if (type === "restaurant") return [item.name, item.description, item.businessName, item.meal_period].filter(Boolean).join(" ");
  if (type === "property") return [item.title, item.description, item.address, item.businessName, item.purpose].filter(Boolean).join(" ");
  return [item.businessName, item.description, item.city].filter(Boolean).join(" ");
}

export default function MarketplaceSearchOverlay({
  open,
  onClose,
  onOpenProduct,
  onOpenSeller,
  onOpenVertical,
  onApplySearch,
  activeCategory = "all",
  onBrowseCategory,
}) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [vertical, setVertical] = useState(EMPTY_VERTICAL);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [retailCategories, setRetailCategories] = useState([]);
  const [recent, setRecent] = useState(() => getRecentMarketplaceSearches());
  const codeLookup = usePublicCodeLookup(open ? query : "");

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH;
  const q = normalizeSearchQuery(trimmed);

  // Everything is loaded once when the overlay opens and filtered on the client,
  // so results appear instantly as the shopper types — retail, meals, hotels and
  // property all behave the same.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setRecent(getRecentMarketplaceSearches());
    setCatalogLoading(true);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);

    Promise.all([
      fetchBuyerMarketplaceProducts({}).then((r) => r.newProducts).catch(() => []),
      fetchMarketplaceVerticalDiscovery().then((r) => r || EMPTY_VERTICAL).catch(() => EMPTY_VERTICAL),
      fetchBuyerDiscoveryOptions().then((r) => r.categories || []).catch(() => []),
    ]).then(([products, verticalData, categories]) => {
      if (!alive) return;
      setAllProducts(products);
      setVertical(verticalData);
      setRetailCategories(categories);
      setCatalogLoading(false);
    });

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open]);

  const verticalEntries = useMemo(
    () => [
      ...(vertical.restaurants || []).map((item) => ({ type: "restaurant", item })),
      ...(vertical.hotels || []).map((item) => ({ type: "hotel", item })),
      ...(vertical.properties || []).map((item) => ({ type: "property", item })),
    ],
    [vertical],
  );

  function toRetailRow(product) {
    return {
      key: `retail-${product.id}`,
      kind: "retail",
      product,
      name: product.name,
      address: product.location || "",
      tag: product.category || t("urmall.search.filterRetail"),
      image: product.imageUrl,
    };
  }
  function toVerticalRow(entry) {
    const { type, item } = entry;
    return {
      key: `${type}-${item.id}`,
      kind: "vertical",
      type,
      item,
      name: verticalName(type, item),
      address: verticalAddress(type, item),
      tag: t(`urmall.search.type_${type}`),
      image: verticalImage(type, item),
    };
  }

  // Typed-query results only: a ranked search across retail products + meals,
  // hotels and property. Category chips do not filter here — they reorder the
  // dashboard behind the overlay (see onBrowseCategory).
  const rows = useMemo(() => {
    if (!hasQuery) return [];
    const retail = rankSearchResults(allProducts, trimmed).map(toRetailRow);
    const listings = verticalEntries
      .filter((entry) => normalizeSearchQuery(`${verticalText(entry.type, entry.item)} ${verticalAddress(entry.type, entry.item)}`).includes(q))
      .map(toVerticalRow);
    return [...retail, ...listings];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, verticalEntries, trimmed, q, hasQuery]);

  const stores = useMemo(() => {
    if (!hasQuery) return [];
    const map = new Map();
    allProducts.forEach((product) => {
      const seller = product.seller;
      if (seller?.id && seller?.name && !map.has(seller.id)) {
        map.set(seller.id, { id: seller.id, name: seller.name, logoUrl: seller.logoUrl, city: seller.city, country: seller.country });
      }
    });
    verticalEntries.forEach(({ item }) => {
      if (item.businessId && item.businessName && !map.has(item.businessId)) {
        map.set(item.businessId, { id: item.businessId, name: item.businessName, logoUrl: item.logoUrl, city: item.city, country: item.country });
      }
    });
    return Array.from(map.values())
      .filter((store) => normalizeSearchQuery(store.name).includes(q))
      .slice(0, 4);
  }, [allProducts, verticalEntries, q, hasQuery]);

  const categoryMatches = useMemo(() => {
    if (!hasQuery) return [];
    return retailCategories.filter((category) => normalizeSearchQuery(category).includes(q)).slice(0, 6);
  }, [retailCategories, q, hasQuery]);

  // Only the business verticals that actually have live inventory, so the filter
  // never lists an empty category.
  const filterOptions = useMemo(() => {
    const options = [{ id: "all", label: t("urmall.search.filterAll") }];
    if (allProducts.length) options.push({ id: "retail", label: t("urmall.search.filterRetail") });
    if ((vertical.restaurants || []).length) options.push({ id: "restaurant", label: t("urmall.search.filterRestaurant") });
    if ((vertical.properties || []).length) options.push({ id: "property", label: t("urmall.search.filterProperty") });
    if ((vertical.hotels || []).length) options.push({ id: "hotel", label: t("urmall.search.filterHotel") });
    return options;
  }, [allProducts.length, vertical, t]);
  const activeFilterLabel = filterOptions.find((option) => option.id === activeCategory)?.label || t("urmall.search.filterAll");

  const showCode = Boolean(detectPublicCodeKind(trimmed)) && codeLookup.kind;
  const hasResults = rows.length || stores.length || categoryMatches.length || showCode;

  if (!open) return null;

  function close() {
    setQuery("");
    setFilterOpen(false);
    onClose?.();
  }
  function remember(term) {
    if (term && term.trim()) setRecent(addRecentMarketplaceSearch(term));
  }
  function pickResult(row) {
    remember(trimmed || row.name);
    if (row.kind === "vertical") onOpenVertical?.(row.type, row.item);
    else onOpenProduct?.(row.product);
    close();
  }
  function pickStore(store) {
    remember(trimmed || store.name);
    onOpenSeller?.({ id: store.id, name: store.name, logoUrl: store.logoUrl, city: store.city });
    close();
  }
  function pickSearchCategory(category) {
    remember(category);
    onApplySearch?.({ category });
    close();
  }
  // Category chip / dropdown → reorder the dashboard behind and close.
  function pickBrowseCategory(categoryId) {
    setQuery("");
    setFilterOpen(false);
    onBrowseCategory?.(categoryId);
  }
  function submitText(term = trimmed) {
    if (term.trim().length < MIN_QUERY_LENGTH) return;
    remember(term);
    onApplySearch?.({ search: term.trim() });
    close();
  }

  return createPortal(
    <>
      {/* Clear (unblurred) backdrop so the catalogue behind stays fully visible. */}
      <button type="button" aria-label={t("urmall.search.close")} onClick={close} className="fixed inset-0 z-[1190] cursor-default bg-slate-950/5" />

      {/* No overflow-hidden here, so the filter dropdown is never clipped. */}
      <div className="kt-urmall-search fixed inset-x-2 top-2 z-[1200] rounded-[24px] border border-gray-200 bg-white shadow-2xl sm:inset-x-5">
        <div className="flex items-center gap-2 p-2">
          <div className="relative flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-gray-100 px-3 text-gray-500">
            <Search className="flex-none text-gray-400" size={18} strokeWidth={2.25} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (rows[0]) pickResult(rows[0]);
                  else submitText();
                }
                if (event.key === "Escape") close();
              }}
              placeholder={t("urmall.search.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400"
            />
            {/* Dropdown-arrow (replaces the inner clear X): pick a category to
                browse it in the dashboard — Retail, Restaurant, Real Estate, Hotel. */}
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              aria-label={t("urmall.search.filterMenu")}
              aria-expanded={filterOpen}
              className={`flex flex-none items-center gap-1 rounded-xl px-2 py-1 text-xs font-black transition ${
                activeCategory === "all" ? "text-gray-500 hover:bg-gray-200" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <span className="max-w-[7.5rem] truncate">{activeFilterLabel}</span>
              <ChevronDown size={15} className={`transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>

            {filterOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 max-h-72 w-56 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl">
                {filterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickBrowseCategory(option.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${
                      activeCategory === option.id ? "bg-emerald-50 text-emerald-700" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Tag size={14} className="flex-none text-gray-400" />
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gray-100 text-gray-700"
            aria-label={t("urmall.search.close")}
          >
            <X size={19} strokeWidth={2.25} />
          </button>
        </div>

        <div className="max-h-[min(70vh,540px)] overflow-y-auto rounded-b-[24px] border-t border-gray-100 p-3">
          {!hasQuery ? (
            <EmptyState
              t={t}
              recent={recent}
              options={filterOptions}
              activeCategory={activeCategory}
              onPickRecent={(term) => setQuery(term)}
              onClearRecent={() => {
                clearRecentMarketplaceSearches();
                setRecent([]);
              }}
              onPickCategory={pickBrowseCategory}
            />
          ) : (
            <div className="space-y-4">
              {showCode ? (
                <PublicCodeResultCard
                  lookup={codeLookup}
                  surface="urmall"
                  onOpen={(result) => {
                    close();
                    if (result.kind === "urmall") {
                      onOpenSeller?.({ id: result.businessId, name: result.title, logoUrl: result.avatarUrl, city: result.subtitle });
                      return;
                    }
                    openPublicCodeResult(result);
                  }}
                />
              ) : null}

              {catalogLoading && !hasResults ? (
                <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">{t("urmall.search.searching")}</p>
              ) : null}

              {rows.length ? (
                <ResultSection title={t("urmall.search.scopeProducts")}>
                  {rows.slice(0, 30).map((row) => (
                    <ResultRow key={row.key} row={row} onClick={() => pickResult(row)} />
                  ))}
                </ResultSection>
              ) : null}

              {stores.length ? (
                <ResultSection title={t("urmall.search.scopeStores")}>
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => pickStore(store)}
                      className="kt-pressable flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-gray-200 text-gray-500">
                        {store.logoUrl ? <img src={resizedImageUrl(store.logoUrl, { width: 96, quality: 70 })} alt="" className="h-full w-full object-cover" /> : <Store size={17} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-gray-950">{store.name}</span>
                        <span className="block truncate text-xs font-bold text-gray-500">
                          {[store.city, store.country].filter(Boolean).join(", ") || t("urmall.search.store")}
                        </span>
                      </span>
                      <TypeTag icon={Store} label={t("urmall.search.store")} />
                    </button>
                  ))}
                </ResultSection>
              ) : null}

              {categoryMatches.length ? (
                <ResultSection title={t("urmall.search.scopeCategories")}>
                  {categoryMatches.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => pickSearchCategory(category)}
                      className="kt-pressable flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-gray-200 text-gray-500">
                        <Tag size={17} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-black text-gray-950">{category}</span>
                      <TypeTag icon={Tag} label={t("urmall.search.category")} />
                    </button>
                  ))}
                </ResultSection>
              ) : null}

              {!catalogLoading && !hasResults ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-4 text-center">
                  <p className="text-sm font-black text-gray-950">{t("urmall.search.noResultsTitle", { query: trimmed })}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-500">{t("urmall.search.noResultsBody")}</p>
                  <button
                    type="button"
                    onClick={() => submitText()}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-2xl bg-gray-950 px-4 text-sm font-black text-white"
                  >
                    <Search size={15} /> {t("urmall.search.seeAllFor", { query: trimmed })}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function ResultRow({ row, onClick }) {
  const Icon = row.kind === "vertical" ? UtensilsCrossed : Package;
  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-pressable flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2.5 text-left hover:bg-gray-100"
    >
      <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-xl bg-gray-200 text-gray-500">
        {row.image ? <img src={resizedImageUrl(row.image, { width: 96, quality: 70 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Icon size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-950">{row.name}</span>
        <span className="block truncate text-xs font-bold text-gray-500">{row.address || "—"}</span>
      </span>
      <TypeTag icon={Icon} label={row.tag} />
    </button>
  );
}

function EmptyState({ t, recent, options, activeCategory, onPickRecent, onClearRecent, onPickCategory }) {
  const categories = options.filter((option) => option.id !== "all");
  return (
    <div className="space-y-4">
      {recent.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">{t("urmall.search.recent")}</p>
            <button type="button" onClick={onClearRecent} className="text-xs font-black text-emerald-700">
              {t("urmall.search.clear")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onPickRecent(term)}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-600"
              >
                <Clock size={14} className="text-gray-400" /> {term}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {categories.length ? (
        <section>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-gray-400">{t("urmall.search.filterMenu")}</p>
          <div className="flex flex-wrap gap-2">
            {activeCategory !== "all" ? (
              <button
                type="button"
                onClick={() => onPickCategory("all")}
                className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-600"
              >
                <X size={14} /> {t("urmall.search.filterAll")}
              </button>
            ) : null}
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onPickCategory(category.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ${
                  activeCategory === category.id ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <Tag size={14} /> {category.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ResultSection({ title, children }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">{title}</p>
      {children}
    </section>
  );
}

function TypeTag({ icon: Icon, label }) {
  return (
    <span className="flex flex-none items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-gray-500">
      <Icon size={11} /> {label}
    </span>
  );
}
