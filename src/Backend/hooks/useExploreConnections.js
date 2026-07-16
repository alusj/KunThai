import { useEffect, useState } from "react";

import { fetchExploreConnections } from "../services/exploreService";
import { getIdentityKey, normalizeIdentityTarget } from "../services/exploreService";
import { blockExploreIdentity, fetchBlockedIdentityKeys, unblockExploreIdentity } from "../services/explore/safetyService";
import { showToast } from "../services/toastService";
import { EXPLORE_FOLLOW_CHANGED_EVENT, useExploreFollows } from "./useExploreFollows";

const BLOCK_STORAGE_KEY = "explore-blocked-users";
const CONNECTIONS_MEMORY = new Map();
const CONNECTIONS_MEMORY_TTL = 120_000;
const CONNECTIONS_STORAGE_PREFIX = "kunthai.explore.connections.";

function getConnectionsKey(kind, currentUserId) {
  return `${kind || "discover"}:${currentUserId || "guest"}`;
}

function readConnectionsMemory(key) {
  const cached = CONNECTIONS_MEMORY.get(key);
  if (cached) {
    return cached;
  }

  const storedItems = readStoredConnections(key);
  return storedItems.length ? { items: storedItems, savedAt: 0 } : null;
}

function writeConnectionsMemory(key, items) {
  CONNECTIONS_MEMORY.set(key, { items, savedAt: Date.now() });
  writeStoredConnections(key, items);
}

function getConnectionsStorageKey(key) {
  return `${CONNECTIONS_STORAGE_PREFIX}${key}`;
}

