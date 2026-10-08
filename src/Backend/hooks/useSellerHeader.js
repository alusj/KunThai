import { useCallback, useEffect, useRef, useState } from "react";
import { isHeavyUploadActive } from "../services/uploadActivity";

import {
  getUnseenNotificationCount,
  markNotificationScopeVisited,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../services/notificationSeenStore";
import {
  fetchSellerHeaderState,
  subscribeSellerHeaderChanges,
} from "../services/marketplace/sellerHeaderService";
import { MARKETPLACE_BUSINESS_CHANGED_EVENT } from "../services/marketplace/sellerRegistrationService";

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
  const [loading, setLoading] = useState(() => !SELLER_HEADER_MEMORY.loaded);
  const [refreshing, setRefreshing] = useState(false);
  const [, setSeenVersion] = useState(0);
  // Bumped whenever the active business changes: the live subscription below
  // is rebuilt for the new business, and loads started for the previous one
  // are ignored when they finish.
  const [businessVersion, setBusinessVersion] = useState(0);
  const businessVersionRef = useRef(0);

  async function loadHeaderState(isActive = () => true) {
    const startedFor = businessVersionRef.current;
    const isCurrent = () => isActive() && businessVersionRef.current === startedFor;
    const hasCachedHeader = SELLER_HEADER_MEMORY.loaded;

    if (hasCachedHeader && isCurrent()) {
      setHeaderState(SELLER_HEADER_MEMORY.headerState);
      setLoading(false);
      setRefreshing(true);
    } else if (isCurrent()) {
      setLoading(true);
      setRefreshing(false);
    }

    const fetchedState = normalizeHeaderState(await fetchSellerHeaderState());
    if (businessVersionRef.current !== startedFor) return;
    // Keep the previous object identity when a poll returns identical data,
    // so consumers depending on headerState (or callbacks built from it)
    // don't churn every 20 seconds.
    const nextState =
      SELLER_HEADER_MEMORY.loaded && JSON.stringify(fetchedState) === JSON.stringify(SELLER_HEADER_MEMORY.headerState)
        ? SELLER_HEADER_MEMORY.headerState
        : fetchedState;
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
    let unsubscribeRealtime = () => {};

    loadHeaderState(() => active).catch(() => {
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    });
    const interval = window.setInterval(() => {
      // Skipped while a video uploads (see uploadActivity).
      if (isHeavyUploadActive()) return;
      loadHeaderState(() => active).catch(() => {});
    }, 20000);
    // Live changes for the business active now; re-run on every switch.
    subscribeSellerHeaderChanges(() => loadHeaderState(() => active).catch(() => {}))
      .then((unsubscribe) => { if (active) unsubscribeRealtime = unsubscribe; else unsubscribe(); })
      .catch(() => {});

    return () => {
      active = false;
      window.clearInterval(interval);
      unsubscribeRealtime();
    };
  // businessVersion re-runs it (and resubscribes) for a newly active business.
  }, [businessVersion]);

  useEffect(() => {
    function handleMessagesUpdated() {
      loadHeaderState(() => true).catch(() => {});
    }

    function handleBusinessChanged() {
      businessVersionRef.current += 1;
      SELLER_HEADER_MEMORY.loaded = false;
      SELLER_HEADER_MEMORY.headerState = DEFAULT_HEADER_STATE;
      setHeaderState(DEFAULT_HEADER_STATE);
      setBusinessVersion((version) => version + 1);
    }

    window.addEventListener("marketplace-message-sent", handleMessagesUpdated);
    window.addEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
    window.addEventListener("marketplace-orders-updated", handleMessagesUpdated);
    window.addEventListener("marketplace-seller-notifications-updated", handleMessagesUpdated);
    window.addEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, handleBusinessChanged);
    return () => {
      window.removeEventListener("marketplace-message-sent", handleMessagesUpdated);
      window.removeEventListener("marketplace-seller-messages-updated", handleMessagesUpdated);
      window.removeEventListener("marketplace-orders-updated", handleMessagesUpdated);
      window.removeEventListener("marketplace-seller-notifications-updated", handleMessagesUpdated);
      window.removeEventListener(MARKETPLACE_BUSINESS_CHANGED_EVENT, handleBusinessChanged);
    };
  }, []);

  useEffect(() => {
    return subscribeNotificationSeen(() => setSeenVersion((version) => version + 1));
  }, []);

  // Stable identity matters: Marketplace runs this from an effect, and the
  // seen-event it fires re-renders the owner. An unstable reference there
  // re-triggers the effect on every render and loops until React throws
  // "Maximum update depth exceeded".
  const markSellerSectionSeen = useCallback((section) => {
    const scope = SELLER_SEEN_SCOPES[section];
    if (!scope) return;

    const items =
      section === "orders"
        ? headerState.orderItems
        : section === "messages"
          ? headerState.messageItems
          : headerState.notificationItems;

    markNotificationsSeen(scope, items);
    markNotificationScopeVisited(scope);
    setSeenVersion((version) => version + 1);
  }, [headerState]);

  return {
    ...headerState,
    // The orders badge tracks live pending orders: it stays visible until the
    // seller marks each order shipped, completed, or cancelled — viewing the
    // list alone must not clear it.
    orderCount: headerState.orderCount,
    // Message badge mirrors the orders badge: it tracks live unread buyer
    // messages and only clears when the seller opens (reads) them.
    messageCount: headerState.messageCount,
    notificationCount: getUnseenNotificationCount(SELLER_SEEN_SCOPES.notifications, headerState.notificationItems, { unreadOnly: true }),
    loading,
    isInitialLoading: loading && !SELLER_HEADER_MEMORY.loaded,
    refreshing,
    isRefreshing: refreshing,
    markSellerSectionSeen,
  };
}
