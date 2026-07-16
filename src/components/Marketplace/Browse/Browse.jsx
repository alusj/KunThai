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
  subscribeBuyerMarketplaceProducts,
  toggleSavedBuyerProduct,
  toggleSavedBuyerSeller,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { guardGuestAction } from "../../../Backend/services/guestModeService";
import { showToast } from "../../../Backend/services/toastService";
import { consumeSellerAreaViewReturn } from "../../../Backend/services/marketplace/navigationHandoffService";
import { useSilentRefresh } from "../../../Backend/hooks/useSilentRefresh";
import { openPublicCodeResult } from "../../../Backend/services/publicCodeService";
import PullToRefresh from "../../shared/PullToRefresh";
import PublicCodeResultCard from "../../shared/PublicCodeResultCard";
import { usePublicCodeLookup } from "../../../Backend/hooks/usePublicCodeLookup";

import BuyerDiscoveryBar from "./BuyerDiscoveryBar";
import PromotedAdsCarousel from "./PromotedAdsCarousel";
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

export default function Browse({ activeTab = "new", onProductModeChange, searchOpen = false, supplementalContent = null }) {
  const initialQueryFilters = cloneFilters(BROWSE_MEMORY.queryFilters);
  const initialCatalog = normalizeCatalog(
    BROWSE_CATALOG_MEMORY.get(buildCatalogKey(initialQueryFilters))?.catalog || BROWSE_MEMORY.catalog,
  );
  const [filters, setFilters] = useState(() => cloneFilters(BROWSE_MEMORY.filters));
  const [queryFilters, setQueryFilters] = useState(() => initialQueryFilters);
  const [options, setOptions] = useState(() => ({ ...DEFAULT_OPTIONS, ...BROWSE_MEMORY.options }));
  const [catalog, setCatalog] = useState(() => initialCatalog);
  const [loading, setLoading] = useState(() => !catalogHasProducts(initialCatalog));
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
  const loadProductsRef = useRef(null);
  const codeLookup = usePublicCodeLookup(filters.search);

  useSilentRefresh(() => loadProductsRef.current?.(), { intervalMs: 60000 });

  function openCodeResult(result) {
    if (result.kind === "urmall") {
      setDetailOpen(false);
      setSelectedSeller({ id: result.businessId, name: result.title, logoUrl: result.avatarUrl, city: result.subtitle });
      setSellerOpen(true);
      return;
    }
    openPublicCodeResult(result);
  }

  useEffect(() => {
    const sellerReturn = consumeSellerAreaViewReturn();
    if (!sellerReturn) return;
    setSelectedSeller(sellerReturn);
    setSellerOpen(true);
  }, []);

  useEffect(() => {
    BROWSE_MEMORY.filters = cloneFilters(filters);
  }, [filters]);

  // Closing the header search hides the discovery bar, so drop its filters or
  // the grid would stay silently filtered with no visible controls.
  const prevSearchOpenRef = useRef(searchOpen);
  useEffect(() => {
    if (prevSearchOpenRef.current && !searchOpen) {
      setFilters(cloneFilters(DEFAULT_FILTERS));
    }
    prevSearchOpenRef.current = searchOpen;
  }, [searchOpen]);

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
      } else {
        setLoading(true);
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
        }
      }
    }

    loadProductsRef.current = loadProducts;
    loadProducts();
    let refreshTimer;
    const refreshSilently = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(loadProducts, 120);
    };
    const unsubscribe = subscribeBuyerMarketplaceProducts(refreshSilently);
    window.addEventListener("marketplace-products-updated", refreshSilently);
    window.addEventListener("focus", refreshSilently);

    return () => {
      alive = false;
      window.clearTimeout(refreshTimer);
      unsubscribe?.();
      window.removeEventListener("marketplace-products-updated", refreshSilently);
      window.removeEventListener("focus", refreshSilently);
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
        if (alive) {
          setOptions((current) =>
            current.categories.length || current.locations.length ? current : DEFAULT_OPTIONS,
          );
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
    function handleExternalSellerOpen(event) {
      const seller = event.detail?.seller;
      if (!seller?.id) return;
      setDetailOpen(false);
      setSelectedSeller(seller);
      setSellerOpen(true);
    }

    window.addEventListener("marketplace-open-seller", handleExternalSellerOpen);
    return () => window.removeEventListener("marketplace-open-seller", handleExternalSellerOpen);
  }, []);

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
    if (guardGuestAction("add", "product to the cart")) return;
    try {
      const result = await addBuyerCartItem(product);
      showNotice(result?.status === "alreadyInCart" ? "This product is already in your cart." : "Product added to cart.");
    } catch (err) {
      showNotice(err.message || "Unable to add product to cart.", "danger");
    }
  }

  async function orderProduct(product, orderInput) {
    if (guardGuestAction("order", "product")) return;
    try {
      await createBuyerProductOrder(product, orderInput);
      showNotice("Order sent. You can view it in Ordered items.");
    } catch (err) {
      showNotice(err.message || "Unable to create order.", "danger");
      throw err;
    }
  }

  async function toggleSaved(product) {
    if (guardGuestAction("save", "product")) return;
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
    if (guardGuestAction("save", "store")) return;
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
    if (guardGuestAction("message", "seller")) return;
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
    supplementalContent,
  };
  return (
    <div className="space-y-4">
      <PullToRefresh className="space-y-4" onRefresh={() => loadProductsRef.current?.()} disabled={detailOpen || sellerOpen}>
      {/* The advert slider lives where the search card used to be; the full
          search card only appears when the header search icon is active. */}
      {searchOpen ? (
        <BuyerDiscoveryBar
          filters={filters}
          setFilters={setFilters}
          categories={options.categories}
          locations={options.locations}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
      ) : (
        <PromotedAdsCarousel onProductSelect={openProduct} />
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          {notice}
        </div>
      )}

      {codeLookup.kind ? (
        <PublicCodeResultCard lookup={codeLookup} surface="urmall" onOpen={openCodeResult} />
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
      </PullToRefresh>

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
