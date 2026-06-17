// src/components/Marketplace/Browse/Browse.jsx

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addBuyerCartItem,
  createBuyerProductOrder,
  fetchBuyerDiscoveryOptions,
  fetchBuyerMarketplaceProducts,
  fetchBuyerProductDetail,
  fetchSavedBuyerProductIds,
  fetchSavedBuyerSellerIds,
  sendBuyerMarketplaceMessage,
  toggleSavedBuyerProduct,
  toggleSavedBuyerSeller,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { showToast } from "../../../Backend/services/toastService";

import BuyerDiscoveryBar from "./BuyerDiscoveryBar";
import ProductDetailDrawer from "./ProductDetailDrawer";
import SellerProfileDrawer from "./SellerProfileDrawer";

/* =========================
   Child tab screens
========================= */
import New from "./tabs/New";
import Discounted from "./tabs/Discounted";
import HighDemand from "./tabs/HighDemand";
import TopRated from "./tabs/TopRated";

const DEFAULT_FILTERS = {
  search: "",
  category: "all",
  location: "",
  delivery: "all",
  sort: "newest",
  minPrice: "",
  maxPrice: "",
};

const RECENT_PRODUCTS_KEY = "marketplace-recent-products";
const DEFAULT_OPTIONS = { categories: [], locations: [] };
const DEFAULT_CATALOG = {
  newProducts: [],
  discountedProducts: [],
  highDemandProducts: [],
  topRatedProducts: [],
};
const BROWSE_CATALOG_MEMORY = new Map();
const BROWSE_MEMORY = {
  filters: DEFAULT_FILTERS,
  queryFilters: DEFAULT_FILTERS,
  options: DEFAULT_OPTIONS,
  catalog: DEFAULT_CATALOG,
  savedIds: new Set(),
  savedSellerIds: new Set(),
};

function cloneFilters(filters) {
  return { ...DEFAULT_FILTERS, ...(filters || {}) };
}

function cloneSet(value) {
  return new Set(value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : []);
}

function normalizeCatalog(catalog) {
  return { ...DEFAULT_CATALOG, ...(catalog || {}) };
}

function catalogHasProducts(catalog) {
  return Object.values(catalog || {}).some((items) => Array.isArray(items) && items.length > 0);
}

function buildCatalogKey(filters) {
  const normalized = cloneFilters(filters);
  return JSON.stringify(
    Object.keys(normalized)
      .sort()
      .reduce((result, key) => {
        result[key] = normalized[key];
        return result;
      }, {}),
  );
}

function rememberRecentProduct(product) {
  try {
    const current = JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY) || "[]");
    const next = [
      product,
      ...current.filter((item) => item.id !== product.id),
    ].slice(0, 12);
    localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next));
  } catch {
    // Recent views are a convenience only.
  }
}

