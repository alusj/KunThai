// Seen / read / dismissed notification marks, per scope ("transport:passenger",
// "transport:passenger:read", "urmall:buyer:notifications", ...).
//
// Kept in localStorage so badges count instantly and offline, AND saved to the
// account (user_notification_receipts, source "seen-store") so a notification
// opened on one phone never shows as new or unread again on another. Marks
// from the account are merged in when the person signs in, when the app comes
// back to the foreground, and live (realtime) while it is open.
const SEEN_KEY_PREFIX = "kuntai.notificationSeen.";
const VISITED_KEY_PREFIX = "kuntai.notificationVisitedAt.";
const SEEN_EVENT = "kuntai-notifications-seen";
export const EXPLORE_NOTIFICATION_SEEN_SCOPE = "explore.header.bell";
export const EXPLORE_MESSAGE_SEEN_SCOPE = "explore.header.messages";
const SYNC_SOURCE = "seen-store";
const MAX_IDS_PER_SCOPE = 1000;
let activeSeenUserId = "guest";

export function setNotificationSeenUser(userId = "") {
  const nextUserId = String(userId || "guest").trim() || "guest";
  if (nextUserId === activeSeenUserId) return;
  activeSeenUserId = nextUserId;
  startAccountSync(nextUserId);
}

// --- Account sync ------------------------------------------------------------

const isAccount = (userId) => Boolean(userId) && userId !== "guest";
const seenKey = (scope, id) => `seen:${scope}|${id}`;
const visitedKey = (scope) => `visited:${scope}`;

const sync = {
  userId: "",
  channel: null,
  pending: new Map(), // notification_key -> ISO time
  flushTimer: 0,
  lastFetchAt: 0,
  visitedQueuedAt: new Map(), // scope -> visitedAt last sent
};

async function db() {
  const module = await import("../lib/supabaseClient");
  return module.default;
}

function queueRemote(key, atMs = Date.now()) {
  if (!isAccount(activeSeenUserId) || typeof window === "undefined") return;
  const at = new Date(atMs).toISOString();
  const previous = sync.pending.get(key);
  if (!previous || previous < at) sync.pending.set(key, at);
  window.clearTimeout(sync.flushTimer);
  sync.flushTimer = window.setTimeout(flushRemote, 400);
}

async function flushRemote() {
  const userId = activeSeenUserId;
  if (!isAccount(userId) || !sync.pending.size) return;
  const rows = [...sync.pending].map(([key, at]) => ({
    user_id: userId,
    notification_key: key,
    source: SYNC_SOURCE,
    seen_at: at,
    updated_at: at,
  }));
  sync.pending.clear();
  try {
    const supabase = await db();
    for (let index = 0; index < rows.length; index += 200) {
      const { error } = await supabase
        .from("user_notification_receipts")
        .upsert(rows.slice(index, index + 200), { onConflict: "user_id,notification_key" });
      if (error) throw error;
    }
  } catch {
    // Kept on this phone either way; it is sent again with the next mark.
    if (userId === activeSeenUserId) rows.forEach((row) => sync.pending.set(row.notification_key, row.seen_at));
  }
}

// Merges marks saved to the account into this phone's store, without sending
// them back.
function applyRemoteRows(rows = []) {
  if (typeof window === "undefined" || !rows.length) return;
  const seenByScope = new Map();
  const visitedByScope = new Map();
  rows.forEach((row) => {
    if (row?.source && row.source !== SYNC_SOURCE) return;
    const key = String(row?.notification_key || "");
    if (key.startsWith("seen:")) {
      const body = key.slice(5);
      const split = body.indexOf("|");
      if (split <= 0) return;
      const scope = body.slice(0, split);
      if (!seenByScope.has(scope)) seenByScope.set(scope, []);
      seenByScope.get(scope).push(body.slice(split + 1));
    } else if (key.startsWith("visited:")) {
      const at = new Date(row.seen_at || 0).getTime();
      const scope = key.slice(8);
      if (Number.isFinite(at)) visitedByScope.set(scope, Math.max(visitedByScope.get(scope) || 0, at));
    }
  });
  const changedScopes = new Set();
  seenByScope.forEach((ids, scope) => {
    const seen = readSeenNotificationIds(scope);
    const before = seen.size;
    ids.forEach((id) => seen.add(id));
    if (seen.size !== before) {
      storeSeenIds(scope, seen);
      changedScopes.add(scope);
    }
  });
  visitedByScope.forEach((at, scope) => {
    if (at > readNotificationScopeVisitedAt(scope)) {
      try {
        window.localStorage.setItem(getVisitedStorageKey(scope), String(at));
        changedScopes.add(scope);
      } catch {
        // Storage can be unavailable.
      }
    }
  });
  changedScopes.forEach((scope) => window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { scope, remote: true } })));
}

