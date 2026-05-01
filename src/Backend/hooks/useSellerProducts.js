import { useEffect, useState } from "react";

import { fetchSellerProducts } from "../services/marketplace/sellerProductService";

const DEFAULT_PRODUCTS = {
  summary: null,
  products: [],
  topSellingProducts: [],
};

export function useSellerProducts() {
  const [productState, setProductState] = useState(DEFAULT_PRODUCTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerProducts()
      .then((nextProductState) => {
        if (active) {
          setProductState({ ...DEFAULT_PRODUCTS, ...nextProductState });
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    ...productState,
    availableProducts: productState.products.filter((product) => product.status === "active" && product.stock > 0),
    loading,
  };
}
