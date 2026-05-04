// src/components/Marketplace/Browse/Browse.jsx

import { useEffect, useState } from "react";
import {
  addBuyerCartItem,
  fetchBuyerDiscoveryOptions,
  fetchBuyerMarketplaceProducts,
  fetchBuyerProductDetail,
  fetchSavedBuyerProductIds,
  sendBuyerMarketplaceMessage,
  toggleSavedBuyerProduct,
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [options, setOptions] = useState({ categories: [], locations: [] });
  const [catalog, setCatalog] = useState({
    newProducts: [],
    discountedProducts: [],
    highDemandProducts: [],
    topRatedProducts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedIds, setSavedIds] = useState(new Set());
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);

  useEffect(() => {
    onProductModeChange?.(detailOpen || sellerOpen);

    return () => {
      onProductModeChange?.(false);
    };
  }, [detailOpen, sellerOpen, onProductModeChange]);

  useEffect(() => {
    let alive = true;

    async function loadProducts() {
      setLoading(true);
      setError("");

      try {
        const products = await fetchBuyerMarketplaceProducts(filters);
        if (alive) setCatalog(products);
      } catch (err) {
        if (alive) setError(err.message || "Unable to load marketplace products.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProducts();

    return () => {
      alive = false;
    };
  }, [filters]);

  useEffect(() => {
    let alive = true;

    async function loadOptions() {
      try {
        const [discoveryOptions, saved] = await Promise.all([
          fetchBuyerDiscoveryOptions(),
          fetchSavedBuyerProductIds().catch(() => new Set()),
        ]);
        if (alive) {
          setOptions(discoveryOptions);
          setSavedIds(saved);
        }
      } catch {
        if (alive) setOptions({ categories: [], locations: [] });
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
  }, []);

  function showNotice(message, tone = "success") {
    showToast(message, tone);
    setNotice(message);
    window.clearTimeout(showNotice.timeoutId);
    showNotice.timeoutId = window.setTimeout(() => setNotice(""), 2500);
  }

  async function openProduct(product) {
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
  }

  async function addToCart(product) {
    try {
      await addBuyerCartItem(product);
      showNotice("Product Added to Cart");
    } catch (err) {
      showNotice(err.message || "Unable to add product to cart.", "danger");
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

  return (
    <div className="space-y-4">
      <BuyerDiscoveryBar
        filters={filters}
        setFilters={setFilters}
        categories={options.categories}
        locations={options.locations}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      {notice && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          {notice}
        </div>
      )}

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
        onNotice={showNotice}
        savedIds={savedIds}
      />

    </div>
  );
}
