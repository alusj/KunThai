import { useEffect, useRef } from "react";

import supabase from "../../Backend/lib/supabaseClient";
import { haptics, sounds } from "../../Backend/services/feedbackService";
import { requestExploreScreen, showNotificationBanner } from "../../Backend/services/notificationBannerService";
import { showToast } from "../../Backend/services/toastService";
import {
  getUnseenNotificationCount,
  subscribeNotificationSeen,
} from "../../Backend/services/notificationSeenStore";
import { showKunThaiSystemNotification } from "../../Backend/services/pushService";
import { t as i18nText } from "../../i18n/index";

const ACTIVITY_REFRESH_MS = 20_000;
const EMPTY_ACTIVITY = {
  initialized: false,
  orderItems: [],
  messageItems: [],
  notificationItems: [],
  bookingItems: [],
};

let activityModulesPromise = null;

function loadActivityModules() {
  if (!activityModulesPromise) {
    activityModulesPromise = Promise.all([
      import("../../Backend/services/marketplace/sellerHeaderService"),
      import("../../Backend/services/marketplace/buyerMarketplaceService"),
      import("../services/transportHeaderService"),
      import("../services/transportOperatorAccountService"),
      import("../services/transportCompanyService"),
      import("../services/passengerTransportService"),
    ]).then(([sellerHeader, buyerMarketplace, transportHeader, operatorAccounts, companyAccounts, passengerTrips]) => ({
      sellerHeader,
      buyerMarketplace,
      transportHeader,
      operatorAccounts,
      companyAccounts,
      passengerTrips,
    }));
  }
  return activityModulesPromise;
}

function itemId(item) {
  return String(item?.id || "");
}

function firstNewItem(items = [], previousItems = []) {
  const previousIds = new Set(previousItems.map(itemId).filter(Boolean));
  return items.find((item) => itemId(item) && !previousIds.has(itemId(item))) || null;
}

function unseenItems(scope, items = []) {
  return items.filter((item) => getUnseenNotificationCount(scope, [item], { unreadOnly: true }) > 0);
}

function unseenScopedItems(items = []) {
  return items.filter((item) => (
    item.activityScope
    && getUnseenNotificationCount(item.activityScope, [item], { unreadOnly: true }) > 0
  ));
}

function openService(page) {
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page } }));
}

function announceActivity({ body, item, page, source, title }) {
  if (!body || !item) return;
  const contextKey = `${page}:${source}`;

  haptics.light(page);
  sounds.notification(page);
  showNotificationBanner({
    title,
    body,
    contextKey,
    openLabel: page === "marketplace" ? "Open UrMall" : "Open UrRide",
    onOpen: () => openService(page),
  });
  showKunThaiSystemNotification({
    title,
    body,
    tag: `${contextKey}:${itemId(item)}`,
    target: page === "marketplace" ? `urmall:${source}` : `urride:${source}`,
  }).catch(() => {});
}

// A recipient of shared Visibility Credits gets a live toast + slide-in banner
// the moment the transfer lands, naming the sender (the persisted notification
// row is written by the transfer_visibility_credits RPC). Fires only for the
// recipient-side 'credit_transfer' type, so the sender — who already saw their
// own confirmation toast — is never double-notified.
function announceCreditTransfer(notification) {
  if (!notification || notification.type !== "credit_transfer") return;
  const message = String(notification.message || "").trim()
    || i18nText("profile.creditsReceivedFallback");
  const title = i18nText("profile.creditsShared");

  haptics.light("explore");
  sounds.notification("explore");
  showToast(message, "success", { title });
  showNotificationBanner({
    title,
    body: message,
    avatarUrl: notification.actor_avatar_url || "",
    tone: "message",
    contextKey: "explore:credit_transfer",
    openLabel: i18nText("common.open"),
    onOpen: () => requestExploreScreen("notifications"),
  });
}

function mapBuyerOrder(order) {
  return {
    ...order,
    id: `buyer-order:${order.id}`,
    createdAt: order.createdAt || "",
    unread: true,
  };
}

