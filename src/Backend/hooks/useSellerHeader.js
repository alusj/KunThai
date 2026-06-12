import { useEffect, useState } from "react";

import {
  getUnseenNotificationCount,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../services/notificationSeenStore";
import {
  fetchSellerHeaderState,
  searchSellerWorkspace,
} from "../services/marketplace/sellerHeaderService";

const SELLER_SEEN_SCOPES = {
  orders: "urmall:seller:orders",
  messages: "urmall:seller:messages",
  notifications: "urmall:seller:notifications",
};

const DEFAULT_HEADER_STATE = {
  orderCount: 0,
  messageCount: 0,
  notificationCount: 0,
  orderItems: [],
  messageItems: [],
  notificationItems: [],
  searchSuggestions: [],
};

const SELLER_HEADER_MEMORY = {
  loaded: false,
  headerState: DEFAULT_HEADER_STATE,
  savedAt: 0,
};

function normalizeHeaderState(headerState) {
  return { ...DEFAULT_HEADER_STATE, ...headerState };
}

export function useSellerHeader() {
  const [headerState, setHeaderState] = useState(() => SELLER_HEADER_MEMORY.headerState);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(() => !SELLER_HEADER_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);
  const [, setSeenVersion] = useState(0);

  async function loadHeaderState(isActive = () => true) {
    const hasCachedHeader = SELLER_HEADER_MEMORY.loaded;

    if (hasCachedHeader && isActive()) {
      setHeaderState(SELLER_HEADER_MEMORY.headerState);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    const nextState = normalizeHeaderState(await fetchSellerHeaderState());
    SELLER_HEADER_MEMORY.loaded = true;
    SELLER_HEADER_MEMORY.headerState = nextState;
    SELLER_HEADER_MEMORY.savedAt = Date.now();
    if (isActive()) {
      setHeaderState(nextState);
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    loadHeaderState(() => active).catch(() => {
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleMessagesUpdated() {
      loadHeaderState(() => true).catch(() => {});
    }

    window.addEventListener("marketplace-message-sent", handleMessagesUpdated);
    window.addEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
    window.addEventListener("marketplace-orders-updated", handleMessagesUpdated);
    return () => {
      window.removeEventListener("marketplace-message-sent", handleMessagesUpdated);
      window.removeEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
      window.removeEventListener("marketplace-orders-updated", handleMessagesUpdated);
    };
  }, []);

  useEffect(() => {
    return subscribeNotificationSeen(() => setSeenVersion((version) => version + 1));
  }, []);

  useEffect(() => {
    let active = true;

    searchSellerWorkspace(query).then((results) => {
      if (active) {
        setSearchResults(results);
      }
    });

    return () => {
      active = false;
    };
  }, [query]);

  function markSellerSectionSeen(section) {
    const scope = SELLER_SEEN_SCOPES[section];
    if (!scope) return;

    const items =
      section === "orders"
        ? headerState.orderItems
        : section === "messages"
          ? headerState.messageItems
          : headerState.notificationItems;

    markNotificationsSeen(scope, items);
    setSeenVersion((version) => version + 1);
  }

  return {
    ...headerState,
    orderCount: getUnseenNotificationCount(SELLER_SEEN_SCOPES.orders, headerState.orderItems),
    messageCount: getUnseenNotificationCount(SELLER_SEEN_SCOPES.messages, headerState.messageItems, { unreadOnly: true }),
    notificationCount: getUnseenNotificationCount(SELLER_SEEN_SCOPES.notifications, headerState.notificationItems, { unreadOnly: true }),
    query,
    setQuery,
    searchResults,
    loading,
    isInitialLoading: loading && !SELLER_HEADER_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
    markSellerSectionSeen,
  };
}
