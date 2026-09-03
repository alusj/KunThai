import supabase from "../lib/supabaseClient";
import { requestExploreScreen, requestMarketplaceScreen, runNotificationAction } from "./notificationBannerService";

export const UNIFIED_NOTIFICATIONS_UPDATED_EVENT = "kuntai-unified-notifications-updated";

const DEFAULT_PREFERENCES = {
  in_app_enabled: true,
  floating_enabled: true,
  push_enabled: false,
  social_enabled: true,
  commerce_enabled: true,
  transport_enabled: true,
  marketing_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

let notificationModulesPromise = null;

function loadNotificationModules() {
  if (!notificationModulesPromise) {
    notificationModulesPromise = Promise.all([
      import("./exploreService"),
      import("./marketplace/buyerMarketplaceService"),
      import("./marketplace/marketplaceNotificationModels"),
      import("./marketplace/sellerActivityService"),
      import("./marketplace/sellerCustomerCareService"),
      import("../../components/services/transportCompanyService"),
      import("../../components/services/transportHeaderService"),
      import("../../components/services/transportOperatorAccountService"),
    ]).then(([explore, buyer, marketplaceModels, sellerActivity, sellerCare, transportCompany, transportHeader, transportOperator]) => ({
      explore,
      buyer,
      marketplaceModels,
      sellerActivity,
      sellerCare,
      transportCompany,
      transportHeader,
      transportOperator,
    }));
  }
  return notificationModulesPromise;
}

const EXPLORE_ACTION_LABELS = {
  reaction: "liked your post",
  like: "liked your post",
  comment: "commented on your post",
  reply: "replied to you",
  mention: "mentioned you",
  follow: "started following you",
  share: "shared your post",
  save: "saved your post",
};

function timestamp(value) {
  const result = new Date(value || 0).getTime();
  return Number.isFinite(result) ? result : 0;
}

function namespace(source, id) {
  return `${source}:${String(id || "unknown")}`;
}

function normalizedPriority(value = "normal") {
  const priority = String(value || "normal").toLowerCase();
  return ["low", "normal", "medium", "high", "urgent", "critical"].includes(priority) ? priority : "normal";
}

function mapExploreNotification(item) {
  const platform = item?._notification_source === "platform" || Object.prototype.hasOwnProperty.call(item || {}, "notification_type");
  if (platform) {
    return {
      id: namespace("platform", item.id),
      rawId: item.id,
      source: item.sector === "platform" || item.sector === "all" ? "system" : item.sector || "system",
      sourceTable: "platform_notifications",
      category: item.category || (item.notification_type?.includes("payment") ? "payment" : "system"),
      type: item.notification_type || "admin_message",
      title: item.title || "KunThai update",
      body: item.body || "Open KunThai for the latest information.",
      priority: normalizedPriority(item.priority),
      presentation: item.presentation || "inbox",
      actionTarget: item.action_target || "",
      actionData: item.action_data || {},
      createdAt: item.created_at,
      read: item.status === "read" || item.status === "archived",
      archived: item.status === "archived" || Boolean(item.dismissed_at),
      displayedAt: item.displayed_at || null,
      actionedAt: item.actioned_at || null,
      campaignId: item.campaign_id || null,
      channels: item.channels || ["in_app"],
    };
  }

  const actor = item.actor_name || "Someone";
  const action = EXPLORE_ACTION_LABELS[item.type] || "sent you an Explore update";
  return {
    id: namespace("explore", item.id),
    rawId: item.id,
    source: "explore",
    sourceTable: "explore_notifications",
    category: item.category || "social",
    type: item.type || "activity",
    title: `${actor} ${action}`,
    body: item.message || item.post_preview || "Open Explore to view it.",
    avatarUrl: item.actor_avatar_url || "",
    priority: normalizedPriority(item.priority),
    presentation: "inbox",
    createdAt: item.created_at,
    read: Boolean(item.read),
    archived: false,
  };
}

function mapBuyerOrder(item) {
  return {
    ...item,
    id: namespace("urmall-buyer-order", item.id),
    rawId: item.orderId,
    source: "marketplace",
    sourceTable: "marketplace_orders",
    category: "commerce",
    priority: ["cancelled", "canceled"].includes(item.status) ? "high" : "normal",
    presentation: "inbox",
    createdAt: item.createdAt,
    read: false,
  };
}

function mapBuyerConversation(item) {
  return {
    id: namespace("urmall-buyer-message", `${item.id}:${item.createdAt || ""}`),
    rawId: item.id,
    source: "marketplace",
    sourceTable: "marketplace_customer_messages",
    category: "commerce",
    type: "buyer_message",
    title: `Message from ${item.sellerName || "an UrMall seller"}`,
    body: item.preview || item.topic || "Open the conversation to reply.",
    priority: "high",
    presentation: "floating",
    actionTarget: "urmall:messages",
    createdAt: item.createdAt,
    read: !item.unread,
  };
}

function mapSellerConversation(item) {
  const last = item.messages?.at(-1);
  return {
    id: namespace("urmall-seller-message", `${item.businessId}:${item.buyerId || item.id}:${last?.createdAt || item.time || ""}`),
    rawId: item.id,
    source: "marketplace",
    sourceTable: "marketplace_customer_messages",
    category: "commerce",
    type: "seller_message",
    title: `Buyer message from ${item.buyerName || "an UrMall buyer"}`,
    body: item.preview || item.topic || "Open Customer Care to reply.",
    priority: item.supportDispute ? "urgent" : "high",
    presentation: item.supportDispute ? "floating" : "inbox",
    actionTarget: "urmall:business-messages",
    createdAt: last?.createdAt || item.time,
    read: !item.unread,
  };
}

function mapSellerActivity(item) {
  return {
    id: namespace("urmall-seller-activity", item.id),
    rawId: item.id,
    source: "marketplace",
    sourceTable: "marketplace_activities",
    category: "commerce",
    type: item.type || "seller_activity",
    title: item.title || "UrMall business update",
    body: item.description || item.meta || "Open your business workspace for details.",
    priority: item.status === "warning" ? "high" : "normal",
    presentation: "inbox",
    actionTarget: item.actionTarget || "urmall:business",
    createdAt: item.createdAt,
    read: false,
  };
}

function mapTransport(item) {
  return {
    ...item,
    id: namespace("urride", item.id),
    rawId: item.notificationId || item.alertId || item.tripId || item.id,
    source: "transport",
    sourceTable: item.notificationId ? "transport_passenger_notifications" : item.alertId ? "transport_operator_alerts" : "transport",
    category: "transport",
    type: item.type || "transport_update",
    priority: item.unread ? "high" : "normal",
    presentation: item.unread ? "floating" : "inbox",
    actionTarget: item.tripId ? `urride:trip:${item.tripId}` : "urride:notifications",
    createdAt: item.createdAt,
    read: item.unread === false,
  };
}

function applyReceipts(items, receipts) {
  const byKey = new Map((receipts || []).map((receipt) => [receipt.notification_key, receipt]));
  return items
    .map((item) => {
      const receipt = byKey.get(item.id);
      return {
        ...item,
        seen: Boolean(receipt?.seen_at || item.seen),
        read: Boolean(receipt?.read_at || item.read),
        displayedAt: receipt?.displayed_at || item.displayedAt || null,
        actionedAt: receipt?.actioned_at || item.actionedAt || null,
        archived: Boolean(receipt?.dismissed_at || item.archived),
      };
    })
    .filter((item) => !item.archived)
    .sort((first, second) => timestamp(second.createdAt) - timestamp(first.createdAt));
}

export async function fetchNotificationReceipts(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("user_notification_receipts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error && /user_notification_receipts|schema cache|does not exist/i.test(error.message || "")) return [];
  if (error) throw error;
  return data || [];
}

export async function fetchUnifiedNotifications(userId) {
  if (!userId) return [];

  const modules = await loadNotificationModules();

  const [exploreItems, platformResult, buyerOrders, buyerMessages, sellerCare, sellerActivities, operatorAccount, companyAccount, receipts] = await Promise.all([
    modules.explore.fetchExploreNotifications({ limit: 100 }).catch(() => []),
    supabase.from("platform_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(250),
    modules.buyer.fetchBuyerOrders().catch(() => []),
    modules.buyer.fetchBuyerMessages().catch(() => []),
    modules.sellerCare.fetchSellerCustomerCare().catch(() => null),
    modules.sellerActivity.fetchSellerActivities().catch(() => []),
    modules.transportOperator.getOperatorAccount().catch(() => null),
    modules.transportCompany.getTransportCompanyAccount().catch(() => null),
    fetchNotificationReceipts(userId).catch(() => []),
  ]);

  const transportItems = await modules.transportHeader.fetchTransportNotifications(operatorAccount, companyAccount).catch(() => []);
  const now = Date.now();
  const platformRows = platformResult.error
    ? exploreItems.filter((item) => item?._notification_source === "platform")
    : (platformResult.data || []);
  const platformItems = platformRows.filter((item) => !item.expires_at || timestamp(item.expires_at) > now);
  const items = [
    ...exploreItems.filter((item) => item?._notification_source !== "platform").map(mapExploreNotification),
    ...platformItems.map((item) => mapExploreNotification({ ...item, _notification_source: "platform" })),
    ...modules.marketplaceModels.buildBuyerOrderNotifications(buyerOrders).map(mapBuyerOrder),
    ...buyerMessages.filter((item) => item.unread).map(mapBuyerConversation),
    ...(sellerCare?.conversations || []).filter((item) => item.unread).map(mapSellerConversation),
    ...sellerActivities.map(mapSellerActivity),
    ...transportItems.map(mapTransport),
  ];

  const unique = new Map();
  items.forEach((item) => {
    if (!item?.id) return;
    const previous = unique.get(item.id);
    if (!previous || timestamp(item.createdAt) >= timestamp(previous.createdAt)) unique.set(item.id, item);
  });
  return applyReceipts([...unique.values()], receipts);
}

async function updatePlatformDelivery(item, action, at) {
  if (item.sourceTable !== "platform_notifications" || !item.rawId) return;
  const patch = {};
  if (action === "seen") patch.seen_at = at;
  if (action === "displayed") patch.displayed_at = at;
  if (action === "read") Object.assign(patch, { status: "read", read_at: at, seen_at: at });
  if (action === "actioned") Object.assign(patch, { actioned_at: at, status: "read", read_at: at, seen_at: at });
  if (action === "dismissed") Object.assign(patch, { dismissed_at: at, status: "archived" });
  if (!Object.keys(patch).length) return;
  await supabase.from("platform_notifications").update(patch).eq("id", item.rawId);
}

export async function updateUnifiedNotificationReceipt(userId, item, action) {
  if (!userId || !item?.id) return;
  const at = new Date().toISOString();
  const patch = {
    user_id: userId,
    notification_key: item.id,
    source: item.source || "platform",
    updated_at: at,
  };
  if (action === "seen") patch.seen_at = at;
  if (action === "displayed") patch.displayed_at = at;
  if (action === "read") Object.assign(patch, { read_at: at, seen_at: at });
  if (action === "actioned") Object.assign(patch, { actioned_at: at, read_at: at, seen_at: at });
  if (action === "dismissed") patch.dismissed_at = at;

  const { error } = await supabase
    .from("user_notification_receipts")
    .upsert(patch, { onConflict: "user_id,notification_key" });
  if (error && !/user_notification_receipts|schema cache|does not exist/i.test(error.message || "")) throw error;

  if (action === "read" && item.sourceTable === "explore_notifications") {
    const modules = await loadNotificationModules();
    await modules.explore.markExploreNotificationRead(item.rawId, true).catch(() => {});
  }
  if (action === "read" && item.sourceTable === "transport_passenger_notifications") {
    const modules = await loadNotificationModules();
    await modules.transportHeader.markTransportPassengerNotificationRead(item.rawId).catch(() => {});
  }
  await updatePlatformDelivery(item, action, at).catch(() => {});
  window.dispatchEvent(new CustomEvent(UNIFIED_NOTIFICATIONS_UPDATED_EVENT, { detail: { id: item.id, action } }));
}

export async function markUnifiedNotificationsDisplayed(userId, items = []) {
  const pending = items.filter((item) => item?.id && !item.displayedAt).slice(0, 100);
  if (!userId || !pending.length) return;
  await Promise.allSettled(pending.map((item) => updateUnifiedNotificationReceipt(userId, item, "displayed")));
}

export async function fetchUnifiedNotificationPreferences(userId) {
  if (!userId) return DEFAULT_PREFERENCES;
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && !/user_notification_preferences|schema cache|does not exist/i.test(error.message || "")) throw error;
  return { ...DEFAULT_PREFERENCES, ...(data || {}) };
}

export async function saveUnifiedNotificationPreferences(userId, patch) {
  if (!userId) return DEFAULT_PREFERENCES;
  const payload = { ...patch, user_id: userId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return { ...DEFAULT_PREFERENCES, ...data };
}

export function notificationAllowedByPreferences(item, preferences = DEFAULT_PREFERENCES) {
  if (preferences.in_app_enabled === false && !["safety", "security", "payment", "account"].includes(item.category)) return false;
  if (item.source === "explore" && preferences.social_enabled === false) return false;
  if (item.source === "marketplace" && preferences.commerce_enabled === false) return false;
  if (item.source === "transport" && preferences.transport_enabled === false) return false;
  if (item.category === "marketing" && preferences.marketing_enabled === false) return false;
  return true;
}

export function openUnifiedNotification(item) {
  return runNotificationAction(() => {
    const target = String(item?.actionTarget || "");
    if (target.startsWith("urmall:messages")) {
      requestMarketplaceScreen("messages", { conversationId: item?.conversationId || item?.actionData?.conversationId || item?.rawId || "" });
    } else if (target.startsWith("urmall:orders")) requestMarketplaceScreen("orders", { orderId: item?.orderId || item?.rawId || "" });
    else if (target.startsWith("urmall:admin-roles")) requestMarketplaceScreen("admin-roles");
    else if (target.startsWith("urmall:business-messages")) requestMarketplaceScreen("business-messages");
    else if (target.startsWith("urmall:business")) requestMarketplaceScreen("business");
    else if (target.startsWith("urmall") || item?.source === "marketplace") requestMarketplaceScreen("");
    else if (target.startsWith("urride") || item?.source === "transport") {
      window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport", target } }));
    } else if (target.startsWith("messages")) requestExploreScreen("Messages");
    else requestExploreScreen("Notifications");
  });
}

export function notificationSourceLabel(source) {
  if (source === "marketplace") return "UrMall";
  if (source === "transport") return "UrRide";
  if (source === "explore") return "Explore";
  return "KunThai";
}

export function dispatchUnifiedNotificationRefresh() {
  window.dispatchEvent(new CustomEvent(UNIFIED_NOTIFICATIONS_UPDATED_EVENT));
}
