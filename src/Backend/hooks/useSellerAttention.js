import { useEffect, useMemo, useState } from "react";

import { fetchSellerAttentionItems } from "../services/marketplace/sellerAttentionService";

const SELLER_ATTENTION_MEMORY = {
  loaded: false,
  items: [],
  savedAt: 0,
};

export function useSellerAttention() {
  const [items, setItems] = useState(() => SELLER_ATTENTION_MEMORY.items);
  const [loading, setLoading] = useState(() => !SELLER_ATTENTION_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const hasCachedItems = SELLER_ATTENTION_MEMORY.loaded;

    if (hasCachedItems) {
      setItems(SELLER_ATTENTION_MEMORY.items);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    fetchSellerAttentionItems()
      .then((nextItems) => {
        SELLER_ATTENTION_MEMORY.loaded = true;
        SELLER_ATTENTION_MEMORY.items = Array.isArray(nextItems) ? nextItems : [];
        SELLER_ATTENTION_MEMORY.savedAt = Date.now();
        if (active) {
          setItems(SELLER_ATTENTION_MEMORY.items);
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
    isInitialLoading: loading && !SELLER_ATTENTION_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
  };
}
