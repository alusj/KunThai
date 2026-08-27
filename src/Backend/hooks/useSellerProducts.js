import { useEffect, useState } from "react";
import { friendlyErrorMessage } from "../services/friendlyErrorService";
import { notifyActionDone, notifyActionFailed } from "../services/actionFeedbackService";
import { decorateShareUrl } from "../services/visibilityCreditService";

import {
  createSellerProductShareLink,
  deleteSellerProduct,
  fetchSellerProducts,
  promoteSellerProduct,
  updateSellerProduct,
} from "../services/marketplace/sellerProductService";

const DEFAULT_PRODUCTS = {
  summary: null,
  products: [],
  topSellingProducts: [],
};

const SELLER_PRODUCTS_MEMORY = {
  productState: null,
  savedAt: 0,
};

function normalizeProducts(productState) {
  return { ...DEFAULT_PRODUCTS, ...productState };
}

function hasProductStateData(productState) {
  return Boolean(productState?.summary || productState?.products?.length || productState?.topSellingProducts?.length);
}

export function useSellerProducts() {
  const [productState, setProductState] = useState(() => SELLER_PRODUCTS_MEMORY.productState || DEFAULT_PRODUCTS);
  const [loading, setLoading] = useState(() => !hasProductStateData(SELLER_PRODUCTS_MEMORY.productState));
  const [refreshing, setRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadProducts(isActive = () => true) {
    const cachedProductState = SELLER_PRODUCTS_MEMORY.productState;
    const hasCachedProducts = hasProductStateData(cachedProductState);

    if (cachedProductState && isActive()) {
      setProductState(cachedProductState);
    }

    if (hasCachedProducts) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      const nextProductState = normalizeProducts(await fetchSellerProducts());
      SELLER_PRODUCTS_MEMORY.productState = nextProductState;
      SELLER_PRODUCTS_MEMORY.savedAt = Date.now();
      if (isActive()) {
        setProductState(nextProductState);
      }
    } finally {
      if (isActive()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    let active = true;

    loadProducts(() => active).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function handleProductAction(product, action) {
    setActionError("");
    setActionMessage("");

    try {
      let shouldReload = true;

      if (action === "restock") {
        const nextStock = Number(window.prompt("Enter new stock quantity", String(Math.max(product.stock, 1))));
        if (Number.isNaN(nextStock) || nextStock < 0) return;
        await updateSellerProduct(product.id, {
          stock: nextStock,
          status: nextStock > 0 ? "active" : "out-of-stock",
        });
        notifyActionDone("Stock updated.", { module: "marketplace" });
      }

      if (action === "edit-price") {
        const nextPrice = Number(window.prompt("Enter new price", String(product.price)));
        if (Number.isNaN(nextPrice) || nextPrice <= 0) return;
        await updateSellerProduct(product.id, { price: nextPrice });
        notifyActionDone("Price updated.", { module: "marketplace" });
      }

      if (action === "pause") {
        await updateSellerProduct(product.id, { status: product.status === "paused" ? "active" : "paused" });
        notifyActionDone(product.status === "paused" ? "Product resumed." : "Product paused.", { module: "marketplace" });
      }

      if (action === "promote") {
        await promoteSellerProduct(product);
        notifyActionDone("Small Boost started with 5 Visibility Credits.", { module: "marketplace" });
      }

      if (action === "publish") {
        await updateSellerProduct(product.id, {
          status: "active",
          published_at: product.publishedAt || new Date().toISOString(),
        });
        notifyActionDone("Draft published.", { module: "marketplace" });
      }

      if (action === "delete") {
        const confirmed = window.confirm(`Delete ${product.name}? This removes it from Store, Catalog, and Drafts.`);
        if (!confirmed) return;
        await deleteSellerProduct(product.id);
        notifyActionDone("Product deleted.", { module: "marketplace" });
      }

      if (action === "share") {
        const link = await decorateShareUrl(createSellerProductShareLink(product));
        if (!link) throw new Error("Unable to create product link.");
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
        } else {
          window.prompt("Copy product link", link);
        }
        notifyActionDone("Product link copied.", { module: "marketplace" });
        shouldReload = false;
      }

      if (shouldReload) {
        await loadProducts(() => true);
      }
    } catch (error) {
      setActionError(friendlyErrorMessage(error, "Unable to update product."));
      notifyActionFailed(error, "Unable to update product.", { module: "marketplace" });
    }
  }

  return {
    ...productState,
    availableProducts: productState.products.filter((product) => product.status === "active" && product.stock > 0),
    draftProducts: productState.products.filter((product) => product.status === "draft"),
    actionMessage,
    actionError,
    handleProductAction,
    loading,
    isInitialLoading: loading && !hasProductStateData(productState),
    refreshing,
    isRefreshing: refreshing,
  };
}
