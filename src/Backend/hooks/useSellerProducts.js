import { useEffect, useState } from "react";

import {
  fetchSellerProducts,
  promoteSellerProduct,
  updateSellerProduct,
} from "../services/marketplace/sellerProductService";

const DEFAULT_PRODUCTS = {
  summary: null,
  products: [],
  topSellingProducts: [],
};

export function useSellerProducts() {
  const [productState, setProductState] = useState(DEFAULT_PRODUCTS);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadProducts(active = true) {
    try {
      const nextProductState = await fetchSellerProducts();
      if (active) {
        setProductState({ ...DEFAULT_PRODUCTS, ...nextProductState });
      }
    } finally {
      if (active) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let active = true;

    loadProducts(active);

    return () => {
      active = false;
    };
  }, []);

  async function handleProductAction(product, action) {
    setActionError("");
    setActionMessage("");

    try {
      if (action === "restock") {
        const nextStock = Number(window.prompt("Enter new stock quantity", String(Math.max(product.stock, 1))));
        if (Number.isNaN(nextStock) || nextStock < 0) return;
        await updateSellerProduct(product.id, {
          stock: nextStock,
          status: nextStock > 0 ? "active" : "out-of-stock",
        });
        setActionMessage("Stock updated.");
      }

      if (action === "edit-price") {
        const nextPrice = Number(window.prompt("Enter new price", String(product.price)));
        if (Number.isNaN(nextPrice) || nextPrice <= 0) return;
        await updateSellerProduct(product.id, { price: nextPrice });
        setActionMessage("Price updated.");
      }

      if (action === "pause") {
        await updateSellerProduct(product.id, { status: product.status === "paused" ? "active" : "paused" });
        setActionMessage(product.status === "paused" ? "Product resumed." : "Product paused.");
      }

      if (action === "promote") {
        await promoteSellerProduct(product);
        setActionMessage("Promotion draft created.");
      }

      await loadProducts(true);
    } catch (error) {
      setActionError(error.message || "Unable to update product.");
    }
  }

  return {
    ...productState,
    availableProducts: productState.products.filter((product) => product.status === "active" && product.stock > 0),
    actionMessage,
    actionError,
    handleProductAction,
    loading,
  };
}