function readStoredConnections(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(getConnectionsStorageKey(key)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStoredConnections(key, items) {
  try {
    sessionStorage.setItem(getConnectionsStorageKey(key), JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Connections cache is only an instant-return convenience.
  }
}

function readBlockedUsers() {
  try {
    const value = JSON.parse(localStorage.getItem(BLOCK_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeBlockedUsers(value) {
  localStorage.setItem(BLOCK_STORAGE_KEY, JSON.stringify(Array.from(value)));
}

function getConnectionIdentity(item) {
  return normalizeIdentityTarget({
    identityType: item?.identityType || item?.identity_type || item?.targetType || item?.target_type || (item?.space_id ? "space" : "profile"),
    identityId: item?.identityId || item?.identity_id || item?.space_id || item?.user_id || item?.id || "",
  });
}

export function useExploreConnections(kind, currentUserId = "") {
  const cacheKey = getConnectionsKey(kind, currentUserId);
  const cached = readConnectionsMemory(cacheKey);
  const initialItems = cached?.items || [];
  const [items, setItems] = useState(() => initialItems);
  const [loading, setLoading] = useState(() => initialItems.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [blockedUsers, setBlockedUsers] = useState(readBlockedUsers);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);

  useEffect(() => {
    writeConnectionsMemory(cacheKey, items);
  }, [cacheKey, items]);

  async function load(options = {}) {
    const force = Boolean(options.force);
    const currentCache = readConnectionsMemory(cacheKey);
    const hasCachedItems = Boolean(currentCache?.items?.length || items.length);
    const fresh = currentCache?.items?.length && Date.now() - currentCache.savedAt < CONNECTIONS_MEMORY_TTL;

    if (fresh && !force) {
      setLoading(false);
      setRefreshing(false);
      setError("");
      return;
    }

    if (hasCachedItems) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      setError("");
      const nextItems = await fetchExploreConnections(kind, currentUserId);
      setItems(nextItems);
      writeConnectionsMemory(cacheKey, nextItems);
    } catch (err) {
      setError(hasCachedItems ? "" : err.message || "Unable to load connections.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadActive() {
      const currentCache = readConnectionsMemory(cacheKey);
      const hasCachedItems = Boolean(currentCache?.items?.length);
      const fresh = hasCachedItems && Date.now() - currentCache.savedAt < CONNECTIONS_MEMORY_TTL;

      if (hasCachedItems) {
        setItems(currentCache.items);
        setLoading(false);
        setRefreshing(!fresh);
      }

      if (fresh) {
        setRefreshing(false);
        return;
      }

      try {
        if (!hasCachedItems) {
          setLoading(true);
          setRefreshing(false);
        } else {
          setRefreshing(true);
        }
        setError("");
        const nextItems = await fetchExploreConnections(kind, currentUserId);
        if (active) {
          setItems(nextItems);
          writeConnectionsMemory(cacheKey, nextItems);
        }
      } catch (err) {
        if (active) {
          setError(hasCachedItems ? "" : err.message || "Unable to load connections.");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadActive();
    fetchBlockedIdentityKeys()
      .then((blocked) => {
        if (active) setBlockedUsers(new Set(blocked));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [cacheKey, currentUserId, kind]);

  useEffect(() => {
    function handleFollowChanged(event) {
      const { userId, identityKey, identityType, identityId, active } = event.detail || {};
      const targetKey = identityKey || getIdentityKey(identityType || "profile", identityId || userId || "");
      if (!targetKey) {
        return;
      }

      setItems((current) => current.map((item) => (getConnectionIdentity(item).key === targetKey ? { ...item, isFollowing: active } : item)));

      load({ force: true });
    }

    window.addEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
    return () => window.removeEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
    // load is intentionally kept local so follow events force only this connection cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function followUser(target) {
    const targetIdentity = getConnectionIdentity(typeof target === "object" ? target : { user_id: target });
    const targetItem = items.find((item) => getConnectionIdentity(item).key === targetIdentity.key);
    const active = await toggleFollow(targetIdentity);
    showToast(active ? "Connected." : "Connection removed.", "success", {
      actionLabel: "Undo",
      onAction: async () => {
        await toggleFollow(targetIdentity);
        load({ force: true });
      },
    });

    if (active && targetItem) {
      setItems((current) => {
        if (kind === "discover") {
          return current.filter((item) => getConnectionIdentity(item).key !== targetIdentity.key);
        }

        if (kind === "followers") {
          return current.filter((item) => getConnectionIdentity(item).key !== targetIdentity.key);
        }

        return current.map((item) => (getConnectionIdentity(item).key === targetIdentity.key ? { ...item, isFollowing: true, status: "Connected" } : item));
      });
    }

    load({ force: true });
  }

  async function blockUser(target) {
    const targetIdentity = getConnectionIdentity(typeof target === "object" ? target : { user_id: target });
    const blockedItem = items.find((item) => getConnectionIdentity(item).key === targetIdentity.key);
    const optimistic = new Set(blockedUsers);
    optimistic.add(targetIdentity.key);
    writeBlockedUsers(optimistic);
    setBlockedUsers(optimistic);

    try {
      const synced = await blockExploreIdentity(targetIdentity, "blocked from Explore connections");
      setBlockedUsers(new Set(synced));
    } catch (error) {
      showToast(error.message || "Account blocked on this device.", "danger");
    }

    showToast("Account blocked.", "danger", {
      actionLabel: "Undo",
      onAction: async () => {
        setBlockedUsers((current) => {
          const next = new Set(current);
          next.delete(targetIdentity.key);
          writeBlockedUsers(next);
          return next;
        });
        await unblockExploreIdentity(targetIdentity).catch(() => null);
        if (blockedItem) {
          setItems((current) => (current.some((item) => getConnectionIdentity(item).key === targetIdentity.key) ? current : [blockedItem, ...current]));
        }
      },
    });
  }

  async function removeUser(target) {
    const targetIdentity = getConnectionIdentity(typeof target === "object" ? target : { user_id: target });
    const removedItem = items.find((item) => getConnectionIdentity(item).key === targetIdentity.key);
    const wasFollowing = followedUsers.has(targetIdentity.key) || followedUsers.has(targetIdentity.id) || removedItem?.isFollowing;

    if (wasFollowing) {
      await toggleFollow(targetIdentity);
    }

    setItems((current) => current.filter((item) => getConnectionIdentity(item).key !== targetIdentity.key));
    showToast("Connection removed from this list.", "info", {
      actionLabel: "Undo",
      onAction: async () => {
        if (removedItem) {
          setItems((current) => (current.some((item) => getConnectionIdentity(item).key === targetIdentity.key) ? current : [removedItem, ...current]));
        }

        if (wasFollowing) {
          await toggleFollow(targetIdentity);
          load({ force: true });
        }
      },
    });
  }

  const visibleItems = items
    .filter((item) => !blockedUsers.has(getConnectionIdentity(item).key))
    .map((item) => {
      const identity = getConnectionIdentity(item);
      return { ...item, identityKey: identity.key, isFollowing: followedUsers.has(identity.key) || followedUsers.has(identity.id) || item.isFollowing };
    });

  return {
    items: visibleItems,
    loading,
    isInitialLoading: loading && visibleItems.length === 0,
    refreshing,
    isRefreshing: refreshing,
    error,
    reload: () => load({ force: true }),
    followUser,
    blockUser,
    removeUser,
  };
}