async function fetchRemote(userId, { force = false } = {}) {
  if (!isAccount(userId)) return;
  if (!force && Date.now() - sync.lastFetchAt < 15_000) return;
  sync.lastFetchAt = Date.now();
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from("user_notification_receipts")
      .select("notification_key, seen_at, source")
      .eq("user_id", userId)
      .eq("source", SYNC_SOURCE)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error || userId !== activeSeenUserId) return;
    applyRemoteRows(data || []);
  } catch {
    // Offline: this phone's own marks still apply.
  }
}

// Marks this phone made before account sync existed are sent up once, so the
// account (and every other phone) learns about them too.
function uploadLocalMarksOnce(userId) {
  const doneKey = `kuntai.notificationSeenUploaded.${userId}`;
  try {
    if (window.localStorage.getItem(doneKey)) return;
    const seenPrefix = `${SEEN_KEY_PREFIX}${userId}.`;
    const visitedPrefix = `${VISITED_KEY_PREFIX}${userId}.`;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || "";
      if (key.startsWith(seenPrefix)) {
        const scope = key.slice(seenPrefix.length);
        readSeenNotificationIds(scope).forEach((id) => queueRemote(seenKey(scope, id)));
      } else if (key.startsWith(visitedPrefix)) {
        const scope = key.slice(visitedPrefix.length);
        const at = readNotificationScopeVisitedAt(scope);
        if (at) queueRemote(visitedKey(scope), at);
      }
    }
    window.localStorage.setItem(doneKey, String(Date.now()));
  } catch {
    // Storage unavailable: nothing to upload.
  }
}

function onForeground() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") fetchRemote(activeSeenUserId);
}

async function startAccountSync(userId) {
  if (typeof window === "undefined") return;
  if (sync.channel) {
    const previous = sync.channel;
    sync.channel = null;
    db().then((supabase) => supabase.removeChannel(previous)).catch(() => {});
  }
  sync.pending.clear();
  sync.visitedQueuedAt.clear();
  sync.userId = userId;
  if (!isAccount(userId)) return;
  if (!sync.foregroundListening) {
    document.addEventListener("visibilitychange", onForeground);
    sync.foregroundListening = true;
  }
  await fetchRemote(userId, { force: true });
  uploadLocalMarksOnce(userId);
  try {
    const supabase = await db();
    if (userId !== activeSeenUserId) return;
    sync.channel = supabase
      .channel(`notification-seen-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notification_receipts", filter: `user_id=eq.${userId}` },
        (payload) => applyRemoteRows(payload?.new ? [payload.new] : []),
      )
      .subscribe();
  } catch {
    // Realtime is a bonus: foreground refreshes still bring marks in.
  }
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
  // Sent to the account at most every few seconds per scope.
  if (nextVisitedAt - (sync.visitedQueuedAt.get(scope) || 0) > 3000) {
    sync.visitedQueuedAt.set(scope, nextVisitedAt);
    queueRemote(visitedKey(scope), nextVisitedAt);
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

function storeSeenIds(scope, ids) {
  const nextIds = [...new Set([...ids].map((id) => String(id)).filter(Boolean))].slice(-MAX_IDS_PER_SCOPE);
  try {
    window.localStorage.setItem(getStorageKey(scope), JSON.stringify(nextIds));
  } catch {
    // Storage full or unavailable: the account copy still has them.
  }
}

export function writeSeenNotificationIds(scope, ids) {
  if (typeof window === "undefined") return;

  const previous = readSeenNotificationIds(scope);
  storeSeenIds(scope, ids);
  [...ids].map((id) => String(id)).filter((id) => id && !previous.has(id)).forEach((id) => queueRemote(seenKey(scope, id)));
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
