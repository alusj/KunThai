import { useEffect, useMemo, useState } from "react";

import { fetchSellerAttentionItems } from "../services/marketplace/sellerAttentionService";

export function useSellerAttention() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetchSellerAttentionItems()
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
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

  const summary = useMemo(
    () => ({
      total: items.length,
      high: items.filter((item) => item.priority === "high").length,
      medium: items.filter((item) => item.priority === "medium").length,
      low: items.filter((item) => item.priority === "low").length,
    }),
    [items],
  );

  return {
    items,
    summary,
    loading,
  };
}
