import { useEffect, useState } from "react";

import { fetchSellerSales } from "../services/marketplace/sellerSalesService";

const DEFAULT_SALES = {
  revenue: null,
  orders: null,
  averageOrderValue: 0,
  bestSalesWindow: null,
  recentOrders: [],
};

export function useSellerSales() {
  const [sales, setSales] = useState(DEFAULT_SALES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerSales()
      .then((nextSales) => {
        if (active) {
          setSales({ ...DEFAULT_SALES, ...nextSales });
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
    ...sales,
    loading,
  };
}
