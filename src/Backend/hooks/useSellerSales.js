import { useCallback, useEffect, useState } from "react";
import { registerSellerMemory } from "./sellerMemoryRegistry";

import { fetchSellerSales } from "../services/marketplace/sellerSalesService";

const DEFAULT_SALES = {
  revenue: null,
  orders: null,
  averageOrderValue: 0,
  bestSalesWindow: null,
  recentOrders: [],
  currency: "",
};

const SELLER_SALES_MEMORY = registerSellerMemory({
  sales: null,
  savedAt: 0,
});

function normalizeSales(sales) {
  return { ...DEFAULT_SALES, ...sales };
}

function hasSalesData(sales) {
  return Boolean(sales?.revenue || sales?.orders || sales?.bestSalesWindow || sales?.recentOrders?.length);
}

export function useSellerSales() {
  const [sales, setSales] = useState(() => SELLER_SALES_MEMORY.sales || DEFAULT_SALES);
  const [loading, setLoading] = useState(() => !hasSalesData(SELLER_SALES_MEMORY.sales));
  const [refreshing, setRefreshing] = useState(false);
  // Set only when nothing could be shown, so the screen offers a retry
  // instead of an endless skeleton.
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    let active = true;

    function load(quiet = false) {
      const cachedSales = SELLER_SALES_MEMORY.sales;

      if (cachedSales) {
        setSales(cachedSales);
        setLoading(false);
        setRefreshing(true);
      } else if (!quiet) {
        setLoading(true);
        setRefreshing(false);
      }
      setError(false);

      fetchSellerSales()
        .then((nextSales) => {
          const normalizedSales = normalizeSales(nextSales);
          SELLER_SALES_MEMORY.sales = normalizedSales;
          SELLER_SALES_MEMORY.savedAt = Date.now();
          if (active) {
            setSales(normalizedSales);
          }
        })
        .catch(() => {
          if (active && !hasSalesData(SELLER_SALES_MEMORY.sales)) setError(true);
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    }

    load();
    // An order action (here, in another seller screen or from a buyer) changes
    // the counts and revenue: reload them instead of only patching locally.
    const refresh = () => load(true);
    window.addEventListener("marketplace-orders-updated", refresh);

    return () => {
      active = false;
      window.removeEventListener("marketplace-orders-updated", refresh);
    };
  }, [attempt]);

  return {
    ...sales,
    loading,
    isInitialLoading: loading && !hasSalesData(sales),
    refreshing,
    isRefreshing: refreshing,
    error,
    retry,
  };
}
