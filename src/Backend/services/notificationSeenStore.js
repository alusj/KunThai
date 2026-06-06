const SEEN_KEY_PREFIX = "kuntai.notificationSeen.";
const SEEN_EVENT = "kuntai-notifications-seen";

function getItemId(item) {
  return String(item?.id || item?.alertId || item?.orderId || item?.messageId || "").trim();
}

function getStorageKey(scope) {
  return `${SEEN_KEY_PREFIX}${String(scope || "general")}`;
}

export function readSeenNotificationIds(scope) {
  if (typeof window === "undefined") return new Set();

  try {
    const saved = window.localStorage.getItem(getStorageKey(scope));
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

  return items.filter((item) => {
    const id = getItemId(item);
    if (!id || seen.has(id)) return false;
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
