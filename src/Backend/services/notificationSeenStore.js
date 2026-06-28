const SEEN_KEY_PREFIX = "kuntai.notificationSeen.";
const VISITED_KEY_PREFIX = "kuntai.notificationVisitedAt.";
const SEEN_EVENT = "kuntai-notifications-seen";
export const EXPLORE_NOTIFICATION_SEEN_SCOPE = "explore.header.bell";
export const EXPLORE_MESSAGE_SEEN_SCOPE = "explore.header.messages";
let activeSeenUserId = "guest";

export function setNotificationSeenUser(userId = "") {
  const nextUserId = String(userId || "guest").trim() || "guest";
  if (nextUserId === activeSeenUserId) return;
  activeSeenUserId = nextUserId;
}

function getItemId(item) {
  return String(item?.id || item?.alertId || item?.orderId || item?.messageId || "").trim();
}

function getStorageKey(scope) {
  return `${SEEN_KEY_PREFIX}${activeSeenUserId}.${String(scope || "general")}`;
}

function getVisitedStorageKey(scope) {
  return `${VISITED_KEY_PREFIX}${activeSeenUserId}.${String(scope || "general")}`;
}

function getItemTimestamp(item) {
  const value = item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt || item?.timestamp || "";
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function readNotificationScopeVisitedAt(scope) {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(getVisitedStorageKey(scope)) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function markNotificationScopeVisited(scope, visitedAt = Date.now()) {
  if (typeof window === "undefined") return 0;
  const nextVisitedAt = Math.max(readNotificationScopeVisitedAt(scope), Number(visitedAt) || Date.now());
  try {
    window.localStorage.setItem(getVisitedStorageKey(scope), String(nextVisitedAt));
    window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { scope } }));
  } catch {
    return 0;
  }
  return nextVisitedAt;
}

function getLegacyStorageKey(scope) {
  return `${SEEN_KEY_PREFIX}${String(scope || "general")}`;
}

export function readSeenNotificationIds(scope) {
  if (typeof window === "undefined") return new Set();

  try {
    const storageKey = getStorageKey(scope);
    let saved = window.localStorage.getItem(storageKey);
    if (!saved && activeSeenUserId !== "guest") {
      saved = window.localStorage.getItem(getLegacyStorageKey(scope));
      if (saved) {
        window.localStorage.setItem(storageKey, saved);
        window.localStorage.removeItem(getLegacyStorageKey(scope));
      }
    }
    const ids = saved ? JSON.parse(saved) : [];
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}

export function writeSeenNotificationIds(scope, ids) {
  if (typeof window === "undefined") return;

  const nextIds = [...new Set([...ids].map((id) => String(id)).filter(Boolean))].slice(-400);
  window.localStorage.setItem(getStorageKey(scope), JSON.stringify(nextIds));
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { scope } }));
}

export function markNotificationsSeen(scope, items = []) {
  const seen = readSeenNotificationIds(scope);
  let changed = false;

  items.forEach((item) => {
    const id = getItemId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    changed = true;
  });

  if (changed) writeSeenNotificationIds(scope, seen);
  return seen;
}

export function getUnseenNotificationCount(scope, items = [], { unreadOnly = false } = {}) {
  const seen = readSeenNotificationIds(scope);
  const visitedAt = readNotificationScopeVisitedAt(scope);

  return items.filter((item) => {
    const id = getItemId(item);
    if (!id || seen.has(id)) return false;
    const itemTimestamp = getItemTimestamp(item);
    if (visitedAt && itemTimestamp && itemTimestamp <= visitedAt) return false;
    return unreadOnly ? item.unread !== false : true;
  }).length;
}

export function applySeenNotificationState(scope, items = [], { unreadOnly = true } = {}) {
  const seen = readSeenNotificationIds(scope);

  return items.map((item) => {
    const id = getItemId(item);
    if (!id || !seen.has(id)) return item;

    return {
      ...item,
      unread: unreadOnly ? false : item.unread,
    };
  });
}

export function subscribeNotificationSeen(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") return () => {};

  window.addEventListener(SEEN_EVENT, callback);
  return () => window.removeEventListener(SEEN_EVENT, callback);
}
