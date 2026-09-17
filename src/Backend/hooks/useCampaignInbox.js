import { useCallback, useEffect, useState } from "react";

import { fetchCampaignInbox, subscribeToCampaignDeliveries } from "../services/campaigns/campaignDeliveryService";

/**
 * Admin campaigns delivered to one dashboard inbox (seller, operator or
 * company). Refreshes in real time; `unreadCount` feeds the dashboard badge.
 */
export function useCampaignInbox(inbox, { enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !inbox) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await fetchCampaignInbox(inbox));
    } catch {
      // Keep what is on screen; the next realtime change retries.
    } finally {
      setLoading(false);
    }
  }, [enabled, inbox]);

  useEffect(() => {
    refresh();
    if (!enabled || !inbox) return undefined;
    let stop = () => {};
    let alive = true;
    let timer = null;
    subscribeToCampaignDeliveries(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 300);
    }).then((unsubscribe) => {
      if (alive) stop = unsubscribe;
      else unsubscribe();
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stop();
    };
  }, [enabled, inbox, refresh]);

  const unreadCount = items.filter((item) => item.status === "unread").length;
  return { items, loading, unreadCount, refresh, setItems };
}