export default function Browse({ activeTab = "new", onProductModeChange }) {
  const initialQueryFilters = cloneFilters(BROWSE_MEMORY.queryFilters);
  const initialCatalog = normalizeCatalog(
    BROWSE_CATALOG_MEMORY.get(buildCatalogKey(initialQueryFilters))?.catalog || BROWSE_MEMORY.catalog,
  );
  const [filters, setFilters] = useState(() => cloneFilters(BROWSE_MEMORY.filters));
  const [queryFilters, setQueryFilters] = useState(() => initialQueryFilters);
  const [options, setOptions] = useState(() => ({ ...DEFAULT_OPTIONS, ...BROWSE_MEMORY.options }));
  const [catalog, setCatalog] = useState(() => initialCatalog);
  const [loading, setLoading] = useState(() => !catalogHasProducts(initialCatalog));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedIds, setSavedIds] = useState(() => cloneSet(BROWSE_MEMORY.savedIds));
  const [savedSellerIds, setSavedSellerIds] = useState(() => cloneSet(BROWSE_MEMORY.savedSellerIds));
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);
  const noticeTimerRef = useRef(null);
  const catalogRef = useRef(catalog);

  useEffect(() => {
    BROWSE_MEMORY.filters = cloneFilters(filters);
  }, [filters]);

  useEffect(() => {
    BROWSE_MEMORY.queryFilters = cloneFilters(queryFilters);
  }, [queryFilters]);

  useEffect(() => {
    catalogRef.current = catalog;
    BROWSE_MEMORY.catalog = normalizeCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    BROWSE_MEMORY.options = { ...DEFAULT_OPTIONS, ...options };
  }, [options]);

  useEffect(() => {
    BROWSE_MEMORY.savedIds = cloneSet(savedIds);
  }, [savedIds]);

  useEffect(() => {
    BROWSE_MEMORY.savedSellerIds = cloneSet(savedSellerIds);
  }, [savedSellerIds]);

  const showNotice = useCallback((message, tone = "success") => {
    showToast(message, tone);
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2500);
  }, []);

  const openProduct = useCallback(async (product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
    rememberRecentProduct(product);

    try {
      const detail = await fetchBuyerProductDetail(product.id);
      setSelectedProduct(detail);
      rememberRecentProduct(detail);
    } catch (err) {
      showNotice(err.message || "Unable to open product details.", "danger");
    }
  }, [showNotice]);

  useEffect(() => {
    onProductModeChange?.(detailOpen || sellerOpen);

    return () => {
      onProductModeChange?.(false);
    };
  }, [detailOpen, sellerOpen, onProductModeChange]);

  useEffect(() => {
    return () => window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    function handleCloseBuyerSurfaces() {
      setDetailOpen(false);
      setSellerOpen(false);
    }

    window.addEventListener("marketplace-close-buyer-surfaces", handleCloseBuyerSurfaces);
    return () => window.removeEventListener("marketplace-close-buyer-surfaces", handleCloseBuyerSurfaces);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProducts() {
      const cacheKey = buildCatalogKey(queryFilters);
      const cachedCatalog = normalizeCatalog(BROWSE_CATALOG_MEMORY.get(cacheKey)?.catalog);
      const hasCachedCatalog = catalogHasProducts(cachedCatalog);
      const hasExistingCatalog = hasCachedCatalog || catalogHasProducts(catalogRef.current);

      if (hasCachedCatalog) {
        setCatalog(cachedCatalog);
      }

      if (hasExistingCatalog) {
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
      }

      setError("");

      try {
        const products = normalizeCatalog(await fetchBuyerMarketplaceProducts(queryFilters));
        BROWSE_CATALOG_MEMORY.set(cacheKey, { catalog: products, savedAt: Date.now() });
        if (alive) setCatalog(products);
      } catch (err) {
        if (alive) setError(hasExistingCatalog ? "" : err.message || "Unable to load UrMall products.");
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadProducts();

    return () => {
      alive = false;
    };
  }, [queryFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQueryFilters(filters);
    }, filters.search ? 320 : 0);

    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    let alive = true;

    async function loadOptions() {
      try {
        const [discoveryOptions, saved, savedStores] = await Promise.all([
          fetchBuyerDiscoveryOptions(),
          fetchSavedBuyerProductIds().catch(() => new Set()),
          fetchSavedBuyerSellerIds().catch(() => new Set()),
        ]);
        if (alive) {
          setOptions(discoveryOptions);
          setSavedIds(saved);
          setSavedSellerIds(savedStores);
        }
      } catch {
        if (alive && !options.categories.length && !options.locations.length) {
          setOptions(DEFAULT_OPTIONS);
        }
      }
    }

    loadOptions();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function handleExternalProductOpen(event) {
      const product = event.detail?.product;
      if (!product) return;
      setSellerOpen(false);
      openProduct(product);
    }

    window.addEventListener("marketplace-open-product", handleExternalProductOpen);
    return () => window.removeEventListener("marketplace-open-product", handleExternalProductOpen);
  }, [openProduct]);

  useEffect(() => {
    let alive = true;

    async function openProductFromHash() {
      const match = String(window.location.hash || "").match(/marketplace-product-([^/?#]+)/i);
      if (!match) return;

      try {
        const detail = await fetchBuyerProductDetail(decodeURIComponent(match[1]));
        if (!alive) return;
        setSellerOpen(false);
        setSelectedProduct(detail);
        setDetailOpen(true);
        rememberRecentProduct(detail);
      } catch (err) {
        showNotice(err.message || "Unable to open product details.", "danger");
      }
    }

    openProductFromHash();
    window.addEventListener("hashchange", openProductFromHash);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", openProductFromHash);
    };
  }, [showNotice]);

  async function addToCart(product) {
    try {
      const result = await addBuyerCartItem(product);
      showNotice(result?.status === "alreadyInCart" ? "This product is already in your cart." : "Product added to cart.");
    } catch (err) {
      showNotice(err.message || "Unable to add product to cart.", "danger");
    }
  }

  async function orderProduct(product, orderInput) {
    try {
      await createBuyerProductOrder(product, orderInput);
      showNotice("Order sent. You can view it in Ordered items.");
    } catch (err) {
      showNotice(err.message || "Unable to create order.", "danger");
      throw err;
    }
  }

  async function toggleSaved(product) {
    const currentlySaved = savedIds.has(product.id);
    setSavedIds((current) => {
      const next = new Set(current);
      if (currentlySaved) next.delete(product.id);
      else next.add(product.id);
      return next;
    });

    try {
      await toggleSavedBuyerProduct(product.id, currentlySaved);
      showNotice(currentlySaved ? "Product removed from saved" : "Product saved");
    } catch (err) {
      setSavedIds((current) => {
        const next = new Set(current);
        if (currentlySaved) next.add(product.id);
        else next.delete(product.id);
        return next;
      });
      showNotice(err.message || "Unable to update saved product.", "danger");
    }
  }

  async function toggleSavedSeller(seller) {
    if (!seller?.id) {
      showNotice("This store cannot be saved yet.", "danger");
      return;
    }
    const currentlySaved = savedSellerIds.has(seller.id);
    setSavedSellerIds((current) => {
      const next = new Set(current);
      if (currentlySaved) next.delete(seller.id);
      else next.add(seller.id);
      return next;
    });

    try {
      await toggleSavedBuyerSeller(seller.id, currentlySaved);
      showNotice(currentlySaved ? "Store removed from favorites" : "Store saved to favorites");
    } catch (err) {
      setSavedSellerIds((current) => {
        const next = new Set(current);
        if (currentlySaved) next.add(seller.id);
        else next.delete(seller.id);
        return next;
      });
      showNotice(err.message || "Unable to update favorite store.", "danger");
    }
  }

  async function messageSeller(product, options = {}) {
    try {
      await sendBuyerMarketplaceMessage({
        seller: product.seller,
        product,
        topic: product.name,
        message: options.message || `Hello, I am interested in ${product.name}.`,
        messageType: options.messageType || (product.allowNegotiation ? "negotiation" : "question"),
      });
      showNotice("Message sent to seller. You can continue in Messages.");
    } catch (err) {
      showNotice(err.message || "Unable to message seller.", "danger");
      throw err;
    }
  }

  const tabProps = {
    loading,
    error,
    savedIds,
    onProductSelect: openProduct,
    onAddToCart: addToCart,
    onToggleSaved: toggleSaved,
  };
  const initialProductLoading = loading && !catalogHasProducts(catalog);

  return (
    <div className="space-y-4">
      {!initialProductLoading ? (
        <BuyerDiscoveryBar
          filters={filters}
          setFilters={setFilters}
          categories={options.categories}
          locations={options.locations}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
      ) : null}

      {notice && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          {notice}
        </div>
      )}

      {refreshing && catalogHasProducts(catalog) ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700">
          Refreshing products...
        </div>
      ) : null}

      {/* =========================
          Browse content
      ========================= */}
      {activeTab === "new" && <New products={catalog.newProducts} {...tabProps} />}
      {activeTab === "discounted" && (
        <Discounted products={catalog.discountedProducts} {...tabProps} />
      )}
      {activeTab === "high-demand" && (
        <HighDemand products={catalog.highDemandProducts} {...tabProps} />
      )}
      {activeTab === "top-rated" && <TopRated products={catalog.topRatedProducts} {...tabProps} />}

      <ProductDetailDrawer
        product={selectedProduct}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onAddToCart={addToCart}
        onOrderProduct={orderProduct}
        onToggleSaved={toggleSaved}
        onMessageSeller={messageSeller}
        onOpenSeller={(seller) => {
          setSelectedSeller(seller);
          setSellerOpen(true);
        }}
        onNotice={showNotice}
        saved={selectedProduct ? savedIds.has(selectedProduct.id) : false}
      />

      <SellerProfileDrawer
        seller={selectedSeller}
        open={sellerOpen}
        onClose={() => setSellerOpen(false)}
        onProductSelect={(product) => {
          setSellerOpen(false);
          openProduct(product);
        }}
        onAddToCart={addToCart}
        onToggleSaved={toggleSaved}
        onToggleSavedSeller={toggleSavedSeller}
        onNotice={showNotice}
        savedIds={savedIds}
        sellerSaved={selectedSeller ? savedSellerIds.has(selectedSeller.id) : false}
      />

    </div>
  );
}