function mapBuyerMessage(message) {
  return {
    ...message,
    id: `buyer-message:${message.id}:${message.createdAt || ""}`,
    createdAt: message.createdAt || "",
    unread: true,
  };
}

export default function CrossServiceActivityHost({
  onMarketplaceCountChange,
  onTransportCountChange,
  userId = "",
}) {
  const marketplaceRef = useRef(EMPTY_ACTIVITY);
  const transportRef = useRef(EMPTY_ACTIVITY);

  useEffect(() => {
    if (!userId) {
      marketplaceRef.current = EMPTY_ACTIVITY;
      transportRef.current = EMPTY_ACTIVITY;
      onMarketplaceCountChange?.(0);
      onTransportCountChange?.(0);
      return undefined;
    }

    let active = true;
    let marketplaceBusy = false;
    let transportBusy = false;
    let marketplaceQueued = false;
    let transportQueued = false;
    let sellerCleanup = () => {};
    let buyerMessageCleanup = () => {};
    let transportCompanyCleanup = () => {};
    let passengerTripCleanup = () => {};
    let realtimeChannel = null;

    marketplaceRef.current = EMPTY_ACTIVITY;
    transportRef.current = EMPTY_ACTIVITY;

    async function refreshMarketplace() {
      if (!active) return;
      if (marketplaceBusy) {
        marketplaceQueued = true;
        return;
      }
      marketplaceBusy = true;

      try {
        const modules = await loadActivityModules();
        const [sellerState, buyerOrders, buyerMessages] = await Promise.all([
          modules.sellerHeader.fetchSellerHeaderState().catch(() => null),
          modules.buyerMarketplace.fetchBuyerOrders().catch(() => []),
          modules.buyerMarketplace.fetchBuyerMessages().catch(() => []),
        ]);
        if (!active) return;

        const sellerOrderItems = sellerState?.orderItems || [];
        const sellerMessageItems = sellerState?.messageItems || [];
        const sellerNotificationItems = unseenItems("urmall:seller:notifications", sellerState?.notificationItems || []);
        const buyerOrderItems = buyerOrders
          .filter((order) => String(order.status || "").toLowerCase() === "pending")
          .map(mapBuyerOrder);
        const buyerMessageItems = buyerMessages.filter((message) => message.unread).map(mapBuyerMessage);
        const nextState = {
          initialized: true,
          orderItems: [...sellerOrderItems, ...buyerOrderItems],
          sellerOrderItems,
          messageItems: [...sellerMessageItems, ...buyerMessageItems],
          notificationItems: sellerNotificationItems,
          bookingItems: [],
        };
        const previous = marketplaceRef.current;
        marketplaceRef.current = nextState;
        onMarketplaceCountChange?.(
          nextState.orderItems.length + nextState.messageItems.length + nextState.notificationItems.length,
        );

        if (previous.initialized) {
          announceActivity({
            title: i18nText("ui.literals.kb27663c8d970"),
            body: i18nText("ui.literals.k27e7dc4c1d6f"),
            item: firstNewItem(nextState.sellerOrderItems, previous.sellerOrderItems),
            page: "marketplace",
            source: "orders",
          });
          announceActivity({
            title: i18nText("ui.literals.kb27663c8d970"),
            body: i18nText("ui.literals.k509789d18404"),
            item: firstNewItem(nextState.messageItems, previous.messageItems),
            page: "marketplace",
            source: "messages",
          });
          announceActivity({
            title: i18nText("ui.literals.kb27663c8d970"),
            body: i18nText("ui.literals.k8b400f126918"),
            item: firstNewItem(nextState.notificationItems, previous.notificationItems),
            page: "marketplace",
            source: "notifications",
          });
        }
      } finally {
        marketplaceBusy = false;
        if (marketplaceQueued && active) {
          marketplaceQueued = false;
          window.setTimeout(refreshMarketplace, 0);
        }
      }
    }

    async function refreshTransport() {
      if (!active) return;
      if (transportBusy) {
        transportQueued = true;
        return;
      }
      transportBusy = true;

      try {
        const modules = await loadActivityModules();
        const [operatorAccount, companyAccount] = await Promise.all([
          modules.operatorAccounts.getOperatorAccount().catch(() => null),
          modules.companyAccounts.getTransportCompanyAccount().catch(() => null),
        ]);
        const [operationState, passengerItems] = await Promise.all([
          modules.transportHeader.fetchTransportOperationBadgeState(operatorAccount, companyAccount).catch(() => ({
            bookingCount: 0,
            notificationCount: 0,
            bookingItems: [],
            notificationItems: [],
          })),
          modules.transportHeader.fetchTransportNotifications(null, null, {
            includeCompany: false,
            includeOperator: false,
            includePassenger: true,
          }).catch(() => []),
        ]);
        if (!active) return;

        const operationNotificationItems = unseenScopedItems(operationState.notificationItems || []);
        const passengerNotificationItems = unseenItems("transport:passenger", passengerItems);
        const nextState = {
          initialized: true,
          orderItems: [],
          messageItems: [],
          bookingItems: operationState.bookingItems || [],
          notificationItems: [...operationNotificationItems, ...passengerNotificationItems],
        };
        const previous = transportRef.current;
        transportRef.current = nextState;
        onTransportCountChange?.(nextState.bookingItems.length + nextState.notificationItems.length);

        if (previous.initialized) {
          announceActivity({
            title: i18nText("ui.literals.kd72dbe16af0c"),
            body: i18nText("ui.literals.kace42db22b36"),
            item: firstNewItem(nextState.bookingItems, previous.bookingItems),
            page: "transport",
            source: "bookings",
          });
          announceActivity({
            title: i18nText("ui.literals.kd72dbe16af0c"),
            body: i18nText("ui.literals.k8b400f126918"),
            item: firstNewItem(nextState.notificationItems, previous.notificationItems),
            page: "transport",
            source: "notifications",
          });
        }
      } finally {
        transportBusy = false;
        if (transportQueued && active) {
          transportQueued = false;
          window.setTimeout(refreshTransport, 0);
        }
      }
    }

    function refreshAll() {
      refreshMarketplace().catch(() => {});
      refreshTransport().catch(() => {});
    }

    const intervalId = window.setInterval(refreshAll, ACTIVITY_REFRESH_MS);
    const seenCleanup = subscribeNotificationSeen(refreshAll);
    const eventNames = [
      "marketplace-orders-updated",
      "marketplace-message-sent",
      "marketplace-seller-messages-updated",
      "transport-booking-created",
      "transport-trip-updated",
    ];
    eventNames.forEach((eventName) => window.addEventListener(eventName, refreshAll));

    loadActivityModules().then(async (modules) => {
      if (!active) return;
      sellerCleanup = await modules.sellerHeader.subscribeSellerHeaderChanges(refreshMarketplace).catch(() => () => {});
      buyerMessageCleanup = await modules.buyerMarketplace.subscribeBuyerMarketplaceMessages(refreshMarketplace).catch(() => () => {});
      transportCompanyCleanup = modules.companyAccounts.subscribeTransportCompanyUpdates(refreshTransport);
      passengerTripCleanup = modules.passengerTrips.subscribePassengerTrips(refreshTransport);
      if (!active) {
        sellerCleanup();
        buyerMessageCleanup();
        transportCompanyCleanup();
        passengerTripCleanup();
        return;
      }

      realtimeChannel = supabase
        .channel(`cross-service-activity-${userId}-${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_orders" }, refreshMarketplace)
        .on("postgres_changes", { event: "*", schema: "public", table: "transport_operator_alerts" }, refreshTransport)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "explore_notifications", filter: `user_id=eq.${userId}` },
          (payload) => { if (active) announceCreditTransfer(payload.new); },
        )
        .subscribe();
    }).catch(() => {});

    refreshAll();
    return () => {
      active = false;
      window.clearInterval(intervalId);
      seenCleanup();
      sellerCleanup();
      buyerMessageCleanup();
      transportCompanyCleanup();
      passengerTripCleanup();
      eventNames.forEach((eventName) => window.removeEventListener(eventName, refreshAll));
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [onMarketplaceCountChange, onTransportCountChange, userId]);

  return null;
}
