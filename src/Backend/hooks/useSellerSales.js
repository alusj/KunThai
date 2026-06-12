import { useEffect, useState } from "react";

import { fetchSellerSales } from "../services/marketplace/sellerSalesService";

const DEFAULT_SALES = {
  revenue: null,
  orders: null,
  averageOrderValue: 0,
  bestSalesWindow: null,
  recentOrders: [],
};

const SELLER_SALES_MEMORY = {
  sales: null,
  savedAt: 0,
};

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

  useEffect(() => {
    let active = true;
    const cachedSales = SELLER_SALES_MEMORY.sales;

    if (cachedSales) {
      setSales(cachedSales);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerSales()
      .then((nextSales) => {
        const normalizedSales = normalizeSales(nextSales);
        SELLER_SALES_MEMORY.sales = normalizedSales;
        SELLER_SALES_MEMORY.savedAt = Date.now();
        if (active) {
          setSales(normalizedSales);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    ...sales,
    loading,
    isInitialLoading: loading && !hasSalesData(sales),
    refreshing,
    isRefreshing: refreshing,
  };
}
